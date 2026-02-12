'use client';

import { FormEvent, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setStatus(error ? error.message : 'Email de recuperação enviado.');
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">Esqueci minha senha</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input className="w-full rounded-xl border px-3 py-2" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button className="w-full rounded-xl bg-slate-900 py-2 font-semibold text-white">Enviar link</button>
      </form>
      {status && <p className="mt-3 text-sm">{status}</p>}
    </div>
  );
}
