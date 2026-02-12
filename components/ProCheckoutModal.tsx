"use client";

import React, { useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onJoinWaitlist?: (email: string) => Promise<void> | void;
};

export default function ProCheckoutModal({ open, onClose, onJoinWaitlist }: Props) {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setSent(false);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await onJoinWaitlist?.(email.trim());
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        className="absolute inset-0 bg-black/60"
        aria-label="Fechar modal"
        onClick={onClose}
        type="button"
      />

      <div className="relative w-full max-w-lg rounded-2xl border bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Talken Pro</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              Pagamentos estão em desenvolvimento
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Estamos finalizando o checkout. Quer que eu te avise assim que o Pro estiver disponível?
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 rounded-xl border bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-900">O que vem no Pro</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            <li>• Conversas ilimitadas</li>
            <li>• Correção mais completa (gramática + clareza)</li>
            <li>• Relatório de evolução</li>
            <li>• Voz e pronúncia (em breve)</li>
          </ul>
        </div>

        <div className="mt-5">
          {sent ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Perfeito! Vou te avisar no email informado.
            </div>
          ) : (
            <>
              <label className="text-sm font-medium text-slate-900">Seu melhor email</label>
              <div className="mt-2 flex gap-2">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  className="h-11 flex-1 rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/20"
                />
                <button
                  onClick={submit}
                  disabled={loading || !email.trim()}
                  className="h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
                  type="button"
                >
                  {loading ? "Enviando…" : "Me avise"}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Sem spam. Só um aviso quando o checkout estiver pronto.
              </p>
            </>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-10 rounded-xl border px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            type="button"
          >
            Agora não
          </button>
          <a
            href="/auth/signup"
            className="h-10 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:opacity-90"
          >
            Começar grátis
          </a>
        </div>
      </div>
    </div>
  );
}
