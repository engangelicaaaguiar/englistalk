import './globals.css'

export const metadata = {
  title: 'EnglisTalk - English Tutor',
  description: 'MicroSaaS English tutor powered by AI'
}

export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="w-full py-4 bg-white/60 shadow-sm">
            <div className="max-w-4xl mx-auto px-4">
              <h1 className="text-lg font-semibold">EnglisTalk</h1>
            </div>
          </header>
          <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">{children}</main>
        </div>
      </body>
    </html>
  )
}
