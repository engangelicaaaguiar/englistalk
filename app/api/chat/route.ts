// app/api/chat/route.ts

// Forçamos o uso do Node.js padrão (muito mais estável que Edge)
export const runtime = 'nodejs'; 

export async function POST(req: Request) {
  try {
    // 1. Segurança Básica
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error("❌ ERRO: GROQ_API_KEY não encontrada");
      return new Response(JSON.stringify({ error: "API key not configured" }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Parsear o corpo
    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error("❌ JSON parse failed:", e);
      return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log("📥 Raw body recebido:", JSON.stringify(body, null, 2));

    const { messages } = body;

    // 3. Validação RIGOROSA de messages
    if (!messages) {
      console.error("❌ Campo 'messages' não encontrado no body");
      return new Response(JSON.stringify({ 
        error: "Missing 'messages' field in request",
        received: body
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!Array.isArray(messages)) {
      console.error("❌ 'messages' não é um array:", typeof messages);
      return new Response(JSON.stringify({ 
        error: "'messages' must be an array",
        received: typeof messages
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (messages.length === 0) {
      console.error("❌ 'messages' array vazio");
      return new Response(JSON.stringify({ error: "Messages array is empty" }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. Filtra e valida mensagens (CORRIGIDO: content pode ser string vazia, precisamos de content !== null/undefined)
    const validMessages = messages
      .filter((m: any) => {
        if (!m || typeof m !== 'object') {
          console.warn("⚠️ Mensagem inválida (não é objeto):", m);
          return false;
        }
        if (!m.role) {
          console.warn("⚠️ Mensagem sem 'role':", m);
          return false;
        }
        if (m.content === null || m.content === undefined) {
          console.warn("⚠️ Mensagem com 'content' null/undefined:", m);
          return false;
        }
        return true;
      })
      .map((m: any) => ({
        role: String(m.role).trim(),
        content: String(m.content).trim()
      }))
      .filter(m => m.content.length > 0); // Remove conteúdo vazio após trim

    if (validMessages.length === 0) {
      console.error("❌ Nenhuma mensagem válida após filtro. Original:", JSON.stringify(messages));
      return new Response(JSON.stringify({ 
        error: "No valid messages after validation",
        originalMessages: messages
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    console.log(`✅ ${validMessages.length} mensagem(ns) validada(s)`);

    // 5. Montar request para Groq
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

    console.log("📤 Enviando para Groq:", JSON.stringify(requestBody, null, 2));

    // 6. Chamada para Groq
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    // 7. Validar resposta
    if (!groqResponse.ok) {
      const errorBody = await groqResponse.text();
      console.error(`🔥 Groq error (${groqResponse.status}):`, errorBody);
      
      // Tenta parsear como JSON primeiro
      let errorJson;
      try {
        errorJson = JSON.parse(errorBody);
      } catch {
        errorJson = { raw_error: errorBody };
      }

      return new Response(JSON.stringify({ 
        error: "Groq API error",
        groq_status: groqResponse.status,
        groq_error: errorJson
      }), { 
        status: groqResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 8. Repassar stream (CORRIGIDO: adicionar headers necessários)
    return new Response(groqResponse.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });

  } catch (error: any) {
    console.error("💀 Erro Fatal:", error);
    return new Response(JSON.stringify({ 
      error: "Internal server error",
      message: error.message
    }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}
