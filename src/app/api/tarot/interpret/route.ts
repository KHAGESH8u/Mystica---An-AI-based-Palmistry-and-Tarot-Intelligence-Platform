import { NextRequest, NextResponse } from 'next/server';
import { CARD_BY_ID } from '@/lib/tarot';
import { runAIFallback } from '@/lib/ai-fallback';

export async function POST(req: NextRequest) {
  try {
    const { spreadName, question, draw } = await req.json();

    if (!draw || draw.length === 0) {
      return NextResponse.json({ error: 'No cards provided' }, { status: 400 });
    }

    const cardBreakdown = draw
      .map((d: any) => {
        const card = CARD_BY_ID[d.cardId];
        const name = card?.name || d.cardId;
        const orientation = d.orientation || 'upright';
        const position = d.position || 'Position';
        const keywords = card?.keywords ? card.keywords.join(', ') : '';

        return `- **${position}**: ${name} (${orientation}) ${keywords ? `[Themes: ${keywords}]` : ''}`;
      })
      .join('\n');

    const systemInstruction = `You are an intuitive, direct Tarot reader. Provide a structured reading. 
Guidelines:
- 1. The Breakdown: For EVERY card, write exactly ONE concise sentence explaining its meaning in its specific position. Format strictly as: "**[Position] - [Card Name]:** [Your short sentence]"
- 2. The Synthesis: End with an "### Overall Summary" section containing 3 to 4 punchy sentences weaving the whole story together.
- 3. Keep the entire response impactful and moving fast. Do not write long, fluffy introductions.`;

    const prompt = `Spread Type: ${spreadName}\n${question ? `Question: "${question}"` : 'Inquiry: General Guidance'}\n\nCards Drawn:\n${cardBreakdown}`;

    // Generate a safe offline template just in case both Gemini and Groq fail
    const safeFallback = draw.map((d: any) => {
      const card = CARD_BY_ID[d.cardId];
      return `**${d.position || 'Position'} - ${card?.name || d.cardId}:** This card highlights themes of ${card?.keywords?.slice(0, 3).join(', ')} in this area of your life.`;
    }).join('\n\n') + '\n\n### Overall Summary\nThe energies present in this spread suggest a time of transition and reflection. Consider the unique position of each card as a guide for your next steps.';

    // Execute the resilient AI cascade
    const interpretation = await runAIFallback({
      prompt,
      systemInstruction,
      fallbackTemplate: safeFallback
    });

    const cardNames = draw
      .map((d: any) => CARD_BY_ID[d.cardId]?.name)
      .filter(Boolean)
      .join(', ');

    const summary = `A ${spreadName} reading guided by ${cardNames}.`;

    // --- Save Tarot Reading to PostgreSQL via FastAPI ---
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      try {
        const backendUrl = process.env.BACKEND_URL || 'https://mystica-backend.onrender.com';
        await fetch(backendUrl + '/api/readings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader
          },
          body: JSON.stringify({
            readingType: 'tarot',
            summary: summary,
            personalitySynthesis: interpretation,
            rawData: {
              spreadName: spreadName,
              question: question || null,
              draw: draw
            }
          })
        });
        console.log("Tarot reading successfully saved to database!");
      } catch (dbError) {
        console.error('Failed to save tarot reading to DB:', dbError);
      }
    }

    return NextResponse.json({
      interpretation,
      summary,
      id: crypto.randomUUID(),
    });
  } catch (error: any) {
    console.error('Tarot Interpretation Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate AI interpretation' },
      { status: 500 }
    );
  }
}