'use client'

import { useChat } from 'ai/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Paperclip, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export function ChatInterface() {
  const router = useRouter()
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    onFinish: () => {
      router.refresh()
    }
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<FileList | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    let attachments: { name: string; contentType: string; url: string }[] | undefined = undefined

    if (files && files.length > 0) {
      attachments = await Promise.all(
        Array.from(files).map(async (file) => ({
          name: file.name,
          contentType: file.type,
          url: await fileToDataUrl(file),
        }))
      )
    }

    handleSubmit(e, {
      experimental_attachments: attachments,
    })
    setFiles(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

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
                
                {/* Render any attachments the user sent */}
                {m.experimental_attachments?.map((attachment, index) => (
                  <div key={index} className="mt-2 flex gap-2 overflow-x-auto">
                    {attachment.contentType?.startsWith('image/') ? (
                      <img 
                        src={attachment.url} 
                        alt="attachment" 
                        className="h-24 w-auto rounded border shadow-sm"
                      />
                    ) : (
                      <div className="text-xs italic bg-white/20 p-2 rounded">
                        Attached file
                      </div>
                    )}
                  </div>
                ))}

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
      <CardFooter className="p-4 border-t flex flex-col items-start gap-2">
        {files && files.length > 0 && (
          <div className="flex items-center gap-2 mb-2 w-full">
            {Array.from(files).map((file, i) => (
              <div key={i} className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full text-xs text-slate-700">
                <span className="truncate max-w-[150px]">{file.name}</span>
                <button 
                  onClick={() => {
                    setFiles(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }} 
                  className="hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit} className="flex w-full items-center space-x-2">
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            accept="image/*"
            multiple={false}
            onChange={(e) => {
              if (e.target.files) {
                setFiles(e.target.files)
              }
            }}
          />
          <Button 
            type="button" 
            variant="outline" 
            size="icon" 
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 text-slate-500"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Input
            value={input}
            onChange={handleInputChange}
            onPaste={(e) => {
              if (e.clipboardData.files && e.clipboardData.files.length > 0) {
                const pastedFiles = e.clipboardData.files;
                const hasImage = Array.from(pastedFiles).some(file => file.type.startsWith('image/'));
                if (hasImage) {
                  setFiles(pastedFiles);
                }
              }
            }}
            placeholder="Type your message or paste an image..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading || (!input && (!files || files.length === 0))}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  )
}
