import { createGroq } from '@ai-sdk/groq';
import { convertToCoreMessages, generateText } from 'ai';

export const maxDuration = 30;

export function GET() {
  return new Response('Health check OK', { status: 200 });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY?.trim();

    if (!apiKey) {
      return Response.json(
        {
          error: 'GROQ_API_KEY não configurada',
          hint: 'Verifique as variáveis de ambiente no Netlify',
        },
        { status: 500 },
      );
    }

    const body = await req.json();
    const { messages } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        {
          error: 'messages must be a non-empty array',
          received: typeof messages,
        },
        { status: 400 },
      );
    }

    const normalizedMessages = messages
      .map((m: any) => ({
        role: m?.role,
        content:
          typeof m?.content === 'string'
            ? m.content
            : Array.isArray(m?.content)
              ? m.content
                  .map((part: any) =>
                    typeof part?.text === 'string' ? part.text : '',
                  )
                  .join(' ')
                  .trim()
              : '',
      }))
      .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && m.content);

    if (normalizedMessages.length === 0) {
      return Response.json(
        {
          error: 'invalid message shape/content',
          sample: messages?.[0],
          expected: { role: 'user|assistant', content: 'string' },
        },
        { status: 400 },
      );
    }

    const groq = createGroq({ apiKey });

    const result = await generateText({
      model: groq('llama-3.1-8b-instant') as any,
      system: `You are "Talken", a friendly English tutor.
1. Keep responses short (max 2 sentences).
2. If the user makes a grammar mistake, correct it using **bold** markdown.
3. Always end with a simple question.
4. Speak friendly and encouraging.`,
      messages: convertToCoreMessages(normalizedMessages as any),
      maxTokens: 250,
    });

    const safeText = (result.text || '').trim();
    const output =
      safeText.length > 0
        ? safeText
        : "I didn't catch that well. Can you try saying that again in one short sentence?";

    return new Response(output, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error: any) {
    return Response.json(
      {
        error: error.message ?? 'Unknown error',
        type: error.name,
        hint: 'Check Netlify function logs for details',
      },
      { status: 500 },
    );
  }
}
