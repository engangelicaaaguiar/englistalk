"use client"
import React from 'react'

export default function ChatInput({ value, onChange, onSend }: { value: string; onChange: (e: any) => void; onSend: (e?: any) => void }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSend()
      }}
      className="flex gap-2"
    >
      <input
        value={value}
        onChange={onChange}
        placeholder="Escreva em inglês..."
        className="flex-1 px-4 py-2 rounded-md border border-slate-200"
      />
      <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md">Enviar</button>
    </form>
  )
}
