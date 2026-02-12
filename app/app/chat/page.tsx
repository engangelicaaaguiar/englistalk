'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from 'ai/react';
import { LogOut, Mic, MicOff, Settings } from 'lucide-react';
import { getSupabaseClient } from '../../../lib/supabaseClient';

export default function AppChatPage() {
  const router = useRouter();
  const { messages, append, isLoading } = useChat({
    api: '/api/chat',
    streamMode: 'text',
  });
  const [status, setStatus] = useState('Toque no balao e fale em ingles');
  const [isListening, setIsListening] = useState(false);
  const [subtitleUser, setSubtitleUser] = useState('');
  const [subtitleAssistant, setSubtitleAssistant] = useState('');
  const [supportsSpeech, setSupportsSpeech] = useState(true);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const autoListenRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const lastSpokenAssistantIdRef = useRef('');

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
    if (isLoading) return;
    if (isSpeakingRef.current && synthRef.current) {
      synthRef.current.cancel();
      isSpeakingRef.current = false;
    }
    try {
      recognitionRef.current.start();
    } catch {
      setStatus('Toque novamente para comecar a falar.');
    }
  }, [isLoading]);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      setIsListening(false);
    }
  }, []);

  const sendTranscript = useCallback(
    async (spokenText: string) => {
      const cleaned = spokenText.trim();
      if (!cleaned) return;
      setSubtitleUser(cleaned);
      setStatus('Professor pensando...');
      try {
        await append({ role: 'user', content: cleaned });
      } catch {
        setStatus('Falha ao enviar sua fala. Tente novamente.');
      }
    },
    [append],
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

    recognition.onend = () => {
      setIsListening(false);
      if (!isSpeakingRef.current && !isLoading) {
        setStatus('Toque no balao e fale em ingles');
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setStatus('Erro no microfone. Verifique a permissao.');
    };

    recognition.onresult = (event: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalText += chunk;
        else interimText += chunk;
      }

      if (interimText.trim()) {
        setSubtitleUser(interimText.trim());
      }

      if (finalText.trim()) {
        stopListening();
        void sendTranscript(finalText);
      }
    };

    recognitionRef.current = recognition;
    return () => recognition.stop();
  }, [isLoading, sendTranscript, stopListening]);

  useEffect(() => {
    const lastAssistantMessage = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant' && String(m.content).trim().length > 0);

    if (!lastAssistantMessage || isLoading) return;
    if (lastAssistantMessage.id === lastSpokenAssistantIdRef.current) return;

    const text = String(lastAssistantMessage.content).replace(/[*#]/g, '').trim();
    if (!text) return;

    lastSpokenAssistantIdRef.current = lastAssistantMessage.id;
    setSubtitleAssistant(text);

    if (!synthRef.current) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.98;

    utterance.onstart = () => {
      isSpeakingRef.current = true;
      setStatus('Professor falando...');
    };

    utterance.onend = () => {
      isSpeakingRef.current = false;
      setStatus('Sua vez. Fale novamente.');
      if (autoListenRef.current) {
        startListening();
      }
    };

    utterance.onerror = () => {
      isSpeakingRef.current = false;
      setStatus('Falha no audio da resposta.');
    };

    synthRef.current.cancel();
    synthRef.current.resume();
    synthRef.current.speak(utterance);
  }, [messages, isLoading, startListening]);

  const logout = async () => {
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
    autoListenRef.current = true;
    if (isListening) stopListening();
    else startListening();
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
        </div>
      </div>
    </div>
  );
}
