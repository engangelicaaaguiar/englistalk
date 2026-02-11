// app/api/chat/route.ts

// Forçamos o uso do Node.js padrão (muito mais estável que Edge)
export const runtime = 'nodejs'; 

export async function POST(req: Request) {
  try {
    // 1. Segurança Básica
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error("❌ ERRO: GROQ_API_KEY não encontrada");
      return new Response(JSON.stringify({ error: "Chave de API não configurada" }), { status: 500 });
    }

    // 2. Preparar os dados
    const { messages } = await req.json();
    
    // Pegamos a última mensagem do usuário
    const userMessage = messages[messages.length - 1].content;

    console.log("📨 Enviando para Groq:", userMessage);

    // 3. Chamada Direta (Fetch) - Sem SDKs para quebrar
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "llama3-8b-8192", // Modelo rápido
        messages: [
          {
            role: "system",
            content: `You are Talken, a friendly English tutor. 
                      Keep answers short (max 2 sentences). 
                      Correct grammar in bold (e.g., **went**). 
                      Always end with a question.`
          },
          ...messages.map((m: any) => ({
            role: m.role,
            content: m.content
          }))
        ],
        stream: true, // Importante para o efeito de digitação
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🔥 Erro da Groq:", errorText);
      return new Response(errorText, { status: response.status });
    }

    // 4. Repassar o fluxo de dados (Stream) direto para o Frontend
    // O Vercel AI SDK no frontend sabe ler esse stream nativo da OpenAI/Groq
    return new Response(response.body, {
      headers: { 'Content-Type': 'text/event-stream' }
    });

  } catch (error: any) {
    console.error("💀 Erro Fatal:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
