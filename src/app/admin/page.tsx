'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthedFetch } from '@/components/auth/auth-provider';

// Import your tabs
import OverviewDashboardTab from '@/components/admin/OverviewDashboardTab';
import PalmAnalysisTab from '@/components/admin/PalmAnalysisTab';
import TarotAnalyticsTab from '@/components/admin/TarotAnalyticsTab';
import AIInsightsTab from '@/components/admin/AIInsightsTab';
import UserActivityTab from '@/components/admin/UserActivityTab';

export default function AdminDashboard() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  
  const router = useRouter();
  const authedFetch = useAuthedFetch();

  // 🛡️ THE BOUNCER: Check clearance on load
  useEffect(() => {
    const verifyAdminClearance = async () => {
      try {
        // We ping the overview endpoint just to check their status
        const res = await authedFetch('/api/admin/dashboard-overview');
        
        if (res.status === 403 || res.status === 401) {
          // Access Denied! Kick them to the normal user dashboard
          router.push('/dashboard');
          return;
        }
        
        if (res.ok) {
          // Clearance granted
          setIsAuthorized(true);
        }
      } catch (error) {
        console.error("Failed to verify admin status", error);
        router.push('/dashboard');
      } finally {
        setIsVerifying(false);
      }
    };

    verifyAdminClearance();
  }, [authedFetch, router]);

  const menuItems = [
    { id: 'dashboard', label: 'Overview Dashboard' },
    { id: 'palm', label: 'Palm Analysis' },
    { id: 'tarot', label: 'Tarot Analytics' },
    { id: 'insights', label: 'AI Insights' },
    { id: 'users', label: 'User Activity' },
  ];

  // Show a cool hacker-style loading screen while checking database
  if (isVerifying) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#050314] flex-col">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-4" />
        <p className="text-purple-300 font-mono text-sm tracking-widest uppercase">Verifying Executive Clearance...</p>
      </div>
    );
  }

  // If they somehow bypass the loading state but aren't authorized, render nothing
  if (!isAuthorized) return null;

  return (
    <div className="flex h-screen bg-[#050314] font-sans text-slate-100 overflow-hidden">
      <aside className="w-64 bg-[#0a061e] border-r border-purple-900/30 flex flex-col shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.5)] z-10">
        <div className="p-6 border-b border-purple-900/30">
          <h1 className="text-xl font-serif font-bold text-amber-500 tracking-wider">MYSTICA</h1>
          <p className="text-xs text-purple-300/60 mt-1 uppercase tracking-widest">Admin Control Node</p>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-300 ${
                activeSection === item.id
                  ? 'bg-purple-900/40 text-amber-400 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                  : 'text-purple-200/70 hover:bg-purple-900/20 hover:text-amber-200 border border-transparent'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto p-8 bg-gradient-to-br from-[#050314] to-[#0a061e]">
        {activeSection === 'dashboard' && <OverviewDashboardTab />}
        {activeSection === 'palm' && <PalmAnalysisTab />}
        {activeSection === 'tarot' && <TarotAnalyticsTab />}
        {activeSection === 'insights' && <AIInsightsTab />}
        {activeSection === 'users' && <UserActivityTab />}
      </main>
    </div>
  );
}