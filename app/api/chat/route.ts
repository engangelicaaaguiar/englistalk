import { createGroq } from '@ai-sdk/groq';
import { convertToCoreMessages, generateText } from 'ai';

export const maxDuration = 30;

const systemPrompt = `You are "Talken", a friendly English tutor.
1. Keep responses short (max 2 sentences).
2. If the user makes a grammar mistake, correct it using **bold** markdown.
3. Always end with a simple question.
4. Speak friendly and encouraging.`;

function normalizeMessages(messages: any[]) {
  return messages
    .map((m: any) => ({
      role: m?.role,
      content:
        typeof m?.content === 'string'
          ? m.content
          : Array.isArray(m?.content)
            ? m.content
                .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
                .join(' ')
                .trim()
            : '',
    }))
    .filter(
      (m: any) =>
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0,
    )
    .map((m: any) => ({ role: m.role, content: m.content.trim() }));
}

export function GET() {
  return new Response('Health check OK', { status: 200 });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY?.trim();

    if (!apiKey) {
      return Response.json(
        {
          error: 'GROQ_API_KEY nao configurada',
          hint: 'Verifique as variaveis de ambiente no Netlify',
        },
        { status: 500 },
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'JSON invalido no body' }, { status: 400 });
    }

    const rawMessages = body?.messages;
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return Response.json(
        {
          error: 'messages must be a non-empty array',
          received: typeof rawMessages,
        },
        { status: 400 },
      );
    }

    const normalizedMessages = normalizeMessages(rawMessages);
    if (normalizedMessages.length === 0) {
      return Response.json(
        {
          error: 'invalid message shape/content',
          sample: rawMessages?.[0],
          expected: { role: 'user|assistant', content: 'string' },
        },
        { status: 400 },
      );
    }

    const groq = createGroq({ apiKey });
    const recentMessages = normalizedMessages.slice(-12);
    const lastUserMessage = [...recentMessages]
      .reverse()
      .find((m) => m.role === 'user')?.content;

    let output = '';

    const firstTry = await generateText({
      model: groq('llama-3.1-8b-instant') as any,
      system: systemPrompt,
      messages: convertToCoreMessages(recentMessages as any),
      maxTokens: 220,
    });

    output = (firstTry.text || '').trim();

    if (!output) {
      const contextText = recentMessages
        .map((m) => `${m.role === 'user' ? 'Student' : 'Teacher'}: ${m.content}`)
        .join('\n');

      const retryPrompt = [
        'Continue this tutoring conversation.',
        contextText,
        'Now reply as the Teacher in at most 2 sentences.',
        'Correct grammar mistakes with **bold** markdown and always end with a simple question.',
      ].join('\n\n');

      const retry = await generateText({
        model: groq('llama-3.1-8b-instant') as any,
        prompt: retryPrompt,
        maxTokens: 220,
      });

      output = (retry.text || '').trim();
    }

    if (!output) {
      output = lastUserMessage
        ? `Great, I heard you say: "${lastUserMessage}". Can you tell me one more sentence about your day?`
        : 'Great, let us continue in English. Can you try one short sentence?';
    }

    return new Response(output, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error: any) {
    return Response.json(
      {
        error: error?.message ?? 'Unknown error',
        type: error?.name,
        hint: 'Check Netlify function logs for details',
      },
      { status: 500 },
    );
  }
}
