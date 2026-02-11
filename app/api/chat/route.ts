// Configuração direta da API Groq

export async function POST(req: Request) {
  try {
    // 1. Verificação de Segurança
    if (!process.env.GROQ_API_KEY) {
      throw new Error("A chave GROQ_API_KEY não foi encontrada no servidor.");
    }

    const { messages } = await req.json();

    // 2. Prompt do Sistema
    const systemPrompt = `You are Talken AI, a friendly American English Tutor.
Goal: Keep the conversation flowing.
Rules:
1. Responses must be short (max 2 sentences).
2. Correct grammar mistakes using Markdown bolding (e.g., "**I went**").
3. Always end with a question.`;

    // 3. Chamada para a Groq (Modelo Llama 3 8B - Super Rápido)
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
      console.error("❌ Groq API Error:", response.status, errorText);
      throw new Error(`Groq API returned ${response.status}: ${errorText}`);
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
    
    // Retorna o erro exato para o frontend mostrar
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
