import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(geminiApiKey);

// Grab Groq key from environment
const groqApiKey = process.env.GROQ_API_KEY || '';

export interface AIFallbackOptions {
  prompt: string;
  systemInstruction?: string;
  fallbackTemplate: string; 
}

export async function runAIFallback(options: AIFallbackOptions): Promise<string> {
  const { prompt, systemInstruction, fallbackTemplate } = options;
  const fullPrompt = systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt;

  // --- TIER 1: GEMINI ---
  if (geminiApiKey) {
    try {
      console.log('Attempting AI Generation: Tier 1 (Gemini)');
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: {
          maxOutputTokens: 4096,
          temperature: 0.7,
        }
      });
      const result = await model.generateContent(fullPrompt);
      const text = result.response.text();
      if (text && text.length > 10) return text; 
    } catch (error) {
      console.error('Tier 1 (Gemini) failed:', error);
    }
  }

  // --- TIER 2: GROQ (LLAMA-3.3-70B) ---
  if (groqApiKey) {
    try {
      console.log('Attempting AI Generation: Tier 2 (Groq)');
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [
            { role: 'system', content: systemInstruction || 'You are a helpful assistant.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_completion_tokens: 4096,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text && text.length > 10) return text;
      } else {
        console.error('Tier 2 (Groq) failed with status:', response.status);
      }
    } catch (error) {
      console.error('Tier 2 (Groq) failed:', error);
    }
  }

  // --- TIER 3: DETERMINISTIC FALLBACK ---
  console.warn('All AI APIs failed. Using Tier 3 Deterministic Fallback.');
  return fallbackTemplate;
}