'use client'

import { useState } from 'react'
import { Plug, Copy, Check, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createMcpToken, listMcpTokens, revokeMcpToken, type McpTokenSummary } from '@/app/connector-actions'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

export function ConnectAppsDialog() {
  const [open, setOpen] = useState(false)
  const [tokens, setTokens] = useState<McpTokenSummary[] | null>(null)
  const [name, setName] = useState('')
  const [newToken, setNewToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const origin = typeof window === 'undefined' ? '' : window.location.origin

  const refresh = async () => {
    const res = await listMcpTokens()
    if (res.error) setError(res.error)
    else setTokens(res.tokens ?? [])
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setError(null)
      refresh()
    } else {
      setNewToken(null)
      setName('')
    }
  }

  const handleCreate = async () => {
    setBusy(true)
    setError(null)
    const res = await createMcpToken(name || 'AI app')
    setBusy(false)
    if (res.error || !res.token) {
      setError(res.error || 'Could not create a connector link')
      return
    }
    setNewToken(res.token)
    setName('')
    refresh()
  }

  const handleRevoke = async (id: string) => {
    const res = await revokeMcpToken(id)
    if (res.error) setError(res.error)
    refresh()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => handleOpenChange(true)}>
        <Plug className="h-4 w-4" />
        <span className="hidden sm:inline">Connect AI apps</span>
      </Button>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plug className="h-4 w-4" /> Connect AI apps</DialogTitle>
          <DialogDescription>
            Let Claude, ChatGPT or another AI app add orders, update statuses and record refunds by voice or chat, from your phone or computer.
          </DialogDescription>
        </DialogHeader>

        {newToken ? (
          <div className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="text-sm font-medium">Your connector link is ready. Copy it now: it won&apos;t be shown again.</p>
            <CopyField label="Connector URL (Claude, ChatGPT and other apps that ask for a URL)" value={`${origin}/api/mcp/${newToken}`} />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Apps that take a URL plus a token (Claude Code, Cursor)</summary>
              <div className="mt-2 space-y-2">
                <CopyField label="Server URL" value={`${origin}/api/mcp`} />
                <CopyField label="Bearer token" value={newToken} />
                <CopyField label="Claude Code command" value={`claude mcp add --transport http meerkhan ${origin}/api/mcp --header "Authorization: Bearer ${newToken}"`} />
              </div>
            </details>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Claude (web, desktop, then on your phone):</strong> Settings → Connectors → Add custom connector → paste the URL. Connectors you add on claude.ai show up in the Claude mobile app too.</p>
              <p><strong>ChatGPT:</strong> Settings → Apps &amp; Connectors → Advanced → Developer mode, then Create → paste the URL, authentication: none.</p>
              <p>Anyone with this link can change your tracker. If it leaks, revoke it below.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setNewToken(null)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="connector-name">Name this connection</Label>
            <div className="flex gap-2">
              <Input id="connector-name" placeholder="e.g. Claude on my phone" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
              <Button onClick={handleCreate} disabled={busy} className="shrink-0">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create link'}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Active connections</h4>
          {tokens === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {tokens.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {t.token_prefix}… · {t.last_used_at ? `last used ${new Date(t.last_used_at).toLocaleString()}` : 'never used'}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1 text-destructive hover:text-destructive shrink-0" onClick={() => handleRevoke(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
