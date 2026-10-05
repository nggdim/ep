import { getRunnerInfo } from "@/lib/net-diagnostics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/network/whoami - pod/node identity, i.e. the source the firewall sees. */
export async function GET() {
  return Response.json(getRunnerInfo())
}
