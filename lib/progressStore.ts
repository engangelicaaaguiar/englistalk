import {
  CEFR_DEFAULT_TTS_SPEED,
  CEFRLevel,
  CEFR_WORD_TARGETS,
  CorrectionMode,
  LearningModule,
  clampTtsSpeed,
  mapLegacyLevelToCefr,
  nextCefrLevel,
} from './cefr';
import { getSupabaseClient } from './supabaseClient';

export type ProgressSettings = {
  tts_speed: number;
  show_subtitles: boolean;
  correction_mode: CorrectionMode;
  voice: 'en-US' | 'en-GB';
};

export type UserProgressRow = {
  user_id: string;
  current_level: CEFRLevel;
  current_module: LearningModule;
  xp_points: number;
  streak_days: number;
  settings: ProgressSettings;
};

export type VocabularyStatus = 'weak' | 'learning' | 'mastered';

export type VocabularyWordRow = {
  user_id: string;
  word: string;
  level_tag: CEFRLevel;
  status: VocabularyStatus;
  times_heard: number;
  times_spoken_correctly: number;
  times_spoken_incorrectly: number;
  last_mistake_context: string | null;
  updated_at?: string;
};

export type ConfidenceMetrics = {
  totalWords: number;
  masteredWords: number;
  learningWords: number;
  weakWords: number;
  masteredPct: number;
  weakPct: number;
  progressCurrentLevel: number;
  progressTargetWords: number;
  progressPct: number;
};

export function defaultSettings(level: CEFRLevel = 'A1'): ProgressSettings {
  return {
    tts_speed: CEFR_DEFAULT_TTS_SPEED[level],
    show_subtitles: true,
    correction_mode: 'friendly',
    voice: 'en-US',
  };
}

export function defaultProgress(userId: string, level: CEFRLevel = 'A1'): UserProgressRow {
  return {
    user_id: userId,
    current_level: level,
    current_module: 'Daily_Conversation',
    xp_points: 0,
    streak_days: 0,
    settings: defaultSettings(level),
  };
}

function sanitizeModule(value: string | undefined): LearningModule {
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

export function sanitizeSettings(raw: any, level: CEFRLevel): ProgressSettings {
  const base = defaultSettings(level);
  if (!raw || typeof raw !== 'object') return base;
  return {
    tts_speed: clampTtsSpeed(typeof raw.tts_speed === 'number' ? raw.tts_speed : base.tts_speed),
    show_subtitles: typeof raw.show_subtitles === 'boolean' ? raw.show_subtitles : base.show_subtitles,
    correction_mode: raw.correction_mode === 'strict' || raw.correction_mode === 'friendly' ? raw.correction_mode : base.correction_mode,
    voice: raw.voice === 'en-US' || raw.voice === 'en-GB' ? raw.voice : base.voice,
  };
}

export function sanitizeProgressRow(row: any, userId: string): UserProgressRow {
  const level = mapLegacyLevelToCefr(row?.current_level);
  return {
    user_id: userId,
    current_level: level,
    current_module: sanitizeModule(row?.current_module),
    xp_points: Number.isFinite(row?.xp_points) ? Number(row.xp_points) : 0,
    streak_days: Number.isFinite(row?.streak_days) ? Number(row.streak_days) : 0,
    settings: sanitizeSettings(row?.settings, level),
  };
}

export async function fetchOrCreateProgress(userId: string, legacyLevel?: string): Promise<UserProgressRow> {
  const supabase = getSupabaseClient();
  const initialLevel = mapLegacyLevelToCefr(legacyLevel);
  const empty = defaultProgress(userId, initialLevel);

  const { data, error } = await supabase
    .from('users_progress')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[progress] fetchOrCreateProgress select failed', error.message);
    return empty;
  }

  if (data) {
    const sanitized = sanitizeProgressRow(data, userId);
    const { error: normalizeError } = await supabase.from('users_progress').upsert(sanitized, {
      onConflict: 'user_id',
    });
    if (normalizeError) {
      console.warn('[progress] failed to normalize users_progress', normalizeError.message);
    }
    return sanitized;
  }

  const { error: insertError } = await supabase.from('users_progress').insert(empty);
  if (insertError) {
    console.warn('[progress] insert default users_progress failed', insertError.message);
  }
  return empty;
}

export async function saveProgress(row: UserProgressRow): Promise<UserProgressRow> {
  const supabase = getSupabaseClient();
  const sanitized = sanitizeProgressRow(row, row.user_id);
  const { error } = await supabase.from('users_progress').upsert(sanitized, {
    onConflict: 'user_id',
  });
  if (error) {
    console.warn('[progress] saveProgress failed', error.message);
  }
  return sanitized;
}

export function extractUniqueWords(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z'\s]/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);

  return Array.from(new Set(raw)).slice(0, 30);
}

function extractBoldTokens(text: string): string[] {
  const matches = text.match(/\*\*(.+?)\*\*/g) || [];
  const joined = matches.map((m) => m.replace(/\*\*/g, '')).join(' ');
  return extractUniqueWords(joined);
}

function computeStatus(correct: number, incorrect: number): VocabularyStatus {
  if (correct >= 8 && incorrect <= 2) return 'mastered';
  if (correct >= 3 && incorrect <= correct + 2) return 'learning';
  if (incorrect > correct) return 'weak';
  return 'learning';
}

export async function upsertVocabularyFromTurn(params: {
  userId: string;
  level: CEFRLevel;
  userText: string;
  assistantText: string;
}): Promise<void> {
  const { userId, level, userText, assistantText } = params;
  const supabase = getSupabaseClient();

  const words = extractUniqueWords(userText);
  if (words.length === 0) return;

  const correctedTokens = extractBoldTokens(assistantText);
  const boldExists = /\*\*.+?\*\*/.test(assistantText);
  let fallbackMarked = false;

  for (const [index, word] of words.entries()) {
    const { data: existing, error: findError } = await supabase
      .from('vocabulary_mastery')
      .select('*')
      .eq('user_id', userId)
      .eq('word', word)
      .eq('level_tag', level)
      .maybeSingle();

    if (findError) {
      console.warn('[progress] vocabulary select failed', findError.message);
      continue;
    }

    const overlapMistake = correctedTokens.includes(word);
    const fallbackMistake =
      boldExists && correctedTokens.length === 0 && !fallbackMarked && index === words.length - 1;
    if (fallbackMistake) fallbackMarked = true;

    const mistaken = overlapMistake || fallbackMistake;

    const prevCorrect = Number(existing?.times_spoken_correctly || 0);
    const prevIncorrect = Number(existing?.times_spoken_incorrectly || 0);
    const nextCorrect = prevCorrect + (mistaken ? 0 : 1);
    const nextIncorrect = prevIncorrect + (mistaken ? 1 : 0);
    const nextHeard = Number(existing?.times_heard || 0) + 1;

    const payload: VocabularyWordRow = {
      user_id: userId,
      word,
      level_tag: level,
      status: computeStatus(nextCorrect, nextIncorrect),
      times_heard: nextHeard,
      times_spoken_correctly: nextCorrect,
      times_spoken_incorrectly: nextIncorrect,
      last_mistake_context: mistaken ? `${userText} -> ${assistantText.slice(0, 220)}` : null,
    };

    const { error: upsertError } = await supabase.from('vocabulary_mastery').upsert(payload, {
      onConflict: 'user_id,word,level_tag',
    });

    if (upsertError) {
      console.warn('[progress] vocabulary upsert failed', upsertError.message);
    }
  }
}

export async function loadVocabularyForLevel(userId: string, level: CEFRLevel): Promise<VocabularyWordRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('vocabulary_mastery')
    .select('*')
    .eq('user_id', userId)
    .eq('level_tag', level)
    .order('updated_at', { ascending: false })
    .limit(1200);

  if (error) {
    console.warn('[progress] loadVocabularyForLevel failed', error.message);
    return [];
  }
  return (data || []) as VocabularyWordRow[];
}

export function computeConfidenceMetrics(rows: VocabularyWordRow[], level: CEFRLevel): ConfidenceMetrics {
  const totalWords = rows.length;
  const masteredWords = rows.filter((r) => r.status === 'mastered').length;
  const learningWords = rows.filter((r) => r.status === 'learning').length;
  const weakWords = rows.filter((r) => r.status === 'weak').length;

  const masteredPct = totalWords === 0 ? 0 : Math.round((masteredWords / totalWords) * 100);
  const weakPct = totalWords === 0 ? 0 : Math.round((weakWords / totalWords) * 100);
  const progressCurrentLevel = rows.filter((r) => r.times_spoken_correctly > 0).length;
  const progressTargetWords = CEFR_WORD_TARGETS[level];
  const progressPct = Math.min(100, Math.round((progressCurrentLevel / progressTargetWords) * 100));

  return {
    totalWords,
    masteredWords,
    learningWords,
    weakWords,
    masteredPct,
    weakPct,
    progressCurrentLevel,
    progressTargetWords,
    progressPct,
  };
}

export async function maybePromoteLevel(row: UserProgressRow): Promise<UserProgressRow> {
  const metrics = computeConfidenceMetrics(
    await loadVocabularyForLevel(row.user_id, row.current_level),
    row.current_level,
  );

  if (metrics.progressCurrentLevel < metrics.progressTargetWords || row.current_level === 'C2') {
    return row;
  }

  const next = nextCefrLevel(row.current_level);
  const promoted: UserProgressRow = {
    ...row,
    current_level: next,
    current_module: 'Daily_Conversation',
    xp_points: row.xp_points + 500,
    settings: {
      ...row.settings,
      tts_speed: CEFR_DEFAULT_TTS_SPEED[next],
    },
  };

  return saveProgress(promoted);
}

