'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';
import PricingSection from '../components/PricingSection';

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="space-y-20 pb-20">
      <section className="rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Talken</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-900">Converse em inglês com IA de forma real.</h1>
        <p className="mt-4 max-w-2xl text-slate-600">
          Treine fala e escuta com correções amigáveis, histórico de progresso e experiência fluida para estudo diário.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push('/auth/signup')}
            className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Começar grátis
          </button>
          <Link
            href="/auth/login"
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Já tenho conta
          </Link>
        </div>
      </section>

      <PricingSection />

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Privacidade e termos</h2>
          <p className="mt-2">Leia nossas políticas para entender como seus dados e progresso são tratados.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/privacy" className="font-semibold text-slate-900 underline">
            Privacy
          </Link>
          <Link href="/terms" className="font-semibold text-slate-900 underline">
            Terms
          </Link>
        </div>
      </section>
    </div>
  );
}
