import { FloatingWidget } from "@/components/floating-widget"

export default function Page() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-background">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Gradient orbs */}
        <div className="absolute top-1/3 -left-48 w-[500px] h-[500px] bg-primary/6 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 -right-48 w-[400px] h-[400px] bg-primary/4 rounded-full blur-3xl" />
        
        {/* Grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: '80px 80px'
          }}
        />
      </div>

      {/* Content */}
      <div className="relative h-full flex flex-col items-center justify-center px-6">
        <div className="text-center max-w-2xl">
          {/* Logo */}
          <div className="mb-8">
            <h1 className="text-6xl sm:text-7xl font-light tracking-tighter text-foreground">
              <span className="font-semibold">ep</span>
              <span className="text-primary">.</span>
            </h1>
            <p className="text-sm text-muted-foreground/70 mt-2 tracking-wide uppercase">
              endpoint probe
            </p>
          </div>

          {/* Tagline */}
          <p className="text-lg sm:text-xl text-muted-foreground mb-8 leading-relaxed">
            Test your API endpoints, JDBC, ODBC, and OpenAI connections
            <br className="hidden sm:block" />
            <span className="text-foreground/80">securely and instantly.</span>
          </p>

          {/* Features */}
          <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground/60">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/30 border border-border/30">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
              Zero persistence
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/30 border border-border/30">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
              Client-side secure
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/30 border border-border/30">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
              Open source
            </div>
          </div>

          {/* CTA hint */}
          <div className="mt-12 flex items-center justify-center gap-2 text-sm text-muted-foreground/50">
            <span>Click the</span>
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/20 text-primary">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </span>
            <span>button to get started</span>
          </div>
        </div>
      </div>

      {/* Floating Widget */}
      <FloatingWidget />
    </main>
  )
}
