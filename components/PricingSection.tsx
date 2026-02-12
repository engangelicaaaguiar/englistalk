"use client";

import React from "react";
import ProCheckoutModal from "./ProCheckoutModal";

export default function PricingSection() {
  const [open, setOpen] = React.useState(false);

  return (
    <section id="pricing" className="py-4">
      <div className="mx-auto max-w-6xl rounded-3xl border border-slate-200 bg-white px-6 py-10 shadow-sm">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="text-3xl font-semibold text-slate-900">Planos</h2>
            <p className="mt-2 text-slate-600">
              Comece grátis. Faça upgrade para Pro quando estiver disponível.
            </p>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Free</p>
            <p className="mt-2 text-4xl font-semibold text-slate-900">R$0</p>
            <p className="mt-2 text-sm text-slate-600">Perfeito para começar.</p>

            <ul className="mt-5 space-y-2 text-sm text-slate-700">
              <li>• Prática diária</li>
              <li>• Correção gentil</li>
              <li>• Histórico recente</li>
            </ul>

            <a
              href="/auth/signup"
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:opacity-90"
            >
              Começar grátis
            </a>
          </div>

          <div className="rounded-2xl border bg-slate-900 p-6 text-white shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Pro</p>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs">Em desenvolvimento</span>
            </div>

            <p className="mt-2 text-4xl font-semibold">—</p>
            <p className="mt-2 text-sm text-white/80">Checkout será liberado em breve.</p>

            <ul className="mt-5 space-y-2 text-sm text-white/90">
              <li>• Conversas ilimitadas</li>
              <li>• Relatório de evolução</li>
              <li>• Voz & pronúncia (em breve)</li>
            </ul>

            <button
              onClick={() => setOpen(true)}
              className="mt-6 h-11 w-full rounded-xl bg-white px-4 text-sm font-semibold text-slate-900 hover:opacity-90"
              type="button"
            >
              Assinar Pro
            </button>
          </div>
        </div>
      </div>

      <ProCheckoutModal
        open={open}
        onClose={() => setOpen(false)}
        onJoinWaitlist={async (email) => {
          await fetch('/api/waitlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
        }}
      />
    </section>
  );
}
