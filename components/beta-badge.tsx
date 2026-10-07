import { cn } from "@/lib/utils"

export function BetaBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      beta
    </span>
  )
}
