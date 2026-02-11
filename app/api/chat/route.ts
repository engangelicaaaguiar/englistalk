import { streamText, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

// Configuração da Groq (Compatível com OpenAI)
const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
});

// Edge Runtime para velocidade máxima
export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    // Validação de segurança simples
    if (!process.env.GROQ_API_KEY) {
      return new Response("Erro: Chave GROQ_API_KEY não encontrada.", { status: 500 });
    }

    const { messages } = await req.json();

    // O Prompt do Professor
    const systemPrompt = `
      You are Talken AI, an energetic American English Tutor.
      Role: Help the user practice speaking. 
      Rules:
      1. Concise responses (max 2 sentences).
      2. Correct grammar mistakes using Markdown bolding (e.g., "**I went**").
      3. Always end with a simple question to keep the conversation flowing.
    `;

    // Usar fetch direto à API Groq (compatível com OpenAI)
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    // Passar o stream diretamente
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error("🔥 ERRO NA API:", error);
    return new Response(`Erro no servidor: ${error.message}`, { status: 500 });
  }
}
