'use client';

import { useChat } from 'ai/react';
import { useEffect, useState, useRef } from 'react';
import { Mic, MicOff, Volume2, ArrowRight, Lock, User, Sparkles, CheckCircle2, Activity, X } from 'lucide-react';

// --- COMPONENTES VISUAIS (UI KIT) ---

// Botão com brilho
const ShinyButton = ({ children, onClick, className = "" }: any) => (
  <button 
    onClick={onClick}
    className={`relative group px-8 py-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold shadow-lg hover:shadow-indigo-500/30 transition-all transform hover:scale-105 ${className}`}
  >
    <div className="absolute inset-0 rounded-full bg-white opacity-0 group-hover:opacity-20 transition-opacity"></div>
    <span className="relative flex items-center gap-2">{children}</span>
  </button>
);

// Card de Vidro (Glassmorphism)
const GlassCard = ({ children, className = "" }: any) => (
  <div className={`backdrop-blur-xl bg-white/5 border border-white/10 shadow-2xl rounded-3xl ${className}`}>
    {children}
  </div>
);

// --- APP PRINCIPAL ---

export default function App() {
  // Estados da Jornada do Usuário
  const [view, setView] = useState<'landing' | 'login' | 'app'>('landing');
  const [email, setEmail] = useState('');
  
  // Estados do Chat/Voz
  const { messages, input, setInput, handleSubmit, isLoading } = useChat({
    onError: (err) => setStatus(`Erro na IA: ${err.message}`)
  });
  
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("Pronto"); // Debug visual para você
  const [volume, setVolume] = useState(0); // Para animar o orbe

  // Refs
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // --- LÓGICA DE VOZ (Refatorada e Robusta) ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
      // @ts-ignore
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true; 
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setIsListening(true);
          setStatus("Ouvindo... (Fale agora)");
        };
        
        recognition.onend = () => {
          // Se parar sozinho mas a gente queria continuar ouvindo, reinicia
          if (view === 'app' && !isLoading && !synthRef.current?.speaking) {
            // Pequeno delay para não travar o browser
            setTimeout(() => {
               if(!isListening) recognition.start();
            }, 1000);
          }
        };

        recognition.onerror = (event: any) => {
          console.error("Erro no microfone:", event.error);
          setStatus(`Erro Mic: ${event.error}`);
          setIsListening(false);
        };

        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0])
            .map((result: any) => result.transcript)
            .join('');

          if (event.results[0].isFinal) {
             setInput(transcript);
             setStatus("Processando silêncio...");
             
             // Lógica de Silêncio: Espera 1.2s após a frase final para enviar
             clearTimeout(silenceTimerRef.current);
             silenceTimerRef.current = setTimeout(() => {
               recognition.stop();
               setStatus("Enviando para IA...");
               // Hack para submeter o formulário programaticamente
               const form = document.getElementById('voice-form') as HTMLFormElement;
               if (form) {
                 form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
               }
             }, 1200);
          }
        };
        recognitionRef.current = recognition;
      }
    }
  }, [view]);

  // Efeito de Volume Simulado (Para animar o orbe quando ouve)
  useEffect(() => {
    if (isListening) {
      const interval = setInterval(() => setVolume(Math.random() * 100), 100);
      return () => clearInterval(interval);
    } else {
      setVolume(0);
    }
  }, [isListening]);

  // IA Fala -> Usuário Ouve
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && !isLoading) {
      setStatus("IA Falando...");
      speak(lastMessage.content);
    }
  }, [messages, isLoading]);

  const speak = (text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel(); // Para fala anterior

    const cleanText = text.replace(/\*\*/g, '').replace(/[\#\*]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    
    // Tenta pegar voz melhor
    const voices = synthRef.current.getVoices();
    const bestVoice = voices.find(v => v.name.includes('Google US English')) || voices.find(v => v.name.includes('Samantha')) || voices[0];
    if (bestVoice) utterance.voice = bestVoice;

    utterance.onend = () => {
       setStatus("Sua vez...");
       try { recognitionRef.current?.start(); } catch(e) {}
    };

    synthRef.current.speak(utterance);
  };

  const startSession = () => {
    try {
      recognitionRef.current?.start();
      setStatus("Sessão Iniciada");
    } catch (e) {
      setStatus("Clique no Orbe para ativar");
    }
  };

  // --- RENDERIZAÇÃO DAS TELAS ---

  // 1. LANDING PAGE
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-slate-950 text-white selection:bg-indigo-500 selection:text-white overflow-hidden font-sans">
        {/* Background Gradients */}
        <div className="fixed top-0 left-0 w-full h-full overflow-hidden -z-10">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px]" />
        </div>

        <nav className="p-6 flex justify-between items-center max-w-7xl mx-auto">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <Sparkles className="text-indigo-400" /> NativeTalk AI
          </div>
          <button onClick={() => setView('login')} className="text-sm font-medium hover:text-indigo-400 transition-colors">Login</button>
        </nav>

        <main className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-indigo-300 mb-8 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
            Nova Engine Gemini 2.5 Ativada
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
            Fluência em Inglês <br /> sem Julgamentos.
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-10 leading-relaxed">
            Pratique conversação com uma IA que te ouve, entende e corrige sutilmente. 
            Como um professor nativo, disponível 24h.
          </p>

          <ShinyButton onClick={() => setView('login')}>
            Começar Agora Grátis <ArrowRight size={18} />
          </ShinyButton>

          <div className="mt-20 flex gap-8 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            {/* Fake logos for social proof */}
            <span className="text-xl font-bold font-serif">Wired</span>
            <span className="text-xl font-bold font-mono">TechCrunch</span>
            <span className="text-xl font-bold italic">Forbes</span>
          </div>
        </main>
      </div>
    );
  }

  // 2. LOGIN SCREEN
  if (view === 'login') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative">
        {/* Background Decorative */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
        
        <GlassCard className="w-full max-w-md p-8 relative z-10">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Bem-vindo de volta</h2>
            <p className="text-slate-400 text-sm">Entre para continuar sua jornada de fluência.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 ml-1">Email</label>
              <div className="relative">
                <User className="absolute left-3 top-3 text-slate-500" size={18} />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-600"
                  placeholder="seu@email.com"
                />
              </div>
            </div>
            
            <button 
              onClick={() => setView('app')} // Fake login for demo
              className="w-full bg-white text-slate-900 font-bold py-3 rounded-xl hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
            >
              Entrar <ArrowRight size={18} />
            </button>
            
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-700"></div></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-slate-900 px-2 text-slate-500">Ou continue com</span></div>
            </div>

            <button className="w-full bg-slate-800 border border-slate-700 text-white font-medium py-3 rounded-xl hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/></svg>
              Google
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  // 3. APP INTERFACE (VOICE MODE)
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center relative overflow-hidden font-sans">
      {/* Formulário Invisível para o AI SDK */}
      <form id="voice-form" onSubmit={handleSubmit} className="hidden">
        <input value={input} onChange={(e) => setInput(e.target.value)} />
      </form>

      {/* Header App */}
      <div className="absolute top-0 w-full p-6 flex justify-between items-center z-20">
        <div className="flex items-center gap-2 text-slate-400">
          <Activity size={16} className={isListening ? "text-green-500" : "text-slate-600"} />
          <span className="text-xs font-mono uppercase tracking-widest">{status}</span>
        </div>
        <button onClick={() => setView('landing')} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
          <X size={20} className="text-slate-400" />
        </button>
      </div>

      {/* O CÉREBRO VISUAL (ORBE) */}
      <div className="relative z-10 cursor-pointer group" onClick={startSession}>
        {/* Glow Effects */}
        <div className={`absolute inset-0 rounded-full blur-[80px] transition-all duration-700 
          ${isLoading ? 'bg-purple-600/40 scale-150' : 
            isListening ? 'bg-indigo-500/30 scale-125' : 
            'bg-slate-800/20 scale-100'}`} 
        />
        
        {/* Main Orb Container */}
        <div className={`relative w-64 h-64 rounded-full backdrop-blur-md border border-white/10 shadow-2xl flex items-center justify-center transition-all duration-500
           ${isListening ? 'scale-105 border-indigo-500/50' : 'scale-100 border-white/10'}
        `}>
          {/* Inner Core Animation */}
          <div className={`w-48 h-48 rounded-full bg-gradient-to-tr from-slate-900 to-slate-800 flex items-center justify-center overflow-hidden relative shadow-inner`}>
             {/* Waveform Visualization (Fake mas bonito) */}
             <div className="flex items-center gap-1 h-20">
                {[...Array(5)].map((_, i) => (
                  <div key={i} 
                    className={`w-3 rounded-full bg-indigo-400 transition-all duration-100`}
                    style={{ 
                      height: isListening ? `${20 + (Math.random() * volume)}%` : '10%',
                      opacity: isListening ? 1 : 0.3
                    }}
                  />
                ))}
             </div>
          </div>

          {/* Status Icon Overlay */}
          <div className="absolute bottom-4 right-4 bg-slate-900 rounded-full p-3 border border-slate-700 shadow-lg">
             {isLoading ? <Sparkles className="animate-spin text-purple-400" size={20} /> : 
              isListening ? <Mic className="text-indigo-400" size={20} /> : 
              <MicOff className="text-slate-600" size={20} />}
          </div>
        </div>
      </div>

      {/* Legendas e Feedback */}
      <div className="mt-12 h-32 px-6 max-w-2xl w-full text-center flex flex-col items-center justify-start z-20">
        <p className={`text-2xl md:text-3xl font-light leading-snug transition-all duration-500 
          ${isLoading ? 'opacity-50 blur-sm' : 'opacity-100'}`}>
          {messages.length > 0 && messages[messages.length - 1].role === 'assistant' 
            ? <span dangerouslySetInnerHTML={{ __html: messages[messages.length - 1].content.replace(/\*\*(.*?)\*\*/g, '<span class="text-indigo-400 font-semibold">$1</span>') }} />
            : input || "Toque no orbe e diga Hello!"}
        </p>
        
        {/* Dica de Gramática (Só aparece se a IA detectar erro no texto anterior) */}
        {messages.length > 0 && messages[messages.length - 1].content.includes('**') && (
           <div className="mt-4 flex items-center gap-2 bg-indigo-900/30 border border-indigo-500/30 px-4 py-2 rounded-full text-xs text-indigo-300 animate-fade-in-up">
              <CheckCircle2 size={12} /> Correção Disponível
           </div>
        )}
      </div>

      {/* Footer / Controls */}
      <div className="absolute bottom-10 flex gap-4 opacity-50 hover:opacity-100 transition-opacity">
        <button className="text-xs text-slate-500 uppercase hover:text-white transition-colors">Settings</button>
        <button className="text-xs text-slate-500 uppercase hover:text-white transition-colors">History</button>
      </div>
    </div>
  );
}

