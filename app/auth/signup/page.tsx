'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const signup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    const redirectTo = `${window.location.origin}/auth/reset-password`;
    const { error: signError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { full_name: fullName },
      },
    });
    setLoading(false);

    if (signError) {
      setError(signError.message);
      return;
    }

    router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
  };

  const google = async () => {
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app/chat` },
    });
    if (googleError) setError(googleError.message);
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">Criar conta</h1>
      <p className="mt-1 text-sm text-slate-600">Comece grátis no Talken.</p>
      <form onSubmit={signup} className="mt-6 space-y-3">
        <input className="w-full rounded-xl border px-3 py-2" placeholder="Nome completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <input className="w-full rounded-xl border px-3 py-2" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full rounded-xl border px-3 py-2" placeholder="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input className="w-full rounded-xl border px-3 py-2" placeholder="Confirmar senha" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="w-full rounded-xl bg-slate-900 py-2 font-semibold text-white disabled:opacity-60">{loading ? 'Criando...' : 'Criar conta'}</button>
      </form>
      <button onClick={google} type="button" className="mt-3 w-full rounded-xl border py-2 font-semibold">Continuar com Google</button>
      <p className="mt-4 text-sm">Já tem conta? <Link className="font-semibold underline" href="/auth/login">Entrar</Link></p>
    </div>
  );
}
