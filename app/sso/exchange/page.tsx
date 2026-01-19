"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { getADFSCredentials } from "@/lib/credential-store"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"

function ExchangeContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("Exchanging authorization code...")
  const [sentToOpener, setSentToOpener] = useState(false)

  useEffect(() => {
    const exchangeAndSendBack = async () => {
      const code = searchParams.get("code")
      
      if (!code) {
        setStatus("error")
        setMessage("No authorization code provided")
        return
      }

      const credentials = getADFSCredentials()
      if (!credentials) {
        setStatus("error")
        setMessage("No ADFS credentials found in localStorage")
        return
      }

      try {
        // Call our server-side API to exchange the code
        const response = await fetch("/api/adfs/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            serverUrl: credentials.serverUrl,
            redirectUri: credentials.redirectUri,
            scope: credentials.scope,
          }),
        })

        const data = await response.json()

        if (!response.ok || data.error) {
          setStatus("error")
          setMessage(data.error_description || data.error || "Token exchange failed")
          
          // Still try to send error back to opener
          if (window.opener) {
            window.opener.postMessage({
              type: "adfs-token-response",
              payload: data,
            }, window.location.origin)
            setSentToOpener(true)
          }
          return
        }

        // Success! Send token back to opener
        setStatus("success")
        setMessage("Token received! Sending to main window...")

        if (window.opener) {
          window.opener.postMessage({
            type: "adfs-token-response",
            payload: data,
          }, window.location.origin)
          setSentToOpener(true)
          
          // Auto-close after a short delay
          setTimeout(() => {
            window.close()
          }, 1500)
        } else {
          setMessage("Token received but no opener window found. Copy the token manually.")
        }

      } catch (err) {
        setStatus("error")
        setMessage(err instanceof Error ? err.message : "Network error during token exchange")
      }
    }

    exchangeAndSendBack()
  }, [searchParams])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-lg p-6 text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto" />
            <h1 className="text-lg font-semibold">Exchanging Code for Token</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
          </>
        )}
        
        {status === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <h1 className="text-lg font-semibold text-green-600">Success!</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            {sentToOpener && (
              <p className="text-xs text-muted-foreground">This window will close automatically...</p>
            )}
          </>
        )}
        
        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h1 className="text-lg font-semibold text-red-600">Error</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            {sentToOpener && (
              <p className="text-xs text-muted-foreground">Error details sent to main window.</p>
            )}
            <button
              onClick={() => window.close()}
              className="mt-4 px-4 py-2 rounded bg-accent text-sm hover:bg-accent/80"
            >
              Close Window
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ExchangeLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )
}

export default function ExchangePage() {
  return (
    <Suspense fallback={<ExchangeLoading />}>
      <ExchangeContent />
    </Suspense>
  )
}
