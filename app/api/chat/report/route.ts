import { Agent, fetch as undiciFetch } from "undici"

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
  message?: string
}

function resolveChatCompletionsUrl(baseUrl: string, urlMode?: "base" | "endpoint") {
  const normalized = baseUrl.trim().replace(/\/+$/, "")
  if (urlMode === "endpoint") return normalized

  let base = normalized
  if (!base.endsWith("/v1")) base = `${base}/v1`
  return `${base}/chat/completions`
}

async function callReportAgent(payload: {
  baseUrl: string
  apiKey: string
  model: string
  urlMode?: "base" | "endpoint"
  skipSslVerify?: boolean
  assistantResponse: string
  userPrompt?: string
}) {
  const apiUrl = resolveChatCompletionsUrl(payload.baseUrl, payload.urlMode)
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${payload.apiKey}`,
  }

  const requestBody = {
    model: payload.model,
    temperature: 0.2,
    max_tokens: 1500,
    messages: [
      {
        role: "system",
        content:
          "You are report-agent. Produce polished markdown with sections: Executive Summary, Key Insights, Technical Notes, Recommendations, and Next Steps. Keep it concise, readable, and practical.",
      },
      {
        role: "user",
        content: `User prompt (if any): ${payload.userPrompt || "N/A"}

Assistant response to analyze:
${payload.assistantResponse}
`,
      },
    ],
  }

  let response: Response
  if (payload.skipSslVerify && apiUrl.startsWith("https://")) {
    const dispatcher = new Agent({ connect: { rejectUnauthorized: false } })
    const r = await undiciFetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      dispatcher,
    })
    response = r as unknown as Response
  } else {
    response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    })
  }

  const text = await response.text()
  let json: ChatCompletionResponse
  try {
    json = JSON.parse(text) as ChatCompletionResponse
  } catch {
    throw new Error(`Non-JSON response from ${apiUrl}`)
  }
  if (!response.ok) {
    throw new Error(json.error?.message || json.message || `HTTP ${response.status}`)
  }

  return json.choices?.[0]?.message?.content?.trim() || ""
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      baseUrl,
      apiKey,
      model,
      urlMode,
      skipSslVerify,
      assistantResponse,
      userPrompt,
    } = body as {
      baseUrl?: string
      apiKey?: string
      model?: string
      urlMode?: "base" | "endpoint"
      skipSslVerify?: boolean
      assistantResponse?: string
      userPrompt?: string
    }

    if (!baseUrl || !apiKey || !model || !assistantResponse) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: baseUrl, apiKey, model, assistantResponse" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const reportMarkdown = await callReportAgent({
      baseUrl,
      apiKey,
      model,
      urlMode,
      skipSslVerify,
      assistantResponse,
      userPrompt,
    })

    return new Response(
      JSON.stringify({
        title: "Insights Report",
        reportMarkdown: reportMarkdown || "No report content generated.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
