import { NextRequest } from "next/server"
import { withPool, describePgError, getTarget, type PostgresConnectionInput } from "@/lib/postgres"
import { getRunnerInfo, hintFor, resolveHost, tcpProbe, type Stage, type StageName } from "@/lib/net-diagnostics"

export const runtime = "nodejs"

/**
 * POST /api/postgres/test
 * Layered probe: DNS -> TCP -> Postgres (auth + queries), so firewall drops,
 * listener issues, pg_hba rejections and bad credentials are distinguishable.
 */
export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const stages: Stage[] = []
  const runner = getRunnerInfo()
  let current: StageName = "dns"
  let t = Date.now()

  try {
    const body = (await req.json()) as PostgresConnectionInput
    const { host, port } = getTarget(body)

    const address = await resolveHost(host)
    stages.push({ name: "dns", ok: true, ms: Date.now() - t, detail: `${host} -> ${address}` })

    current = "tcp"
    t = Date.now()
    await tcpProbe(address, port)
    stages.push({ name: "tcp", ok: true, ms: Date.now() - t, detail: `${address}:${port} open` })

    current = "postgres"
    t = Date.now()
    const data = await withPool(body, async (pool) => {
      const version = await pool.query(
        "SELECT version() as version, current_database() as db, current_user as \"user\", host(inet_client_addr()) as client_addr, (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) as ssl",
      )
      const extensions = await pool.query(
        `SELECT name, default_version, installed_version
         FROM pg_available_extensions
         WHERE name IN ('vector','pg_trgm','pgcrypto')
         ORDER BY name`,
      )
      const schemas = await pool.query(
        `SELECT nspname as schema
         FROM pg_namespace
         WHERE nspname NOT IN ('pg_catalog','information_schema','pg_toast')
           AND nspname NOT LIKE 'pg_temp_%'
           AND nspname NOT LIKE 'pg_toast_temp_%'
         ORDER BY nspname`,
      )
      const row = version.rows[0] as { version: string; db: string; user: string; client_addr: string | null; ssl: boolean | null }
      return {
        version: row.version,
        database: row.db,
        user: row.user,
        clientAddr: row.client_addr,
        ssl: row.ssl,
        extensions: extensions.rows,
        schemas: schemas.rows.map((r) => (r as { schema: string }).schema),
      }
    })
    stages.push({
      name: "postgres",
      ok: true,
      ms: Date.now() - t,
      detail: `authenticated as ${data.user}; server sees client ${data.clientAddr ?? "unknown"}`,
    })

    return Response.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      stages,
      runner,
      ...data,
    })
  } catch (err) {
    const error = describePgError(err)
    stages.push({ name: current, ok: false, ms: Date.now() - t, detail: error })
    return Response.json(
      {
        ok: false,
        error,
        failedStage: current,
        hint: hintFor(current, err),
        stages,
        runner,
        elapsedMs: Date.now() - startedAt,
      },
      { status: 400 },
    )
  }
}
