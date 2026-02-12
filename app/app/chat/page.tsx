'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Mic, MicOff, Settings } from 'lucide-react';
import { getSupabaseClient } from '../../../lib/supabaseClient';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export default function AppChatPage() {
  const router = useRouter();
  const emptyReplyFallback = "I did not catch that clearly. Could you repeat in one short sentence?";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Toque no balao e fale em ingles');
  const [isListening, setIsListening] = useState(false);
  const [subtitleUser, setSubtitleUser] = useState('');
  const [subtitleAssistant, setSubtitleAssistant] = useState('');
  const [supportsSpeech, setSupportsSpeech] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [apiStatus, setApiStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [lastApiMs, setLastApiMs] = useState<number | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const shouldAutoListenRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const pendingSendRef = useRef(false);
  const interimTranscriptRef = useRef('');
  const finalTranscriptRef = useRef('');
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) {
        router.replace('/auth/login');
      }
    };
    void checkSession();
  }, [router]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setSupportsSpeech(false);
      setStatus('Seu navegador nao suporta reconhecimento de voz.');
      return;
    }
    if (pendingSendRef.current || isLoading || isSpeakingRef.current) return;
    try {
      recognitionRef.current.start();
    } catch {
      setTimeout(() => {
        if (shouldAutoListenRef.current && !pendingSendRef.current && !isSpeakingRef.current) {
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
      const cleanText = text.replace(/[*#]/g, '').trim();
      if (!cleanText) return;

      setSubtitleAssistant(cleanText);
      if (!synthRef.current) {
        setVoiceStatus('error');
        if (shouldAutoListenRef.current) startListening();
        return;
      }

      synthRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'en-US';
      utterance.rate = 0.98;
      const voices = synthRef.current.getVoices();
      const preferred =
        voices.find((v) => v.lang?.toLowerCase().startsWith('en-us')) ||
        voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ||
        null;
      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => {
        isSpeakingRef.current = true;
        setVoiceStatus('ok');
        setStatus('Professor falando...');
      };

      utterance.onend = () => {
        isSpeakingRef.current = false;
        setStatus('Sua vez. Fale novamente.');
        if (shouldAutoListenRef.current) {
          startListening();
        }
      };

      utterance.onerror = () => {
        isSpeakingRef.current = false;
        setVoiceStatus('error');
        setStatus('Falha no audio da resposta.');
        if (shouldAutoListenRef.current) {
          startListening();
        }
      };

      synthRef.current.resume();
      synthRef.current.speak(utterance);
    },
    [startListening],
  );

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
        }),
        signal: controller.signal,
      });

      const elapsed = Date.now() - startedAt;
      setLastApiMs(elapsed);

      if (!response.ok) {
        setApiStatus('error');
        let message = 'Falha ao processar sua fala.';
        try {
          const errorJson = await response.json();
          if (typeof errorJson?.error === 'string' && errorJson.error) {
            message = errorJson.error;
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      let assistantText = '';
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await response.json();
        assistantText = String(json?.content || '').trim();
      } else {
        assistantText = (await response.text()).trim();
      }

      setApiStatus('ok');
      return assistantText;
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  const sendTranscript = useCallback(
    async (spokenText: string) => {
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
        const compactHistory = history.slice(-10);
        let assistantText = await requestAssistant(compactHistory);
        if (!assistantText || assistantText === emptyReplyFallback) {
          assistantText = await requestAssistant([userMessage]);
        }
        const safeAssistantText = assistantText || emptyReplyFallback;

        const assistantMessage: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: safeAssistantText,
        };

        setMessages([...history, assistantMessage]);
        speakAssistant(safeAssistantText);
      } catch {
        setApiStatus('error');
        const fallback = 'Nao consegui responder agora. Tente novamente em ingles.';
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
    },
    [emptyReplyFallback, requestAssistant, speakAssistant],
  );

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
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsListening(true);
      setStatus('Ouvindo voce...');
    };

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalText += chunk;
        else interimText += chunk;
      }

      interimTranscriptRef.current = interimText.trim();
      if (interimText.trim()) {
        setSubtitleUser(interimText.trim());
      }

      if (finalText.trim()) {
        finalTranscriptRef.current = finalText.trim();
        setSubtitleUser(finalText.trim());
      }
    };

    recognition.onend = () => {
      setIsListening(false);

      const transcript = (finalTranscriptRef.current || interimTranscriptRef.current).trim();
      if (transcript && !pendingSendRef.current) {
        finalTranscriptRef.current = '';
        interimTranscriptRef.current = '';
        void sendTranscript(transcript);
        return;
      }

      if (shouldAutoListenRef.current && !pendingSendRef.current && !isSpeakingRef.current) {
        startListening();
        return;
      }

      setStatus('Toque no balao e fale em ingles');
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
          setStatus('Nao ouvi sua fala. Tente novamente.');
          startListening();
        }
        return;
      }

      setStatus('Erro no microfone. Verifique a permissao.');
      setVoiceStatus('error');
      if (shouldAutoListenRef.current && !pendingSendRef.current && !isSpeakingRef.current) {
        startListening();
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      synthRef.current?.cancel();
    };
  }, [sendTranscript, startListening]);

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

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    shouldAutoListenRef.current = next;

    if (!next) {
      stopListening();
      setStatus('Conversa por voz pausada.');
      return;
    }

    setStatus('Ouvindo voce...');
    startListening();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-xl font-semibold">Jornada Falada</h1>
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
      </div>
    </div>
  );
}
