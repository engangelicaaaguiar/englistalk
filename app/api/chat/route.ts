import { createGroq } from '@ai-sdk/groq';
import { convertToCoreMessages, generateText } from 'ai';

export const maxDuration = 30;

type Level = 'beginner' | 'intermediate' | 'advanced';
type Goal = 'daily-conversation' | 'travel' | 'work';
type Voice = 'en-US' | 'en-GB';

type StudentProfile = {
  fullName: string;
  level: Level;
  goal: Goal;
  voice: Voice;
};

const defaultProfile: StudentProfile = {
  fullName: '',
  level: 'beginner',
  goal: 'daily-conversation',
  voice: 'en-US',
};

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

function sanitizeProfile(profile: any): StudentProfile {
  const level: Level =
    profile?.level === 'beginner' || profile?.level === 'intermediate' || profile?.level === 'advanced'
      ? profile.level
      : defaultProfile.level;

  const goal: Goal =
    profile?.goal === 'daily-conversation' || profile?.goal === 'travel' || profile?.goal === 'work'
      ? profile.goal
      : defaultProfile.goal;

  const voice: Voice = profile?.voice === 'en-US' || profile?.voice === 'en-GB' ? profile.voice : defaultProfile.voice;

  const fullName = typeof profile?.fullName === 'string' ? profile.fullName.trim().slice(0, 40) : '';

  return { fullName, level, goal, voice };
}

function levelPersona(level: Level) {
  if (level === 'beginner') {
    return {
      coachName: 'Luna',
      style: [
        'Use CEFR A1-A2 vocabulary only.',
        'Use short and very clear sentences.',
        'If student gives a fragment, help complete a natural full sentence.',
        'Give one correction and one encouraging question.',
        'Max 2 short sentences.',
      ],
    };
  }

  if (level === 'intermediate') {
    return {
      coachName: 'Maya',
      style: [
        'Use CEFR B1-B2 vocabulary with natural spoken English.',
        'Give one concise correction and one better alternative expression.',
        'Keep conversation flowing and practical.',
        'Max 3 sentences.',
      ],
    };
  }

  return {
    coachName: 'Orion',
    style: [
      'Use CEFR C1-C2 language and nuanced feedback.',
      'Refine precision, tone, and fluency with concise coaching.',
      'Challenge the student with a thoughtful follow-up question.',
      'Max 3 sentences.',
    ],
  };
}

function goalDirective(goal: Goal) {
  if (goal === 'travel') {
    return 'Prioritize travel scenarios: airport, hotel, directions, restaurants, emergencies.';
  }
  if (goal === 'work') {
    return 'Prioritize work scenarios: meetings, updates, negotiation, presentations, email tone.';
  }
  return 'Prioritize daily conversation: routine, hobbies, feelings, friends, daily decisions.';
}

function buildSystemPrompt(profile: StudentProfile) {
  const persona = levelPersona(profile.level);
  const nameLine = profile.fullName
    ? `Student name is ${profile.fullName}. Use the name naturally at most once every 3 turns.`
    : 'Student name is unknown. Do not mention a name.';

  return [
    `You are Talken Coach ${persona.coachName}, an English speaking tutor with a warm personality.`,
    nameLine,
    `Student level: ${profile.level}.`,
    `Preferred accent context: ${profile.voice}.`,
    goalDirective(profile.goal),
    ...persona.style,
    'Always respond in English.',
    'If there is a grammar issue, show the corrected part using **bold** markdown.',
    'Never say you did not catch the message if user text exists; coach from what was said.',
    'Always end with one simple, direct question to continue the conversation.',
  ].join('\n');
}

function fallbackReply(profile: StudentProfile, lastUserMessage: string | undefined) {
  const safeUser = (lastUserMessage || '').trim();

  if (profile.level === 'beginner') {
    if (safeUser) {
      return `Great start. You can say: **${safeUser}**. Can you add 3 more words to complete your idea?`;
    }
    return 'Great start. Can you say one short sentence about your day?';
  }

  if (profile.level === 'intermediate') {
    if (safeUser) {
      return `Nice point. A natural version is: **${safeUser}**. Can you expand it with one specific detail?`;
    }
    return 'Good. Can you describe one real situation from today in English?';
  }

  if (safeUser) {
    return `Strong opening. A polished version is: **${safeUser}**. Which nuance would you add to make it more precise?`;
  }
  return 'Let us go deeper. Can you express one opinion and support it briefly?';
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

    const profile = sanitizeProfile(body?.profile);
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
    const recentMessages = normalizedMessages.slice(-14);
    const lastUserMessage = [...recentMessages]
      .reverse()
      .find((m) => m.role === 'user')?.content;

    let output = '';

    const firstTry = await generateText({
      model: groq('llama-3.1-8b-instant') as any,
      system: buildSystemPrompt(profile),
      messages: convertToCoreMessages(recentMessages as any),
      maxTokens: 260,
      temperature: 0.7,
    });

    output = (firstTry.text || '').trim();

    if (!output) {
      const compactTranscript = recentMessages
        .map((m) => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`)
        .join('\n');

      const retryPrompt = [
        buildSystemPrompt(profile),
        '',
        'Conversation so far:',
        compactTranscript,
        '',
        'Reply now as the coach with concrete and useful feedback.',
      ].join('\n');

      const retry = await generateText({
        model: groq('llama-3.1-8b-instant') as any,
        prompt: retryPrompt,
        maxTokens: 260,
        temperature: 0.7,
      });

      output = (retry.text || '').trim();
    }

    if (!output) {
      output = fallbackReply(profile, lastUserMessage);
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
