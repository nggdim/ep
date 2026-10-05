"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { TestResult } from "@/components/connection-tester"
import { ResultDisplay } from "@/components/result-display"
import { RunnerInfoCard, StageList, type RunnerInfo, type Stage } from "@/components/testers/network-diagnostics"
import { Loader2, Play, Network, Zap } from "lucide-react"

type Props = {
  onResult: (result: Omit<TestResult, "id" | "timestamp">) => void
}

type PortResult = { port: number; ok: boolean; ms: number; code?: string; error?: string; hint?: string }

export function NetworkTester({ onResult }: Props) {
  const [host, setHost] = useState("")
  const [ports, setPorts] = useState("5432")
  const [testing, setTesting] = useState(false)
  const [stages, setStages] = useState<Stage[]>([])
  const [result, setResult] = useState<Omit<TestResult, "id" | "timestamp"> | null>(null)
  const [dbTarget, setDbTarget] = useState<RunnerInfo["defaultTarget"]>()

  const handleRunnerInfo = (info: RunnerInfo) => {
    setDbTarget(info.defaultTarget)
    if (info.defaultTarget && !host) {
      setHost(info.defaultTarget.host)
      setPorts(String(info.defaultTarget.port))
    }
  }

  const parsedPorts = ports
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
  const valid = host.trim().length > 0 && parsedPorts.length > 0 && parsedPorts.every((p) => Number.isInteger(p) && p > 0 && p < 65536)

  const run = async (targetHost = host.trim(), targetPorts = parsedPorts) => {
    setTesting(true)
    setResult(null)
    setStages([])
    const startedAt = performance.now()
    try {
      const res = await fetch("/api/network/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: targetHost, ports: targetPorts }),
      })
      const data = await res.json()
      const ms = Math.round(performance.now() - startedAt)
      const target = `${targetHost}:${targetPorts.join(",")}`

      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      const s: Stage[] = [
        {
          name: "dns",
          ok: data.dns.ok,
          ms: data.dns.ms,
          detail: data.dns.ok ? `${data.host} -> ${data.dns.address}` : data.dns.error,
        },
        ...(data.ports as PortResult[]).map((p) => ({
          name: "tcp",
          ok: p.ok,
          ms: p.ms,
          detail: p.ok ? `port ${p.port} open` : `port ${p.port}: ${p.code ?? ""} ${p.error ?? ""}`.trim(),
        })),
      ]
      setStages(s)

      const firstFail = (data.ports as PortResult[]).find((p) => !p.ok)
      const tr: Omit<TestResult, "id" | "timestamp"> = {
        type: "network",
        connectionString: target,
        status: data.ok ? "success" : "error",
        message: data.ok
          ? `All ${targetPorts.length} port(s) reachable from this pod`
          : data.dns.ok
            ? `${(data.ports as PortResult[]).filter((p) => !p.ok).length} port(s) unreachable`
            : `DNS lookup failed for ${data.host}`,
        responseTime: ms,
        details: { hint: data.dns.ok ? firstFail?.hint : data.dns.hint, dns: data.dns, ports: data.ports },
      }
      setResult(tr)
      onResult(tr)
    } catch (err) {
      const tr: Omit<TestResult, "id" | "timestamp"> = {
        type: "network",
        connectionString: targetHost,
        status: "error",
        message: err instanceof Error ? err.message : "Request failed",
      }
      setResult(tr)
      onResult(tr)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Network className="h-4 w-4 text-primary" />
        <Label className="text-sm text-muted-foreground">Network Reachability (DNS + TCP)</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Runs from the server/pod, not your browser - equivalent to <code>nc -zv</code> / <code>pg_isready</code>. Use
        it to verify firewall rules without kubectl.
      </p>

      <RunnerInfoCard onLoad={handleRunnerInfo} />

      {dbTarget && (
        <Button
          variant="outline"
          onClick={() => run(dbTarget.host, [dbTarget.port])}
          disabled={testing}
          className="w-full"
        >
          <Zap className="h-4 w-4 mr-2" />
          Test DB TCP {dbTarget.host}:{dbTarget.port}
        </Button>
      )}

      <div className="grid grid-cols-4 gap-3 border-t border-border pt-4">
        <div className="col-span-3">
          <Label className="text-sm text-muted-foreground mb-1.5 block">Host</Label>
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="db-vm.example.internal or 10.x.x.x"
            className="bg-input font-mono text-xs"
          />
        </div>
        <div>
          <Label className="text-sm text-muted-foreground mb-1.5 block">Ports</Label>
          <Input
            value={ports}
            onChange={(e) => setPorts(e.target.value)}
            placeholder="5432,443"
            className="bg-input font-mono text-xs"
          />
        </div>
      </div>

      <Button onClick={() => run()} disabled={!valid || testing} className="w-full">
        {testing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Probing...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Probe
          </>
        )}
      </Button>

      {stages.length > 0 && <StageList stages={stages} />}
      {result && <ResultDisplay result={result} />}
    </div>
  )
}
