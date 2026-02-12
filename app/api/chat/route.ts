import { createGroq } from '@ai-sdk/groq';
import { convertToCoreMessages, generateText } from 'ai';
import {
  CEFR_BLUEPRINT,
  CEFRLevel,
  CorrectionMode,
  LearningModule,
  mapLegacyLevelToCefr,
} from '../../../lib/cefr';

export const maxDuration = 30;

type ProfilePayload = {
  fullName: string;
  currentLevel: CEFRLevel;
  currentModule: LearningModule;
  correctionMode: CorrectionMode;
  voice: 'en-US' | 'en-GB';
  ttsSpeed: number;
};

const defaultProfile: ProfilePayload = {
  fullName: '',
  currentLevel: 'A1',
  currentModule: 'Daily_Conversation',
  correctionMode: 'friendly',
  voice: 'en-US',
  ttsSpeed: 0.75,
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

function sanitizeModule(value: any): LearningModule {
  if (
    value === 'Daily_Conversation' ||
    value === 'Travel_Logistics' ||
    value === 'Work_Communication' ||
    value === 'Social_Small_Talk' ||
    value === 'Exam_Preparation'
  ) {
    return value;
  }
  return 'Daily_Conversation';
}

function sanitizeProfile(raw: any): ProfilePayload {
  if (!raw || typeof raw !== 'object') return defaultProfile;

  return {
    fullName: typeof raw.fullName === 'string' ? raw.fullName.trim().slice(0, 40) : '',
    currentLevel: mapLegacyLevelToCefr(raw.currentLevel),
    currentModule: sanitizeModule(raw.currentModule),
    correctionMode: raw.correctionMode === 'strict' ? 'strict' : 'friendly',
    voice: raw.voice === 'en-GB' ? 'en-GB' : 'en-US',
    ttsSpeed: typeof raw.ttsSpeed === 'number' ? raw.ttsSpeed : defaultProfile.ttsSpeed,
  };
}

function moduleDirective(moduleName: LearningModule) {
  if (moduleName === 'Travel_Logistics') {
    return 'Context focus: airports, hotels, directions, transport, food ordering, emergencies.';
  }
  if (moduleName === 'Work_Communication') {
    return 'Context focus: meetings, status updates, negotiations, presentations, professional tone.';
  }
  if (moduleName === 'Social_Small_Talk') {
    return 'Context focus: greetings, hobbies, friends, opinions, casual interaction.';
  }
  if (moduleName === 'Exam_Preparation') {
    return 'Context focus: exam-like prompts, coherent arguments, precision under pressure.';
  }
  return 'Context focus: daily life, routines, practical conversation.';
}

function correctionDirective(mode: CorrectionMode) {
  if (mode === 'strict') {
    return [
      'Be rigorous in corrections.',
      'Correct every relevant grammar issue that blocks natural fluency.',
      'Prefer exact and native-like alternatives.',
    ].join(' ');
  }

  return [
    'Be friendly and confidence-first.',
    'Correct only one key issue per turn unless understanding breaks.',
    'Prioritize flow and safety before perfection.',
  ].join(' ');
}

function personaInstruction(level: CEFRLevel) {
  const confidenceRule =
    level === 'A1' || level === 'A2'
      ? 'Prioritize confidence above accuracy in this stage.'
      : 'Balance confidence and accuracy while preserving conversational flow.';

  return [
    'ROLE: You are Professora Talken, an empathetic, patient, and highly perceptive English mentor.',
    'MISSION: Make the student love speaking English and keep conversation fluid.',
    confidenceRule,
    'Response protocol 1 - Validation first: start every reply by validating effort or content (for example: "Great effort!", "Interesting!", "I agree!").',
    'Response protocol 2 - Invisible correction: when errors are mild, reply with the corrected form naturally without scolding.',
    'Response protocol 3 - Severe clarity issue: if meaning is unclear, ask gently: "Did you mean X or Y?".',
    'Response protocol 4 - Never judge: no sarcasm, no condescension, no disapproval tone.',
    'Response protocol 5 - Keep it short: 2-3 short sentences max.',
    'Response protocol 6 - Continuity trigger: always end with an easy related question so the student knows what to answer next.',
  ].join(' ');
}

function buildSystemPrompt(profile: ProfilePayload) {
  const blueprint = CEFR_BLUEPRINT[profile.currentLevel];
  const studentNameLine = profile.fullName
    ? `Student name: ${profile.fullName}. Use it naturally, no more than once every 3 turns.`
    : 'Student name unknown. Do not force name usage.';

  return [
    'You are Talken, a safe and encouraging English fluency teacher.',
    studentNameLine,
    `Current CEFR level: ${profile.currentLevel}.`,
    `JTBD: ${blueprint.jtbd}`,
    `Vocabulary rule: ${blueprint.vocabularyRule}`,
    `Grammar focus: ${blueprint.grammarFocus.join(', ')}.`,
    `Correction style baseline: ${blueprint.correctionStyle}`,
    correctionDirective(profile.correctionMode),
    moduleDirective(profile.currentModule),
    personaInstruction(profile.currentLevel),
    `Speech context for rhythm: ${profile.voice} at around ${profile.ttsSpeed.toFixed(2)}x speed.`,
    'Always respond in English.',
    'Keep answer concise: max 3 short sentences.',
    'If there is a grammar issue, show corrected fragment in **bold** markdown.',
    'Always end with one simple and direct follow-up question.',
    'If student writes a fragment, scaffold a complete sentence before asking the next question.',
    'Never say you did not understand if user text exists. Coach from available text.',
  ].join('\n');
}

function levelFallback(profile: ProfilePayload, lastUserMessage: string | undefined) {
  const studentText = (lastUserMessage || '').trim();

  if (profile.currentLevel === 'A1') {
    if (studentText) {
      return `Great start. A clear version is: **${studentText}**. Can you add 3 more words to finish your idea?`;
    }
    return 'Great start. Can you say one short sentence about your day?';
  }

  if (profile.currentLevel === 'A2') {
    if (studentText) {
      return `Nice sentence. A better version is: **${studentText}**. Can you connect another idea using because?`;
    }
    return 'Good. Can you tell me one thing you did yesterday?';
  }

  if (profile.currentLevel === 'B1') {
    if (studentText) {
      return `Good point. A stronger phrasing is: **${studentText}**. Can you add one detail with a richer adjective?`;
    }
    return 'Nice. Can you explain one plan you have for this week?';
  }

  if (profile.currentLevel === 'B2') {
    if (studentText) {
      return `Clear idea. A more natural version is: **${studentText}**. How would you justify this in a work meeting?`;
    }
    return 'Can you defend your opinion with one argument and one example?';
  }

  if (profile.currentLevel === 'C1' || profile.currentLevel === 'C2') {
    if (studentText) {
      return `Strong message. A refined alternative is: **${studentText}**. What nuance would make this more persuasive?`;
    }
    return 'Can you present a nuanced opinion and contrast it with one counterpoint?';
  }

  return 'Can you say one more sentence so we continue your fluency training?';
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

    const recentMessages = normalizedMessages.slice(-14);
    const lastUserMessage = [...recentMessages]
      .reverse()
      .find((m) => m.role === 'user')?.content;

    const groq = createGroq({ apiKey });

    let output = '';
    const firstTry = await generateText({
      model: groq('llama-3.1-8b-instant') as any,
      system: buildSystemPrompt(profile),
      messages: convertToCoreMessages(recentMessages as any),
      maxTokens: 300,
      temperature: 0.65,
    });

    output = (firstTry.text || '').trim();

    if (!output) {
      const transcript = recentMessages
        .map((m) => `${m.role === 'user' ? 'Student' : 'Teacher'}: ${m.content}`)
        .join('\n');

      const retryPrompt = [
        buildSystemPrompt(profile),
        '',
        'Conversation transcript:',
        transcript,
        '',
        'Reply as the teacher now with practical coaching and one follow-up question.',
      ].join('\n');

      const retry = await generateText({
        model: groq('llama-3.1-8b-instant') as any,
        prompt: retryPrompt,
        maxTokens: 300,
        temperature: 0.65,
      });

      output = (retry.text || '').trim();
    }

    if (!output) {
      output = levelFallback(profile, lastUserMessage);
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
