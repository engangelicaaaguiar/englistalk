'use client';

import { useChat } from 'ai/react';
import { useEffect, useRef } from 'react';
import { Send, Mic, Volume2, StopCircle } from 'lucide-react';

export default function Chat() {
  // Hook mágico do Vercel AI SDK - gerencia todo o estado do chat
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();
  
  // Referência para rolar o chat para o final automaticamente
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Função para rolar para baixo quando chega mensagem nova
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Função de Voz (TTS Nativo do Navegador)
  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Para se já estiver falando
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US'; // Força sotaque americano
      utterance.rate = 0.9; // Velocidade didática
      
      // Tenta achar uma voz melhor (Google US ou Microsoft David/Zira)
      const voices = window.speechSynthesis.getVoices();
      const bestVoice = voices.find(v => v.name.includes('Google US English')) || voices[0];
      if (bestVoice) utterance.voice = bestVoice;
      
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Header Simples */}
      <header className="flex items-center justify-between p-4 bg-white border-b shadow-sm sticky top-0 z-10">
        <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2">
          🇺🇸 English Master AI
        </h1>
        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
          Beta Free
        </span>
      </header>

      {/* Área de Mensagens */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 && (
          <div className="text-center mt-20 text-gray-400">
            <p className="text-lg font-medium">Welcome! I'm your AI Tutor.</p>
            <p className="text-sm">Type "Hello" to start practicing.</p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`relative max-w-[85%] px-5 py-3 rounded-2xl shadow-sm text-base leading-relaxed ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
              }`}
            >
              {/* Renderiza o texto (com suporte básico a negrito do Markdown) */}
              <div dangerouslySetInnerHTML={{ 
                __html: m.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
              }} />

              {/* Botão de Ouvir (Apenas para o Assistente) */}
              {m.role === 'assistant' && (
                <button
                  onClick={() => speak(m.content)}
                  className="absolute -bottom-8 left-0 p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                  title="Listen to pronunciation"
                >
                  <Volume2 size={18} />
                </button>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-200 px-4 py-2 rounded-2xl animate-pulse text-gray-500 text-sm">
              Typing...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="p-4 bg-white border-t">
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-3xl mx-auto">
          <input
            className="flex-1 p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-base"
            value={input}
            onChange={handleInputChange}
            placeholder="Type your message here..."
            autoFocus
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={20} />
          </button>
        </form>
      </footer>
    </div>
  );
}