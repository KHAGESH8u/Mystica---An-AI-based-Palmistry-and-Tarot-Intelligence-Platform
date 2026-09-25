import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import { runAIFallback } from '@/lib/ai-fallback'; // We'll use the fallback here too!

const PALMISTRY_API_URL = process.env.PALMISTRY_API_URL || 'http://palmistry-ai:8001';

interface PalmLinePrediction {
  detected: boolean;
  confidence: number;
  points: [number, number][];
}

interface PalmistryApiResponse {
  success: boolean;
  model: string;
  message: string;
  filename: string;
  lines: {
    life_line: PalmLinePrediction;
    head_line: PalmLinePrediction;
    heart_line: PalmLinePrediction;
    fate_line: PalmLinePrediction;
    sun_line: PalmLinePrediction;
  };
}

function describeConfidence(confidence: number): string {
  if (confidence >= 0.85) return 'very clearly defined';
  if (confidence >= 0.6) return 'reasonably well defined';
  if (confidence >= 0.35) return 'faint and hard to trace';
  return 'barely visible in this image';
}

function describeLine(name: string, line: PalmLinePrediction, handType: 'left' | 'right'): string {
  if (!line.detected) {
    return `The ${name} could not be confidently detected on your ${handType} hand from this photo.`;
  }
  const pct = Math.round(line.confidence * 100);
  return `Your ${name} is ${describeConfidence(line.confidence)} on your ${handType} hand (confidence ${pct}%).`;
}

export async function POST(req: NextRequest) {
  try {
    const { image, handType } = await req.json();
    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    const hand = handType === 'left' ? 'left' : 'right';

    // 1. Intercept and isolate the Base64 image data
    const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) throw new Error('Invalid image data URL');
    const imageBuffer = Buffer.from(match[2], 'base64');

    // 2. COMPRESSION STEP: Shrink to 800x800 (~80KB) to prevent Render memory crashes
    const compressedBuffer = await sharp(imageBuffer)
      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const compressedBlob = new Blob([new Uint8Array(compressedBuffer)], { type: 'image/jpeg' });
    const optimizedBase64ForDB = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;

    // 3. Send lightweight image to Python Backend (Memory-safe)
    const formData = new FormData();
    formData.append('file', compressedBlob, 'palm_optimized.jpg');

    const apiResponse = await fetch(`${PALMISTRY_API_URL}/predict`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(120_000),
    });

    if (!apiResponse.ok) {
      return NextResponse.json({ error: 'Palm analysis vision service failed' }, { status: 502 });
    }

    const prediction = (await apiResponse.json()) as PalmistryApiResponse;
    const { lines } = prediction;

    // 4. Format the Python metrics into a prompt for our AI Fallback
    const lineDescriptions = [
      describeLine('life line', lines.life_line, hand),
      describeLine('heart line', lines.heart_line, hand),
      describeLine('head line', lines.head_line, hand),
      describeLine('fate line', lines.fate_line, hand),
      describeLine('sun line', lines.sun_line, hand),
    ].join('\n');

    const systemInstruction = `You are an expert palm reader. I have used a computer vision model to scan a user's ${hand} hand. Write a short, engaging, and mystical 2-paragraph personality synthesis based ONLY on these line strengths. Keep it under 150 words. Do not list the confidence percentages, just interpret what strong/faint/missing lines mean.`;
    
    const prompt = `Here is the technical data from the scan:\n\n${lineDescriptions}`;

    const fallbackTemplate = `Based on the unique patterns detected on your ${hand} hand, the lines reflect a journey of steady growth and deep internal reflection. While the exact depths of your heart and fate lines hold their own mysteries today, the overall energy of your palm suggests resilience and intuitive strength moving forward.`;

    // Use our new resilient AI cascade!
    const personality = await runAIFallback({
      prompt,
      systemInstruction,
      fallbackTemplate
    });

    const detectedLines = Object.values(lines).filter((l) => l.detected);
    const summary = prediction.success
      ? `${detectedLines.length} of 5 palm lines were successfully analyzed on your ${hand} hand. Here is your AI-synthesized reading.`
      : 'The palm analysis service could not process this image fully. Please try a clearer photo.';

    // 5. Save safe, compressed data to PostgreSQL
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
            readingType: 'palm',
            summary: summary,
            personalitySynthesis: personality,
            imageUrl: optimizedBase64ForDB, // <--- Saves 80KB instead of 10MB!
            rawData: {
              handType: hand,
              lines: lines
            }
          })
        });
      } catch (dbError) {
        console.error('Failed to save reading to DB:', dbError);
      }
    }

    return NextResponse.json({
      summary,
      lifeLine: describeLine('life line', lines.life_line, hand),
      heartLine: describeLine('heart line', lines.heart_line, hand),
      headLine: describeLine('head line', lines.head_line, hand),
      fateLine: describeLine('fate line', lines.fate_line, hand),
      sunLine: describeLine('sun line', lines.sun_line, hand),
      personality,
      recommendations: [
        'For a more precise reading, use natural daylight.',
        'Ensure your palm is flat and fully visible inside the scanner box.'
      ],
      id: crypto.randomUUID(),
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to analyze palm' }, { status: 500 });
  }
}