'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { getSupabaseClient } from '../../../lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: loginError } = await getSupabaseClient().auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        setError(loginError.message);
        return;
      }

      router.replace('/app/chat');
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Falha ao entrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    const { error: googleError } = await getSupabaseClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app/chat` },
    });
    if (googleError) setError(googleError.message);
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">Entrar</h1>
      <form onSubmit={login} className="mt-6 space-y-3">
        <input className="w-full rounded-xl border px-3 py-2" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full rounded-xl border px-3 py-2" placeholder="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="w-full rounded-xl bg-slate-900 py-2 font-semibold text-white disabled:opacity-60">{loading ? 'Entrando...' : 'Entrar'}</button>
      </form>
      <button onClick={google} type="button" className="mt-3 w-full rounded-xl border py-2 font-semibold">Continuar com Google</button>
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/auth/forgot-password" className="underline">Esqueci a senha</Link>
        <Link href="/auth/signup" className="underline">Criar conta</Link>
      </div>
    </div>
  );
}
