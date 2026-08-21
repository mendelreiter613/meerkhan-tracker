'use client'

import { useChat } from 'ai/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export function ChatInterface() {
  const router = useRouter()
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    onFinish: () => {
      // Refresh the page data when the AI finishes a response, in case tools updated the DB
      router.refresh()
    }
  })
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <Card className="w-full h-[600px] flex flex-col">
      <CardHeader>
        <CardTitle>Meerkhan AI Assistant</CardTitle>
        <CardDescription>Chat to update your orders, ask about refunds, or add new agents.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-[450px] p-4" ref={scrollRef}>
          <div className="flex flex-col gap-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 mt-10">
                Hi! Tell me what you ordered, or if you got a refund.
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex w-max max-w-[80%] flex-col gap-2 rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'ml-auto bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {m.content}
                {m.toolInvocations?.map((tool) => (
                  <div key={tool.toolCallId} className="text-xs bg-black/10 dark:bg-white/10 rounded p-1 mt-1 font-mono">
                    {tool.state === 'result' ? (
                      <span className="text-green-600 dark:text-green-400">✓ Completed action: {tool.toolName}</span>
                    ) : (
                      <span className="text-yellow-600 dark:text-yellow-400">Working on: {tool.toolName}...</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {isLoading && (
              <div className="bg-muted w-max rounded-lg px-3 py-2 text-sm">Thinking...</div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
          <Input
            value={input}
            onChange={handleInputChange}
            placeholder="Type your message..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  )
}
