// Substituído pelo componente solicitado — VoiceMode
'use client';

import { useChat } from 'ai/react';
import { useEffect, useState, useRef } from 'react';
import { Mic, MicOff, Volume2, X } from 'lucide-react';

export default function VoiceMode() {
  const { messages, input, setInput, handleSubmit, isLoading } = useChat();
  
  // Estados da Conversa
  const [isListening, setIsListening] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [feedbackText, setFeedbackText] = useState('Tap the Orb to Start');
  
  // Referências para APIs do Navegador
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // 1. Inicialização das APIs (Voz e Fala)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
      // @ts-ignore
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0])
            .map((result: any) => result.transcript)
            .join('');
          setInput(transcript);
          setFeedbackText(transcript);
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            recognition.stop();
            setIsListening(false);
            setFeedbackText('Thinking...');
            const formEvent = new Event('submit', { bubbles: true, cancelable: true });
            document.querySelector('form')?.dispatchEvent(formEvent);
          }, 1500);
        };

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognitionRef.current = recognition;
      }
    }
  }, [setInput]);

  // 2. Barge-in
  useEffect(() => {
    if (isListening && synthRef.current?.speaking) synthRef.current.cancel();
  }, [isListening]);

  // 3. IA fala automaticamente quando chega resposta
  useEffect(() => {
    const last = messages?.[messages.length - 1];
    if (last?.role === 'assistant' && !isLoading) {
      setFeedbackText(last.content);
      speak(last.content);
    }
  }, [messages, isLoading]);

  const speak = (text: string) => {
    if (!synthRef.current) return;
    const cleanText = String(text).replace(/\*\*/g, '').replace(/[\#\*]/g, '');
    const u = new SpeechSynthesisUtterance(cleanText);
    u.lang = 'en-US';
    u.rate = 1.0;
    const voices = synthRef.current.getVoices();
    const best = voices.find((v: any) => v.name.includes('Google US English')) || voices[0];
    if (best) (u as any).voice = best;
    u.onend = () => {
      if (conversationStarted) {
        setFeedbackText('Listening...');
        try { recognitionRef.current?.start(); } catch (e) {}
      }
    };
    synthRef.current.speak(u);
  };

  const toggleConversation = () => {
    if (conversationStarted) {
      setConversationStarted(false);
      recognitionRef.current?.stop();
      synthRef.current?.cancel();
      setFeedbackText('Tap to Resume');
    } else {
      setConversationStarted(true);
      setFeedbackText('Listening...');
      try { recognitionRef.current?.start(); } catch (e) { console.error(e); }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white items-center justify-center relative overflow-hidden">
      <form onSubmit={handleSubmit} className="hidden"><input value={input} onChange={(e) => setInput(e.target.value)} /></form>
      <div className="absolute top-6 left-0 w-full flex justify-center z-10"><div className="bg-gray-800/50 px-4 py-1 rounded-full text-xs font-mono text-gray-400 backdrop-blur-md">ENGLISH IMMERSION MODE</div></div>

      <div className="relative z-20 cursor-pointer" onClick={toggleConversation}>
        <div className={`w-48 h-48 rounded-full blur-3xl absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ${isLoading ? 'bg-purple-600 animate-pulse scale-125' : ''} ${isListening ? 'bg-blue-500 scale-110' : ''} ${!isListening && !isLoading && conversationStarted ? 'bg-green-500 scale-100' : ''} ${!conversationStarted ? 'bg-gray-600 scale-90' : ''}`}></div>
        <div className={`w-32 h-32 rounded-full border-2 flex items-center justify-center backdrop-blur-sm transition-all duration-300 shadow-2xl ${isLoading ? 'border-purple-400 bg-purple-900/20' : ''} ${isListening ? 'border-blue-400 bg-blue-900/20' : ''} ${!isListening && !isLoading && conversationStarted ? 'border-green-400 bg-green-900/20' : ''} ${!conversationStarted ? 'border-gray-600 bg-gray-900/20' : ''}`}>
          {conversationStarted ? (isLoading ? <Volume2 className="w-10 h-10 text-purple-200 animate-bounce" /> : isListening ? <Mic className="w-10 h-10 text-blue-200" /> : <Volume2 className="w-10 h-10 text-green-200" />) : (<MicOff className="w-10 h-10 text-gray-400" />)}
        </div>
      </div>

      <div className="mt-12 max-w-md text-center px-6 h-24 flex items-center justify-center"><p className={`text-xl font-light leading-relaxed transition-opacity duration-500 ${isListening ? 'text-blue-300' : 'text-gray-200'}`}>"{feedbackText}"</p></div>

      {conversationStarted && (
        <button onClick={toggleConversation} className="absolute bottom-10 bg-red-500/20 hover:bg-red-500/40 text-red-200 px-6 py-3 rounded-full flex items-center gap-2 transition-all"><X size={18} /> End Session</button>
      )}
    </div>
  );
}

