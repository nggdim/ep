"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type VersionInfo = { version: string; commit?: string; builtAt?: string; env?: string }

export function VersionBadge({ className }: { className?: string }) {
  const [info, setInfo] = useState<VersionInfo | null>(null)

  useEffect(() => {
    fetch("/api/version", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])

  if (!info) return null

  const title = [
    `Version: ${info.version}`,
    info.commit && `Commit: ${info.commit}`,
    info.builtAt && `Built: ${info.builtAt}`,
    info.env && `Env: ${info.env}`,
  ]
    .filter(Boolean)
    .join("\n")

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground",
        className,
      )}
    >
      {info.version}
      {info.commit && <span className="opacity-60">@{info.commit.slice(0, 7)}</span>}
    </span>
  )
}
