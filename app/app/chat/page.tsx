'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Mic, MicOff, Settings } from 'lucide-react';
import { CEFR_BLUEPRINT, CEFR_DEFAULT_TTS_SPEED, CEFRLevel } from '../../../lib/cefr';
import {
  ConfidenceMetrics,
  UserProgressRow,
  VocabularyWordRow,
  computeConfidenceMetrics,
  extractUniqueWords,
  fetchOrCreateProgress,
  loadVocabularyForLevel,
  maybePromoteLevel,
  saveProgress,
  upsertVocabularyFromTurn,
} from '../../../lib/progressStore';
import { getSupabaseClient } from '../../../lib/supabaseClient';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type ProfilePayload = {
  userId: string;
  fullName: string;
  currentLevel: CEFRLevel;
  currentModule: string;
  correctionMode: 'friendly' | 'strict';
  voice: 'en-US' | 'en-GB';
  ttsSpeed: number;
};

const SILENCE_GRACE_MS = 2000;

const EMPTY_METRICS: ConfidenceMetrics = {
  totalWords: 0,
  masteredWords: 0,
  learningWords: 0,
  weakWords: 0,
  masteredPct: 0,
  weakPct: 0,
  progressCurrentLevel: 0,
  progressTargetWords: 500,
  progressPct: 0,
};

function radarPoint(angleDeg: number, valuePct: number) {
  const radius = 44 * Math.max(0, Math.min(100, valuePct)) / 100;
  const angle = (angleDeg * Math.PI) / 180;
  const x = 60 + Math.cos(angle) * radius;
  const y = 60 + Math.sin(angle) * radius;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

export default function AppChatPage() {
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState('Toque no balao e fale em ingles');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [supportsSpeech, setSupportsSpeech] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const [subtitleUser, setSubtitleUser] = useState('');
  const [subtitleAssistant, setSubtitleAssistant] = useState('');
  const [apiStatus, setApiStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [lastApiMs, setLastApiMs] = useState<number | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const [fullName, setFullName] = useState('');
  const [userId, setUserId] = useState('');
  const [progress, setProgress] = useState<UserProgressRow | null>(null);
  const [vocabularyRows, setVocabularyRows] = useState<VocabularyWordRow[]>([]);
  const [confidence, setConfidence] = useState<ConfidenceMetrics>(EMPTY_METRICS);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const shouldAutoListenRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const ttsPendingRef = useRef(false);
  const pendingSendRef = useRef(false);
  const interimTranscriptRef = useRef('');
  const finalTranscriptRef = useRef('');
  const messagesRef = useRef<ChatMessage[]>([]);
  const progressRef = useRef<UserProgressRow | null>(null);
  const fullNameRef = useRef('');
  const userIdRef = useRef('');
  const silenceDecisionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    fullNameRef.current = fullName;
  }, [fullName]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const loadDashboard = useCallback(async (uid: string, level: CEFRLevel) => {
    const rows = await loadVocabularyForLevel(uid, level);
    setVocabularyRows(rows);
    setConfidence(computeConfidenceMetrics(rows, level));
  }, []);

  useEffect(() => {
    const hydrate = async () => {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        router.replace('/auth/login');
        return;
      }

      setUserId(user.id);

      const { data: userData } = await supabase.auth.getUser();
      const meta = userData.user?.user_metadata || {};
      setFullName(typeof meta.full_name === 'string' ? meta.full_name : '');

      const row = await fetchOrCreateProgress(user.id, meta.level as string | undefined);
      setProgress(row);
      await loadDashboard(user.id, row.current_level);
    };

    void hydrate();
  }, [loadDashboard, router]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setSupportsSpeech(false);
      setStatus('Seu navegador nao suporta reconhecimento de voz.');
      return;
    }

    if (pendingSendRef.current || isLoading || isSpeakingRef.current || ttsPendingRef.current) {
      return;
    }

    try {
      recognitionRef.current.start();
    } catch {
      setTimeout(() => {
        if (
          shouldAutoListenRef.current &&
          !pendingSendRef.current &&
          !isSpeakingRef.current &&
          !ttsPendingRef.current
        ) {
          try {
            recognitionRef.current?.start();
          } catch {
            setStatus('Toque novamente para comecar a falar.');
          }
        }
      }, 350);
    }
  }, [isLoading]);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      setIsListening(false);
    }
  }, []);

  const speakAssistant = useCallback(
    (text: string) => {
      const cleanText = text
        .replace(/^\s*\[(gentle|cheerful)\]\s*/i, '')
        .replace(/[*#]/g, '')
        .trim();
      if (!cleanText) return;

      setSubtitleAssistant(cleanText);

      const active = progressRef.current;
      const voice = active?.settings.voice || 'en-US';
      const speed = active?.settings.tts_speed ?? CEFR_DEFAULT_TTS_SPEED[active?.current_level || 'A1'];

      if (!synthRef.current) {
        setVoiceStatus('error');
        ttsPendingRef.current = false;
        if (shouldAutoListenRef.current) startListening();
        return;
      }

      ttsPendingRef.current = true;
      isSpeakingRef.current = true;
      setStatus('Professor falando...');

      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = voice;
      utterance.rate = speed;

      const voices = synthRef.current.getVoices();
      const preferred =
        voices.find((v) => v.lang?.toLowerCase() === voice.toLowerCase()) ||
        voices.find((v) => v.lang?.toLowerCase().startsWith(voice.slice(0, 2).toLowerCase())) ||
        voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ||
        null;

      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => {
        setVoiceStatus('ok');
        setStatus('Professor falando...');
      };

      utterance.onend = () => {
        ttsPendingRef.current = false;
        isSpeakingRef.current = false;
        setStatus('Sua vez. Fale novamente.');
        if (shouldAutoListenRef.current) startListening();
      };

      utterance.onerror = () => {
        ttsPendingRef.current = false;
        isSpeakingRef.current = false;
        setVoiceStatus('error');

        const backup = new SpeechSynthesisUtterance(cleanText);
        backup.lang = voice;
        backup.rate = Math.max(0.8, speed - 0.05);
        backup.onstart = () => {
          isSpeakingRef.current = true;
          setVoiceStatus('ok');
          setStatus('Professor falando...');
        };
        backup.onend = () => {
          isSpeakingRef.current = false;
          setStatus('Sua vez. Fale novamente.');
          if (shouldAutoListenRef.current) startListening();
        };
        backup.onerror = () => {
          isSpeakingRef.current = false;
          setVoiceStatus('error');
          setStatus('Falha no audio da resposta. Toque no balao para retomar.');
          if (shouldAutoListenRef.current) startListening();
        };

        try {
          synthRef.current?.cancel();
          synthRef.current?.speak(backup);
        } catch {
          setStatus('Falha no audio da resposta. Toque no balao para retomar.');
          if (shouldAutoListenRef.current) startListening();
        }
      };

      synthRef.current.resume();
      synthRef.current.speak(utterance);
    },
    [startListening],
  );

  const buildProfilePayload = useCallback((): ProfilePayload => {
    const active = progressRef.current;
    const level = active?.current_level || 'A1';

    return {
      userId: userIdRef.current,
      fullName: fullNameRef.current,
      currentLevel: level,
      currentModule: active?.current_module || 'Daily_Conversation',
      correctionMode: active?.settings.correction_mode || 'friendly',
      voice: active?.settings.voice || 'en-US',
      ttsSpeed: active?.settings.tts_speed ?? CEFR_DEFAULT_TTS_SPEED[level],
    };
  }, []);

  const requestAssistant = useCallback(async (history: ChatMessage[]) => {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          profile: buildProfilePayload(),
        }),
        signal: controller.signal,
      });

      setLastApiMs(Date.now() - startedAt);

      if (!response.ok) {
        setApiStatus('error');
        let message = 'Falha ao processar sua fala.';
        try {
          const errorJson = await response.json();
          if (typeof errorJson?.error === 'string' && errorJson.error) {
            message = errorJson.error;
          }
        } catch {
          // ignore json parsing fallback
        }
        throw new Error(message);
      }

      const contentType = response.headers.get('content-type') || '';
      const assistantText = contentType.includes('application/json')
        ? String((await response.json())?.content || '').trim()
        : (await response.text()).trim();

      setApiStatus('ok');
      return assistantText;
    } finally {
      clearTimeout(timeout);
    }
  }, [buildProfilePayload]);

  const applyTurnProgress = useCallback(async (studentText: string, teacherText: string) => {
    const uid = userIdRef.current;
    const active = progressRef.current;
    if (!uid || !active) return;

    await upsertVocabularyFromTurn({
      userId: uid,
      level: active.current_level,
      userText: studentText,
      assistantText: teacherText,
    });

    const wordsCount = extractUniqueWords(studentText).length;
    const correctionHits = (teacherText.match(/\*\*(.+?)\*\*/g) || []).length;
    const xpGain = Math.max(6, 10 + wordsCount - correctionHits * 2);

    const saved = await saveProgress({
      ...active,
      xp_points: active.xp_points + xpGain,
    });

    const promoted = await maybePromoteLevel(saved);
    setProgress(promoted);

    if (promoted.current_level !== active.current_level) {
      setStatus(`Parabens! Voce avancou para o nivel ${promoted.current_level}.`);
    }

    await loadDashboard(uid, promoted.current_level);
  }, [loadDashboard]);

  const sendTranscript = useCallback(async (spokenText: string) => {
    const cleaned = spokenText.trim();
    if (!cleaned || pendingSendRef.current) return;

    pendingSendRef.current = true;
    setIsLoading(true);
    setSubtitleUser(cleaned);
    setStatus('Professor pensando...');

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: cleaned,
    };

    const history = [...messagesRef.current, userMessage];
    setMessages(history);

    try {
      let assistantText = await requestAssistant(history);
      if (!assistantText) {
        assistantText = await requestAssistant([userMessage]);
      }

      const safeAssistantText =
        assistantText ||
        'Great effort. Let us continue. Can you say one more complete sentence about this topic?';

      const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: safeAssistantText,
      };

      setMessages([...history, assistantMessage]);
      await applyTurnProgress(cleaned, safeAssistantText);
      speakAssistant(safeAssistantText);
    } catch {
      setApiStatus('error');
      const fallback = 'I had a temporary issue, but we can continue. Can you repeat your sentence once?';
      const assistantMessage: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: fallback,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      speakAssistant(fallback);
    } finally {
      pendingSendRef.current = false;
      setIsLoading(false);
    }
  }, [applyTurnProgress, requestAssistant, speakAssistant]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    synthRef.current = window.speechSynthesis;
    const SpeechRecognition =
      // @ts-ignore webkit prefix for Chrome
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupportsSpeech(false);
      setStatus('Seu navegador nao suporta reconhecimento de voz.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = progress?.settings.voice || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setIsListening(true);
      setStatus('Ouvindo voce...');
    };

    recognition.onresult = (event: any) => {
      if (silenceDecisionTimeoutRef.current) {
        clearTimeout(silenceDecisionTimeoutRef.current);
        silenceDecisionTimeoutRef.current = null;
      }

      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalText += chunk;
        else interimText += chunk;
      }

      const finalizedChunk = finalText.trim();
      if (finalizedChunk) {
        finalTranscriptRef.current = `${finalTranscriptRef.current} ${finalizedChunk}`.trim();
      }

      interimTranscriptRef.current = interimText.trim();
      const liveTranscript = `${finalTranscriptRef.current} ${interimTranscriptRef.current}`.trim();
      if (liveTranscript) setSubtitleUser(liveTranscript);
    };

    recognition.onend = () => {
      setIsListening(false);

      if (silenceDecisionTimeoutRef.current) {
        clearTimeout(silenceDecisionTimeoutRef.current);
      }

      setStatus('Aguardando fim da pausa...');
      silenceDecisionTimeoutRef.current = setTimeout(() => {
        silenceDecisionTimeoutRef.current = null;

        const transcript = `${finalTranscriptRef.current} ${interimTranscriptRef.current}`.trim();
        if (transcript && !pendingSendRef.current) {
          finalTranscriptRef.current = '';
          interimTranscriptRef.current = '';
          void sendTranscript(transcript);
          return;
        }

        if (
          shouldAutoListenRef.current &&
          !pendingSendRef.current &&
          !isSpeakingRef.current &&
          !ttsPendingRef.current
        ) {
          startListening();
          return;
        }

        setStatus('Toque no balao e fale em ingles');
      }, SILENCE_GRACE_MS);
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      const code = event?.error || 'unknown';

      if (code === 'not-allowed' || code === 'service-not-allowed') {
        shouldAutoListenRef.current = false;
        setVoiceEnabled(false);
        setVoiceStatus('error');
        setStatus('Permissao do microfone bloqueada no navegador.');
        return;
      }

      if (code === 'no-speech') {
        if (shouldAutoListenRef.current) {
          setStatus('Nao ouvi sua fala. Mantendo microfone aberto...');
          setTimeout(() => {
            if (
              shouldAutoListenRef.current &&
              !pendingSendRef.current &&
              !isSpeakingRef.current &&
              !ttsPendingRef.current
            ) {
              startListening();
            }
          }, SILENCE_GRACE_MS);
        }
        return;
      }

      setStatus('Erro no microfone. Verifique a permissao.');
      setVoiceStatus('error');

      if (
        shouldAutoListenRef.current &&
        !pendingSendRef.current &&
        !isSpeakingRef.current &&
        !ttsPendingRef.current
      ) {
        startListening();
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (silenceDecisionTimeoutRef.current) {
        clearTimeout(silenceDecisionTimeoutRef.current);
        silenceDecisionTimeoutRef.current = null;
      }
      recognition.stop();
      synthRef.current?.cancel();
    };
  }, [progress?.settings.voice, sendTranscript, startListening]);

  const logout = async () => {
    shouldAutoListenRef.current = false;
    setVoiceEnabled(false);
    stopListening();
    synthRef.current?.cancel();
    await getSupabaseClient().auth.signOut();
    router.push('/auth/login');
    router.refresh();
  };

  const orbClass = useMemo(() => {
    if (isLoading) return 'border-amber-400/60 bg-amber-400/10';
    if (isListening) return 'border-emerald-400/60 bg-emerald-400/10';
    return 'border-slate-300 bg-white hover:border-slate-400';
  }, [isListening, isLoading]);

  const coachMode = useMemo(() => {
    const level = progress?.current_level || 'A1';
    return `Coach ${level}`;
  }, [progress?.current_level]);

  const blueprint = useMemo(() => CEFR_BLUEPRINT[progress?.current_level || 'A1'], [progress?.current_level]);

  const weakFocus = useMemo(
    () => vocabularyRows.find((row) => row.status === 'weak' && row.last_mistake_context),
    [vocabularyRows],
  );

  const radarValues = useMemo(() => {
    const stability = 100 - confidence.weakPct;
    const growth = confidence.progressPct;
    const retention = confidence.totalWords === 0
      ? 0
      : Math.round(((confidence.masteredWords + confidence.learningWords) / confidence.totalWords) * 100);

    return [
      confidence.masteredPct,
      stability,
      growth,
      retention,
    ];
  }, [confidence]);

  const radarPolygon = useMemo(() => {
    const angles = [-90, 0, 90, 180];
    return angles.map((angle, idx) => radarPoint(angle, radarValues[idx])).join(' ');
  }, [radarValues]);

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    shouldAutoListenRef.current = next;

    if (!next) {
      stopListening();
      ttsPendingRef.current = false;
      isSpeakingRef.current = false;
      synthRef.current?.cancel();
      setStatus('Conversa por voz pausada.');
      return;
    }

    try {
      const unlock = new SpeechSynthesisUtterance(' ');
      unlock.volume = 0;
      synthRef.current?.speak(unlock);
      synthRef.current?.cancel();
    } catch {
      // ignore unlock failures
    }

    setStatus('Ouvindo voce...');
    startListening();
  };

  const subtitlesEnabled = progress?.settings.show_subtitles ?? true;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Jornada Falada</h1>
          <p className="text-xs text-slate-500">
            {coachMode} - modulo {progress?.current_module || 'Daily_Conversation'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/settings" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <Settings size={16} />
            Settings
          </Link>
          <button type="button" onClick={logout} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </div>

      <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden rounded-2xl border bg-gradient-to-b from-slate-50 to-slate-100 px-6 py-10">
        <div className="absolute -top-20 h-72 w-72 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="absolute -bottom-24 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl" />

        <button
          type="button"
          onClick={toggleVoice}
          disabled={!supportsSpeech}
          className={`relative z-10 h-44 w-44 rounded-full border-2 shadow-xl transition-all md:h-52 md:w-52 ${orbClass} ${supportsSpeech ? '' : 'cursor-not-allowed opacity-60'}`}
        >
          <span className="sr-only">Ativar conversa por voz</span>
          {isListening ? <MicOff className="mx-auto h-12 w-12 text-emerald-600" /> : <Mic className="mx-auto h-12 w-12 text-slate-700" />}
        </button>

        <p className="relative z-10 mt-6 text-center text-sm font-medium text-slate-700">{status}</p>

        {subtitlesEnabled ? (
          <div className="relative z-10 mt-10 w-full max-w-3xl space-y-3 rounded-2xl border bg-white/90 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Legenda</p>
            <p className="min-h-10 text-base text-slate-700">
              <span className="font-semibold text-slate-900">Aluno:</span>{' '}
              {subtitleUser || 'Fale em ingles para iniciar.'}
            </p>
            <p className="min-h-10 text-base text-slate-700">
              <span className="font-semibold text-slate-900">Professor:</span>{' '}
              {subtitleAssistant || 'A resposta em voz aparecera aqui como legenda.'}
            </p>
            <div className="pt-2 text-xs text-slate-500">
              <span className="mr-4">
                API: {apiStatus === 'ok' ? 'ok' : apiStatus === 'error' ? 'erro' : 'aguardando'}
                {lastApiMs ? ` (${lastApiMs}ms)` : ''}
              </span>
              <span>
                Voz: {voiceStatus === 'ok' ? 'ok' : voiceStatus === 'error' ? 'erro' : 'aguardando'}
              </span>
            </div>
          </div>
        ) : null}

        <div className="relative z-10 mt-6 grid w-full max-w-5xl gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Radar de Confianca</p>
            <div className="mt-3 flex items-center gap-4">
              <svg viewBox="0 0 120 120" className="h-28 w-28">
                <circle cx="60" cy="60" r="44" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                <circle cx="60" cy="60" r="30" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                <line x1="60" y1="8" x2="60" y2="112" stroke="#e2e8f0" strokeWidth="1" />
                <line x1="8" y1="60" x2="112" y2="60" stroke="#e2e8f0" strokeWidth="1" />
                <polygon points={radarPolygon} fill="rgba(14,116,144,0.24)" stroke="#0e7490" strokeWidth="2" />
              </svg>
              <div className="text-xs text-slate-600">
                <p>Mastered: {confidence.masteredPct}%</p>
                <p>Weak: {confidence.weakPct}%</p>
                <p>Words tracked: {confidence.totalWords}</p>
                {confidence.weakPct > 35 ? <p className="mt-1 text-amber-700">Alerta: muitas weak words. Reforce vocabulario antes do exame.</p> : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Feedback Instantaneo</p>
            {weakFocus ? (
              <p className="mt-3 text-sm text-slate-700">
                Hoje voce tropecou em <span className="font-semibold">{weakFocus.word}</span>. Amanha a professora vai reforcar isso.
                {weakFocus.last_mistake_context ? ` Contexto: ${weakFocus.last_mistake_context}` : ''}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-700">
                Nenhum tropeco forte registrado nesta sessao. Continue praticando para solidificar o nivel {progress?.current_level || 'A1'}.
              </p>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Barra de Evolucao</p>
            <p className="mt-3 text-sm text-slate-700">
              Voce domina {confidence.progressCurrentLevel}/{confidence.progressTargetWords} palavras do nivel {progress?.current_level || 'A1'}.
            </p>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-slate-900" style={{ width: `${confidence.progressPct}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Faltam {Math.max(0, confidence.progressTargetWords - confidence.progressCurrentLevel)} palavras para o exame final deste nivel.
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-4 w-full max-w-5xl rounded-2xl border bg-white p-4 text-xs text-slate-600 shadow-sm">
          <p className="font-semibold text-slate-700">Foco CEFR {progress?.current_level || 'A1'}</p>
          <p className="mt-1">JTBD: {blueprint.jtbd}</p>
          <p className="mt-1">Grammar focus: {blueprint.grammarFocus.join(', ')}</p>
        </div>
      </div>
    </div>
  );
}

