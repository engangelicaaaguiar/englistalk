export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const last = messages?.slice(-1)[0];
    const userText = last?.content || '';

    // Simple local responder as a safe fallback for the MVP.
    // - Keeps answers short, ends with a question.
    // - Wraps a naive "correction" in **bold** when it detects a simple pattern.
    let corrected = userText;
    // naive correction example: replace common wrong "goed" -> "went"
    corrected = corrected.replace(/\bgoed\b/gi, '**went**');

    const reply = `I heard: ${corrected}. Would you like another example?`;

    return new Response(JSON.stringify({ output: reply }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
