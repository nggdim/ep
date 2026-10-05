import { readFileSync } from "node:fs"
import { join } from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function packageVersion(): string | undefined {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version
  } catch {
    return undefined
  }
}

/** GET /api/version - APP_VERSION is the deployed image tag; GIT_SHA/BUILD_TIME are baked at image build. */
export async function GET() {
  return Response.json({
    version: process.env.APP_VERSION || packageVersion() || "dev",
    commit: process.env.GIT_SHA || undefined,
    builtAt: process.env.BUILD_TIME || undefined,
    env: process.env.ENV_NAME || process.env.NODE_ENV,
  })
}
