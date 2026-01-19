import { NextRequest } from "next/server"
import { Agent, fetch as undiciFetch } from "undici"

export async function POST(req: NextRequest) {
  try {
    const { code, clientId, clientSecret, serverUrl, redirectUri, scope } = await req.json()

    // Validate required fields
    if (!code) {
      return new Response(
        JSON.stringify({ error: "Authorization code is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: "Client ID and Client Secret are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!serverUrl) {
      return new Response(
        JSON.stringify({ error: "ADFS server URL is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!redirectUri) {
      return new Response(
        JSON.stringify({ error: "Redirect URI is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // Clean up the server URL
    let baseUrl = serverUrl.trim()
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, -1)
    }

    // ADFS token endpoint
    const tokenUrl = `${baseUrl}/adfs/oauth2/token`

    // Prepare the token request body (application/x-www-form-urlencoded)
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    })

    // Add scope if provided
    if (scope) {
      params.set("scope", scope)
    }

    // Create fetch options with SSL verification bypass (ADFS often uses self-signed certs)
    const fetchOptions: Parameters<typeof undiciFetch>[1] = {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      dispatcher: new Agent({
        connect: {
          rejectUnauthorized: false,
        },
      }),
    }

    console.log("=== ADFS Token Exchange ===")
    console.log("Token URL:", tokenUrl)
    console.log("Request params:", {
      grant_type: "authorization_code",
      code: code.substring(0, 20) + "...",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scope || "(none)",
    })
    
    const response = await undiciFetch(tokenUrl, fetchOptions)

    const responseText = await response.text()
    
    if (!response.ok) {
      console.error("ADFS token error:", responseText)
      return new Response(
        JSON.stringify({
          error: `ADFS token error: ${response.status} ${response.statusText}`,
          details: responseText,
        }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      )
    }

    // Parse the token response
    let tokenData
    try {
      tokenData = JSON.parse(responseText)
    } catch {
      return new Response(
        JSON.stringify({
          error: "Failed to parse token response",
          details: responseText,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    return new Response(JSON.stringify(tokenData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("ADFS token exchange error:", error)
    
    // Extract detailed error information
    const errorDetails: Record<string, unknown> = {
      message: error instanceof Error ? error.message : "Unknown error occurred",
      name: error instanceof Error ? error.name : "Error",
    }
    
    // Include cause if available (common for network errors)
    if (error instanceof Error && "cause" in error) {
      errorDetails.cause = String(error.cause)
    }
    
    // Include code if available (e.g., ECONNREFUSED, CERT_ERROR)
    if (error && typeof error === "object" && "code" in error) {
      errorDetails.code = (error as { code: string }).code
    }
    
    return new Response(
      JSON.stringify({
        error: `Network error: ${errorDetails.message}`,
        errorType: errorDetails.name,
        errorCode: errorDetails.code,
        errorCause: errorDetails.cause,
        hint: "This usually means the server cannot reach ADFS. Check: 1) ADFS URL is correct, 2) Server has network access to ADFS, 3) SSL certificates",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
