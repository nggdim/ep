"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { getADFSCredentials, ADFSCredentials } from "@/lib/credential-store"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Key, 
  Clock, 
  User, 
  Shield,
  Copy,
  Check,
  Home,
  AlertTriangle,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface TokenResponse {
  access_token?: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  id_token?: string
  error?: string
  error_description?: string
}

interface DecodedToken {
  header: Record<string, unknown>
  payload: Record<string, unknown>
}

function decodeJWT(token: string): DecodedToken | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    
    const header = JSON.parse(atob(parts[0]))
    const payload = JSON.parse(atob(parts[1]))
    
    return { header, payload }
  } catch {
    return null
  }
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

interface DebugInfo {
  code?: string
  credentials?: {
    serverUrl: string
    clientId: string
    hasSecret: boolean
    redirectUri: string
    scope?: string
  }
  requestBody?: Record<string, unknown>
  responseStatus?: number
  responseData?: unknown
  mode?: "server" | "client" | "no-cors" | "form" | "form-popup" | "popup-auto"
}

type ExchangeMode = "server" | "client" | "no-cors" | "form" | "form-popup" | "popup-auto"

function SSOContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "exchanging" | "success" | "error" | "no-code" | "no-credentials">("loading")
  const [tokenResponse, setTokenResponse] = useState<TokenResponse | null>(null)
  const [decodedToken, setDecodedToken] = useState<DecodedToken | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({})
  const [exchangeMode, setExchangeMode] = useState<ExchangeMode>("popup-auto")
  const [retryCode, setRetryCode] = useState<string | null>(null)
  const [retryCredentials, setRetryCredentials] = useState<ADFSCredentials | null>(null)
  const [manualTokenJson, setManualTokenJson] = useState("")
  const [manualTokenError, setManualTokenError] = useState("")
  const [waitingForPopup, setWaitingForPopup] = useState(false)
  const [urlDebugInfo, setUrlDebugInfo] = useState<{
    fullUrl?: string
    hash?: string
    search?: string
    hashParams?: Record<string, string>
  }>({})

  // Check for token in sessionStorage (from form POST redirect back)
  useEffect(() => {
    const storedToken = sessionStorage.getItem("adfs_token_response")
    if (storedToken) {
      sessionStorage.removeItem("adfs_token_response")
      try {
        const tokenData = JSON.parse(storedToken)
        
        if (tokenData.error) {
          setStatus("error")
          setErrorMessage(tokenData.error_description || tokenData.error)
          setTokenResponse(tokenData)
          return
        }
        
        if (tokenData.access_token) {
          setTokenResponse(tokenData)
          const decoded = decodeJWT(tokenData.access_token)
          setDecodedToken(decoded)
          setStatus("success")
          setDebugInfo(prev => ({
            ...prev,
            mode: "form",
            responseData: tokenData,
          }))
        }
      } catch {
        // Invalid JSON in storage, ignore
      }
    }
  }, [])

  // Listen for postMessage from popup window with token response
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Check if it's a token response
      if (event.data && typeof event.data === "object" && event.data.type === "adfs-token-response") {
        const tokenData = event.data.payload
        
        if (tokenData.error) {
          setStatus("error")
          setErrorMessage(tokenData.error_description || tokenData.error)
          setTokenResponse(tokenData)
          return
        }
        
        if (tokenData.access_token) {
          setTokenResponse(tokenData)
          const decoded = decodeJWT(tokenData.access_token)
          setDecodedToken(decoded)
          setStatus("success")
          setWaitingForPopup(false)
          setDebugInfo(prev => ({
            ...prev,
            mode: "form",
            responseData: tokenData,
          }))
        }
      }
    }
    
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  useEffect(() => {
    // Capture URL debug info for troubleshooting
    if (typeof window !== "undefined") {
      const hashParams: Record<string, string> = {}
      if (window.location.hash) {
        const params = new URLSearchParams(window.location.hash.substring(1))
        params.forEach((value, key) => {
          hashParams[key] = value.substring(0, 50) + (value.length > 50 ? "..." : "")
        })
      }
      setUrlDebugInfo({
        fullUrl: window.location.href,
        hash: window.location.hash || "(none)",
        search: window.location.search || "(none)",
        hashParams: Object.keys(hashParams).length > 0 ? hashParams : undefined,
      })
    }
    
    // First, check for implicit flow: token in URL hash (fragment)
    // Implicit flow returns: /sso#access_token=xxx&token_type=bearer&expires_in=3600
    if (typeof window !== "undefined" && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get("access_token")
      const hashError = hashParams.get("error")
      const hashErrorDescription = hashParams.get("error_description")
      
      if (hashError) {
        setStatus("error")
        setErrorMessage(hashErrorDescription || hashError)
        // Clear the hash
        window.history.replaceState(null, "", window.location.pathname + window.location.search)
        return
      }
      
      // Check for access_token OR id_token (some ADFS only support id_token)
      const idToken = hashParams.get("id_token")
      
      if (accessToken || idToken) {
        // Implicit flow success! Token is directly in the URL
        const tokenData: TokenResponse = {
          access_token: accessToken || undefined,
          token_type: hashParams.get("token_type") || "Bearer",
          expires_in: hashParams.get("expires_in") ? parseInt(hashParams.get("expires_in")!) : undefined,
          refresh_token: hashParams.get("refresh_token") || undefined,
          scope: hashParams.get("scope") || undefined,
          id_token: idToken || undefined,
        }
        
        setTokenResponse(tokenData)
        // Decode whichever token we have
        const tokenToDecode = accessToken || idToken
        if (tokenToDecode) {
          const decoded = decodeJWT(tokenToDecode)
          setDecodedToken(decoded)
        }
        setStatus("success")
        setDebugInfo({
          mode: undefined,
          responseData: { ...tokenData, source: "implicit_flow_url_hash" },
        })
        
        // Clear the hash for security (token shouldn't stay in URL)
        window.history.replaceState(null, "", window.location.pathname + window.location.search)
        return
      }
    }
    
    // Authorization Code flow: check for code in query params
    const code = searchParams.get("code")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    // Check for OAuth error from ADFS
    if (error) {
      setStatus("error")
      setErrorMessage(errorDescription || error)
      return
    }

    // Check if we have a code
    if (!code) {
      setStatus("no-code")
      return
    }

    // Get ADFS credentials from localStorage
    const credentials = getADFSCredentials()
    if (!credentials) {
      setStatus("no-credentials")
      return
    }

    // Save for potential retry with different mode
    setRetryCode(code)
    setRetryCredentials(credentials)
    
    // Exchange the code for a token
    exchangeCode(code, credentials, exchangeMode)
  }, [searchParams, exchangeMode])

  const exchangeCode = async (code: string, credentials: ADFSCredentials, mode: ExchangeMode) => {
    setStatus("exchanging")
    
    // Build debug info
    const credentialsDebug = {
      serverUrl: credentials.serverUrl,
      clientId: credentials.clientId,
      hasSecret: !!credentials.clientSecret,
      redirectUri: credentials.redirectUri,
      scope: credentials.scope,
    }
    
    setDebugInfo({
      code: code.substring(0, 50) + (code.length > 50 ? "..." : ""),
      credentials: credentialsDebug,
      mode,
    })
    
    if (mode === "client") {
      await exchangeCodeClient(code, credentials, false)
    } else if (mode === "no-cors") {
      await exchangeCodeClient(code, credentials, true)
    } else if (mode === "form") {
      exchangeCodeForm(code, credentials, false) // Same window
    } else if (mode === "form-popup") {
      exchangeCodeForm(code, credentials, true) // Popup
    } else if (mode === "popup-auto") {
      exchangeCodePopupAuto(code) // Auto popup via our exchange page
    } else {
      await exchangeCodeServer(code, credentials)
    }
  }

  // Server-side token exchange (via our API)
  const exchangeCodeServer = async (code: string, credentials: ADFSCredentials) => {
    const requestBody = {
      code,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      serverUrl: credentials.serverUrl,
      redirectUri: credentials.redirectUri,
      scope: credentials.scope,
    }
    
    try {
      const response = await fetch("/api/adfs/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()
      
      // Update debug info with response
      setDebugInfo(prev => ({
        ...prev,
        requestBody: { ...requestBody, clientSecret: "***hidden***" },
        responseStatus: response.status,
        responseData: data,
      }))

      if (!response.ok || data.error) {
        setStatus("error")
        setErrorMessage(data.error_description || data.error || data.details || "Failed to exchange code")
        setTokenResponse(data)
        return
      }

      setTokenResponse(data)
      
      // Try to decode the access token if it's a JWT
      if (data.access_token) {
        const decoded = decodeJWT(data.access_token)
        setDecodedToken(decoded)
      }
      
      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMessage(err instanceof Error ? err.message : "Failed to exchange code")
    }
  }

  // Client-side token exchange (direct to ADFS from browser)
  const exchangeCodeClient = async (code: string, credentials: ADFSCredentials, noCors = false) => {
    const tokenUrl = `${credentials.serverUrl}/adfs/oauth2/token`
    
    // Build form data (ADFS expects application/x-www-form-urlencoded)
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: credentials.redirectUri,
    })
    
    if (credentials.scope) {
      params.set("scope", credentials.scope)
    }
    
    const requestBody = {
      grant_type: "authorization_code",
      code: code.substring(0, 20) + "...",
      client_id: credentials.clientId,
      client_secret: "***hidden***",
      redirect_uri: credentials.redirectUri,
      scope: credentials.scope,
      mode: noCors ? "no-cors" : "cors",
    }
    
    try {
      const fetchOptions: RequestInit = {
        method: "POST",
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
      
      if (noCors) {
        fetchOptions.mode = "no-cors"
      }
      
      const response = await fetch(tokenUrl, fetchOptions)
      
      // no-cors mode returns opaque response - we can't read it
      if (noCors) {
        setDebugInfo(prev => ({
          ...prev,
          requestBody,
          responseStatus: 0,
          responseData: { 
            message: "no-cors mode: Request was sent but response is opaque (unreadable)",
            type: response.type,
            hint: "This proves the request reached ADFS. To get the token, you need CORS enabled on ADFS or server-side access.",
          },
        }))
        setStatus("error")
        setErrorMessage("no-cors test successful - request reached ADFS but response is opaque (browser security). Enable CORS on ADFS or fix server network access.")
        return
      }

      const responseText = await response.text()
      let data: Record<string, unknown>
      
      try {
        data = JSON.parse(responseText)
      } catch {
        data = { raw_response: responseText }
      }
      
      // Update debug info with response
      setDebugInfo(prev => ({
        ...prev,
        requestBody,
        responseStatus: response.status,
        responseData: data,
      }))

      if (!response.ok || data.error) {
        setStatus("error")
        setErrorMessage(String(data.error_description || data.error || "Failed to exchange code"))
        setTokenResponse(data as TokenResponse)
        return
      }

      setTokenResponse(data as TokenResponse)
      
      // Try to decode the access token if it's a JWT
      if (data.access_token) {
        const decoded = decodeJWT(String(data.access_token))
        setDecodedToken(decoded)
      }
      
      setStatus("success")
    } catch (err) {
      setStatus("error")
      const errorMsg = err instanceof Error ? err.message : "Failed to exchange code"
      setErrorMessage(`Client-side error: ${errorMsg}. This may be due to CORS - ADFS may not allow browser requests.`)
      setDebugInfo(prev => ({
        ...prev,
        requestBody,
        responseData: { error: errorMsg, hint: "CORS error - ADFS may not allow direct browser requests" },
      }))
    }
  }

  // Form-based token exchange (bypasses CORS by using form submit)
  const exchangeCodeForm = (code: string, credentials: ADFSCredentials, usePopup = false) => {
    const tokenUrl = `${credentials.serverUrl}/adfs/oauth2/token`
    
    // Update debug info
    setDebugInfo(prev => ({
      ...prev,
      mode: "form",
      requestBody: {
        grant_type: "authorization_code",
        code: code.substring(0, 20) + "...",
        client_id: credentials.clientId,
        client_secret: "***hidden***",
        redirect_uri: credentials.redirectUri,
        scope: credentials.scope,
      },
      responseData: { message: "Form will submit to ADFS - use the bookmarklet to send the token back" },
    }))
    
    // Create a form and submit it
    const form = document.createElement("form")
    form.method = "POST"
    form.action = tokenUrl
    
    if (usePopup) {
      form.target = "adfs_token_popup"
      window.open("about:blank", "adfs_token_popup", "width=600,height=400")
    }
    // If not popup, form submits in current window (default)
    
    const fields = {
      grant_type: "authorization_code",
      code: code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: credentials.redirectUri,
      scope: credentials.scope || "",
    }
    
    Object.entries(fields).forEach(([name, value]) => {
      if (value) {
        const input = document.createElement("input")
        input.type = "hidden"
        input.name = name
        input.value = value
        form.appendChild(input)
      }
    })
    
    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)
    
    if (usePopup) {
      setWaitingForPopup(true)
      setStatus("exchanging")
      setErrorMessage("")
    }
    // If same window, page will navigate away - no state to set
  }

  // Automatic popup exchange - opens our exchange page which calls server API
  const exchangeCodePopupAuto = (code: string) => {
    setDebugInfo(prev => ({
      ...prev,
      mode: "popup-auto",
      requestBody: { code: code.substring(0, 20) + "...", method: "Server-side via popup" },
      responseData: { message: "Opening popup to exchange code via server..." },
    }))
    
    // Open our exchange page in a popup - it will call our server API
    // and postMessage the result back
    const exchangeUrl = `/sso/exchange?code=${encodeURIComponent(code)}`
    const popup = window.open(exchangeUrl, "adfs_exchange_popup", "width=500,height=400,menubar=no,toolbar=no")
    
    if (popup) {
      setWaitingForPopup(true)
      setStatus("exchanging")
      setErrorMessage("")
      
      // The popup will postMessage back when done - handled by the existing message listener
    } else {
      setStatus("error")
      setErrorMessage("Failed to open popup. Please allow popups for this site.")
    }
  }
  
  // Generate bookmarklet code - stores in sessionStorage and redirects back
  const getBookmarkletCode = () => {
    const returnUrl = typeof window !== "undefined" ? `${window.location.origin}/sso` : "/sso"
    return `javascript:(function(){try{var t=document.body.innerText;JSON.parse(t);sessionStorage.setItem('adfs_token_response',t);window.location.href='${returnUrl}';}catch(e){alert('Error: '+e.message);}})();`
  }
  
  // Generate bookmarklet for popup mode (uses postMessage)
  const getPopupBookmarkletCode = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    return `javascript:(function(){try{var t=document.body.innerText;var d=JSON.parse(t);window.opener.postMessage({type:'adfs-token-response',payload:d},'${origin}');window.close();}catch(e){alert('Error: '+e.message);}})();`
  }

  // Retry with different mode
  const handleRetry = (mode: ExchangeMode) => {
    if (retryCode && retryCredentials) {
      setExchangeMode(mode)
      setStatus("loading")
      setErrorMessage("")
      setTokenResponse(null)
      setDecodedToken(null)
      setTimeout(() => {
        exchangeCode(retryCode, retryCredentials, mode)
      }, 100)
    }
  }

  const handleCopyToken = async () => {
    if (tokenResponse?.access_token) {
      await navigator.clipboard.writeText(tokenResponse.access_token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Handle manual token paste from Form POST result
  const resetState = () => {
    // Clear all state for a fresh start
    setStatus("loading")
    setTokenResponse(null)
    setDecodedToken(null)
    setErrorMessage("")
    setCopied(false)
    setDebugInfo({})
    setRetryCode(null)
    setRetryCredentials(null)
    setManualTokenJson("")
    setManualTokenError("")
    setWaitingForPopup(false)
    setUrlDebugInfo({})
    
    // Clear sessionStorage
    sessionStorage.removeItem("adfs_token_response")
    sessionStorage.removeItem("adfs_form_post_pending")
    
    // Clear URL hash and query params
    window.history.replaceState(null, "", window.location.pathname)
    
    // Set to no-code after reset
    setTimeout(() => setStatus("no-code"), 100)
  }

  const handleManualTokenPaste = () => {
    setManualTokenError("")
    
    if (!manualTokenJson.trim()) {
      setManualTokenError("Please paste the JSON response from ADFS")
      return
    }
    
    try {
      const data = JSON.parse(manualTokenJson.trim())
      
      if (data.error) {
        setManualTokenError(`ADFS returned an error: ${data.error_description || data.error}`)
        return
      }
      
      if (!data.access_token) {
        setManualTokenError("No access_token found in the JSON response")
        return
      }
      
      // Success! Set the token response
      setTokenResponse(data)
      
      // Try to decode the access token if it's a JWT
      if (data.access_token) {
        const decoded = decodeJWT(data.access_token)
        setDecodedToken(decoded)
      }
      
      setStatus("success")
      setManualTokenJson("")
      setDebugInfo(prev => ({
        ...prev,
        mode: "form",
        responseData: data,
      }))
    } catch {
      setManualTokenError("Invalid JSON - please paste the complete JSON response from ADFS")
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold">ADFS SSO Callback</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={resetState}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href="/">
                <Home className="h-4 w-4 mr-2" />
                Home
              </a>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        {/* Status Card */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {/* Status Header */}
          <div className={cn(
            "px-6 py-4 border-b",
            status === "success" && "bg-green-500/10",
            status === "error" && "bg-red-500/10",
            (status === "loading" || status === "exchanging") && "bg-blue-500/10",
            (status === "no-code" || status === "no-credentials") && "bg-amber-500/10"
          )}>
            <div className="flex items-center gap-3">
              {(status === "loading" || status === "exchanging") && (
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              )}
              {status === "success" && (
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              )}
              {status === "error" && (
                <XCircle className="h-6 w-6 text-red-500" />
              )}
              {(status === "no-code" || status === "no-credentials") && (
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              )}
              
              <div>
                <h1 className="font-semibold text-lg">
                  {status === "loading" && "Initializing..."}
                  {status === "exchanging" && !waitingForPopup && "Exchanging Authorization Code..."}
                  {status === "exchanging" && waitingForPopup && "Waiting for Token from Popup..."}
                  {status === "success" && "Authentication Successful"}
                  {status === "error" && "Authentication Failed"}
                  {status === "no-code" && "Waiting for ADFS Response"}
                  {status === "no-credentials" && "ADFS Credentials Not Configured"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {status === "loading" && "Please wait..."}
                  {status === "exchanging" && !waitingForPopup && "Contacting ADFS server to exchange code for token..."}
                  {status === "exchanging" && waitingForPopup && "Complete the steps below to receive the token"}
                  {status === "success" && "Token received successfully"}
                  {status === "error" && errorMessage}
                  {status === "no-code" && "Start the OAuth flow from Settings to authenticate"}
                  {status === "no-credentials" && "Please configure ADFS credentials in settings first"}
                </p>
              </div>
            </div>
          </div>

          {/* Waiting for Popup - Bookmarklet Instructions */}
          {status === "exchanging" && waitingForPopup && (
            <div className="p-6 space-y-4">
              <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                <h3 className="font-medium text-sm mb-3">Steps to complete token exchange:</h3>
                <ol className="text-sm space-y-3 list-decimal list-inside">
                  <li>A popup window opened with the ADFS response (JSON)</li>
                  <li>
                    <span className="font-medium">Drag this button to your bookmarks bar:</span>
                    <a
                      href={getPopupBookmarkletCode()}
                      className="ml-2 inline-flex items-center gap-1 px-3 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
                      onClick={(e) => {
                        e.preventDefault()
                        alert("Drag this button to your bookmarks bar, then click it in the ADFS popup window!")
                      }}
                    >
                      📤 Send Token to SSO
                    </a>
                  </li>
                  <li>Go to the popup window and click the bookmarklet</li>
                  <li>The token will automatically appear here!</li>
                </ol>
              </div>
              
              <div className="text-xs text-muted-foreground">
                <p className="mb-2">Or run this in the popup&apos;s browser console (F12):</p>
                <pre className="p-2 rounded bg-accent/50 overflow-x-auto text-[10px]">
                  {`window.opener.postMessage({type:'adfs-token-response',payload:JSON.parse(document.body.innerText)},'*');window.close();`}
                </pre>
              </div>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setWaitingForPopup(false)
                  setStatus("error")
                  setErrorMessage("Cancelled waiting for popup")
                }}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Token Details */}
          {status === "success" && tokenResponse && (
            <div className="p-6 space-y-6">
              {/* Quick Info */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-accent/50">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Key className="h-3 w-3" />
                    Token Type
                  </div>
                  <div className="font-medium">{tokenResponse.token_type || "Bearer"}</div>
                </div>
                
                {tokenResponse.expires_in && (
                  <div className="p-3 rounded-lg bg-accent/50">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Clock className="h-3 w-3" />
                      Expires In
                    </div>
                    <div className="font-medium">{tokenResponse.expires_in} seconds</div>
                  </div>
                )}
                
                {tokenResponse.scope && (
                  <div className="p-3 rounded-lg bg-accent/50">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Shield className="h-3 w-3" />
                      Scope
                    </div>
                    <div className="font-medium text-xs">{tokenResponse.scope}</div>
                  </div>
                )}
              </div>

              {/* Access Token */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Access Token
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyToken}
                    className="h-7"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 mr-1 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 mr-1" />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <div className="p-3 rounded-lg bg-accent/30 border">
                  <code className="text-xs break-all font-mono">
                    {tokenResponse.access_token}
                  </code>
                </div>
              </div>

              {/* Decoded Token (if JWT) */}
              {decodedToken && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Decoded Token Claims
                  </h3>
                  
                  <div className="p-4 rounded-lg bg-accent/30 border space-y-3">
                    {"sub" in decodedToken.payload && decodedToken.payload.sub != null && (
                      <div>
                        <span className="text-xs text-muted-foreground">Subject (sub):</span>
                        <p className="font-mono text-sm">{String(decodedToken.payload.sub)}</p>
                      </div>
                    )}
                    {"upn" in decodedToken.payload && decodedToken.payload.upn != null && (
                      <div>
                        <span className="text-xs text-muted-foreground">UPN:</span>
                        <p className="font-mono text-sm">{String(decodedToken.payload.upn)}</p>
                      </div>
                    )}
                    {"unique_name" in decodedToken.payload && decodedToken.payload.unique_name != null && (
                      <div>
                        <span className="text-xs text-muted-foreground">Unique Name:</span>
                        <p className="font-mono text-sm">{String(decodedToken.payload.unique_name)}</p>
                      </div>
                    )}
                    {"iat" in decodedToken.payload && typeof decodedToken.payload.iat === "number" && (
                      <div>
                        <span className="text-xs text-muted-foreground">Issued At:</span>
                        <p className="font-mono text-sm">{formatTimestamp(decodedToken.payload.iat)}</p>
                      </div>
                    )}
                    {"exp" in decodedToken.payload && typeof decodedToken.payload.exp === "number" && (
                      <div>
                        <span className="text-xs text-muted-foreground">Expires:</span>
                        <p className="font-mono text-sm">{formatTimestamp(decodedToken.payload.exp)}</p>
                      </div>
                    )}
                    
                    <details className="mt-4">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                        View full payload
                      </summary>
                      <pre className="mt-2 p-3 rounded bg-background text-xs overflow-auto max-h-64">
                        {JSON.stringify(decodedToken.payload, null, 2)}
                      </pre>
                    </details>
                  </div>
                </div>
              )}

              {/* Refresh Token */}
              {tokenResponse.refresh_token && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Refresh Token</label>
                  <div className="p-3 rounded-lg bg-accent/30 border">
                    <code className="text-xs break-all font-mono">
                      {tokenResponse.refresh_token}
                    </code>
                  </div>
                </div>
              )}

              {/* ID Token */}
              {tokenResponse.id_token && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">ID Token</label>
                  <div className="p-3 rounded-lg bg-accent/30 border">
                    <code className="text-xs break-all font-mono">
                      {tokenResponse.id_token}
                    </code>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Details and Retry Options */}
          {status === "error" && (
            <div className="p-6 space-y-4">
              {/* Retry with different mode */}
              {retryCode && retryCredentials && (
                <div className="p-4 rounded-lg bg-accent/30 border">
                  <p className="text-sm font-medium mb-2">Try a different exchange mode:</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={exchangeMode === "server" ? "secondary" : "default"}
                      size="sm"
                      onClick={() => handleRetry("server")}
                      disabled={exchangeMode === "server"}
                    >
                      Server-side
                    </Button>
                    <Button
                      variant={exchangeMode === "client" ? "secondary" : "default"}
                      size="sm"
                      onClick={() => handleRetry("client")}
                      disabled={exchangeMode === "client"}
                    >
                      Client-side
                    </Button>
                    <Button
                      variant={exchangeMode === "no-cors" ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => handleRetry("no-cors")}
                      disabled={exchangeMode === "no-cors"}
                    >
                      No-CORS Test
                    </Button>
                    <Button
                      variant={exchangeMode === "form" ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => handleRetry("form")}
                    >
                      Form POST
                    </Button>
                    <Button
                      variant={exchangeMode === "form-popup" ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => handleRetry("form-popup")}
                    >
                      Form (popup)
                    </Button>
                    <Button
                      variant={exchangeMode === "popup-auto" ? "secondary" : "default"}
                      size="sm"
                      onClick={() => handleRetry("popup-auto")}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      ✨ Auto Popup
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {exchangeMode === "server" && "Server mode failed - server may not have network access to ADFS."}
                    {exchangeMode === "client" && "Client mode failed - ADFS may not allow CORS."}
                    {exchangeMode === "no-cors" && "No-CORS proves connectivity but can't read the response."}
                    {exchangeMode === "form" && "Form POST in same window - use bookmarklet to return with token."}
                    {exchangeMode === "form-popup" && "Form POST in popup - use bookmarklet to send token back."}
                    {exchangeMode === "popup-auto" && "✅ Auto Popup - exchanges via server in popup, auto-returns result!"}
                  </p>
                  
                  {/* Instructions for Form POST modes */}
                  <div className="mt-3 p-3 rounded bg-blue-500/10 border border-blue-500/30 space-y-3">
                    <p className="text-xs font-medium">After clicking Form POST, on the ADFS JSON page:</p>
                    
                    {/* Option 1: Console command */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Option 1: Open console (F12) and paste this:</p>
                      <div className="flex gap-2">
                        <code className="flex-1 text-[10px] p-1.5 rounded bg-background border overflow-x-auto">
                          sessionStorage.setItem(&apos;adfs_token_response&apos;,document.body.innerText);history.back();
                        </code>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs shrink-0"
                          onClick={() => {
                            navigator.clipboard.writeText("sessionStorage.setItem('adfs_token_response',document.body.innerText);history.back();")
                            alert("Copied! Now click Form POST, then paste this in the browser console (F12)")
                          }}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                    </div>
                    
                    {/* Option 2: Manual copy */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Option 2: Copy the JSON (Ctrl+A, Ctrl+C), go back, and paste below</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Manual Token Paste - for Form POST results */}
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Copy className="h-4 w-4" />
                  Paste Token Response (from Form POST)
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  If you used Form POST, copy the JSON response from the new tab and paste it here:
                </p>
                <textarea
                  className="w-full h-24 p-2 text-xs font-mono bg-background border rounded resize-none"
                  placeholder='{"access_token": "eyJ...", "token_type": "Bearer", ...}'
                  value={manualTokenJson}
                  onChange={(e) => setManualTokenJson(e.target.value)}
                />
                {manualTokenError && (
                  <p className="text-xs text-destructive mt-1">{manualTokenError}</p>
                )}
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={handleManualTokenPaste}
                  disabled={!manualTokenJson.trim()}
                >
                  Parse &amp; Display Token
                </Button>
              </div>
              
              {tokenResponse && (
                <details>
                  <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                    View error details
                  </summary>
                  <pre className="mt-2 p-3 rounded bg-accent/30 text-xs overflow-auto">
                    {JSON.stringify(tokenResponse, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* Instructions for no-code or no-credentials */}
          {(status === "no-code" || status === "no-credentials") && (
            <div className="p-6 space-y-4">
              <div className="text-sm text-muted-foreground space-y-2">
                {status === "no-code" && (
                  <>
                    <p>This page is the OAuth callback endpoint. To test ADFS authentication:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-2">
                      <li>Configure ADFS credentials in the application settings</li>
                      <li>Navigate to your ADFS authorization URL</li>
                      <li>After authentication, ADFS will redirect here with the code or token</li>
                    </ol>
                  </>
                )}
                {status === "no-credentials" && (
                  <>
                    <p>ADFS credentials must be configured before using SSO.</p>
                    <p className="text-xs mt-2">
                      Required: Server URL, Client ID, Client Secret, and Redirect URI
                    </p>
                  </>
                )}
              </div>
              
              {/* URL Debug Info */}
              {status === "no-code" && urlDebugInfo.fullUrl && (
                <div className="p-4 rounded-lg bg-accent/30 border space-y-3">
                  <h3 className="text-sm font-medium">URL Debug Info</h3>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Full URL: </span>
                      <code className="break-all bg-background px-1 py-0.5 rounded">{urlDebugInfo.fullUrl}</code>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Hash: </span>
                      <code className="break-all bg-background px-1 py-0.5 rounded">{urlDebugInfo.hash}</code>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Query: </span>
                      <code className="break-all bg-background px-1 py-0.5 rounded">{urlDebugInfo.search}</code>
                    </div>
                    {urlDebugInfo.hashParams && (
                      <div>
                        <span className="text-muted-foreground">Hash Params: </span>
                        <pre className="mt-1 p-2 bg-background rounded text-xs overflow-auto">
                          {JSON.stringify(urlDebugInfo.hashParams, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 If you see a code or access_token in the URL above but the page shows this message, 
                    please share the URL format so we can fix parsing.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Debug Panel */}
        {Object.keys(debugInfo).length > 0 && (
          <div className="mt-6 rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="px-6 py-3 border-b bg-amber-500/10">
              <h2 className="font-medium text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Debug Information
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {debugInfo.code && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-1">Authorization Code</h3>
                  <code className="text-xs bg-accent/30 px-2 py-1 rounded block overflow-auto">
                    {debugInfo.code}
                  </code>
                </div>
              )}
              
              {debugInfo.credentials && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-1">Credentials from localStorage</h3>
                  <pre className="text-xs bg-accent/30 p-2 rounded overflow-auto">
{JSON.stringify(debugInfo.credentials, null, 2)}
                  </pre>
                </div>
              )}
              
              {debugInfo.requestBody && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-1">Request Body Sent to /api/adfs/token</h3>
                  <pre className="text-xs bg-accent/30 p-2 rounded overflow-auto">
{JSON.stringify(debugInfo.requestBody, null, 2)}
                  </pre>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Note: The API adds <code className="bg-accent px-1 rounded">grant_type: &quot;authorization_code&quot;</code> when calling ADFS
                  </p>
                </div>
              )}
              
              {debugInfo.responseStatus !== undefined && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-1">Response Status</h3>
                  <code className={cn(
                    "text-xs px-2 py-1 rounded",
                    debugInfo.responseStatus >= 200 && debugInfo.responseStatus < 300 
                      ? "bg-green-500/20 text-green-600" 
                      : "bg-red-500/20 text-red-600"
                  )}>
                    {debugInfo.responseStatus}
                  </code>
                </div>
              )}
              
              {debugInfo.responseData !== undefined && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-1">Response Data</h3>
                  <pre className="text-xs bg-accent/30 p-2 rounded overflow-auto max-h-64">
{JSON.stringify(debugInfo.responseData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function SSOLoading() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold">ADFS SSO Callback</span>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </main>
    </div>
  )
}

export default function SSOPage() {
  return (
    <Suspense fallback={<SSOLoading />}>
      <SSOContent />
    </Suspense>
  )
}
