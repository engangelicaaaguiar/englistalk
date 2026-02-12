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
const PRIMARY_MODEL = 'llama-3.3-70b-versatile';

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

  const c2Rule =
    level === 'C2' || level === 'C1'
      ? 'For C1/C2, use rich but warm language: idioms, persuasive framing, and nuanced vocabulary without sounding formal or cold.'
      : 'Use level-appropriate language while keeping a warm, natural tone.';

  return [
    'ROLE: You are Professora Talken, a warm, empathetic, patient English mentor.',
    'MISSION: Make the student enjoy speaking English and keep the conversation flowing naturally.',
    confidenceRule,
    c2Rule,
    'Human-first filter: never start with technical labels such as "Strong message", "Refined alternative", or "Error detected".',
    'Always begin by reacting to the student meaning like a real person would.',
    'Invisible correction (recasting): do not point out mistakes directly; weave the corrected form naturally into your reply.',
    'If meaning is unclear, ask gently: "Did you mean X or Y?" and keep the student safe.',
    'Anti-anxiety rule: if the student makes a simple mistake, normalize it with kind, light self-deprecating humor.',
    'Never judge: no sarcasm, no scolding, no condescending tone.',
    'Keep replies short: maximum 2-3 short sentences so the student speaks around 70% of the time.',
    'Always finish with one easy, inviting follow-up question linked to the topic.',
    'For C1/C2, avoid robotic meta-questions. Prefer reflective invitations such as "That framing sounds more confident. What do you think?"',
    'Output voice tone tag requirement: every reply must start with exactly one tag, either [gentle] or [cheerful].',
    'Never ask mechanical tasks like "add three words" unless the user explicitly requests drill mode.',
  ].join(' ');
}

function buildSystemPrompt(profile: ProfilePayload, isFirstTurn: boolean) {
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
    'Keep answer concise: max 2-3 short sentences.',
    'Use natural contractions and conversational rhythm so voice sounds human, not robotic.',
    'Never use explicit correction labels. Apply recasting naturally in the sentence flow.',
    'Always end with one simple and direct follow-up question.',
    'If the student speaks Portuguese, keep your reply in English, but you may add a tiny Portuguese hint in parentheses for one key word.',
    'If student writes a fragment, scaffold a complete sentence before asking the next question.',
    'Introduce one useful new word naturally in context when possible.',
    'Never say you did not understand if user text exists. Coach from available text.',
    isFirstTurn
      ? 'This is the first teacher turn: greet warmly, answer the student greeting naturally, and begin a fluid conversation.'
      : 'Continue the existing conversation naturally without resetting.',
  ].join('\n');
}

function levelFallback(profile: ProfilePayload, lastUserMessage: string | undefined, isFirstTurn: boolean) {
  const studentText = (lastUserMessage || '').trim();

  if (isFirstTurn) {
    if (profile.currentLevel === 'A1' || profile.currentLevel === 'A2') {
      return '[cheerful] Hi! It is great to meet you, and I am happy to practice with you today. New word: "great" means "otimo". How are you feeling today?';
    }
    return '[cheerful] Hi! I am glad to meet you, and I am ready for a great conversation. New word: "insightful" means full of good ideas. What topic would you like to start with?';
  }

  if (profile.currentLevel === 'A1') {
    if (studentText) {
      return `[gentle] Nice effort, and I understood you well. A natural way to say it is: "Hi teacher, how are you? How was your day?" New word: "busy" means "ocupado". How was your day today?`;
    }
    return '[gentle] Great start, you are doing well. Can you say one short sentence about your day?';
  }

  if (profile.currentLevel === 'A2') {
    if (studentText) {
      return `[cheerful] Nice effort, and your sentence is clear. A natural way to say it is "${studentText}", and you can extend it with "because". Can you add one more idea using "because"?`;
    }
    return '[gentle] Good job so far. Can you tell me one thing you did yesterday?';
  }

  if (profile.currentLevel === 'B1') {
    if (studentText) {
      return `[gentle] That is a good point, and I can see your meaning clearly. A more natural way to phrase it is "${studentText}". Could you add one vivid detail with a stronger adjective?`;
    }
    return '[gentle] Nice flow. Can you explain one plan you have for this week?';
  }

  if (profile.currentLevel === 'B2') {
    if (studentText) {
      return `[cheerful] Clear idea, and your intent is persuasive already. A polished way to say it is "${studentText}". How would you justify this in a short work meeting?`;
    }
    return '[gentle] You are doing well with structure. Can you defend your opinion with one argument and one example?';
  }

  if (profile.currentLevel === 'C1' || profile.currentLevel === 'C2') {
    if (studentText) {
      return `[gentle] I really like where you're going with this idea, and a natural way to say it is: "${studentText}". A small tone shift can make it sound even more persuasive. What tone do you want to project: confident, diplomatic, or assertive?`;
    }
    return '[gentle] You are ready for a nuanced answer, and that is a great sign. Share one opinion and one counterpoint in a calm, persuasive way. What topic do you want to tackle first?';
  }

  return 'Can you say one more sentence so we continue your fluency training?';
}

function needsPersonaRewrite(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return true;

  const startsWithToneTag = /^\[(gentle|cheerful)\]\s+/i.test(trimmed);
  if (!startsWithToneTag) return true;

  const forbiddenStarts = [
    'strong message',
    'refined alternative',
    'alternative refined',
    'error detected',
    'mensagem forte',
    'alternativa refinada',
    'erro detectado',
  ];
  const firstWords = trimmed
    .replace(/^\[(gentle|cheerful)\]\s+/i, '')
    .slice(0, 40)
    .toLowerCase();
  if (forbiddenStarts.some((item) => firstWords.startsWith(item))) return true;

  if (!trimmed.includes('?')) return true;
  if (trimmed.includes('**')) return true;
  return false;
}

async function rewriteWithPersonaGuard(
  groq: ReturnType<typeof createGroq>,
  profile: ProfilePayload,
  rawAssistantText: string,
  lastUserMessage: string | undefined,
) {
  const rewritePrompt = [
    `Current level: ${profile.currentLevel}.`,
    `Student last message: ${lastUserMessage || '(none)'}`,
    '',
    'Rewrite the teacher reply below following these strict rules:',
    '1) Start with exactly one tone tag: [gentle] or [cheerful].',
    '2) First sentence must react warmly to student meaning (human-first).',
    '3) Use invisible correction (recasting), never mention "error", "correct", or "mistake".',
    '4) Keep 2-3 short sentences total.',
    '5) End with one simple inviting question.',
    '6) Never start with technical labels like "Strong message" or "Refined alternative".',
    '7) Keep meaning, but sound natural and warm.',
    '8) Reply in English only.',
    '',
    `Teacher reply to rewrite: ${rawAssistantText}`,
  ].join('\n');

  const rewritten = await generateText({
    model: groq(PRIMARY_MODEL) as any,
    prompt: rewritePrompt,
    maxTokens: 220,
    temperature: 0.35,
  });

  return (rewritten.text || '').trim();
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
    const assistantTurns = recentMessages.filter((m) => m.role === 'assistant').length;
    const isFirstTurn = assistantTurns === 0;

    const groq = createGroq({ apiKey });

    let output = '';
    const firstTry = await generateText({
      model: groq(PRIMARY_MODEL) as any,
      system: buildSystemPrompt(profile, isFirstTurn),
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
        buildSystemPrompt(profile, isFirstTurn),
        '',
        'Conversation transcript:',
        transcript,
        '',
        'Reply as the teacher now with practical coaching and one follow-up question.',
      ].join('\n');

      const retry = await generateText({
        model: groq(PRIMARY_MODEL) as any,
        prompt: retryPrompt,
        maxTokens: 300,
        temperature: 0.65,
      });

      output = (retry.text || '').trim();
    }

    if (output && needsPersonaRewrite(output)) {
      const rewritten = await rewriteWithPersonaGuard(groq, profile, output, lastUserMessage);
      if (rewritten) output = rewritten;
    }

    if (!output) {
      output = levelFallback(profile, lastUserMessage, isFirstTurn);
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
