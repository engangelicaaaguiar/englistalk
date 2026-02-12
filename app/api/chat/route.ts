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
const PRIMARY_MODEL = 'llama-3.3-70b-versatile';
const PRIMARY_TEMPERATURE = 0.7;
const PRIMARY_MAX_TOKENS = 150;
const PRIMARY_PRESENCE_PENALTY = 0.6;

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
    return /\b(hobby|weekend|family|friend|music|movie|like|enjoy)\b/.test(userText);
  }
  if (moduleName === 'Exam_Preparation') {
    return /\b(on the one hand|on the other hand|however|in conclusion|argument|counterpoint)\b/.test(userText);
  }
  return /\b(today|yesterday|routine|work|study|plan|because)\b/.test(userText);
}

function evaluateTransition(params: {
  phase: BrainPhase;
  lastUserText: string;
  moduleName: LearningModule;
  recentMessages: Array<{ role: string; content: string }>;
  metrics: RuntimeMetrics;
}) {
  const { phase, lastUserText, moduleName, recentMessages, metrics } = params;
  const outcomeAchieved = detectOutcomeAchieved(moduleName, recentMessages);
  const gentleScaffolding = metrics.ptRatio >= 0.35 || metrics.shortMessageStreak >= 2;
  const shortenResponse = metrics.teacherTalkPct > 30;

  let nextPhase = phase;
  let reason = 'no_transition';

  if (phase === 'pre_task' && (detectStartIntent(lastUserText) || tokenCount(lastUserText) >= 5)) {
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

function levelFallback(
  profile: ProfilePayload,
  lastUserMessage: string | undefined,
  isFirstTurn: boolean,
  phase: BrainPhase,
  helpMeMode: boolean,
  upgradeMode: boolean,
) {
  const studentText = (lastUserMessage || '').trim();
  const normalizedStudent = studentText.replace(/\s+/g, ' ').trim();
  const lower = normalizedStudent.toLowerCase();

  if (/language gap/.test(lower)) {
    return '[gentle] Great request. Language Gap: you said "I want more money," while a native professional version is "Based on my impact, I would like to discuss a compensation adjustment." Can you repeat that upgraded sentence once?';
  }

  if (/feedback/.test(lower) || /i'?m done with the task/.test(lower)) {
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
    if (profile.currentLevel === 'A1' || profile.currentLevel === 'A2') {
      return '[cheerful] Hi! It is great to meet you, and I am happy to practice with you today. New word: "great" means "otimo". How are you feeling today?';
    }
    return '[cheerful] Great, let us start the job interview roleplay. New word: "strengths" means your best professional qualities. What are your top two strengths for this role?';
  }

  if (profile.currentLevel === 'A1') {
    if (studentText) {
      const completed =
        normalizedStudent.endsWith('.')
          ? normalizedStudent
          : `${normalizedStudent} good.`;
      return `[gentle] Nice start, and I understood you well. You can say: "${completed}" New word: "busy" means "ocupado". How is your day today?`;
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
      if (phase === 'task_cycle') {
        return '[gentle] Good flow, keep going in character. New chunk: "I have led cross-functional projects" to sound more executive. How would you answer: "Tell me about a challenge you solved at work?"';
      }
      return '[gentle] Good point, and your message is clear. A polished version could use stronger framing and evidence. What one concrete result can you add to make it persuasive?';
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
  if (trimmed.toLowerCase().includes('hi teacher, how are you? how was your day?')) return true;
  return false;
}

function isOvergenericResponse(text: string) {
  const t = text.toLowerCase();
  return (
    t.includes("i really like where you're going with this idea") &&
    t.includes('what tone do you want to project')
  );
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
    const safeLastUser = (lastUserMessage || '').trim();
    const assistantTurns = recentMessages.filter((m) => m.role === 'assistant').length;
    const isFirstTurn = assistantTurns === 0;
    const brainSession = await loadOrCreateBrainSession(profile);
    const phase = brainSession?.phase || inferPhase(assistantTurns);
    const scenario = brainSession?.scenario || detectScenario(profile.currentModule);
    const emergentHints = await loadEmergentLanguageHints(brainSession);
    const metrics = computeRuntimeMetrics(recentMessages as any, safeLastUser);
    const transition = evaluateTransition({
      phase,
      lastUserText: safeLastUser,
      moduleName: profile.currentModule,
      recentMessages: recentMessages as any,
      metrics,
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
    const helpMeMode = isHelpMeIntent(safeLastUser);
    const upgradeMode = isUpgradeIntent(safeLastUser) || activePhase === 'language_focus';
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
    const systemPrompt = buildSystemPrompt(
      profile,
      isFirstTurn,
      activePhase,
      scenario,
      emergentHints,
      sttDirective,
      transition,
      silentMemoryJson,
      chunkMinerDirective,
    );

    const firstTry = await generateText({
      model: groq(PRIMARY_MODEL) as any,
      system: systemPrompt,
      messages: convertToCoreMessages(recentMessages as any),
      maxTokens: PRIMARY_MAX_TOKENS,
      temperature: PRIMARY_TEMPERATURE,
      presencePenalty: PRIMARY_PRESENCE_PENALTY,
    });

    output = (firstTry.text || '').trim();

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

      const retry = await generateText({
        model: groq(PRIMARY_MODEL) as any,
        prompt: retryPrompt,
        maxTokens: PRIMARY_MAX_TOKENS,
        temperature: PRIMARY_TEMPERATURE,
        presencePenalty: PRIMARY_PRESENCE_PENALTY,
      });

      output = (retry.text || '').trim();
    }

    if (output && needsPersonaRewrite(output)) {
      const rewritten = await rewriteWithPersonaGuard(groq, profile, output, lastUserMessage);
      if (rewritten) output = rewritten;
    }

    if (!output || isOvergenericResponse(output)) {
      output = levelFallback(
        profile,
        lastUserMessage,
        isFirstTurn,
        activePhase,
        helpMeMode,
        upgradeMode,
      );
    }

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
