"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, RefreshCw, Server } from "lucide-react"

export type Stage = { name: string; ok: boolean; ms: number; detail?: string }

export type RunnerInfo = {
  hostname: string
  podName?: string
  podIp?: string
  nodeName?: string
  nodeIp?: string
  interfaces: { name: string; address: string }[]
  defaultTarget?: { host: string; port: number }
}

/** Where the probes actually run (the pod), i.e. the source the firewall evaluates. */
export function RunnerInfoCard({ onLoad }: { onLoad?: (info: RunnerInfo) => void }) {
  const [info, setInfo] = useState<RunnerInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setError(null)
    try {
      const res = await fetch("/api/network/whoami", { cache: "no-store" })
      const data = (await res.json()) as RunnerInfo
      setInfo(data)
      onLoad?.(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows: [string, string | undefined][] = info
    ? [
        ["Node", info.nodeName],
        ["Node IP (firewall source)", info.nodeIp],
        ["Pod", info.podName ?? info.hostname],
        ["Pod IP", info.podIp ?? info.interfaces.map((i) => i.address).join(", ")],
        ["DB target (TCP)", info.defaultTarget && `${info.defaultTarget.host}:${info.defaultTarget.port}`],
      ]
    : []

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Server className="h-3.5 w-3.5 text-primary" />
          Tests run from
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={load} title="Refresh">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      {info && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="truncate">{v || <span className="text-muted-foreground">{k.startsWith("DB") ? "not set (DB_PROBE_HOST)" : "n/a (not in k8s)"}</span>}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

export function StageList({ stages }: { stages: Stage[] }) {
  return (
    <ol className="space-y-1 text-xs">
      {stages.map((s, i) => (
        <li key={`${s.name}-${i}`} className="flex items-start gap-2">
          {s.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
          )}
          <span className="font-mono uppercase w-16 shrink-0">{s.name}</span>
          <span className="text-muted-foreground break-all">
            {s.detail} <span className="opacity-60">({s.ms}ms)</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
