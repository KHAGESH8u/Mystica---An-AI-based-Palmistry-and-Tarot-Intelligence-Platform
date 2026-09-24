import { NextRequest, NextResponse } from 'next/server';
import { runAIFallback } from '@/lib/ai-fallback';

const BACKEND_URL = process.env.BACKEND_URL || 'https://mystica-backend.onrender.com';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get User Question
    const body = await req.json();
    const { question } = body;
    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // 3. Fetch Database Memory from FastAPI
    let zodiac = "Unknown";
    let goal = "General life clarity";
    let historyContext = "No recent readings.";
    
    try {
      const contextRes = await fetch(`${BACKEND_URL}/api/insights/context`, {
        headers: { 'Authorization': authHeader }
      });
      if (contextRes.ok) {
        const contextData = await contextRes.json();
        zodiac = contextData.zodiac || zodiac;
        goal = contextData.goal || goal;
        historyContext = contextData.history || historyContext;
      }
    } catch (e) {
      console.error("Could not fetch user context from FastAPI", e);
    }

    // 4. Structured prompt for the cascade
    const systemInstruction = `You are the Mystica Spiritual Advisor chatbot.
The seeker is asking a specific question in a live chat session.
CORE INSTRUCTIONS:
1. Answer ONLY the specific question asked by the user.
2. Do NOT provide a generic life report or broad overview.
3. Use past reading results and profile as background context to make your response personally relevant, but do not recite them word-for-word.
4. Keep the response natural, conversational, intuitive, and concise (1-2 direct paragraphs).`;

    const prompt = `SEEKER BACKGROUND & RECENT READING OUTPUTS:
- Zodiac Sign: ${zodiac}
- Core Life Goal: ${goal}
- Past Reading Results:
${historyContext}

USER'S CURRENT CHAT QUESTION:
"${question}"`;

    const fallbackTemplate = `Looking closely at your path as a ${zodiac} focusing on ${goal}, the current energies encourage steady reflection rather than hasty decisions. Trust your intuitive instincts and take practical, grounded steps toward your current question.`;

    // Run Tier 1 (Gemini) -> Tier 2 (Groq) -> Tier 3 (Deterministic)
    const answer = await runAIFallback({
      prompt,
      systemInstruction,
      fallbackTemplate
    });

    // 5. Save the insight to the database as a new reading
    try {
      await fetch(`${BACKEND_URL}/api/readings/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          readingType: "insight",
          summary: "Weekly Holistic Insight",
          personalitySynthesis: answer,
          rawData: { question: question }
        })
      });
    } catch (dbError) {
      console.error("Failed to save insight to history:", dbError);
    }

    // 6. Return to UI
    return NextResponse.json({ answer: answer });

  } catch (error: any) {
    console.error('Insights API Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to consult guide' }, { status: 500 });
  }
}