import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Configuração da Groq (Via adaptador OpenAI)
const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
});

// ⚠️ REMOVI O 'runtime = edge' PROPOSITALMENTE
// Isso evita que o Netlify quebre a execução da biblioteca.
// export const runtime = 'edge'; 

export async function POST(req: Request) {
  try {
    // 1. Verificação de Segurança (Debug)
    if (!process.env.GROQ_API_KEY) {
      throw new Error("A chave GROQ_API_KEY não foi encontrada no servidor.");
    }

    const { messages } = await req.json();

    // 2. Prompt do Sistema
    const systemPrompt = `
      You are Talken AI, a friendly American English Tutor.
      Goal: Keep the conversation flowing.
      Rules:
      1. Responses must be short (max 2 sentences).
      2. Correct grammar mistakes using Markdown bolding (e.g., "**I went**").
      3. Always end with a question.
    `;

    // 3. Chamada para a Groq (Modelo Llama 3 8B - Super Rápido)
    const result = await streamText({
      model: groq('llama3-8b-8192'), 
      system: systemPrompt,
      messages,
    });

    return result.toDataStreamResponse();

  } catch (error: any) {
    console.error("🔥 ERRO FATAL NA API:", error);
    
    // Retorna o erro exato para o frontend mostrar na aba Network
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
