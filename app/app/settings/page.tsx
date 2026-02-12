'use client';

import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

export default function SettingsPage() {
  const [fullName, setFullName] = useState('');
  const [level, setLevel] = useState('beginner');
  const [goal, setGoal] = useState('daily-conversation');
  const [voice, setVoice] = useState('en-US');
  const [status, setStatus] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setFullName((data.user?.user_metadata?.full_name as string) || '');
    });
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: fullName,
        level,
        goal,
        voice,
      },
    });

    setStatus(error ? error.message : 'Preferências salvas!');
  };

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold">Configurações</h1>
      <p className="mt-1 text-sm text-slate-600">Perfil, nível e objetivos.</p>
      <form onSubmit={save} className="mt-6 grid gap-4">
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="rounded-xl border px-3 py-2" placeholder="Nome completo" />
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded-xl border px-3 py-2">
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
        <select value={goal} onChange={(e) => setGoal(e.target.value)} className="rounded-xl border px-3 py-2">
          <option value="daily-conversation">Conversação diária</option>
          <option value="travel">Viagens</option>
          <option value="work">Trabalho</option>
        </select>
        <select value={voice} onChange={(e) => setVoice(e.target.value)} className="rounded-xl border px-3 py-2">
          <option value="en-US">English (US)</option>
          <option value="en-GB">English (UK)</option>
        </select>
        <button className="rounded-xl bg-slate-900 py-2 font-semibold text-white">Salvar</button>
      </form>
      {status && <p className="mt-3 text-sm text-slate-600">{status}</p>}
    </div>
  );
}
