import { useState, useCallback } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function useChatJSON(api: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const append = useCallback(
    async (msg: Message) => {
      // Adicionar msg do user
      setMessages(prev => [...prev, msg]);
      setIsLoading(true);

      try {
        const response = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [...messages, msg] })
        });

        if (!response.ok) {
          const error = await response.json();
          console.error('API Error:', error);
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `❌ Error: ${error.error}` 
          }]);
          return;
        }

        const data = await response.json();
        
        // Adicionar resposta do assistant
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.content 
        }]);
      } catch (error: any) {
        console.error('Fetch error:', error);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `❌ Connection error: ${error.message}` 
        }]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, api]
  );

  return { messages, append, isLoading };
}
