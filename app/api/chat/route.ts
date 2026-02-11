import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Configuração da Groq
const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
});

// IMPORTANTE: Removemos o 'runtime = edge' para evitar conflitos no Netlify Free
// export const runtime = 'edge'; 

export async function POST(req: Request) {
  try {
    // 1. Log para debug no painel do Netlify
    console.log("🚀 Recebendo requisição...");

    // 2. Verificação de Segurança
    if (!process.env.GROQ_API_KEY) {
      console.error("❌ Chave GROQ_API_KEY não encontrada");
      throw new Error("Chave de API não configurada no servidor (Netlify Env Var).");
    }

    const { messages } = await req.json();

    // 3. Prompt do Sistema
    const systemPrompt = `
      You are Talken AI, a friendly American English Tutor.
      Your goal: Keep the user talking.
      Rules:
      1. Responses must be short (max 2 sentences).
      2. If the user makes a grammar mistake, correct it in bold (e.g., "**I went**").
      3. Always end with a question.
    `;

    // 4. Chamada para a Groq (Modelo Llama 3 8B - Super Rápido)
    const result = await streamText({
      model: groq('llama3-8b-8192'), // Modelo mais estável da Groq
      system: systemPrompt,
      messages,
    });

    return result.toDataStreamResponse();

  } catch (error: any) {
    console.error("🔥 ERRO FATAL NA API:", error);
    
    // Retorna o erro exato para o frontend mostrar
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
