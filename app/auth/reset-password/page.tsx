'use client';

import { FormEvent, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setStatus('As senhas não coincidem.');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    setStatus(error ? error.message : 'Senha atualizada com sucesso.');
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">Redefinir senha</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input className="w-full rounded-xl border px-3 py-2" placeholder="Nova senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input className="w-full rounded-xl border px-3 py-2" placeholder="Confirmar senha" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
        <button className="w-full rounded-xl bg-slate-900 py-2 font-semibold text-white">Salvar nova senha</button>
      </form>
      {status && <p className="mt-3 text-sm">{status}</p>}
    </div>
  );
}
