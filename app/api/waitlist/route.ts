export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return Response.json({ error: 'email is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json({ ok: true, mode: 'dev-no-db' }, { status: 200 });
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/waitlist_pro`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });

    if (!response.ok) {
      const body = await response.text();
      return Response.json({ error: 'failed to insert waitlist', details: body }, { status: 500 });
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch (error: any) {
    return Response.json({ error: error.message || 'unexpected error' }, { status: 500 });
  }
}
