import { NextRequest } from "next/server"
import { Agent, fetch as undiciFetch } from "undici"

export async function POST(req: NextRequest) {
  try {
    const { serverUrl } = await req.json()

    if (!serverUrl) {
      return new Response(
        JSON.stringify({ error: "Server URL is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // Normalize the URL
    let baseUrl = serverUrl.trim()
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, -1)
    }

    const metadataUrl = `${baseUrl}/adfs/.well-known/openid-configuration`

    console.log("Fetching ADFS metadata from:", metadataUrl)

    const response = await undiciFetch(metadataUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      dispatcher: new Agent({
        connect: {
          rejectUnauthorized: false, // Allow self-signed certs
        },
      }),
    })

    const responseText = await response.text()

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `ADFS returned ${response.status} ${response.statusText}`,
          details: responseText,
        }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      )
    }

    let metadata
    try {
      metadata = JSON.parse(responseText)
    } catch {
      return new Response(
        JSON.stringify({
          error: "Failed to parse metadata response as JSON",
          details: responseText.substring(0, 500),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    return new Response(JSON.stringify(metadata), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error: unknown) {
    console.error("ADFS metadata fetch error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const errorCode = (error as { code?: string })?.code
    
    return new Response(
      JSON.stringify({
        error: errorMessage,
        errorCode: errorCode,
        hint: errorCode === "ENOTFOUND" 
          ? "Server hostname not found - check the URL"
          : errorCode === "ECONNREFUSED"
          ? "Connection refused - server may be down or firewall blocking"
          : errorCode === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
          ? "SSL certificate issue - server may use self-signed cert"
          : "Network error connecting to ADFS server",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
