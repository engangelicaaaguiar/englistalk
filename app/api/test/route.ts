import { createGroq } from '@ai-sdk/groq';
import { generateText } from 'ai';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    console.log("🧪 TEST ROUTE - GROQ_API_KEY presente?", !!apiKey);

    if (!apiKey) {
      return new Response(JSON.stringify({ 
        error: 'API key not configured'
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const { messages } = body;

    console.log("🧪 Messages recebidas:", messages?.length);

    const groq = createGroq({ apiKey });

    // ✅ SEM STREAMING - teste simples
    console.log("🧪 Chamando generateText (sem stream)...");
    const result = await generateText({
      model: groq('llama-3.1-8b-instant') as any,
      system: 'Você é um tutor de inglês. Respostas curtas.',
      messages,
      maxTokens: 50,
    });

    console.log("🧪 Sucesso! Resposta:", result.text.substring(0, 100));

    return new Response(JSON.stringify({
      success: true,
      text: result.text,
      timestamp: new Date().toISOString()
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("🧪 TESTE FALHOU:", error.message);
    console.error("Stack:", error.stack);
    
    return new Response(JSON.stringify({
      error: error.message,
      type: error.name,
      stack: error.stack?.split('\n').slice(0, 5)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
