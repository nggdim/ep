"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { TestResult } from "@/components/connection-tester"
import { ResultDisplay } from "@/components/result-display"
import { Loader2, Play, Eye, EyeOff, Shield, Settings2, Save, ExternalLink, Server, Globe, Wifi } from "lucide-react"
import { getADFSCredentials, saveADFSCredentials, ADFSCredentials } from "@/lib/credential-store"

type Props = {
  onResult: (result: Omit<TestResult, "id" | "timestamp">) => void
}

type TokenExchangeMode = "server" | "client"
type ResponseType = "code" | "token" | "id_token" | "id_token token"

export function AdfsTester({ onResult }: Props) {
  const [serverUrl, setServerUrl] = useState("")
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [redirectUri, setRedirectUri] = useState("")
  const [resource, setResource] = useState("")
  const [scope, setScope] = useState("openid")
  const [tokenExchangeMode, setTokenExchangeMode] = useState<TokenExchangeMode>("server")
  const [responseType, setResponseType] = useState<ResponseType>("token")  // Default to implicit for easier testing
  const [showSecret, setShowSecret] = useState(false)
  const [generatedUrl, setGeneratedUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false)
  const [result, setResult] = useState<Omit<TestResult, "id" | "timestamp"> | null>(null)
  const [testingConnection, setTestingConnection] = useState(false)
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null)

  // Load stored credentials on mount
  useEffect(() => {
    const stored = getADFSCredentials()
    if (stored) {
      setServerUrl(stored.serverUrl)
      setClientId(stored.clientId)
      setClientSecret(stored.clientSecret)
      setRedirectUri(stored.redirectUri)
      setScope(stored.scope || "openid")
      setResource(stored.resource || "")
      setTokenExchangeMode(stored.tokenExchangeMode || "server")
      setResponseType(stored.responseType || "token")  // Default to implicit flow
      setHasStoredCredentials(true)
    } else {
      // Default redirect URI
      if (typeof window !== "undefined") {
        setRedirectUri(`${window.location.origin}/sso`)
      }
    }
  }, [])

  const handleTestConnection = async () => {
    if (!serverUrl.trim()) {
      const errorResult = {
        type: "api" as const,
        connectionString: serverUrl || "(empty)",
        status: "error" as const,
        message: "Server URL is required to test connection",
      }
      setResult(errorResult)
      onResult(errorResult)
      return
    }

    setTestingConnection(true)
    setResult(null)
    setMetadata(null)

    try {
      const response = await fetch("/api/adfs/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl: serverUrl.trim() }),
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        const errorResult = {
          type: "api" as const,
          connectionString: serverUrl,
          status: "error" as const,
          message: data.error || "Failed to fetch ADFS metadata",
          details: {
            errorCode: data.errorCode,
            hint: data.hint,
            details: data.details,
          },
        }
        setResult(errorResult)
        onResult(errorResult)
        return
      }

      // Success - we got metadata
      setMetadata(data)
      const successResult = {
        type: "api" as const,
        connectionString: serverUrl,
        status: "success" as const,
        message: "✅ Successfully connected to ADFS server",
        details: {
          issuer: data.issuer,
          authorization_endpoint: data.authorization_endpoint,
          token_endpoint: data.token_endpoint,
          scopes_supported: data.scopes_supported,
          response_types_supported: data.response_types_supported,
        },
      }
      setResult(successResult)
      onResult(successResult)
    } catch (err) {
      const errorResult = {
        type: "api" as const,
        connectionString: serverUrl,
        status: "error" as const,
        message: err instanceof Error ? err.message : "Network error",
      }
      setResult(errorResult)
      onResult(errorResult)
    } finally {
      setTestingConnection(false)
    }
  }

  const validateInputs = (): { valid: boolean; message: string } => {
    if (!serverUrl.trim()) {
      return { valid: false, message: "ADFS Server URL is required" }
    }

    try {
      new URL(serverUrl)
    } catch {
      return { valid: false, message: "Invalid Server URL format" }
    }

    if (!clientId.trim()) {
      return { valid: false, message: "Client ID is required" }
    }

    // Client secret is required for authorization code flow, optional for implicit
    if (responseType === "code" && !clientSecret.trim()) {
      return { valid: false, message: "Client Secret is required for Authorization Code flow" }
    }

    if (!redirectUri.trim()) {
      return { valid: false, message: "Redirect URI is required" }
    }

    try {
      new URL(redirectUri)
    } catch {
      return { valid: false, message: "Invalid Redirect URI format" }
    }

    return { valid: true, message: "Valid" }
  }

  const handleSaveCredentials = () => {
    const validation = validateInputs()
    if (!validation.valid) {
      const errorResult = {
        type: "api" as const,
        connectionString: serverUrl,
        status: "error" as const,
        message: validation.message,
      }
      setResult(errorResult)
      onResult(errorResult)
      return
    }

    setSaving(true)
    
    const credentials: ADFSCredentials = {
      serverUrl: serverUrl.trim().replace(/\/+$/, ""),
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      redirectUri: redirectUri.trim(),
      scope: scope.trim() || undefined,
      resource: resource.trim() || undefined,
      tokenExchangeMode,
      responseType,  // "code" or "token" (implicit)
    }
    
    saveADFSCredentials(credentials)
    setHasStoredCredentials(true)
    setSaved(true)
    setSaving(false)
    
    setTimeout(() => setSaved(false), 2000)

    const successResult = {
      type: "api" as const,
      connectionString: serverUrl,
      status: "success" as const,
      message: "ADFS credentials saved to localStorage",
      details: {
        serverUrl: credentials.serverUrl,
        clientId: credentials.clientId,
        redirectUri: credentials.redirectUri,
        resource: resource || "(none)",
      },
    }
    setResult(successResult)
    onResult(successResult)
  }

  const buildAuthorizationUrl = (): string => {
    const baseUrl = serverUrl.trim().replace(/\/+$/, "")
    const params = new URLSearchParams({
      response_type: responseType,  // "code" for auth code flow, "token" for implicit flow
      client_id: clientId.trim(),
      redirect_uri: redirectUri.trim(),
    })
    
    if (scope.trim()) {
      params.set("scope", scope.trim())
    }
    
    if (resource.trim()) {
      params.set("resource", resource.trim())
    }
    
    return `${baseUrl}/adfs/oauth2/authorize?${params.toString()}`
  }

  // Update generated URL when inputs change
  useEffect(() => {
    if (serverUrl && clientId && redirectUri) {
      setGeneratedUrl(buildAuthorizationUrl())
    } else {
      setGeneratedUrl("")
    }
  }, [serverUrl, clientId, redirectUri, scope, resource, responseType])

  const handleStartOAuthFlow = () => {
    const validation = validateInputs()
    if (!validation.valid) {
      const errorResult = {
        type: "api" as const,
        connectionString: serverUrl,
        status: "error" as const,
        message: validation.message,
      }
      setResult(errorResult)
      onResult(errorResult)
      return
    }

    // Clear any stale SSO state for a clean slate
    sessionStorage.removeItem("adfs_token_response")
    sessionStorage.removeItem("adfs_form_post_pending")
    
    // Save credentials first
    handleSaveCredentials()
    
    // Open authorization URL
    const authUrl = buildAuthorizationUrl()
    window.location.href = authUrl
  }

  const handleOpenInNewTab = () => {
    const validation = validateInputs()
    if (!validation.valid) {
      const errorResult = {
        type: "api" as const,
        connectionString: serverUrl,
        status: "error" as const,
        message: validation.message,
      }
      setResult(errorResult)
      onResult(errorResult)
      return
    }

    // Clear any stale SSO state for a clean slate
    sessionStorage.removeItem("adfs_token_response")
    sessionStorage.removeItem("adfs_form_post_pending")
    
    // Save credentials first
    handleSaveCredentials()
    
    // Open authorization URL in new tab
    const authUrl = buildAuthorizationUrl()
    window.open(authUrl, "_blank")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-4 w-4 text-blue-500" />
        <Label className="text-sm text-muted-foreground">ADFS OAuth2 Configuration</Label>
        {hasStoredCredentials && (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            <Settings2 className="h-3 w-3" />
            Stored
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Configure ADFS credentials for OAuth2 authentication. After saving, use the OAuth flow to test authentication.
      </p>

      <div className="border-t border-border pt-4">
        <div className="grid gap-4">
          {/* Server URL */}
          <div>
            <Label htmlFor="server-url" className="text-sm text-muted-foreground mb-1.5 block">
              ADFS Server URL
            </Label>
            <div className="flex gap-2">
              <Input
                id="server-url"
                placeholder="https://adfs.example.com"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className="bg-input font-mono text-sm flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={testingConnection || !serverUrl.trim()}
                className="shrink-0"
              >
                {testingConnection ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wifi className="h-4 w-4" />
                )}
                <span className="ml-1.5 hidden sm:inline">Test</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              The base URL of your ADFS server (without /adfs path). Click Test to verify connectivity.
            </p>
          </div>

          {/* Client ID */}
          <div>
            <Label htmlFor="client-id" className="text-sm text-muted-foreground mb-1.5 block">
              Client ID
            </Label>
            <Input
              id="client-id"
              placeholder="your-client-id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="bg-input font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The Client Identifier registered with ADFS
            </p>
          </div>

          {/* Client Secret */}
          <div>
            <Label htmlFor="client-secret" className="text-sm text-muted-foreground mb-1.5 block">
              Client Secret
            </Label>
            <div className="relative">
              <Input
                id="client-secret"
                type={showSecret ? "text" : "password"}
                placeholder="your-client-secret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                className="bg-input font-mono text-sm pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          {/* Redirect URI */}
          <div>
            <Label htmlFor="redirect-uri" className="text-sm text-muted-foreground mb-1.5 block">
              Redirect URI
            </Label>
            <Input
              id="redirect-uri"
              placeholder="http://localhost:3000/sso"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              className="bg-input font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Must match the redirect URI registered with ADFS
            </p>
          </div>

          {/* Response Type */}
          <div>
            <Label className="text-sm text-muted-foreground mb-1.5 block">
              Response Type (OAuth Flow)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={responseType === "code" ? "default" : "outline"}
                size="sm"
                onClick={() => setResponseType("code")}
              >
                <Server className="h-3.5 w-3.5 mr-1.5" />
                code
              </Button>
              <Button
                type="button"
                variant={responseType === "token" ? "default" : "outline"}
                size="sm"
                onClick={() => setResponseType("token")}
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                token
              </Button>
              <Button
                type="button"
                variant={responseType === "id_token" ? "default" : "outline"}
                size="sm"
                onClick={() => setResponseType("id_token")}
              >
                <Shield className="h-3.5 w-3.5 mr-1.5" />
                id_token
              </Button>
              <Button
                type="button"
                variant={responseType === "id_token token" ? "default" : "outline"}
                size="sm"
                onClick={() => setResponseType("id_token token")}
              >
                <Shield className="h-3.5 w-3.5 mr-1.5" />
                id_token token
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {responseType === "code" && "Auth Code: Returns code, then exchange for token (requires server/manual step)"}
              {responseType === "token" && "✅ Implicit: Access token returned directly in URL - automatic!"}
              {responseType === "id_token" && "✅ Implicit: ID token (JWT) returned directly in URL - automatic!"}
              {responseType === "id_token token" && "✅ Implicit: Both ID token and access token in URL - automatic!"}
            </p>
          </div>

          {/* Scope */}
          <div>
            <Label htmlFor="scope" className="text-sm text-muted-foreground mb-1.5 block">
              Scope (optional)
            </Label>
            <Input
              id="scope"
              placeholder="openid profile email"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="bg-input font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              OAuth scopes (e.g., openid, profile, email). Leave empty if not needed.
            </p>
          </div>

          {/* Resource (optional) */}
          <div>
            <Label htmlFor="resource" className="text-sm text-muted-foreground mb-1.5 block">
              Resource (optional)
            </Label>
            <Input
              id="resource"
              placeholder="urn:your-resource-identifier"
              value={resource}
              onChange={(e) => setResource(e.target.value)}
              className="bg-input font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The relying party identifier (if required by your ADFS configuration)
            </p>
          </div>

          {/* Generated URL Preview */}
          {generatedUrl && (
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">
                Authorization URL Preview
              </Label>
              <div className="p-2 rounded bg-accent/30 border border-border/50">
                <code className="text-xs break-all font-mono text-muted-foreground">
                  {generatedUrl}
                </code>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button 
          onClick={handleSaveCredentials} 
          disabled={saving}
          variant="outline"
          className="flex-1"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : saved ? (
            <Settings2 className="h-4 w-4 mr-2 text-green-500" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {saved ? "Saved!" : "Save Credentials"}
        </Button>
      </div>

      <div className="flex gap-2">
        <Button 
          onClick={handleStartOAuthFlow} 
          className="flex-1"
        >
          <Play className="h-4 w-4 mr-2" />
          Start OAuth Flow
        </Button>
        <Button 
          onClick={handleOpenInNewTab} 
          variant="outline"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Clicking &quot;Start OAuth Flow&quot; will redirect you to ADFS for authentication
      </p>

      {/* Result */}
      {result && <ResultDisplay result={result} />}

      {/* Metadata Details */}
      {metadata && (
        <div className="p-3 rounded-lg bg-accent/30 border space-y-2">
          <p className="text-xs font-medium flex items-center gap-2">
            <Wifi className="h-3.5 w-3.5 text-green-500" />
            ADFS Server Metadata
          </p>
          <div className="text-xs space-y-1.5">
            {"issuer" in metadata && metadata.issuer != null && (
              <div>
                <span className="text-muted-foreground">Issuer: </span>
                <code className="bg-background px-1 py-0.5 rounded text-[10px]">{String(metadata.issuer)}</code>
              </div>
            )}
            {"token_endpoint" in metadata && metadata.token_endpoint != null && (
              <div>
                <span className="text-muted-foreground">Token Endpoint: </span>
                <code className="bg-background px-1 py-0.5 rounded text-[10px] break-all">{String(metadata.token_endpoint)}</code>
              </div>
            )}
            {Array.isArray(metadata.response_types_supported) && (
              <div>
                <span className="text-muted-foreground">Response Types: </span>
                <code className="bg-background px-1 py-0.5 rounded text-[10px]">
                  {(metadata.response_types_supported as string[]).join(", ")}
                </code>
              </div>
            )}
            {Array.isArray(metadata.scopes_supported) && (
              <div>
                <span className="text-muted-foreground">Scopes: </span>
                <code className="bg-background px-1 py-0.5 rounded text-[10px]">
                  {(metadata.scopes_supported as string[]).join(", ")}
                </code>
              </div>
            )}
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              View full metadata
            </summary>
            <pre className="mt-2 p-2 rounded bg-background text-[10px] overflow-auto max-h-48">
              {JSON.stringify(metadata, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
