"use client"
import React from 'react'
import { useChat } from 'ai/react'
import Message from '../../components/Message.tsx'
import ChatInput from '../../components/ChatInput.tsx'

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat',
    streamMode: 'text'
  })

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex-1 overflow-auto p-4 bg-white rounded-lg shadow chat-scroll">
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li key={m.id} className="">
              <Message role={m.role} content={String(m.content)} />
            </li>
          ))}
        </ul>
      </div>

      <div>
        <ChatInput value={input ?? ''} onChange={handleInputChange} onSend={handleSubmit} />
      </div>
    </div>
  )
}
