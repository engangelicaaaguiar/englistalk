'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../../lib/supabaseClient';

export default function VerifyEmailPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get('email') || '');
  }, []);

  const resend = async () => {
    if (!email) return;
    const { error } = await getSupabaseClient().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/app/chat` },
    });
    setStatus(error ? error.message : 'Email reenviado com sucesso.');
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">Verifique seu email</h1>
      <p className="mt-2 text-sm text-slate-600">Enviamos um link para <strong>{email || 'seu email'}</strong>.</p>
      <div className="mt-6 space-y-3">
        <button onClick={resend} type="button" className="w-full rounded-xl border py-2 font-semibold">Reenviar email</button>
        <Link href="/auth/login" className="block w-full rounded-xl bg-slate-900 py-2 text-center font-semibold text-white">Já confirmei, entrar</Link>
      </div>
      {status && <p className="mt-3 text-sm text-slate-700">{status}</p>}
    </div>
  );
}
