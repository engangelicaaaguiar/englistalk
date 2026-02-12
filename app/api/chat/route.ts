import { createGroq } from '@ai-sdk/groq';
import { convertToCoreMessages, generateText } from 'ai';
import {
  CEFR_BLUEPRINT,
  CEFRLevel,
  CorrectionMode,
  LearningModule,
  mapLegacyLevelToCefr,
} from '../../../lib/cefr';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';

export const maxDuration = 30;
const MODEL_FALLBACK_CHAIN = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-20b',
] as const;
const HTTP_EMPTY_OUTPUT_RECOVERY_MODELS = new Set<ModelId>([
  'llama-3.1-8b-instant',
  'openai/gpt-oss-20b',
]);
const PRIMARY_TEMPERATURE = 0.7;
const PRIMARY_MAX_TOKENS = 150;
const PRIMARY_PRESENCE_PENALTY = 0.6;

type ModelId = (typeof MODEL_FALLBACK_CHAIN)[number];

type ProfilePayload = {
  userId: string;
  fullName: string;
  currentLevel: CEFRLevel;
  currentModule: LearningModule;
  correctionMode: CorrectionMode;
  voice: 'en-US' | 'en-GB';
  ttsSpeed: number;
};

const defaultProfile: ProfilePayload = {
  userId: '',
  fullName: '',
  currentLevel: 'A1',
  currentModule: 'Daily_Conversation',
  correctionMode: 'friendly',
  voice: 'en-US',
  ttsSpeed: 0.75,
};

type BrainPhase = 'pre_task' | 'task_cycle' | 'planning_refine' | 'report' | 'language_focus';

type BrainSession = {
  id: string;
  phase: BrainPhase;
  scenario: string;
  task_goal: string;
  turn_count: number;
  stt_student_tokens: number;
  stt_teacher_tokens: number;
  language_gap_count: number;
};

type RuntimeMetrics = {
  studentTokens: number;
  teacherTokens: number;
  teacherTalkPct: number;
  ptRatio: number;
  shortMessageStreak: number;
};

type TransitionEval = {
  nextPhase: BrainPhase;
  reason: string;
  role: string;
  outcomeAchieved: boolean;
  gentleScaffolding: boolean;
  shortenResponse: boolean;
};

type TurnIntent =
  | 'language_gap'
  | 'feedback'
  | 'help_me'
  | 'upgrade'
  | 'start'
  | 'greeting'
  | 'how_are_you'
  | 'how_was_day'
  | 'preference'
  | 'routine'
  | 'location'
  | 'family'
  | 'ability'
  | 'open_question'
  | 'statement'
  | 'fragment';

const SEMANTIC_STOP_WORDS = new Set([
  'the',
  'and',
  'but',
  'for',
  'with',
  'that',
  'this',
  'your',
  'have',
  'has',
  'was',
  'were',
  'are',
  'you',
  'how',
  'what',
  'where',
  'when',
  'which',
  'who',
  'why',
  'can',
  'could',
  'would',
  'should',
  'does',
  'did',
  'do',
  'is',
  'it',
  'my',
  'today',
  'really',
  'very',
]);

const WORD_HINTS_PT: Record<string, string> = {
  great: 'otimo',
  relaxed: 'relaxado',
  productive: 'produtivo',
  routine: 'rotina',
  prefer: 'preferir',
  neighborhood: 'bairro',
  siblings: 'irmaos',
  recipe: 'receita',
  confident: 'confiante',
  improve: 'melhorar',
};

type ModelAttemptFailure = {
  model: ModelId;
  stage: 'primary' | 'retry' | 'persona_rewrite';
  status: number | null;
  category: 'rate_limit' | 'timeout' | 'provider' | 'auth' | 'empty_output' | 'unknown';
  name: string;
  error: string;
};

type GenerateWithModelFallbackParams = {
  groq: ReturnType<typeof createGroq>;
  apiKey: string;
  stage: 'primary' | 'retry' | 'persona_rewrite';
  system?: string;
  messages?: any;
  prompt?: string;
  maxTokens?: number;
  temperature?: number;
  presencePenalty?: number;
};

type GenerateWithModelFallbackResult = {
  text: string;
  modelUsed: ModelId;
  attempts: ModelAttemptFailure[];
};

function normalizeChatContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join(' ')
      .trim();
  }
  return '';
}

function buildGroqHttpMessages(params: {
  system?: string;
  messages?: any;
  prompt?: string;
}) {
  const payloadMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  if (typeof params.system === 'string' && params.system.trim()) {
    payloadMessages.push({ role: 'system', content: params.system.trim() });
  }

  if (Array.isArray(params.messages) && params.messages.length > 0) {
    for (const msg of params.messages) {
      const role = msg?.role === 'assistant' ? 'assistant' : msg?.role === 'system' ? 'system' : 'user';
      const content = normalizeChatContent(msg?.content);
      if (!content) continue;
      payloadMessages.push({ role, content });
    }
  } else if (typeof params.prompt === 'string' && params.prompt.trim()) {
    payloadMessages.push({ role: 'user', content: params.prompt.trim() });
  }

  return payloadMessages;
}

async function recoverFromEmptyOutputViaHttp(params: {
  apiKey: string;
  modelId: ModelId;
  system?: string;
  messages?: any;
  prompt?: string;
  maxTokens?: number;
  temperature?: number;
  presencePenalty?: number;
}) {
  const messages = buildGroqHttpMessages({
    system: params.system,
    messages: params.messages,
    prompt: params.prompt,
  });

  if (messages.length === 0) {
    return {
      ok: false as const,
      status: null,
      category: 'empty_output' as const,
      name: 'HttpFallbackNoMessages',
      error: 'HTTP fallback skipped because message payload is empty.',
    };
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.modelId,
      messages,
      temperature: params.temperature ?? PRIMARY_TEMPERATURE,
      max_tokens: params.maxTokens ?? PRIMARY_MAX_TOKENS,
      presence_penalty: params.presencePenalty ?? PRIMARY_PRESENCE_PENALTY,
    }),
  });

  const rawBody = await response.text();
  let parsed: any = null;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const errMsg = String(parsed?.error?.message || rawBody || 'unknown http fallback error');
    let category: ModelAttemptFailure['category'] = 'unknown';
    const lowered = errMsg.toLowerCase();
    if (response.status === 401 || response.status === 403 || lowered.includes('invalid api key')) {
      category = 'auth';
    } else if (
      response.status === 429 ||
      lowered.includes('rate limit') ||
      lowered.includes('tokens per day') ||
      lowered.includes('quota')
    ) {
      category = 'rate_limit';
    } else if (
      response.status === 408 ||
      lowered.includes('timeout') ||
      lowered.includes('timed out')
    ) {
      category = 'timeout';
    } else if (
      [500, 502, 503, 504, 529].includes(response.status) ||
      lowered.includes('service unavailable') ||
      lowered.includes('provider')
    ) {
      category = 'provider';
    }

    return {
      ok: false as const,
      status: response.status,
      category,
      name: 'HttpFallbackError',
      error: errMsg.slice(0, 320),
    };
  }

  const content = String(parsed?.choices?.[0]?.message?.content || '').trim();
  if (!content) {
    return {
      ok: false as const,
      status: response.status,
      category: 'empty_output' as const,
      name: 'HttpFallbackEmptyContent',
      error: 'HTTP fallback returned success but empty message content.',
    };
  }

  return {
    ok: true as const,
    text: content,
    status: response.status,
  };
}

function shouldFallbackToNextModel(error: any) {
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.statusCode || error?.status || 0);
  const retryablePatterns = [
    'rate limit',
    'tokens per day',
    'tokens per minute',
    'requests per minute',
    'requests per day',
    'tpd',
    'tpm',
    'rpm',
    'rpd',
    'quota',
    'capacity',
    'temporarily unavailable',
    'service unavailable',
    'model unavailable',
    'overloaded',
    'too many requests',
    'failed after',
  ];

  if (status === 429 || status === 503 || status === 529) return true;
  if (error?.name === 'AI_RetryError') return true;
  return retryablePatterns.some((pattern) => message.includes(pattern));
}

function summarizeError(error: any) {
  const rawMessage = String(error?.message || error || '').replace(/\s+/g, ' ').trim();
  const statusCandidates = [
    error?.statusCode,
    error?.status,
    error?.response?.status,
    error?.cause?.status,
    error?.cause?.statusCode,
  ];
  const status = statusCandidates.find((value: any) => Number.isFinite(Number(value)));
  const numericStatus = typeof status === 'undefined' ? null : Number(status);
  const lowered = rawMessage.toLowerCase();

  let category: ModelAttemptFailure['category'] = 'unknown';
  if (numericStatus === 401 || numericStatus === 403 || lowered.includes('invalid api key')) {
    category = 'auth';
  } else if (
    numericStatus === 429 ||
    lowered.includes('rate limit') ||
    lowered.includes('tokens per day') ||
    lowered.includes('tokens per minute') ||
    lowered.includes('quota')
  ) {
    category = 'rate_limit';
  } else if (
    numericStatus === 408 ||
    lowered.includes('timeout') ||
    lowered.includes('timed out') ||
    lowered.includes('aborted')
  ) {
    category = 'timeout';
  } else if (
    numericStatus === 500 ||
    numericStatus === 502 ||
    numericStatus === 503 ||
    numericStatus === 504 ||
    numericStatus === 529 ||
    lowered.includes('service unavailable') ||
    lowered.includes('model unavailable') ||
    lowered.includes('provider')
  ) {
    category = 'provider';
  }

  return {
    status: numericStatus,
    category,
    name: String(error?.name || 'Error'),
    message: rawMessage.slice(0, 320),
  };
}

async function generateTextWithModelFallback(
  params: GenerateWithModelFallbackParams,
): Promise<GenerateWithModelFallbackResult> {
  const attempts: ModelAttemptFailure[] = [];
  let lastError: any = null;

  for (const modelId of MODEL_FALLBACK_CHAIN) {
    try {
      const options: any = {
        model: params.groq(modelId) as any,
        maxTokens: params.maxTokens ?? PRIMARY_MAX_TOKENS,
        temperature: params.temperature ?? PRIMARY_TEMPERATURE,
      };

      if (typeof params.presencePenalty === 'number') {
        options.presencePenalty = params.presencePenalty;
      }
      if (typeof params.system === 'string') options.system = params.system;
      if (params.messages) options.messages = params.messages;
      if (typeof params.prompt === 'string') options.prompt = params.prompt;

      const generated = await generateText(options);
      const text = (generated.text || '').trim();
      if (!text) {
        const emptyAttempt: ModelAttemptFailure = {
          model: modelId,
          stage: params.stage,
          status: null,
          category: 'empty_output',
          name: 'EmptyTextResponse',
          error: 'Model returned success but empty text payload.',
        };
        attempts.push(emptyAttempt);
        console.warn(
          `[talken:model-fallback] stage=${params.stage} model=${modelId} status=n/a category=empty_output name=EmptyTextResponse message="Model returned success but empty text payload."`,
        );

        if (HTTP_EMPTY_OUTPUT_RECOVERY_MODELS.has(modelId)) {
          try {
            const recovered = await recoverFromEmptyOutputViaHttp({
              apiKey: params.apiKey,
              modelId,
              system: params.system,
              messages: params.messages,
              prompt: params.prompt,
              maxTokens: params.maxTokens,
              temperature: params.temperature,
              presencePenalty: params.presencePenalty,
            });

            if (recovered.ok) {
              console.info(
                `[talken:model-fallback] stage=${params.stage} model=${modelId} recovery=http status=${recovered.status} category=ok`,
              );
              return {
                text: recovered.text,
                modelUsed: modelId,
                attempts,
              };
            }

            attempts.push({
              model: modelId,
              stage: params.stage,
              status: recovered.status,
              category: recovered.category,
              name: recovered.name,
              error: recovered.error,
            });
            console.warn(
              `[talken:model-fallback] stage=${params.stage} model=${modelId} recovery=http status=${recovered.status ?? 'n/a'} category=${recovered.category} name=${recovered.name} message="${recovered.error}"`,
            );
          } catch (httpError: any) {
            const meta = summarizeError(httpError);
            attempts.push({
              model: modelId,
              stage: params.stage,
              status: meta.status,
              category: meta.category,
              name: 'HttpFallbackException',
              error: meta.message,
            });
            console.warn(
              `[talken:model-fallback] stage=${params.stage} model=${modelId} recovery=http status=${meta.status ?? 'n/a'} category=${meta.category} name=HttpFallbackException message="${meta.message}"`,
            );
          }
        }
        continue;
      }

      return {
        text,
        modelUsed: modelId,
        attempts,
      };
    } catch (error: any) {
      lastError = error;
      const meta = summarizeError(error);
      attempts.push({
        model: modelId,
        stage: params.stage,
        status: meta.status,
        category: meta.category,
        name: meta.name,
        error: meta.message,
      });
      console.warn(
        `[talken:model-fallback] stage=${params.stage} model=${modelId} status=${meta.status ?? 'n/a'} category=${meta.category} name=${meta.name} message="${meta.message}"`,
      );

      if (!shouldFallbackToNextModel(error)) break;
    }
  }

  const trace = attempts.map((a) => `${a.model}: ${a.error}`).join(' | ');
  const reason = String(lastError?.message || 'unknown model fallback error');
  const fallbackError = new Error(`Model fallback failed. Last error: ${reason}. Attempts: ${trace}`);
  (fallbackError as any).attempts = attempts;
  throw fallbackError;
}

function tokenCount(text: string | undefined) {
  if (!text) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function inferPhase(turnCount: number): BrainPhase {
  if (turnCount <= 1) return 'pre_task';
  if (turnCount <= 5) return 'task_cycle';
  if (turnCount <= 7) return 'planning_refine';
  if (turnCount <= 9) return 'report';
  return 'language_focus';
}

function phaseRole(phase: BrainPhase) {
  if (phase === 'pre_task') return 'Instigator & Primer';
  if (phase === 'task_cycle') return 'Invisible Monitor';
  if (phase === 'planning_refine') return 'Language Advisor';
  if (phase === 'report') return 'Chairperson';
  return 'Analyst & Detective';
}

function isHelpMeIntent(text: string) {
  return /\b(how do i say|como digo|how can i say|what is .* in english)\b/i.test(text);
}

function isUpgradeIntent(text: string) {
  return /\b(more persuasive|refined|natural way|upgrade|c2|more natural)\b/i.test(text);
}

function detectStartIntent(text: string) {
  return /\b(ok(ay)?|let'?s start|i'?m ready|ready|vamos|bora|pode comecar)\b/i.test(text);
}

function detectPlanningDone(text: string) {
  return /\b(i'?m done|final version|this is my final|finished|done|pronto|vers[aã]o final)\b/i.test(text);
}

function detectReportEnd(text: string) {
  return /\b(that'?s all|all done|finished|done|encerrado|fim|end)\b/i.test(text);
}

function isFeedbackIntent(text: string) {
  return /\b(feedback|review my answer|avaliacao|avaliação)\b/i.test(text);
}

function isLanguageGapIntent(text: string) {
  return /\b(language gap|gap analysis|native would speak|native would say)\b/i.test(text);
}

function extractPreferenceOptions(text: string) {
  const match = text.match(/\bprefer\s+([a-z ]+?)\s+or\s+([a-z ]+?)(?:\?|$)/i);
  if (!match) return null;
  return {
    first: match[1].trim().toLowerCase(),
    second: match[2].trim().toLowerCase(),
  };
}

function normalizeSemanticWords(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !SEMANTIC_STOP_WORDS.has(word));
}

function detectTurnIntent(params: {
  text: string;
  helpMeMode: boolean;
  upgradeMode: boolean;
  feedbackMode: boolean;
  languageGapMode: boolean;
}): TurnIntent {
  const { text, helpMeMode, upgradeMode, feedbackMode, languageGapMode } = params;
  const normalized = text.toLowerCase().trim();

  if (languageGapMode || /language gap/.test(normalized)) return 'language_gap';
  if (feedbackMode || /feedback/.test(normalized)) return 'feedback';
  if (helpMeMode) return 'help_me';
  if (upgradeMode) return 'upgrade';
  if (detectStartIntent(normalized)) return 'start';
  if (/\b(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(normalized)) return 'greeting';
  if (/\bhow are you|how's it going|how do you feel\b/.test(normalized)) return 'how_are_you';
  if (/\bhow was your day|how is your day|how was today|how was your day today\b/.test(normalized)) return 'how_was_day';
  if (/\bprefer\b/.test(normalized) && /\bor\b/.test(normalized)) return 'preference';
  if (/\b(weekend|weekends|usually do|routine)\b/.test(normalized)) return 'routine';
  if (/\b(where do you live|big city|small city|city)\b/.test(normalized)) return 'location';
  if (/\b(brother|brothers|sister|sisters|siblings|family)\b/.test(normalized)) return 'family';
  if (/\b(can you cook|can you)\b/.test(normalized)) return 'ability';
  if (normalized.endsWith('?')) return 'open_question';
  if (tokenCount(normalized) <= 4) return 'fragment';
  return 'statement';
}

function intentConversationDirective(intent: TurnIntent, level: CEFRLevel) {
  const levelHint =
    level === 'A1' || level === 'A2'
      ? 'Use very simple short English and avoid abstract explanations.'
      : 'Keep language natural and concise while maintaining pedagogical flow.';

  if (intent === 'how_are_you' || intent === 'how_was_day') {
    return `${levelHint} The student asked about you: answer naturally first, then invite the student to share their day.`;
  }

  if (intent === 'preference') {
    return `${levelHint} The student asked about a preference: answer with one reason, then ask the same preference back.`;
  }

  if (intent === 'routine' || intent === 'location' || intent === 'family' || intent === 'ability') {
    return `${levelHint} Answer the student question directly in one short sentence, add one natural detail, then ask one related follow-up.`;
  }

  if (intent === 'fragment') {
    return `${levelHint} Student gave a fragment: gently complete it into a natural sentence and ask a simple continuation question.`;
  }

  if (intent === 'start' || intent === 'greeting') {
    return `${levelHint} Open warmly and naturally, then ask one easy question to keep the student speaking.`;
  }

  if (intent === 'help_me' || intent === 'upgrade') {
    return 'Provide one concise chunk upgrade and immediately continue the conversation with one easy question.';
  }

  if (intent === 'feedback' || intent === 'language_gap') {
    return 'Provide concise feedback anchored to learner wording, then ask for one repetition or reformulation.';
  }

  return `${levelHint} React to meaning, keep 2-3 short sentences, and end with one easy follow-up question.`;
}

function estimatePtRatio(text: string) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-zà-ÿ'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return 0;

  const ptHints = new Set([
    'eu', 'voce', 'você', 'meu', 'minha', 'bom', 'boa', 'hoje', 'ontem', 'amanha', 'amanhã',
    'quero', 'gosto', 'nao', 'não', 'com', 'para', 'professora', 'dia', 'como', 'vai',
  ]);

  const ptCount = tokens.filter((t) => ptHints.has(t)).length;
  return ptCount / tokens.length;
}

function detectAffectiveState(metrics: RuntimeMetrics) {
  const highAnxiety = metrics.ptRatio >= 0.35 || metrics.shortMessageStreak >= 2;
  return {
    state: highAnxiety ? 'High Anxiety' : 'Stable',
    highAnxiety,
    signals: {
      pt_ratio: Number(metrics.ptRatio.toFixed(2)),
      short_message_streak: metrics.shortMessageStreak,
      teacher_talk_pct: metrics.teacherTalkPct,
    },
  };
}

function computeRuntimeMetrics(recentMessages: Array<{ role: string; content: string }>, lastUserText: string) {
  const studentMessages = recentMessages.filter((m) => m.role === 'user');
  const teacherMessages = recentMessages.filter((m) => m.role === 'assistant');
  const studentTokens = studentMessages.reduce((acc, m) => acc + tokenCount(m.content), 0);
  const teacherTokens = teacherMessages.reduce((acc, m) => acc + tokenCount(m.content), 0);
  const total = studentTokens + teacherTokens;
  const teacherTalkPct = total === 0 ? 0 : Math.round((teacherTokens / total) * 100);
  const ptRatio = estimatePtRatio(lastUserText);

  const shortMessageStreak = [...studentMessages]
    .reverse()
    .slice(0, 3)
    .reduce((acc, m) => (tokenCount(m.content) <= 3 ? acc + 1 : acc), 0);

  return {
    studentTokens,
    teacherTokens,
    teacherTalkPct,
    ptRatio,
    shortMessageStreak,
  } as RuntimeMetrics;
}

function detectOutcomeAchieved(moduleName: LearningModule, recentMessages: Array<{ role: string; content: string }>) {
  const userText = recentMessages
    .filter((m) => m.role === 'user')
    .map((m) => m.content.toLowerCase())
    .join(' ');

  if (moduleName === 'Travel_Logistics') {
    return /\b(book(ed)?|ticket|platform|check[- ]?in|reservation|hotel|room|train|flight)\b/.test(userText);
  }
  if (moduleName === 'Work_Communication') {
    return /\b(meeting|deadline|status|deliverable|client|proposal|agree|decision)\b/.test(userText);
  }
  if (moduleName === 'Social_Small_Talk') {
    return false;
  }
  if (moduleName === 'Exam_Preparation') {
    return /\b(on the one hand|on the other hand|however|in conclusion|argument|counterpoint)\b/.test(userText);
  }
  return false;
}

function evaluateTransition(params: {
  phase: BrainPhase;
  lastUserText: string;
  moduleName: LearningModule;
  recentMessages: Array<{ role: string; content: string }>;
  metrics: RuntimeMetrics;
  helpMeIntent: boolean;
  upgradeIntent: boolean;
  feedbackIntent: boolean;
  languageGapIntent: boolean;
}) {
  const {
    phase,
    lastUserText,
    moduleName,
    recentMessages,
    metrics,
    helpMeIntent,
    upgradeIntent,
    feedbackIntent,
    languageGapIntent,
  } = params;
  const outcomeAchieved = detectOutcomeAchieved(moduleName, recentMessages);
  const gentleScaffolding = metrics.ptRatio >= 0.35 || metrics.shortMessageStreak >= 2;
  const shortenResponse = metrics.teacherTalkPct > 30;
  const openConversationModule =
    moduleName === 'Daily_Conversation' || moduleName === 'Social_Small_Talk';

  let nextPhase = phase;
  let reason = 'no_transition';

  if (openConversationModule) {
    if (phase === 'pre_task' && (detectStartIntent(lastUserText) || tokenCount(lastUserText) >= 2)) {
      nextPhase = 'task_cycle';
      reason = 'conversation_started';
    } else if (
      (phase === 'task_cycle' || phase === 'pre_task') &&
      (feedbackIntent || languageGapIntent)
    ) {
      nextPhase = 'language_focus';
      reason = 'feedback_requested';
    } else if (phase === 'task_cycle' && (helpMeIntent || upgradeIntent)) {
      nextPhase = 'planning_refine';
      reason = 'micro_refinement_requested';
    } else if (phase === 'planning_refine' && detectPlanningDone(lastUserText)) {
      nextPhase = 'report';
      reason = 'refinement_done';
    } else if (phase === 'planning_refine' && !(helpMeIntent || upgradeIntent)) {
      nextPhase = 'task_cycle';
      reason = 'return_to_conversation';
    } else if (phase === 'report' && (detectReportEnd(lastUserText) || feedbackIntent || languageGapIntent)) {
      nextPhase = 'language_focus';
      reason = 'report_completed';
    } else if (phase === 'language_focus' && !(feedbackIntent || languageGapIntent)) {
      nextPhase = 'task_cycle';
      reason = 'resume_conversation';
    }
  } else if (phase === 'pre_task' && (detectStartIntent(lastUserText) || tokenCount(lastUserText) >= 5)) {
    nextPhase = 'task_cycle';
    reason = 'start_intent_detected';
  } else if (phase === 'task_cycle' && outcomeAchieved) {
    nextPhase = 'planning_refine';
    reason = 'non_linguistic_outcome_achieved';
  } else if (phase === 'planning_refine' && detectPlanningDone(lastUserText)) {
    nextPhase = 'report';
    reason = 'planning_completed';
  } else if (phase === 'report' && detectReportEnd(lastUserText)) {
    nextPhase = 'language_focus';
    reason = 'report_closed';
  }

  return {
    nextPhase,
    reason,
    role: phaseRole(nextPhase),
    outcomeAchieved,
    gentleScaffolding,
    shortenResponse,
  } as TransitionEval;
}

function detectScenario(moduleName: LearningModule) {
  if (moduleName === 'Travel_Logistics') return 'airport check-in and hotel reception';
  if (moduleName === 'Work_Communication') return 'team meeting with status updates';
  if (moduleName === 'Social_Small_Talk') return 'casual conversation with a new friend';
  if (moduleName === 'Exam_Preparation') return 'public speaking task with argument and counterpoint';
  return 'daily life conversation about routine, plans, and feelings';
}

function phaseMethodology(phase: BrainPhase) {
  if (phase === 'pre_task') {
    return [
      'Phase: Pre-Task.',
      'Role now: Instigator.',
      'Set one authentic scenario and invite quick brainstorming.',
      'Do NOT pre-teach grammar; ask the student to start speaking quickly.',
      'Give only 3-5 useful words/chunks when needed, short and practical.',
    ].join(' ');
  }
  if (phase === 'task_cycle') {
    return [
      'Phase: Task Cycle.',
      'Role now: Invisible monitor inside the scenario.',
      'Stay immersive (persona of the scenario), prioritize meaning over minor grammar errors.',
      'Maximize student talking time: your reply should be shorter than the student message whenever possible.',
      'If student gets stuck, give one lexical chunk and ask them to continue.',
    ].join(' ');
  }
  if (phase === 'planning_refine') {
    return [
      'Phase: Planning and Refining.',
      'Role now: Language consultant.',
      'Use emergent language from previous turns only.',
      'Help polish wording into natural chunks with concise guidance.',
      'Ask short questions that help the student plan a stronger final delivery.',
    ].join(' ');
  }
  if (phase === 'report') {
    return [
      'Phase: Report.',
      'Role now: Chairperson.',
      'Validate task success by meaning and clarity, not perfection.',
      'Do not interrupt with corrections; let the learner deliver.',
      'Keep prompts short so the learner speaks most of the time.',
    ].join(' ');
  }
  return [
    'Phase: Language Focus.',
    'Role now: Analyst.',
    'Show concise language gap from what learner said to a natural upgrade.',
    'Focus on lexical chunks and collocations from real usage.',
    'Finish with quick repeat practice prompt and one easy question.',
  ].join(' ');
}

function extractChunks(text: string) {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z'\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3),
    ),
  ).slice(0, 6);
}

async function loadOrCreateBrainSession(profile: ProfilePayload): Promise<BrainSession | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !profile.userId) return null;

  const { data: existing } = await supabase
    .from('talken_sessions')
    .select('*')
    .eq('user_id', profile.userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as BrainSession;

  const phase = 'pre_task';
  const payload = {
    user_id: profile.userId,
    level_tag: profile.currentLevel,
    module_tag: profile.currentModule,
    phase,
    scenario: detectScenario(profile.currentModule),
    task_goal: 'keep fluent conversation with high student talking time in a real-life scenario',
    is_active: true,
  };

  const { data: created } = await supabase.from('talken_sessions').insert(payload).select('*').single();
  return (created as BrainSession) || null;
}

async function loadEmergentLanguageHints(session: BrainSession | null) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !session) return '';

  const { data } = await supabase
    .from('talken_emergent_language')
    .select('chunk')
    .eq('session_id', session.id)
    .order('updated_at', { ascending: false })
    .limit(5);

  const chunks = (data || []).map((row: any) => row.chunk).filter(Boolean);
  if (chunks.length === 0) return 'No prior emergent chunks yet.';
  return `Emergent chunks to recycle naturally: ${chunks.join(', ')}.`;
}

async function loadWeakWords(userId: string, level: CEFRLevel) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return [] as string[];

  const { data } = await supabase
    .from('vocabulary_mastery')
    .select('word')
    .eq('user_id', userId)
    .eq('level_tag', level)
    .eq('status', 'weak')
    .order('updated_at', { ascending: false })
    .limit(5);

  return (data || []).map((row: any) => String(row.word || '').trim()).filter(Boolean);
}

async function loadHiddenLanguageLog(session: BrainSession | null) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !session) return [] as Array<{ student_error: string; target_chunk: string }>;

  const { data } = await supabase
    .from('talken_hidden_language_log')
    .select('student_attempt,target_upgrade')
    .eq('session_id', session.id)
    .order('created_at', { ascending: false })
    .limit(8);

  return (data || [])
    .map((row: any) => ({
      student_error: String(row.student_attempt || '').slice(0, 140),
      target_chunk: String(row.target_upgrade || '').slice(0, 140),
    }))
    .filter((row: any) => row.student_error && row.target_chunk);
}

function buildSilentMemoryJson(params: {
  phase: BrainPhase;
  affectiveState: ReturnType<typeof detectAffectiveState>;
  weakWords: string[];
  emergentLog: Array<{ student_error: string; target_chunk: string }>;
}) {
  const payload = {
    phase: params.phase,
    affective_state: params.affectiveState,
    spaced_repetition: {
      weak_words: params.weakWords,
      instruction: 'Recycle these weak words naturally in new contexts when relevant.',
    },
    emergent_language_log: params.emergentLog,
  };
  return JSON.stringify(payload);
}

async function persistBrainTurn(params: {
  profile: ProfilePayload;
  session: BrainSession | null;
  phase: BrainPhase;
  userText: string;
  assistantText: string;
}) {
  const { profile, session, phase, userText, assistantText } = params;
  const supabase = getSupabaseAdmin();
  if (!supabase || !session) return;

  const studentTokens = tokenCount(userText);
  const teacherTokens = tokenCount(assistantText);
  const turnIndex = Number(session.turn_count || 0) + 1;

  const introducedWordMatch = assistantText.match(/New word:\s*["']?([a-zA-Z'-]+)/i);
  const introducedWord = introducedWordMatch?.[1]?.toLowerCase() || null;
  const lexicalChunk = introducedWord ? `New word: ${introducedWord}` : null;

  const { data: turn } = await supabase
    .from('talken_turns')
    .insert({
      session_id: session.id,
      user_id: profile.userId,
      turn_index: turnIndex,
      phase,
      user_text: userText,
      assistant_text: assistantText,
      scenario_role: phase === 'task_cycle' ? 'in-scenario partner' : 'coach',
      introduced_word: introducedWord,
      lexical_chunk: lexicalChunk,
      student_token_count: studentTokens,
      teacher_token_count: teacherTokens,
    })
    .select('id')
    .single();

  const chunks = extractChunks(userText);
  for (const chunk of chunks) {
    const { data: existing } = await supabase
      .from('talken_emergent_language')
      .select('*')
      .eq('session_id', session.id)
      .eq('chunk', chunk)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('talken_emergent_language')
        .update({
          occurrences: Number(existing.occurrences || 1) + 1,
          status: Number(existing.occurrences || 1) >= 3 ? 'recycled' : 'new',
          last_context: userText.slice(0, 240),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('talken_emergent_language').insert({
        session_id: session.id,
        user_id: profile.userId,
        source_turn_id: turn?.id || null,
        chunk,
        status: 'new',
        occurrences: 1,
        last_context: userText.slice(0, 240),
      });
    }
  }

  if (phase === 'language_focus') {
    await supabase.from('talken_language_gaps').insert({
      session_id: session.id,
      user_id: profile.userId,
      source_turn_id: turn?.id || null,
      phase,
      gap_type: 'fluency',
      student_attempt: userText.slice(0, 300),
      target_upgrade: assistantText.slice(0, 300),
      severity: 1,
    });
  }

  const nextTurnCount = turnIndex;

  await supabase
    .from('talken_sessions')
    .update({
      turn_count: nextTurnCount,
      phase,
      stt_student_tokens: Number(session.stt_student_tokens || 0) + studentTokens,
      stt_teacher_tokens: Number(session.stt_teacher_tokens || 0) + teacherTokens,
      language_gap_count:
        Number(session.language_gap_count || 0) + (phase === 'language_focus' ? 1 : 0),
    })
    .eq('id', session.id);
}

async function persistHiddenLanguageLog(params: {
  profile: ProfilePayload;
  session: BrainSession | null;
  phase: BrainPhase;
  userText: string;
  assistantText: string;
}) {
  const { profile, session, phase, userText, assistantText } = params;
  const supabase = getSupabaseAdmin();
  if (!supabase || !session) return;

  const quoted = assistantText.match(/"([^"]{4,140})"/g) || [];
  const upgraded = quoted
    .map((q) => q.replace(/^"|"$/g, ''))
    .find((q) => q.toLowerCase() !== userText.toLowerCase());

  if (!upgraded) return;

  await supabase.from('talken_hidden_language_log').insert({
    session_id: session.id,
    user_id: profile.userId,
    phase,
    gap_type: isUpgradeIntent(userText) ? 'lexical' : 'fluency',
    student_attempt: userText.slice(0, 300),
    target_upgrade: upgraded.slice(0, 300),
    notes: 'offline correction log for language focus',
  });
}

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
    userId: typeof raw.userId === 'string' ? raw.userId.trim() : '',
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

function buildSystemPrompt(
  profile: ProfilePayload,
  isFirstTurn: boolean,
  phase: BrainPhase,
  turnIntent: TurnIntent,
  turnIntentDirective: string,
  scenario: string,
  emergentHints: string,
  sttDirective: string,
  transition: TransitionEval,
  silentMemoryJson: string,
  chunkMinerDirective: string,
) {
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
    `Authentic scenario now: ${scenario}.`,
    `Pedagogical role now: ${transition.role}.`,
    `Transition reason: ${transition.reason}.`,
    `Detected turn intent: ${turnIntent}.`,
    `Intent handling directive: ${turnIntentDirective}`,
    phaseMethodology(phase),
    sttDirective,
    emergentHints,
    `Silent memory JSON (do not expose explicitly): ${silentMemoryJson}`,
    chunkMinerDirective,
    transition.shortenResponse
      ? 'Internal control: STT exceeded 30% for teacher. Apply shorten_response now.'
      : 'Internal control: STT within target.',
    transition.gentleScaffolding
      ? 'Internal control: Anxiety monitor high. Enable Gentle_Scaffolding with lower cognitive load.'
      : 'Internal control: Anxiety monitor normal.',
    transition.outcomeAchieved
      ? 'Outcome tracking: non-linguistic objective appears achieved. Move learner toward planning/report style.'
      : 'Outcome tracking: objective still in progress. Keep focus on task execution and meaning.',
    personaInstruction(profile.currentLevel),
    `Speech context for rhythm: ${profile.voice} at around ${profile.ttsSpeed.toFixed(2)}x speed.`,
    'Always respond in English.',
    'Keep answer concise: max 2-3 short sentences.',
    'Use natural contractions and conversational rhythm so voice sounds human, not robotic.',
    'Never use explicit correction labels. Apply recasting naturally in the sentence flow.',
    'Do not replace student content with unrelated templates. Always anchor your reply to the latest student sentence.',
    'If the student gives a partial sentence, complete it naturally and ask one easy follow-up question.',
    'Always end with one simple and direct follow-up question.',
    'If the student speaks Portuguese, keep your reply in English, but you may add a tiny Portuguese hint in parentheses for one key word.',
    'If student writes a fragment, scaffold a complete sentence before asking the next question.',
    'Introduce one useful new word naturally in context when possible.',
    'In task_cycle, stay in character and prioritize meaning over minor grammar errors.',
    'In language_focus, provide concise Gap Analysis: what learner said vs native-like upgrade.',
    'Never say you did not understand if user text exists. Coach from available text.',
    isFirstTurn
      ? 'This is the first teacher turn: greet warmly, answer the student greeting naturally, and begin a fluid conversation.'
      : 'Continue the existing conversation naturally without resetting.',
  ].join('\n');
}

function pickTeachingWord(params: {
  level: CEFRLevel;
  intent: TurnIntent;
  weakWords: string[];
  recentAssistantMessages: string[];
}) {
  const { level, intent, weakWords, recentAssistantMessages } = params;
  const history = recentAssistantMessages.join(' ').toLowerCase();

  const defaultsByIntent: Record<TurnIntent, string[]> = {
    language_gap: ['upgrade', 'nuance', 'confident'],
    feedback: ['improve', 'clear', 'natural'],
    help_me: ['phrase', 'chunk', 'request'],
    upgrade: ['confident', 'persuasive', 'impact'],
    start: ['great', 'ready', 'focus'],
    greeting: ['great', 'happy', 'ready'],
    how_are_you: ['fine', 'calm', 'productive'],
    how_was_day: ['busy', 'relaxed', 'productive'],
    preference: ['prefer', 'favorite', 'instead'],
    routine: ['usually', 'often', 'sometimes'],
    location: ['neighborhood', 'downtown', 'quiet'],
    family: ['siblings', 'close', 'supportive'],
    ability: ['cook', 'recipe', 'practice'],
    open_question: ['clear', 'explain', 'example'],
    statement: ['improve', 'detail', 'clear'],
    fragment: ['complete', 'detail', 'because'],
  };

  const levelBias: Record<CEFRLevel, string[]> = {
    A1: ['great', 'happy', 'busy', 'usually'],
    A2: ['because', 'often', 'prefer', 'routine'],
    B1: ['confident', 'improve', 'describe', 'example'],
    B2: ['persuasive', 'impact', 'structured', 'nuance'],
    C1: ['compelling', 'precise', 'strategic', 'refine'],
    C2: ['nuance', 'framing', 'subtle', 'sophisticated'],
  };

  const pool = [...weakWords, ...defaultsByIntent[intent], ...levelBias[level]]
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);

  for (const word of pool) {
    if (!history.includes(word)) return word;
  }

  return pool[0] || 'clear';
}

function englishHintLine(word: string, level: CEFRLevel) {
  if (!word) return '';
  const hint = WORD_HINTS_PT[word];
  if (!hint) {
    if (level === 'A1' || level === 'A2') return '';
    return ` Useful word: "${word}".`;
  }
  return ` New word: "${word}" means "${hint}".`;
}

function completeFragment(text: string) {
  const clean = text.replace(/"/g, '').trim();
  if (!clean) return '';
  if (/[.!?]$/.test(clean)) return clean;
  if (/\b(is|am|are|was|were|be|seems|feels)\s*$/i.test(clean)) return `${clean} very good today.`;
  if (/\b(to|for|with|at|in|on)\s*$/i.test(clean)) return `${clean} my family.`;
  return `${clean}.`;
}

function levelFallback(
  profile: ProfilePayload,
  lastUserMessage: string | undefined,
  isFirstTurn: boolean,
  phase: BrainPhase,
  helpMeMode: boolean,
  upgradeMode: boolean,
  turnIntent: TurnIntent,
  weakWords: string[],
  recentAssistantMessages: string[],
) {
  const studentText = (lastUserMessage || '').trim();
  const normalizedStudent = studentText.replace(/\s+/g, ' ').trim();
  const lower = normalizedStudent.toLowerCase();
  const teachingWord = pickTeachingWord({
    level: profile.currentLevel,
    intent: turnIntent,
    weakWords,
    recentAssistantMessages,
  });
  const hintLine = englishHintLine(teachingWord, profile.currentLevel);
  const preference = extractPreferenceOptions(lower);

  if (turnIntent === 'language_gap') {
    return '[gentle] Great request. Language Gap: you said "I want more money," while a native professional version is "Based on my impact, I would like to discuss a compensation adjustment." Can you repeat that upgraded sentence once?';
  }

  if (turnIntent === 'feedback' || /i'?m done with the task/.test(lower)) {
    return '[cheerful] Excellent work, you completed the task. Quick feedback: your message is clear, and the main upgrade is using "I would like to discuss..." instead of "I want...". Can you deliver your final polished version in one sentence?';
  }

  if (upgradeMode && lower.includes('want more money')) {
    return '[gentle] Strong intent, and here is a more persuasive version: "Based on my recent results, I would like to discuss a compensation adjustment." New chunk: "compensation adjustment." Would you like a softer or firmer tone?';
  }

  if (helpMeMode) {
    return '[cheerful] Great question. You can say: "I would like to request a refund." New chunk: "request a refund." Can you say that to me as if I were the HR manager?';
  }

  if (phase === 'language_focus' && /feedback|language gap/.test(lower)) {
    return '[gentle] Great timing for feedback. Language Gap: you said "I want more money," and a native professional version is "I would like to discuss a compensation adjustment based on my performance." Can you repeat the upgraded sentence once?';
  }

  if (phase === 'report' && /done|final|feedback/.test(lower)) {
    return '[cheerful] Excellent, you completed the task clearly and kept your message professional. Your main upgrade is using "I would like to discuss..." instead of "I want...". Could you deliver your final version in one smooth sentence?';
  }

  if (isFirstTurn) {
    if (profile.currentLevel === 'A1' || profile.currentLevel === 'A2' || turnIntent === 'greeting') {
      return `[cheerful] Hi! I am really happy to talk with you today.${hintLine} How are you feeling now?`;
    }
    return `[cheerful] Great, let us start the roleplay and keep it natural.${hintLine} What is the first thing you want to say?`;
  }

  if (turnIntent === 'how_are_you') {
    return `[cheerful] I am doing well today, thanks for asking, and I am excited to practice with you.${hintLine} How are you feeling right now?`;
  }

  if (turnIntent === 'how_was_day') {
    return `[gentle] My day was good and a little busy, in a good way.${hintLine} How was your day today?`;
  }

  if (turnIntent === 'preference') {
    if (preference) {
      return `[cheerful] I usually prefer ${preference.first} because it helps me focus.${hintLine} What about you, do you prefer ${preference.first} or ${preference.second}?`;
    }
    return `[cheerful] I usually pick what matches the moment, but I often have a favorite.${hintLine} What do you prefer most?`;
  }

  if (turnIntent === 'routine') {
    return `[gentle] On weekends I usually rest, read, and take a short walk.${hintLine} What do you usually do on weekends?`;
  }

  if (turnIntent === 'location') {
    const bigCityAsk = /\bbig city\b/.test(lower);
    if (bigCityAsk) {
      return `[gentle] I live in a big city, so life feels fast but interesting.${hintLine} Do you live in a big city or a quiet town?`;
    }
    return `[gentle] I live in a lively city area, and there is always something happening.${hintLine} Where do you live?`;
  }

  if (turnIntent === 'family') {
    return `[cheerful] Yes, I have siblings, and we are very close.${hintLine} Do you have any brothers or sisters?`;
  }

  if (turnIntent === 'ability') {
    return `[cheerful] Yes, I can cook simple meals, especially pasta and eggs.${hintLine} Can you cook, and what is your favorite dish?`;
  }

  if (turnIntent === 'open_question') {
    return `[gentle] Great question, and I like your curiosity.${hintLine} What is your own answer to that question?`;
  }

  if (turnIntent === 'fragment') {
    const completed = completeFragment(normalizedStudent);
    if (completed) {
      return `[gentle] Nice start, and I understood your idea. You can say: "${completed}"${hintLine} Can you add one more detail?`;
    }
    return '[gentle] Nice try, and we can build it together. Can you say one short sentence about your day?';
  }

  if (profile.currentLevel === 'A1') {
    if (studentText) {
      const completed = completeFragment(normalizedStudent);
      return `[gentle] Nice start, and I understood you well. You can say: "${completed}"${hintLine} What happened next?`;
    }
    return '[gentle] Great start, you are doing well. Can you say one short sentence about your day?';
  }

  if (profile.currentLevel === 'A2') {
    if (studentText) {
      const completed = completeFragment(normalizedStudent);
      return `[cheerful] Nice effort, and your sentence is clear. A natural way to say it is "${completed}"${hintLine} Can you add one more idea using "because"?`;
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
      if (phase === 'task_cycle') {
        return '[gentle] Good flow, keep going in character. New chunk: "I have led cross-functional projects" to sound more executive. How would you answer: "Tell me about a challenge you solved at work?"';
      }
      return '[gentle] Good point, and your message is clear. A polished version could use stronger framing and evidence. What one concrete result can you add to make it persuasive?';
    }
    return '[gentle] You are ready for a nuanced answer, and that is a great sign. Share one opinion and one counterpoint in a calm, persuasive way. What topic do you want to tackle first?';
  }

  return '[gentle] Nice progress so far, and I am with you. Can you say one more sentence so we keep your fluency moving?';
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
  if (trimmed.toLowerCase().includes('hi teacher, how are you? how was your day?')) return true;
  return false;
}

function hasSemanticAnchor(assistantText: string, lastUserMessage: string) {
  const userKeywords = normalizeSemanticWords(lastUserMessage).slice(0, 8);
  if (userKeywords.length === 0) return true;

  const assistantLower = assistantText.toLowerCase();
  return userKeywords.some((keyword) => assistantLower.includes(keyword));
}

function isOvergenericResponse(
  text: string,
  lastUserMessage: string | undefined,
  turnIntent: TurnIntent,
) {
  const t = text.toLowerCase();
  const genericTemplateMarkers = [
    "i really like where you're going with this idea",
    'what tone do you want to project',
    'add three words',
    'strong message',
    'refined alternative',
    'error detected',
  ];

  if (genericTemplateMarkers.some((marker) => t.includes(marker))) return true;
  if (turnIntent === 'how_are_you' && !/\b(i am|i'm|doing well|good)\b/.test(t)) return true;
  if (turnIntent === 'preference' && !/\bprefer\b/.test(t)) return true;
  if (turnIntent === 'location' && !/\b(live|city|town)\b/.test(t)) return true;
  if (turnIntent === 'family' && !/\b(sister|brother|siblings|family)\b/.test(t)) return true;
  if (turnIntent === 'ability' && !/\b(can|cook)\b/.test(t)) return true;
  if (lastUserMessage && !hasSemanticAnchor(text, lastUserMessage) && turnIntent !== 'feedback') return true;

  return false;
}

async function rewriteWithPersonaGuard(
  groq: ReturnType<typeof createGroq>,
  apiKey: string,
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

  const rewritten = await generateTextWithModelFallback({
    groq,
    apiKey,
    stage: 'persona_rewrite',
    prompt: rewritePrompt,
    maxTokens: 220,
    temperature: 0.35,
  });

  return rewritten;
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
    const safeLastUser = (lastUserMessage || '').trim();
    const assistantTurns = recentMessages.filter((m) => m.role === 'assistant').length;
    const isFirstTurn = assistantTurns === 0;
    const brainSession = await loadOrCreateBrainSession(profile);
    const phase = brainSession?.phase || inferPhase(assistantTurns);
    const scenario = brainSession?.scenario || detectScenario(profile.currentModule);
    const emergentHints = await loadEmergentLanguageHints(brainSession);
    const helpMeMode = isHelpMeIntent(safeLastUser);
    const explicitUpgradeMode = isUpgradeIntent(safeLastUser);
    const feedbackMode = isFeedbackIntent(safeLastUser);
    const languageGapMode = isLanguageGapIntent(safeLastUser);
    const turnIntent = detectTurnIntent({
      text: safeLastUser,
      helpMeMode,
      upgradeMode: explicitUpgradeMode,
      feedbackMode,
      languageGapMode,
    });
    const turnIntentDirective = intentConversationDirective(turnIntent, profile.currentLevel);
    const metrics = computeRuntimeMetrics(recentMessages as any, safeLastUser);
    const transition = evaluateTransition({
      phase,
      lastUserText: safeLastUser,
      moduleName: profile.currentModule,
      recentMessages: recentMessages as any,
      metrics,
      helpMeIntent: helpMeMode,
      upgradeIntent: explicitUpgradeMode,
      feedbackIntent: feedbackMode,
      languageGapIntent: languageGapMode,
    });
    const activePhase = transition.nextPhase;
    const affectiveState = detectAffectiveState(metrics);
    const weakWords = await loadWeakWords(profile.userId, profile.currentLevel);
    const hiddenLanguageLog = await loadHiddenLanguageLog(brainSession);
    const silentMemoryJson = buildSilentMemoryJson({
      phase: activePhase,
      affectiveState,
      weakWords,
      emergentLog: hiddenLanguageLog,
    });
    const upgradeMode = explicitUpgradeMode || activePhase === 'language_focus';
    const chunkMinerDirective = helpMeMode
      ? 'Chunk Miner Mode: HELP_ME. Give one minimal lexical chunk that unblocks communication, then immediately continue roleplay in character.'
      : upgradeMode
        ? 'Chunk Miner Mode: UPGRADE. Show concise lexical upgrade from simple phrasing to a more natural/professional C1/C2 chunk.'
        : 'Chunk Miner Mode: PASSIVE. Recycle useful chunks only when relevant.';
    const sttDirective = transition.shortenResponse
      ? 'Student Talking Time control: your response must be shorter than the student response and use at most 2 short sentences before the question.'
      : tokenCount(lastUserMessage) >= 6
        ? 'Student message was long enough: keep your response shorter than the student response.'
        : 'Student message was short: keep your response concise and ask one easy continuation question.';

    const groq = createGroq({ apiKey });

    let output = '';
    let modelUsed: string = MODEL_FALLBACK_CHAIN[0];
    let modelFallbackErrors: ModelAttemptFailure[] = [];
    const systemPrompt = buildSystemPrompt(
      profile,
      isFirstTurn,
      activePhase,
      turnIntent,
      turnIntentDirective,
      scenario,
      emergentHints,
      sttDirective,
      transition,
      silentMemoryJson,
      chunkMinerDirective,
    );

    try {
      const firstTry = await generateTextWithModelFallback({
        groq,
        apiKey,
        stage: 'primary',
        system: systemPrompt,
        messages: convertToCoreMessages(recentMessages as any),
        presencePenalty: PRIMARY_PRESENCE_PENALTY,
      });

      output = firstTry.text;
      modelUsed = firstTry.modelUsed;
      modelFallbackErrors = [...modelFallbackErrors, ...firstTry.attempts];
    } catch (error: any) {
      const attempts = Array.isArray(error?.attempts) ? error.attempts : [];
      modelFallbackErrors = [...modelFallbackErrors, ...attempts];
      console.error(`[talken:model-fallback] stage=primary exhausted error="${String(error?.message || error)}"`);
    }

    if (!output) {
      const transcript = recentMessages
        .map((m) => `${m.role === 'user' ? 'Student' : 'Teacher'}: ${m.content}`)
        .join('\n');

      const retryPrompt = [
        systemPrompt,
        '',
        'Conversation transcript:',
        transcript,
        '',
        'Reply as the teacher now with practical coaching and one follow-up question.',
      ].join('\n');

      try {
        const retry = await generateTextWithModelFallback({
          groq,
          apiKey,
          stage: 'retry',
          prompt: retryPrompt,
          presencePenalty: PRIMARY_PRESENCE_PENALTY,
        });

        output = retry.text;
        modelUsed = retry.modelUsed;
        modelFallbackErrors = [...modelFallbackErrors, ...retry.attempts];
      } catch (error: any) {
        const attempts = Array.isArray(error?.attempts) ? error.attempts : [];
        modelFallbackErrors = [...modelFallbackErrors, ...attempts];
        console.error(`[talken:model-fallback] stage=retry exhausted error="${String(error?.message || error)}"`);
      }
    }

    if (output && needsPersonaRewrite(output)) {
      try {
        const rewritten = await rewriteWithPersonaGuard(groq, apiKey, profile, output, lastUserMessage);
        if (rewritten.text) {
          output = rewritten.text;
          modelUsed = rewritten.modelUsed;
          modelFallbackErrors = [...modelFallbackErrors, ...rewritten.attempts];
        }
      } catch (error: any) {
        const attempts = Array.isArray(error?.attempts) ? error.attempts : [];
        modelFallbackErrors = [...modelFallbackErrors, ...attempts];
        console.error(
          `[talken:model-fallback] stage=persona_rewrite exhausted error="${String(error?.message || error)}"`,
        );
      }
    }

    if (!output || isOvergenericResponse(output, lastUserMessage, turnIntent)) {
      output = levelFallback(
        profile,
        lastUserMessage,
        isFirstTurn,
        activePhase,
        helpMeMode,
        upgradeMode,
        turnIntent,
        weakWords,
        recentMessages.filter((m) => m.role === 'assistant').map((m) => m.content),
      );
      modelUsed = 'fallback-local';
    }

    const attemptsSummary = modelFallbackErrors
      .slice(-8)
      .map((attempt) => {
        const statusPart = attempt.status === null ? 'na' : String(attempt.status);
        return `${attempt.stage}:${attempt.model}:${attempt.category}:${statusPart}`;
      })
      .join('|')
      .slice(0, 480);

    console.info(
      `[talken:model-result] chosen=${modelUsed} attempts=${modelFallbackErrors.length} summary="${attemptsSummary || 'none'}"`,
    );

    if (lastUserMessage) {
      await persistBrainTurn({
        profile,
        session: brainSession,
        phase: activePhase,
        userText: lastUserMessage,
        assistantText: output,
      });
      await persistHiddenLanguageLog({
        profile,
        session: brainSession,
        phase: activePhase,
        userText: lastUserMessage,
        assistantText: output,
      });
    }

    return new Response(output, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Talken-Model': modelUsed,
        'X-Talken-Model-Fallback-Errors': String(modelFallbackErrors.length),
        'X-Talken-Model-Attempts': attemptsSummary || 'none',
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
