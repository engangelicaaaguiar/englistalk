import { streamText } from 'ai';

// Isso é CRUCIAL para o Netlify. Se tirar, quebra.
export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    // 1. Verificar se a chave existe no servidor
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.error("❌ ERRO CRÍTICO: Chave da API não encontrada!");
    } else {
      console.log("✅ Chave da API encontrada!");
    }

    // 2. Ler a mensagem
    const { messages } = await req.json();
    const userMessage = messages[messages.length - 1]?.content || '';
    console.log("📩 Recebi mensagem do frontend:", userMessage);

    // 3. Responder com fallback local (diagnóstico)
    const reply = `I heard: "${userMessage}". Would you like to try again?`;
    console.log("📤 Enviando resposta:", reply);

    // Streaming response para manter compatibilidade com useChat
    const encoder = new TextEncoder();
    const chunks = [
      `0:["${reply}"]\n`,
      'd:[[["text","I heard: \\"${userMessage}\\". Would you like to try again?"]],null]\n',
    ];

    return new Response(
      new ReadableStream({
        async start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
            await new Promise(r => setTimeout(r, 50));
          }
          controller.close();
        },
      }),
      { 
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error("🔥 ERRO NA API:", error);
    return new Response(`Erro no servidor: ${error.message}`, { status: 500 });
  }
}
