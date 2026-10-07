"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getPostgresCredentials, type PostgresCredentials } from "@/lib/credential-store"
import { cn } from "@/lib/utils"
import { Activity, CheckCircle2, Loader2, Pause, Play, XCircle } from "lucide-react"

type PingResult = {
  at: number
  ok: boolean
  ms: number
  address?: string
  error?: string
  hint?: string
}

const HISTORY_SIZE = 20
const AUTO_INTERVAL_MS = 5000

const TARGET_KEY = "ep_postgres_ping_target"

/** Accepts "10.0.0.5:5432", "[::1]:5432" or a bare host/IP (defaults to 5432). */
function parseTarget(input: string): { host: string; port: number } | null {
  const value = input.trim().replace(/^[a-z]+:\/\//i, "")
  if (!value) return null
  let host = value
  let portText = "5432"
  const bracket = value.match(/^\[([^\]]+)\](?::(\d+))?$/)
  if (bracket) {
    host = bracket[1]
    portText = bracket[2] ?? portText
  } else if ((value.match(/:/g) ?? []).length === 1) {
    ;[host, portText] = value.split(":")
  }
  const port = Number(portText)
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null
  return { host, port }
}

function targetFromCredentials(creds: PostgresCredentials | null): { host: string; port: number } | null {
  if (!creds) return null
  if (creds.mode === "connectionString" && creds.connectionString) {
    try {
      const url = new URL(creds.connectionString.trim())
      return { host: decodeURIComponent(url.hostname), port: url.port ? Number(url.port) : 5432 }
    } catch {
      return null
    }
  }
  if (creds.host) return { host: creds.host, port: creds.port ?? 5432 }
  return null
}

/** TCP reachability check (DNS + connect) for the Postgres host:port, run from the server. */
export function PostgresPinger() {
  const [target, setTarget] = useState("")
  const [pinging, setPinging] = useState(false)
  const [auto, setAuto] = useState(false)
  const [history, setHistory] = useState<PingResult[]>([])
  const inFlight = useRef(false)

  const parsed = parseTarget(target)
  const valid = parsed !== null

  // Saved value wins, then the saved Postgres connection, then the server's DB_PROBE_HOST default.
  useEffect(() => {
    const saved = localStorage.getItem(TARGET_KEY)
    const fromCreds = targetFromCredentials(getPostgresCredentials())
    if (saved) {
      setTarget(saved)
    } else if (fromCreds) {
      setTarget(`${fromCreds.host}:${fromCreds.port}`)
    } else {
      fetch("/api/network/whoami", { cache: "no-store" })
        .then((r) => r.json())
        .then((info: { defaultTarget?: { host: string; port: number } }) => {
          if (info.defaultTarget) setTarget((t) => t || `${info.defaultTarget!.host}:${info.defaultTarget!.port}`)
        })
        .catch(() => {})
    }
  }, [])

  const ping = useCallback(async () => {
    if (!parsed || inFlight.current) return
    inFlight.current = true
    localStorage.setItem(TARGET_KEY, target.trim())
    setPinging(true)
    const startedAt = performance.now()
    let result: PingResult
    try {
      const res = await fetch("/api/network/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: parsed.host, ports: [parsed.port], timeoutMs: 4000 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      if (!data.dns?.ok) {
        result = { at: Date.now(), ok: false, ms: data.dns?.ms ?? 0, error: `DNS: ${data.dns?.error}`, hint: data.dns?.hint }
      } else {
        const p = data.ports[0]
        result = {
          at: Date.now(),
          ok: p.ok,
          ms: p.ms,
          address: data.dns.address,
          error: p.ok ? undefined : `${p.code ?? ""} ${p.error ?? ""}`.trim(),
          hint: p.hint,
        }
      }
    } catch (err) {
      result = {
        at: Date.now(),
        ok: false,
        ms: Math.round(performance.now() - startedAt),
        error: err instanceof Error ? err.message : "Request failed",
      }
    } finally {
      inFlight.current = false
      setPinging(false)
    }
    setHistory((h) => [...h, result].slice(-HISTORY_SIZE))
  }, [parsed?.host, parsed?.port, target]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!auto) return
    ping()
    const id = setInterval(ping, AUTO_INTERVAL_MS)
    return () => clearInterval(id)
  }, [auto, ping])

  const last = history[history.length - 1]
  const okCount = history.filter((h) => h.ok).length

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">Host reachability (pinger)</Label>
        </div>
        {last && (
          <span
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              last.ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
            )}
          >
            {last.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {last.ok ? `Reachable · ${last.ms}ms` : "Unreachable"}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Enter an IP (or hostname) and port. Runs a TCP connect from the server - no credentials or database
        needed.
      </p>

      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">IP:port</Label>
        <Input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ping()}
          placeholder="10.0.0.5:5432"
          className="bg-input font-mono text-xs"
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={ping} disabled={!valid || pinging} className="flex-1">
          {pinging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
          {pinging ? "Pinging..." : "Ping"}
        </Button>
        <Button variant="outline" onClick={() => setAuto((a) => !a)} disabled={!valid}>
          {auto ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          {auto ? "Stop auto" : `Auto (${AUTO_INTERVAL_MS / 1000}s)`}
        </Button>
      </div>

      {last && !last.ok && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs space-y-1">
          <p className="font-mono break-all text-destructive">{last.error}</p>
          {last.hint && <p className="text-muted-foreground">{last.hint}</p>}
        </div>
      )}
      {last?.ok && last.address && (
        <p className="text-xs text-muted-foreground font-mono">
          {parsed ? `${parsed.host}:${parsed.port}` : target} → {last.address} open
        </p>
      )}

      {history.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-0.5" aria-label="Recent ping results">
            {history.map((h) => (
              <span
                key={h.at}
                title={`${new Date(h.at).toLocaleTimeString()} - ${h.ok ? `${h.ms}ms` : h.error}`}
                className={cn("h-4 flex-1 max-w-3 rounded-sm", h.ok ? "bg-success" : "bg-destructive")}
              />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {okCount}/{history.length} reachable
          </p>
        </div>
      )}
    </div>
  )
}
