"use client"

import * as React from "react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"
import { Check } from "lucide-react"

export function Queue({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-border/60 bg-card/20", className)} {...props} />
}

export function QueueList({ className, ...props }: React.ComponentProps<typeof ScrollArea>) {
  return <ScrollArea className={cn("max-h-48", className)} {...props} />
}

export function QueueItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-md border border-border/40 bg-background/50 px-3 py-2",
        className
      )}
      {...props}
    />
  )
}

export function QueueItemIndicator({
  status,
}: {
  status: "pending" | "running" | "completed" | "error"
}) {
  if (status === "running") return <Spinner className="h-3.5 w-3.5" />
  if (status === "completed") {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-foreground/30 bg-background">
        <Check className="h-3 w-3 text-foreground" />
      </span>
    )
  }

  return (
    <span
      className={cn(
        "h-2.5 w-2.5 rounded-full",
        status === "error" && "bg-destructive",
        status === "pending" && "bg-muted-foreground/40"
      )}
    />
  )
}

export function QueueItemContent({
  children,
  status,
}: {
  children: React.ReactNode
  status: "pending" | "running" | "completed" | "error"
}) {
  return (
    <span
      className={cn(
        "text-sm",
        status === "pending" && "text-muted-foreground",
        status === "error" && "text-destructive"
      )}
    >
      {children}
    </span>
  )
}
