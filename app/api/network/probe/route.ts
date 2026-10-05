import { NextRequest } from "next/server"
import { hintFor, resolveHost, tcpProbe } from "@/lib/net-diagnostics"

export const runtime = "nodejs"

const MAX_PORTS = 10

/**
 * POST /api/network/probe  { host, ports: number[], timeoutMs? }
 * DNS + raw TCP connect from inside the pod (pg_isready / nc -zv equivalent).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { host?: string; ports?: unknown; timeoutMs?: number }
  const host = typeof body.host === "string" ? body.host.trim() : ""
  const ports = Array.isArray(body.ports) ? body.ports.map(Number) : []
  const timeoutMs = Math.min(Math.max(Number(body.timeoutMs) || 5000, 500), 15000)

  if (!host || host.length > 253) {
    return Response.json({ ok: false, error: "host is required" }, { status: 400 })
  }
  if (ports.length === 0 || ports.length > MAX_PORTS || ports.some((p) => !Number.isInteger(p) || p < 1 || p > 65535)) {
    return Response.json({ ok: false, error: `ports must be 1-${MAX_PORTS} integers between 1 and 65535` }, { status: 400 })
  }

  const t = Date.now()
  let address: string
  try {
    address = await resolveHost(host)
  } catch (err) {
    return Response.json({
      ok: false,
      host,
      dns: { ok: false, ms: Date.now() - t, error: err instanceof Error ? err.message : String(err), hint: hintFor("dns", err) },
      ports: [],
    })
  }
  const dns = { ok: true, ms: Date.now() - t, address }

  const results = await Promise.all(
    ports.map(async (port) => {
      const started = Date.now()
      try {
        await tcpProbe(address, port, timeoutMs)
        return { port, ok: true, ms: Date.now() - started }
      } catch (err) {
        return {
          port,
          ok: false,
          ms: Date.now() - started,
          code: (err as { code?: string }).code,
          error: err instanceof Error ? err.message : String(err),
          hint: hintFor("tcp", err),
        }
      }
    }),
  )

  return Response.json({ ok: results.every((r) => r.ok), host, dns, ports: results })
}
