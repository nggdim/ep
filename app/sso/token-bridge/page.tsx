"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { Loader2, CheckCircle2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"

function TokenBridgeContent() {
  const searchParams = useSearchParams()
  const [tokenJson, setTokenJson] = useState<string>("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string>("")

  useEffect(() => {
    // Get token from URL hash (fragment)
    const hash = window.location.hash
    if (hash && hash.startsWith("#token=")) {
      try {
        const encoded = hash.substring(7) // Remove "#token="
        const decoded = decodeURIComponent(encoded)
        setTokenJson(decoded)
      } catch (e) {
        setError("Failed to decode token data")
      }
    }
  }, [])

  const sendToOpener = () => {
    if (!tokenJson) return
    
    try {
      const tokenData = JSON.parse(tokenJson)
      
      // Try to send to opener window
      if (window.opener) {
        window.opener.postMessage({
          type: "adfs-token-response",
          payload: tokenData
        }, "*")
        setSent(true)
        
        // Close this window after a short delay
        setTimeout(() => {
          window.close()
        }, 1500)
      } else {
        setError("No opener window found. Please copy the token manually.")
      }
    } catch {
      setError("Invalid JSON token data")
    }
  }

  // Auto-send if we have data and opener
  useEffect(() => {
    if (tokenJson && window.opener && !sent) {
      sendToOpener()
    }
  }, [tokenJson, sent])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-xl border bg-card shadow-lg p-6 text-center">
        {!tokenJson && !error && (
          <>
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <h1 className="text-lg font-semibold mb-2">Waiting for Token...</h1>
            <p className="text-sm text-muted-foreground">
              If you see the ADFS JSON response, click the bookmarklet to send it here.
            </p>
          </>
        )}
        
        {tokenJson && !sent && (
          <>
            <Send className="h-8 w-8 mx-auto mb-4 text-primary" />
            <h1 className="text-lg font-semibold mb-2">Token Received!</h1>
            <p className="text-sm text-muted-foreground mb-4">
              Click below to send the token to the SSO page.
            </p>
            <Button onClick={sendToOpener}>
              Send to SSO Page
            </Button>
          </>
        )}
        
        {sent && (
          <>
            <CheckCircle2 className="h-8 w-8 mx-auto mb-4 text-green-500" />
            <h1 className="text-lg font-semibold mb-2">Token Sent!</h1>
            <p className="text-sm text-muted-foreground">
              This window will close automatically...
            </p>
          </>
        )}
        
        {error && (
          <>
            <h1 className="text-lg font-semibold mb-2 text-destructive">Error</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            {tokenJson && (
              <pre className="mt-4 p-2 bg-accent/30 rounded text-xs text-left overflow-auto max-h-48">
                {tokenJson}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function TokenBridgePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <TokenBridgeContent />
    </Suspense>
  )
}
