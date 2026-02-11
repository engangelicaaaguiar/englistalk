'use client';

import { useChat } from 'ai/react';
import { useEffect, useState, useRef } from 'react';
import { Mic, MicOff, Wifi, WifiOff, X, Sparkles, Monitor, Smartphone, ChevronRight } from 'lucide-react';

export default function App() {
  // --- ESTADOS ---
  const [view, setView] = useState<'landing' | 'app'>('landing');
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("Pronto");
  const [debugLog, setDebugLog] = useState("");

  // --- HOOK DA IA ---
  const { messages, append, isLoading } = useChat({
    api: '/api/chat',
    onError: (err) => {
      setStatus("Erro API");
      setDebugLog(`API Error: ${err.message}. Verifique a chave no .env.local`);
    },
    onFinish: () => {
      setStatus("Sua vez");
      restartListening();
    }
  });

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // --- LÓGICA DE VOZ (Universal) ---
  useEffect(() => {
    if (typeof window !== 'undefined' && view === 'app') {
      synthRef.current = window.speechSynthesis;
      // @ts-ignore
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setDebugLog("Navegador incompatível (Use Chrome/Edge).");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true; 
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setStatus("Ouvindo...");
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        // Ignora erros comuns de 'no-speech' para não poluir a tela
        if (event.error !== 'no-speech') {
             setDebugLog(`Mic: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');

        // Se for Desktop, mostra o texto enquanto fala. Se for mobile, simplifica.
        setStatus(window.innerWidth > 768 ? `Ouvindo: ${transcript}` : "Ouvindo...");

        if (event.results[0].isFinal) {
           clearTimeout(silenceTimerRef.current);
           setStatus("Analisando...");
           
           silenceTimerRef.current = setTimeout(() => {
             recognition.stop();
             setStatus("Enviando...");
             append({ role: 'user', content: transcript });
           }, 1200);
        }
      };
      recognitionRef.current = recognition;
    }
  }, [view, append]);

  const restartListening = () => {
    try { recognitionRef.current?.start(); } catch(e) {}
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      restartListening();
    }
  }

  // --- TTS (Fala) ---
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && !isLoading) {
      speak(lastMessage.content);
    }
  }, [messages, isLoading]);

  const speak = (text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();

    const cleanText = text.replace(/[*#]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    
    const voices = synthRef.current.getVoices();
    const bestVoice = voices.find(v => v.name.includes('Google US English')) || voices[0];
    if (bestVoice) utterance.voice = bestVoice;

    utterance.onstart = () => setStatus("IA Falando...");
    utterance.onend = () => {
      setStatus("Sua vez");
      restartListening();
    };

    synthRef.current.speak(utterance);
  };

  // --- UI RENDER ---

  // 1. LANDING PAGE (Desktop & Mobile Otimizada)
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-indigo-500 overflow-x-hidden">
        {/* Navbar */}
        <nav className="max-w-7xl mx-auto p-6 flex justify-between items-center">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <Sparkles className="text-indigo-500" /> TalkNative
          </div>
          <button onClick={() => setView('app')} className="hidden md:block px-6 py-2 rounded-full border border-white/20 hover:bg-white/10 transition-all text-sm font-medium">
            Entrar
          </button>
        </nav>

        {/* Hero Section */}
        <main className="max-w-7xl mx-auto px-6 pt-10 md:pt-20 flex flex-col md:flex-row items-center gap-12">
          
          {/* Texto (Esquerda) */}
          <div className="flex-1 text-center md:text-left z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-900/30 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase tracking-widest mb-8">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
              Voice Engine 2.0 Live
            </div>
            
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tighter mb-6 leading-[1.1]">
              Fluência <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Instantânea.</span>
            </h1>
            
            <p className="text-lg md:text-2xl text-slate-400 mb-10 max-w-xl mx-auto md:mx-0 leading-relaxed">
              Pratique inglês conversando com uma IA nativa. Sem digitar, sem agendar. Apenas fale.
            </p>

            <button 
              onClick={() => setView('app')}
              className="group relative inline-flex items-center gap-3 px-8 py-4 bg-white text-slate-950 rounded-full font-bold text-lg hover:bg-indigo-50 transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] hover:shadow-[0_0_60px_-10px_rgba(255,255,255,0.5)]"
            >
              Iniciar Sessão Agora
              <ChevronRight className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Visual (Direita - Desktop Only) */}
          <div className="flex-1 relative hidden md:flex justify-center">
            <div className="relative w-96 h-96 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-full blur-[100px] opacity-50 animate-pulse"></div>
            <div className="absolute inset-0 flex items-center justify-center">
               <div className="w-80 h-80 rounded-[3rem] bg-slate-900/50 backdrop-blur-xl border border-white/10 shadow-2xl flex items-center justify-center transform rotate-6 hover:rotate-0 transition-all duration-700">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-indigo-500 rounded-full mx-auto mb-6 flex items-center justify-center shadow-lg">
                      <Mic className="text-white w-10 h-10" />
                    </div>
                    <p className="text-2xl font-bold">"Hello!"</p>
                    <p className="text-slate-400 mt-2">Listening...</p>
                  </div>
               </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 2. APP INTERFACE (HÍBRIDA: Desktop + Mobile)
  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col relative overflow-hidden font-sans">
      
      {/* Background Dinâmico */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/10 via-black to-black -z-10" />

      {/* HEADER */}
      <div className="w-full p-6 flex justify-between items-center z-20">
        <button onClick={() => setView('landing')} className="p-3 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
          <X size={24} className="text-slate-400" />
        </button>

        {/* Status Bar Centralizada no Desktop */}
        <div className="hidden md:flex items-center gap-4 bg-white/5 px-6 py-2 rounded-full border border-white/5 backdrop-blur-md">
           <div className={`w-2 h-2 rounded-full ${status.includes('Erro') ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`}></div>
           <span className="text-sm font-medium text-slate-300 uppercase tracking-widest">{status}</span>
        </div>

        {/* Ícone de Dispositivo (Debug Visual) */}
        <div className="text-slate-600 hidden md:block">
           <Monitor size={20} />
        </div>
      </div>

      {/* ÁREA CENTRAL - O ORBE RESPONSIVO */}
      <div className="flex-1 flex flex-col items-center justify-center relative w-full">
        
        <div 
          onClick={toggleListening}
          className="relative cursor-pointer group"
        >
          {/* Glow Gigante no Desktop, Menor no Mobile */}
          <div className={`absolute inset-0 rounded-full transition-all duration-700 
            ${isLoading ? 'bg-purple-600/30 blur-[60px] md:blur-[120px] scale-150' : 
              isListening ? 'bg-indigo-500/30 blur-[60px] md:blur-[120px] scale-125' : 
              'bg-slate-800/10 blur-[40px] scale-100'}`} 
          />
          
          {/* O Orbe Físico - Responsivo via Tailwind (w-48 mobile vs w-96 desktop) */}
          <div className={`relative w-48 h-48 md:w-80 md:h-80 rounded-full backdrop-blur-2xl border flex items-center justify-center transition-all duration-500 shadow-2xl
             ${isListening 
               ? 'border-indigo-500/50 bg-indigo-900/10 scale-110 md:scale-105' 
               : 'border-white/10 bg-black/40 hover:border-white/30 hover:bg-white/5'}
          `}>
            {isLoading ? (
              <Sparkles className="animate-spin text-purple-400 w-12 h-12 md:w-20 md:h-20" />
            ) : isListening ? (
              // Ondas de Som Animadas
              <div className="flex gap-1.5 md:gap-3 items-center h-12 md:h-24">
                 {[...Array(5)].map((_, i) => (
                   <div key={i} className="w-1.5 md:w-3 bg-indigo-400 rounded-full animate-bounce" 
                        style={{ animationDuration: `${0.4 + (i * 0.1)}s`, height: '100%' }}></div>
                 ))}
              </div>
            ) : (
              <MicOff className="text-slate-600 w-10 h-10 md:w-16 md:h-16 group-hover:text-white transition-colors" />
            )}
          </div>

          {/* Dica de Hover (Só aparece no Desktop) */}
          <p className="hidden md:block absolute -bottom-12 left-0 right-0 text-center text-sm text-slate-500 uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-opacity">
            {isListening ? "Clique para Pausar" : "Clique para Falar"}
          </p>
        </div>
      </div>

      {/* ÁREA DE LEGENDAS (Responsiva) */}
      <div className="w-full min-h-[20vh] md:min-h-[25vh] bg-gradient-to-t from-black via-black/80 to-transparent p-6 md:p-12 flex flex-col justify-end items-center text-center z-20">
        
        {/* Debug Log (Erro apenas) */}
        {debugLog && (
           <div className="mb-4 text-xs text-red-400 bg-red-900/20 px-3 py-1 rounded border border-red-500/20">
             {debugLog}
           </div>
        )}

        <div className="max-w-4xl">
          <p className={`text-2xl md:text-4xl lg:text-5xl font-light leading-tight transition-all duration-500
            ${isLoading ? 'opacity-50 blur-sm' : 'opacity-100'}`}>
            {messages.length > 0 
              ? messages[messages.length - 1].role === 'assistant' 
                 ? <span dangerouslySetInnerHTML={{ __html: messages[messages.length - 1].content.replace(/\*\*(.*?)\*\*/g, '<span class="text-indigo-400 font-normal">$1</span>') }} />
                 : <span className="text-slate-500 italic">"{messages[messages.length - 1].content}"</span>
              : <span className="text-slate-600">Diga "Hello" para começar.</span>
            }
          </p>
        </div>
      </div>
    </div>
  );
}
