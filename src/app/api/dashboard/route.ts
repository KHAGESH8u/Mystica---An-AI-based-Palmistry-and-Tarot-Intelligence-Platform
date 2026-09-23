import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const dailyCache = new Map<string, any>();

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const backendUrl = process.env.BACKEND_URL || 'https://mystica-backend.onrender.com';
    const res = await fetch(`${backendUrl}/api/dashboard`, {
      headers: { 'Authorization': authHeader }
    });

    if (!res.ok) throw new Error(`Backend returned ${res.status}`);
    const data = await res.json();
    const todayStr = new Date().toISOString().split('T')[0];

    // =====================================================================
    // 1. SEEKER (USER) GEMINI GENERATION
    // =====================================================================
    if (data.dashboard && data.dashboard.role === 'user') {
      const { userId, aiContext, astrology } = data.dashboard;
      const cacheKey = `user-${userId}-${todayStr}`;
      let geminiData;

      if (dailyCache.has(cacheKey)) {
        geminiData = dailyCache.get(cacheKey);
      } else {
        try {
          const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
          const prompt = `
            You are a master astrologer. Provide a daily forecast.
            User's Zodiac Sign: ${aiContext.sign}
            User's Goal: ${aiContext.primaryGoal}
            Context: ${aiContext.readingSummary}

            Return ONLY a valid JSON object with EXACTLY these keys:
            {
                "overview": "2 sentences of general spiritual advice.",
                "career": "1 sentence on career/karma.",
                "love": "1 sentence on love/relationships.",
                "health": "1 sentence on health/vitality.",
                "remedy": "1 practical spiritual action or remedy.",
                "luckyColor": "e.g. Crimson & Gold",
                "auspiciousTime": "e.g. 10:15 AM - 11:45 AM",
                "mantra": "A relevant short mantra",
                "lunarPhase": "e.g., Waxing Crescent. Ideal for setting intentions."
            }
          `;
          const result = await model.generateContent(prompt);
          const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
          geminiData = JSON.parse(text);
          dailyCache.set(cacheKey, geminiData);
        } catch (err) {
          console.error("Node Gemini API Error:", err);
          geminiData = {
            overview: `The celestial transits today favor conscious introspection for ${aiContext.sign}.`,
            career: "Steady momentum surrounds strategic tasks. Keep goals clear.",
            love: "Empathy and mutual respect create deep, nourishing bonds today.",
            health: "Maintain balanced hydration and take brief moments for mindful pause.",
            remedy: "Practice 5 minutes of mindful breathwork before major tasks.",
            luckyColor: "Royal Indigo",
            auspiciousTime: "11:00 AM - 12:30 PM",
            mantra: "Om Gam Ganapataye Namaha",
            lunarPhase: "Waxing Crescent. Ideal for setting intentions."
          };
        }
      }
      data.dashboard.astrology = { ...astrology, ...geminiData };
      delete data.dashboard.aiContext;
      delete data.dashboard.userId;
    } 
    
    // =====================================================================
    // 2. SPECIALIST GEMINI GENERATION
    // =====================================================================
    else if (data.dashboard && data.dashboard.specialistStats) {
      const role = data.dashboard.role;
      // Cache based on role so we only make 1 call per role per day (saves quota!)
      const cacheKey = `specialist-${role}-${todayStr}`;
      let geminiData;

      if (dailyCache.has(cacheKey)) {
        geminiData = dailyCache.get(cacheKey);
      } else {
        try {
          const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
          const prompt = `
            You are a mentor to spiritual practitioners. Provide a daily cosmic alignment forecast for a ${role}.
            Return ONLY a valid JSON object with EXACTLY these keys:
            {
                "message": "2 sentences of daily guidance advising the practitioner on how to handle client readings today.",
                "channel": "e.g., High Sensitivity, Deep Grounding",
                "crystal": "e.g., Black Tourmaline, Amethyst",
                "chakra": "e.g., Root Chakra, Third Eye"
            }
          `;
          const result = await model.generateContent(prompt);
          const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
          geminiData = JSON.parse(text);
          dailyCache.set(cacheKey, geminiData);
        } catch (err) {
          console.error("Specialist Gemini Error:", err);
          geminiData = {
            message: "Today's planetary currents favor deep discernment and clarity. Anchor your intuition in constructive, empowering remedies.",
            channel: "High Sensitivity",
            crystal: "Grounding Quartz",
            chakra: "Third Eye"
          };
        }
      }
      data.dashboard.specialistStats.alignment = geminiData;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Dashboard Proxy Error:', error);
    return NextResponse.json({ error: 'Failed to connect to backend database' }, { status: 500 });
  }
}