import { createGroq } from '@ai-sdk/groq';
import { streamText } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    // 1. Verificar chave de API
    const apiKey = process.env.GROQ_API_KEY;
    console.log("🔑 GROQ_API_KEY presente?", !!apiKey);
    
    if (!apiKey) {
      console.error("❌ GROQ_API_KEY não configurada no Netlify");
      return new Response(JSON.stringify({ 
        error: 'GROQ_API_KEY não configurada',
        hint: 'Verifique as variáveis de ambiente no Netlify'
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Parsear mensagens
    console.log("📥 Iniciando parse do request body...");
    let body;
    try {
      body = await req.json();
    } catch (e: any) {
      console.error("❌ Erro ao fazer parse JSON:", e.message);
      return new Response(JSON.stringify({ 
        error: 'JSON inválido no body',
        details: e.message
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { messages } = body;
    console.log("📥 Mensagens recebidas (tipo):", typeof messages);
    console.log("📥 Mensagens é array?", Array.isArray(messages));
    console.log("📥 Tamanho:", messages?.length || 'null');

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error("❌ Messages inválido:", messages);
      return new Response(JSON.stringify({ 
        error: 'Messages deve ser um array não-vazio',
        received: typeof messages
      }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Criar instância do Groq
    console.log("🚀 Criando instância Groq...");
    const groq = createGroq({
      apiKey: apiKey,
    });
    console.log("✅ Groq criado com sucesso");

    // 4. Chamar streamText
    console.log("📡 Chamando streamText com modelo llama3-8b-8192...");
    const result = await streamText({
      model: groq('llama3-8b-8192') as any,
      
      system: `You are "Talken", a friendly English tutor.
               1. Keep responses short (max 2 sentences).
               2. If the user makes a grammar mistake, correct it using **bold** markdown.
               3. Always end with a simple question.
               4. Speak friendly and encouraging.`,
      messages,
    });

    console.log("✅ Stream iniciado com sucesso");
    return result.toAIStreamResponse();

  } catch (error: any) {
    console.error("💀 ERRO NA API - Detalhes completos:");
    console.error("  - Message:", error.message);
    console.error("  - Name:", error.name);
    console.error("  - Stack:", error.stack);
    console.error("  - Full Error:", JSON.stringify(error, null, 2));

    // Retorna o erro detalhado
    return new Response(JSON.stringify({ 
      error: 'Erro ao processar requisição', 
      details: error.message,
      type: error.name,
      timestamp: new Date().toISOString()
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
