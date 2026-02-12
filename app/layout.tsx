import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: 'Talken - English Tutor',
  description: 'MicroSaaS English tutor powered by AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-50 text-slate-900">
        <div className="min-h-screen flex flex-col">
          <header className="w-full border-b bg-white/80 backdrop-blur">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
              <Link href="/" className="text-lg font-bold">Talken</Link>
              <nav className="flex items-center gap-4 text-sm">
                <Link href="/pricing" className="hover:underline">Pricing</Link>
                <Link href="/auth/login" className="hover:underline">Login</Link>
                <Link href="/app/chat" className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white">Abrir App</Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
