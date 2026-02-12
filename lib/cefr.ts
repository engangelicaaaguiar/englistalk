export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type CorrectionMode = 'friendly' | 'strict';
export type LearningModule =
  | 'Daily_Conversation'
  | 'Travel_Logistics'
  | 'Work_Communication'
  | 'Social_Small_Talk'
  | 'Exam_Preparation';

export const CEFR_LEVEL_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const CEFR_DEFAULT_TTS_SPEED: Record<CEFRLevel, number> = {
  A1: 0.75,
  A2: 0.85,
  B1: 0.95,
  B2: 1.0,
  C1: 1.05,
  C2: 1.1,
};

export const CEFR_WORD_TARGETS: Record<CEFRLevel, number> = {
  A1: 500,
  A2: 1500,
  B1: 2500,
  B2: 3500,
  C1: 5000,
  C2: 6500,
};

export const CEFR_BLUEPRINT: Record<
  CEFRLevel,
  {
    vocabularyRule: string;
    grammarFocus: string[];
    correctionStyle: string;
    jtbd: string;
  }
> = {
  A1: {
    vocabularyRule: 'Use top 500 high-frequency words (Dolch-like simple vocabulary).',
    grammarFocus: ['present simple', 'imperative', 'basic questions: who/what/where'],
    correctionStyle:
      'Extreme reassurance. If student uses Portuguese, translate and ask repetition. Ignore minor article/plural errors.',
    jtbd:
      'Student wants to survive basic interactions: introduce self, ask simple questions, order food without panic.',
  },
  A2: {
    vocabularyRule: 'Use top 1000-1500 words and simple daily topics.',
    grammarFocus: ['past simple', 'going to future', 'comparatives', 'prepositions of place'],
    correctionStyle:
      'Correct core conjugation mistakes (go/went). Encourage connectors: and, but, because.',
    jtbd: 'Student wants to talk about routine, family, and what happened yesterday.',
  },
  B1: {
    vocabularyRule: 'Use top 2000-2500 words plus practical travel vocabulary.',
    grammarFocus: ['present perfect', 'modals (must/should/can)', 'zero and first conditional'],
    correctionStyle:
      'Focus on precision. Suggest richer synonyms when language stays too basic.',
    jtbd: 'Student wants to travel independently and explain plans and goals clearly.',
  },
  B2: {
    vocabularyRule: 'Use technical and abstract vocabulary when needed.',
    grammarFocus: ['passive voice', 'second/third conditional', 'relative clauses'],
    correctionStyle: 'Rigorous with nuance, clarity, and natural intonation guidance.',
    jtbd:
      'Student wants professional fluency for meetings and defending technical points.',
  },
  C1: {
    vocabularyRule: 'Use advanced vocabulary with idiomatic and professional phrasing.',
    grammarFocus: ['inversion structures', 'mixed conditionals', 'register shifts'],
    correctionStyle:
      'Stylistic refinement. Explain what sounds natural vs formal vs blunt.',
    jtbd:
      'Student wants to negotiate, influence, and understand subtle meaning in professional contexts.',
  },
  C2: {
    vocabularyRule: 'Use nuanced idioms, phrasal verbs, and high-level discourse structures.',
    grammarFocus: ['advanced inversion', 'discourse markers', 'precision and rhetorical framing'],
    correctionStyle:
      'Native-like polishing. Keep feedback concise and highly specific to tone and impact.',
    jtbd:
      'Student wants near-native command, subtle humor comprehension, and persuasive mastery.',
  },
};

export function nextCefrLevel(level: CEFRLevel): CEFRLevel {
  const idx = CEFR_LEVEL_ORDER.indexOf(level);
  if (idx < 0 || idx === CEFR_LEVEL_ORDER.length - 1) return 'C2';
  return CEFR_LEVEL_ORDER[idx + 1];
}

export function clampTtsSpeed(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.6, Math.min(1.2, Number(value.toFixed(2))));
}

export function mapLegacyLevelToCefr(value: string | undefined): CEFRLevel {
  if (value === 'A1' || value === 'A2' || value === 'B1' || value === 'B2' || value === 'C1' || value === 'C2') {
    return value;
  }
  if (value === 'beginner') return 'A1';
  if (value === 'intermediate') return 'B1';
  if (value === 'advanced') return 'C1';
  return 'A1';
}

