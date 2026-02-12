import { createGroq } from '@ai-sdk/groq';
import { streamText } from 'ai';

// Cria a instância usando a chave do ambiente automaticamente
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    console.log("📥 Mensagens recebidas:", messages);

    const result = await streamText({
      // Modelo oficial do Groq (Llama 3 8B é o mais rápido/estável)
      model: groq('llama3-8b-8192') as any,
      
      system: `You are "Talken", a friendly English tutor.
               1. Keep responses short (max 2 sentences).
               2. If the user makes a grammar mistake, correct it using **bold** markdown.
               3. Always end with a simple question.
               4. Speak friendly and encouraging.`,
      messages,
    });

    console.log("✅ Stream iniciado com sucesso");
    return result.toDataStreamResponse();

  } catch (error: any) {
    console.error("💀 ERRO NA API:", error.message || error);
    // Retorna o erro detalhado para você ver no log
    return new Response(JSON.stringify({ 
      error: 'Erro ao processar requisição', 
      details: error.message 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
