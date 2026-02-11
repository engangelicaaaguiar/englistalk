import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

// Isso é CRUCIAL para o Netlify. Se tirar, quebra.
export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    // 1. Verificar se a chave existe no servidor
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.error("❌ ERRO CRÍTICO: Chave da API não encontrada!");
      return new Response("Erro: Chave de API não configurada no servidor.", { status: 500 });
    }

    // 2. Ler a mensagem
    const { messages } = await req.json();
    console.log("📩 Recebi mensagem do frontend:", messages[messages.length - 1].content);

    // 3. Chamar o Gemini
    const result = await streamText({
      model: google('gemini-1.5-flash'),
      system: `You are Talken AI, a friendly English tutor. Keep answers short.`,
      messages,
    });

    // 4. Devolver resposta
    return result.toDataStreamResponse();

  } catch (error: any) {
    console.error("🔥 ERRO NA API:", error);
    return new Response(`Erro no servidor: ${error.message}`, { status: 500 });
  }
}
