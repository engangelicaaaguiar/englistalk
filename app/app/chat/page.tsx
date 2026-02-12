'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useChat } from 'ai/react';
import ChatInput from '../../../components/ChatInput';
import Message from '../../../components/Message';
import { getSupabaseClient } from '../../../lib/supabaseClient';

export default function AppChatPage() {
  const router = useRouter();
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat',
    streamMode: 'text',
  });

  const logout = async () => {
    await getSupabaseClient().auth.signOut();
    router.push('/auth/login');
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border bg-white p-4">
        <h1 className="text-xl font-semibold">Talken Chat</h1>
        <div className="flex gap-2">
          <Link href="/app/settings" className="rounded-lg border px-3 py-2 text-sm">Settings</Link>
          <button type="button" onClick={logout} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Sair</button>
        </div>
      </div>

      <div className="h-[55vh] overflow-auto rounded-xl border bg-white p-4">
        {messages.length === 0 ? <p className="text-sm text-slate-500">Comece dizendo: Hello teacher!</p> : null}
        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={m.id}>
              <Message role={m.role} content={String(m.content)} />
            </li>
          ))}
        </ul>
      </div>

      <ChatInput value={input ?? ''} onChange={handleInputChange} onSend={handleSubmit} />
    </div>
  );
}
