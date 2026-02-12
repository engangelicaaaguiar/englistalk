import { useState, useCallback, useRef } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface UseChatJSONOptions {
  onFinish?: () => void;
  onError?: (error: string) => void;
}

export function useChatJSON(api: string, options?: UseChatJSONOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const onFinishRef = useRef(options?.onFinish);
  const onErrorRef = useRef(options?.onError);

  // Atualizar refs quando options muda
  useCallback(() => {
    onFinishRef.current = options?.onFinish;
    onErrorRef.current = options?.onError;
  }, [options])();

  const append = useCallback(
    async (msg: Message) => {
      console.log("📤 [useChatJSON] Enviando mensagem:", msg.content);
      
      // Adicionar msg do user
      setMessages(prev => [...prev, msg]);
      setIsLoading(true);

      try {
        console.log("🌐 [useChatJSON] Chamando API:", api);
        const response = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [...messages, msg] })
        });

        console.log("📨 [useChatJSON] Resposta status:", response.status);

        if (!response.ok) {
          const error = await response.json();
          console.error('❌ [useChatJSON] API Error:', error);
          const errorMsg = `❌ Error: ${error.error}`;
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: errorMsg
          }]);
          onErrorRef.current?.(error.error);
          setIsLoading(false);
          return;
        }

        const data = await response.json();
        console.log("✅ [useChatJSON] Resposta recebida:", data.content.substring(0, 50));
        
        // Adicionar resposta do assistant
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.content 
        }]);

        console.log("✅ [useChatJSON] Chamando onFinish callback");
        onFinishRef.current?.();
        
      } catch (error: any) {
        console.error('❌ [useChatJSON] Fetch error:', error);
        const errorMsg = `❌ Connection error: ${error.message}`;
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: errorMsg
        }]);
        onErrorRef.current?.(error.message);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, api]
  );

  return { messages, append, isLoading };
}
