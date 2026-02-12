import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';

export const maxDuration = 30;

// Matar o 405
export function GET() {
  return new Response("Health check OK", { status: 200 });
}

export async function POST(req: Request) {
  try {
    // 1. Verificar chave de API
    const apiKey = process.env.GROQ_API_KEY;
    console.log("🔑 GROQ_API_KEY presente?", !!apiKey);
    
    if (!apiKey) {
      return Response.json({ 
        error: 'GROQ_API_KEY não configurada',
        hint: 'Verifique as variáveis de ambiente no Netlify'
      }, { status: 500 });
    }

    // 2. Parsear mensagens
    console.log("📥 Parse do request body...");
    let body;
    try {
      body = await req.json();
    } catch (e: any) {
      return Response.json({ 
        error: 'JSON inválido no body',
        details: e.message
      }, { status: 400 });
    }

    const { messages } = body;
    
    // Validação melhorada
    console.log("📥 Array de messages?", Array.isArray(messages));
    console.log("📥 Tamanho:", messages?.length);
    console.log("📥 Sample message:", messages?.[0]);

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ 
        error: 'messages must be a non-empty array',
        received: typeof messages,
        sample: messages?.[0]
      }, { status: 400 });
    }

    // Validar shape das mensagens
    const validMessages = messages.every(
      m => typeof m?.role === 'string' && m?.content != null
    );
    if (!validMessages) {
      return Response.json({ 
        error: 'invalid message shape',
        sample: messages?.[0],
        expected: { role: 'string', content: 'string|null' }
      }, { status: 400 });
    }

    // 3. Criar instância do Groq
    console.log("🚀 Criando instância Groq...");
    const groq = createGroq({ apiKey });
    console.log("✅ Groq criado");

    // 4. Chamar generateText (SEM STREAMING - TESTE)
    console.log("📡 Chamando generateText com modelo llama-3.1-8b-instant (NOVO)...");
    let result;
    try {
      result = await generateText({
        model: groq('llama-3.1-8b-instant') as any,
        system: `You are "Talken", a friendly English tutor.
1. Keep responses short (max 2 sentences).
2. If the user makes a grammar mistake, correct it using **bold** markdown.
3. Always end with a simple question.
4. Speak friendly and encouraging.`,
        messages,
        maxTokens: 250,
      });
      console.log("✅ generateText completado:", {
        text: result.text?.substring(0, 100),
        finishReason: result.finishReason,
        usage: result.usage
      });
    } catch (e: any) {
      console.error("❌ generateText erro:", e.message, e);
      throw e;
    }

    console.log("✅ Resposta final do Groq:", {
      textLength: result.text.length,
      text: result.text
    });
    
    // Retornar como JSON simples (não-streaming)
    return Response.json({ 
      content: result.text,
      timestamp: new Date().toISOString()
    }, { status: 200 });

  } catch (error: any) {
    console.error("💀 ERRO NA API:");
    console.error("  Message:", error.message);
    console.error("  Type:", error.name);
    console.error("  Stack:", error.stack?.split('\n').slice(0, 3));

    return Response.json({ 
      error: error.message ?? 'Unknown error',
      type: error.name,
      hint: 'Check Netlify function logs for details'
    }, { status: 500 });
  }
}
