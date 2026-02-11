"use client"
import React from 'react'
import { Play } from 'lucide-react'

export default function Message({ role, content }: { role?: string; content: string }) {
  const speak = () => {
    if (typeof window === 'undefined') return
    const utter = new SpeechSynthesisUtterance(content)
    utter.lang = 'en-US'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utter)
  }

  const isUser = role === 'user'

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] p-3 rounded-lg ${isUser ? 'bg-indigo-50 text-indigo-900' : 'bg-slate-100'}`}>
        <div className="whitespace-pre-wrap">{content}</div>
        <button onClick={speak} aria-label="play" className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <Play size={14} /> Ouvir
        </button>
      </div>
    </div>
  )
}
