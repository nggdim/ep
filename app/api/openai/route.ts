import { Agent, fetch as undiciFetch } from "undici"

interface OpenAIResponse {
  choices?: Array<{
    message?: { content?: string }
    finish_reason?: string
  }>
  usage?: unknown
  error?: { message?: string }
  message?: string
}

function resolveChatCompletionsUrl(baseUrl: string, urlMode?: "base" | "endpoint") {
  const normalized = baseUrl.trim().replace(/\/+$/, "")
  if (urlMode === "endpoint") {
    return normalized
  }

  let normalizedBase = normalized
  if (!normalizedBase.endsWith("/v1")) {
    normalizedBase = `${normalizedBase}/v1`
  }

  return `${normalizedBase}/chat/completions`
}

export async function POST(req: Request) {
  try {
    const { baseUrl, apiKey, model, messages, temperature, maxTokens, skipSslVerify, urlMode } = await req.json()

    if (!baseUrl || !apiKey) {
      return new Response(JSON.stringify({ error: "Base URL and API Key are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (!model) {
      return new Response(JSON.stringify({ error: "Model is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Build request body following OpenAI API format
    const requestBody = {
      model,
      messages: messages || [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say hello in one sentence." },
      ],
      temperature: temperature ?? 0.1,
      max_tokens: maxTokens ?? 100,
    }

    const apiUrl = resolveChatCompletionsUrl(baseUrl, urlMode)
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    }

    let response: Response

    // Use undici for HTTPS requests when SSL verification should be skipped
    if (skipSslVerify && apiUrl.startsWith("https://")) {
      const dispatcher = new Agent({
        connect: {
          rejectUnauthorized: false,
        },
      })

      const unidiciResponse = await undiciFetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        dispatcher,
      })
      
      response = unidiciResponse as unknown as Response
    } else {
      response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      })
    }

    // Read response as text first to handle non-JSON responses
    const responseText = await response.text()
    
    // Try to parse as JSON
    let data: OpenAIResponse
    try {
      data = JSON.parse(responseText) as OpenAIResponse
    } catch {
      // Response is not valid JSON - likely an error page from a gateway/proxy
      const preview = responseText.slice(0, 200).replace(/\s+/g, ' ').trim()
      throw new Error(
        `Non-JSON response from ${apiUrl} (HTTP ${response.status}): "${preview}"${responseText.length > 200 ? '...' : ''}`
      )
    }

    if (!response.ok) {
      const errorMessage = data.error?.message || data.message || `HTTP ${response.status}`
      throw new Error(errorMessage)
    }

    const choice = data.choices?.[0]
    const text = choice?.message?.content || ""
    const finishReason = choice?.finish_reason || "unknown"

    return new Response(
      JSON.stringify({
        text,
        usage: data.usage,
        finishReason,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )
  } catch (error) {
    console.error("OpenAI API Error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
