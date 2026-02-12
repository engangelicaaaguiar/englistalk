'use client';

import { useEffect, useState, useRef } from 'react';
import { useChatJSON } from '@/lib/useChatJSON';
import { Mic, MicOff, Zap, X, ShieldCheck, Sparkles, ChevronRight, Play, BrainCircuit, Headphones, Globe, Mail, Lock, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function TalkenApp() {
  const [view, setView] = useState<'landing' | 'login' | 'app'>('landing');
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState("Pronto");
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoadingLogin, setIsLoadingLogin] = useState(false);
  
  // Hook AI customizado (JSON ao invés de SSE)
  const { messages, append, isLoading } = useChatJSON('/api/chat');

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // --- LÓGICA DE VOZ (Engine) ---
  useEffect(() => {
    if (typeof window !== 'undefined' && view === 'app') {
      synthRef.current = window.speechSynthesis;
      // @ts-ignore
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognition) return;

      const recognition = new SpeechRecognition();
      recognition.continuous = true; 
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => { setIsListening(true); setStatus("Ouvindo..."); };
      recognition.onend = () => { setIsListening(false); };
      
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');

        if (event.results[0].isFinal) {
           clearTimeout(silenceTimerRef.current);
           setStatus("Pensando...");
           silenceTimerRef.current = setTimeout(() => {
             recognition.stop();
             append({ role: 'user', content: transcript });
           }, 800);
        }
      };
      recognitionRef.current = recognition;
    }
  }, [view, append]);

  const restartListening = () => { try { recognitionRef.current?.start(); } catch(e) {} };
  const toggleListening = () => isListening ? recognitionRef.current?.stop() : restartListening();

  // Restart listening quando isLoading termina
  useEffect(() => {
    if (!isLoading && messages.length > 0 && messages[messages.length - 1]?.role === 'user') {
      setStatus("Sua vez");
    }
  }, [isLoading, messages]);

  // TTS
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant' && !isLoading) speak(lastMsg.content);
  }, [messages, isLoading]);

  const speak = (text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#]/g, ''));
    utterance.lang = 'en-US';
    const voices = synthRef.current.getVoices();
    const bestVoice = voices.find(v => v.name.includes('Google US English')) || voices[0];
    if (bestVoice) utterance.voice = bestVoice;
    utterance.onstart = () => setStatus("Falando...");
    utterance.onend = () => { setStatus("Sua vez"); restartListening(); };
    synthRef.current.speak(utterance);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingLogin(true);
    // Simula delay de rede para parecer real
    setTimeout(() => {
      setIsLoadingLogin(false);
      setView('app');
    }, 1500);
  };

  // --- COMPONENTS ---

  const Badge = ({ children }: { children: React.ReactNode }) => (
    <div className="relative overflow-hidden inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0E1629] border border-white/10 text-[#4FD1FF] text-xs font-bold uppercase tracking-widest mb-8">
      <div className="absolute inset-0 animate-shimmer opacity-20"></div>
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </div>
  );

  const InputField = ({ icon: Icon, type, placeholder, value, onChange }: any) => (
    <div className="relative group">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#4FD1FF] transition-colors">
        <Icon size={18} />
      </div>
      <input 
        type={type} 
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full bg-[#0B1020] border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-[#4FD1FF]/50 focus:ring-1 focus:ring-[#4FD1FF]/50 transition-all shadow-inner"
      />
    </div>
  );

  const FeatureCard = ({ icon: Icon, title, desc }: any) => (
    <div className="group p-6 rounded-2xl bg-[#0E1629]/50 border border-white/5 hover:border-[#7C6CFF]/30 hover:bg-[#0E1629] transition-all duration-300 hover:-translate-y-1">
      <div className="w-12 h-12 rounded-lg bg-[#0B1020] border border-white/10 flex items-center justify-center mb-4 text-[#7C6CFF] group-hover:text-[#4FD1FF] transition-colors">
        <Icon size={24} />
      </div>
      <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
    </div>
  );

  // --- VIEWS ---

  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-[#0B1020] text-white selection:bg-[#7C6CFF]/30 font-sans">
        {/* Glows de Fundo (Ambiente) */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-[-20%] left-[20%] w-[500px] h-[500px] bg-[#7C6CFF]/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#4FD1FF]/5 rounded-full blur-[120px]" />
        </div>

        {/* Navbar */}
        <nav className="relative z-20 max-w-6xl mx-auto px-6 py-6 flex justify-between items-center">
          <div className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#7C6CFF] to-[#4FD1FF] flex items-center justify-center">
              <Zap size={16} className="text-white" fill="currentColor" />
            </div>
            Talken
          </div>
          <button onClick={() => setView('login')} className="px-5 py-2 rounded-full border border-white/10 hover:bg-white/5 transition-all text-sm font-medium">
            Entrar
          </button>
        </nav>

        {/* Hero Section */}
        <main className="relative z-10 pt-20 pb-32 px-6 max-w-4xl mx-auto text-center">
          
          <Badge>
            <Sparkles size={12} /> Nova Engine 2.5
          </Badge>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 leading-[1.1]">
            Fluência em Inglês.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-slate-400">
              No seu ritmo.
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed font-light">
            Converse em inglês com uma IA treinada para ouvir, compreender e corrigir com empatia. 
            <span className="text-[#3EE6B5]"> Ambiente seguro. Sem julgamentos.</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={() => setView('login')} className="relative group px-8 py-4 rounded-full bg-gradient-to-r from-[#7C6CFF] to-[#4FD1FF] text-white font-bold text-lg shadow-[0_0_20px_-5px_rgba(124,108,255,0.4)] hover:shadow-[0_0_30px_-5px_rgba(124,108,255,0.6)] transition-all hover:scale-[1.02]">
              Começar Conversa Gratuita
            </button>
            <button className="px-8 py-4 rounded-full border border-white/10 hover:bg-white/5 text-slate-300 hover:text-white transition-all font-medium flex items-center gap-2">
              <Play size={18} /> Ver Demo
            </button>
          </div>

          <div className="mt-16 pt-8 border-t border-white/5 flex flex-wrap justify-center gap-8 md:gap-16 opacity-40 grayscale hover:grayscale-0 transition-all duration-700">
            {['TechCrunch', 'Forbes', 'ProductHunt', 'Wired'].map(brand => (
              <span key={brand} className="text-lg font-semibold font-serif">{brand}</span>
            ))}
          </div>
        </main>

        {/* Features Section */}
        <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard 
              icon={BrainCircuit}
              title="Inteligência Emocional"
              desc="Nossa IA detecta hesitação e nervosismo, adaptando a velocidade e o vocabulário para te deixar confortável."
            />
            <FeatureCard 
              icon={ShieldCheck}
              title="Zona de Confiança"
              desc="Erre à vontade. Aqui não existe 'passar vergonha'. O feedback é privado, gentil e focado no progresso."
            />
            <FeatureCard 
              icon={Headphones}
              title="Imersão Total"
              desc="Esqueça textos. Treine seu ouvido e sua fala com vozes neurais indistinguíveis de humanos nativos."
            />
          </div>
        </section>
      </div>
    );
  }

  // --- LOGIN VIEW (NOVA) ---
  if (view === 'login') {
    return (
      <div className="min-h-screen bg-[#0B1020] text-white flex items-center justify-center p-4 relative font-sans">
        {/* Background Animado */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#0E1629] via-[#0B1020] to-[#0B1020]" />
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
           <div className="absolute top-[-10%] left-[30%] w-[500px] h-[500px] bg-[#7C6CFF]/10 rounded-full blur-[120px]" />
        </div>

        {/* Botão Voltar */}
        <button onClick={() => setView('landing')} className="absolute top-8 left-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors z-20 text-sm font-medium">
          <ArrowLeft size={16} /> Voltar
        </button>

        {/* Card de Login */}
        <div className="w-full max-w-md bg-[#0E1629]/60 backdrop-blur-2xl border border-white/10 p-8 md:p-10 rounded-3xl shadow-2xl relative z-10 animate-fade-in-up">
          
          <div className="text-center mb-10">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#7C6CFF] to-[#4FD1FF] flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Zap size={24} className="text-white" fill="currentColor" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Bem-vindo de volta</h2>
            <p className="text-slate-400 text-sm">Acesse seu plano de fluência personalizado.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <InputField 
              icon={Mail} type="email" placeholder="seu@email.com" 
              value={email} onChange={(e: any) => setEmail(e.target.value)} 
            />
            <InputField 
              icon={Lock} type="password" placeholder="••••••••" 
              value={password} onChange={(e: any) => setPassword(e.target.value)} 
            />
            
            <div className="flex justify-end">
              <a href="#" className="text-xs text-[#4FD1FF] hover:text-[#4FD1FF]/80 transition-colors">Esqueceu a senha?</a>
            </div>

            <button 
              type="submit" 
              disabled={isLoadingLogin}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#7C6CFF] to-[#4FD1FF] text-white font-bold text-lg shadow-lg hover:shadow-[#7C6CFF]/25 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoadingLogin ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : "Entrar no Talken"}
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#0E1629] px-2 text-slate-500">Ou continue com</span></div>
          </div>

          <button 
            type="button"
            onClick={() => { setIsLoadingLogin(true); setTimeout(() => setView('app'), 1000); }}
            className="w-full bg-[#0B1020] border border-white/10 text-slate-300 font-medium py-3 rounded-xl hover:bg-white/5 hover:text-white transition-all flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/></svg>
            Google
          </button>

          <p className="mt-8 text-center text-xs text-slate-500">
            Ainda não tem conta? <button onClick={() => setView('landing')} className="text-[#4FD1FF] hover:underline">Criar conta grátis</button>
          </p>
          
          <div className="absolute -bottom-16 left-0 right-0 text-center flex items-center justify-center gap-2 text-xs text-slate-600">
            <ShieldCheck size={12} />
            <span>Seus dados são criptografados de ponta a ponta.</span>
          </div>
        </div>
      </div>
    );
  }

  // --- APP VIEW (IMMERSIVE) ---
  return (
    <div className="h-[100dvh] w-screen bg-[#0B1020] text-white flex flex-col relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#0E1629] via-[#0B1020] to-[#0B1020]" />
      <div className="relative z-20 px-6 py-4 flex justify-between items-center bg-gradient-to-b from-[#0B1020] to-transparent">
        <button onClick={() => setView('landing')} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
        
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#0E1629] border border-white/5 backdrop-blur-md">
           <div className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 
             ${status === 'Erro' ? 'bg-red-500' : 
               isListening ? 'bg-[#3EE6B5] animate-pulse' : 
               isLoading ? 'bg-[#7C6CFF] animate-bounce' : 'bg-slate-500'}`} 
           />
           <span className="text-xs font-medium tracking-wide text-slate-300 uppercase">{status}</span>
        </div>

        <button className="p-2 text-slate-400 hover:text-white opacity-50 cursor-not-allowed">
           <Globe size={20} />
        </button>
      </div>

      {/* ÁREA CENTRAL - ORBE ORGÂNICO */}
      <div className="flex-1 flex flex-col items-center justify-center relative w-full z-10">
        <div onClick={toggleListening} className="relative cursor-pointer group touch-none">
          
          {/* Aura Respirante */}
          <div className={`absolute inset-0 rounded-full transition-all duration-1000 blur-[80px]
            ${isLoading ? 'bg-[#7C6CFF]/30 scale-125' : 
              isListening ? 'bg-[#3EE6B5]/20 scale-110' : 
              'bg-[#4FD1FF]/5 scale-100'}`} 
          />
          
          {/* O Orbe Físico */}
          <div className={`relative w-48 h-48 md:w-64 md:h-64 rounded-full border transition-all duration-700 flex items-center justify-center shadow-2xl backdrop-blur-3xl
             ${isListening 
               ? 'border-[#3EE6B5]/50 bg-[#3EE6B5]/10 scale-105' 
               : isLoading 
                 ? 'border-[#7C6CFF]/50 bg-[#7C6CFF]/10'
                 : 'border-white/10 bg-white/5 hover:border-white/20'}`}
          >
            {/* Núcleo do Orbe */}
            {isLoading ? (
               <div className="absolute inset-4 rounded-full border-t-2 border-[#7C6CFF] animate-spin opacity-60"></div>
            ) : isListening ? (
               <div className="flex gap-1 items-center h-16">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-1.5 bg-[#3EE6B5] rounded-full animate-[bounce_1s_infinite]" 
                         style={{ animationDelay: `${i * 0.1}s`, height: `${30 + Math.random() * 50}%` }}></div>
                  ))}
               </div>
            ) : (
               <Mic size={32} className="text-slate-500 group-hover:text-white transition-colors" />
            )}
          </div>
          
          <p className="mt-12 text-center text-xs font-bold tracking-[0.2em] text-slate-600 uppercase group-hover:text-[#4FD1FF] transition-colors">
             {isListening ? "Toque para Pausar" : "Toque para Falar"}
          </p>
        </div>
      </div>

      {/* LEGENDAS (Bottom Sheet Elegante) */}
      <div className="relative z-20 w-full min-h-[25vh] bg-gradient-to-t from-[#0B1020] via-[#0B1020]/90 to-transparent flex flex-col justify-end items-center pb-12 px-6">
        <div className="max-w-2xl w-full text-center space-y-4">
           {messages.length > 0 ? (
             <div className={`transition-all duration-500 ${isLoading ? 'opacity-50 blur-[1px]' : 'opacity-100'}`}>
                {messages[messages.length - 1].role === 'assistant' ? (
                   <p className="text-xl md:text-2xl font-light leading-relaxed text-slate-100"
                      dangerouslySetInnerHTML={{ 
                        __html: messages[messages.length - 1].content.replace(/\*\*(.*?)\*\*/g, '<span class="text-[#3EE6B5] font-normal">$1</span>') 
                      }} 
                   />
                ) : (
                   <p className="text-lg md:text-xl text-slate-500 italic">"{messages[messages.length - 1].content}"</p>
                )}
             </div>
           ) : (
             <p className="text-slate-500 text-sm font-medium animate-pulse">Diga "Hello" para começar sua jornada.</p>
           )}
        </div>
      </div>
    </div>
  );
}
