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
    const body = await req.json();
    const { messages } = body;

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error("❌ Mensagens inválidas:", messages);
      return new Response(JSON.stringify({ error: "Mensagens inválidas" }), { status: 400 });
    }

    // Filtra e valida mensagens
    const validMessages = messages.filter((m: any) => m && m.role && m.content).map((m: any) => ({
      role: String(m.role).trim(),
      content: String(m.content).trim()
    }));

    if (validMessages.length === 0) {
      console.error("❌ Nenhuma mensagem válida:", messages);
      return new Response(JSON.stringify({ error: "Nenhuma mensagem válida" }), { status: 400 });
    }

    console.log("📨 Mensagens validadas:", validMessages.length);

    // 3. Chamada Direta (Fetch) - Sem SDKs para quebrar
    const requestBody = {
      model: "llama3-8b-8192",
      messages: [
        {
          role: "system",
          content: `You are Talken, a friendly English tutor. Keep answers short (max 2 sentences). Correct grammar in bold (e.g., **went**). Always end with a question.`
        },
        ...validMessages
      ],
      stream: true,
      max_tokens: 250,
      temperature: 0.7
    };

    console.log("📤 Enviando para Groq:", JSON.stringify(requestBody));

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🔥 Erro da Groq (Status:", response.status + "):", errorText);
      return new Response(
        JSON.stringify({ error: `Groq API Error: ${errorText}` }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 4. Repassar o fluxo de dados (Stream) direto para o Frontend
    return new Response(response.body, {
      headers: { 'Content-Type': 'text/event-stream' }
    });

  } catch (error: any) {
    console.error("💀 Erro Fatal:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
