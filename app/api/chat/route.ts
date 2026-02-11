import { createOpenAI } from '@ai-sdk/openai';

// Configuração da Groq
const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
});

// Removemos o edge runtime para ser serverless function normal
export async function POST(req: Request) {
  try {
    // 1. Log para debug
    console.log("🚀 Recebendo requisição...");

    // 2. Verificação de Segurança
    if (!process.env.GROQ_API_KEY) {
      console.error("❌ Chave GROQ_API_KEY não encontrada");
      return new Response(
        JSON.stringify({ error: "Chave de API não configurada no servidor." }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { messages } = await req.json();

    // 3. Prompt do Sistema
    const systemPrompt = `You are Talken AI, a friendly American English Tutor.
Your goal: Keep the user talking.
Rules:
1. Responses must be short (max 2 sentences).
2. If the user makes a grammar mistake, correct it in bold (e.g., "**I went**").
3. Always end with a question.`;

    // 4. Chamada para a Groq via fetch direto
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Resposta da Groq não OK:", response.status, errorText);
      throw new Error(`Groq API retornou ${response.status}: ${errorText}`);
    }

    // Retorna o stream diretamente
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error("🔥 ERRO FATAL NA API:", error);
    
    return new Response(
      JSON.stringify({ error: error.message || "Erro desconhecido" }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
