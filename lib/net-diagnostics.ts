import { lookup } from "node:dns/promises"
import { isIP, Socket } from "node:net"
import { hostname, networkInterfaces } from "node:os"

export type StageName = "dns" | "tcp" | "postgres"

export interface Stage {
  name: StageName
  ok: boolean
  ms: number
  detail?: string
}

export interface RunnerInfo {
  hostname: string
  podName?: string
  podIp?: string
  nodeName?: string
  nodeIp?: string
  interfaces: { name: string; address: string }[]
  defaultTarget?: { host: string; port: number }
}

/** Identity of the process running the probes (populated by the k8s Downward API in prod). */
export function getRunnerInfo(): RunnerInfo {
  const interfaces = Object.entries(networkInterfaces()).flatMap(([name, addrs]) =>
    (addrs ?? []).filter((a) => a.family === "IPv4" && !a.internal).map((a) => ({ name, address: a.address })),
  )
  const host = process.env.DB_PROBE_HOST?.trim()
  return {
    hostname: hostname(),
    podName: process.env.POD_NAME,
    podIp: process.env.POD_IP,
    nodeName: process.env.NODE_NAME,
    nodeIp: process.env.NODE_IP,
    interfaces,
    defaultTarget: host ? { host, port: Number(process.env.DB_PROBE_PORT) || 5432 } : undefined,
  }
}

export async function resolveHost(host: string): Promise<string> {
  return isIP(host) ? host : (await lookup(host)).address
}

/** Plain TCP connect, isolating network/firewall reachability from application auth. */
export function tcpProbe(host: string, port: number, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    const fail = (err: Error) => {
      socket.destroy()
      reject(err)
    }
    socket.setTimeout(timeoutMs)
    socket.once("connect", () => {
      socket.end()
      resolve()
    })
    socket.once("timeout", () =>
      fail(Object.assign(new Error(`TCP connect to ${host}:${port} timed out after ${timeoutMs}ms`), { code: "ETIMEDOUT" })),
    )
    socket.once("error", fail)
    socket.connect(port, host)
  })
}

// Maps low-level failures to the most likely cause in a k8s -> firewalled VM setup.
export function hintFor(stage: StageName, err: unknown): string | undefined {
  const code = (err as { code?: string })?.code
  const msg = err instanceof Error ? err.message : ""
  if (stage === "dns") {
    return "Hostname not resolvable from this pod. Use the target's IP or a FQDN resolvable by cluster DNS."
  }
  if (stage === "tcp") {
    switch (code) {
      case "ETIMEDOUT":
        return "Packets silently dropped: a network firewall rule does not cover this source. Check that the node running this pod is in the rule's source group, and that the VM's Windows Firewall rule (07-network.ps1) allows this node's IP."
      case "ECONNREFUSED":
        return "Host reachable but port refused: the service is not listening on the network (for Postgres: 07-network.ps1 not applied / service down) or wrong port."
      case "EHOSTUNREACH":
      case "ENETUNREACH":
        return "No route from this node to the target host. Check routing / network segment."
    }
    return undefined
  }
  switch (code) {
    case "28000":
      return "Network path is OK, but pg_hba.conf rejects this source IP/user/db. The DB sees the k8s NODE IP (SNAT), not the pod IP - add it via 07-network.ps1 -AllowedCidr."
    case "28P01":
      return "Wrong password for this role."
    case "3D000":
      return "Database does not exist on this server."
  }
  if (/does not support SSL/i.test(msg)) return "Server has no TLS configured: set TLS to 'Disable', or run 04-ssl.ps1 on the VM."
  if (/self[- ]signed|unable to verify|certificate/i.test(msg)) {
    return "TLS certificate not trusted (self-signed / internal CA): use 'TLS, no cert verification' or mount the CA."
  }
  return undefined
}
