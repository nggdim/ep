import { Agent, fetch as undiciFetch } from "undici"

import {
  FocusRunRequestSchema,
  FocusRunResultSchema,
  type FocusCredentials,
} from "@/lib/focus-types"

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

async function callAgent(
  credentials: FocusCredentials,
  messages: Array<{ role: "system" | "user"; content: string }>,
  temperature = 0
) {
  const apiUrl = resolveChatCompletionsUrl(credentials.baseUrl, credentials.urlMode)
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${credentials.apiKey}`,
  }
  const requestBody = {
    model: credentials.model,
    messages,
    temperature,
    max_tokens: 1200,
  }

  let response: Response
  if (credentials.skipSslVerify && apiUrl.startsWith("https://")) {
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

function parseJsonFromModel(content: string) {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i)
  const payload = fenced?.[1] || content
  return JSON.parse(payload)
}

function fallbackRunResult(language: string) {
  return {
    columns: [
      { name: "id", type: "number" },
      { name: "label", type: "string" },
      { name: "value", type: "number" },
      { name: "language", type: "string" },
    ],
    rows: [
      { id: 1, label: "alpha", value: 42, language },
      { id: 2, label: "beta", value: 27, language },
      { id: 3, label: "gamma", value: 63, language },
      { id: 4, label: "delta", value: 35, language },
      { id: 5, label: "epsilon", value: 51, language },
    ],
    summary: `Mocked output generated for ${language} code.`,
    warnings: ["Model output parsing failed; fallback mock dataset used."],
    rawResponse: "",
  }
}

export async function POST(req: Request) {
  try {
    const parsed = FocusRunRequestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request payload", details: parsed.error.flatten() }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { language, code, intent, rowLimit, seed, credentials } = parsed.data
    const limit = rowLimit ?? 30
    const modelText = await callAgent(
      credentials,
      [
        {
          role: "system",
          content:
            "You are data-mock-agent. Return ONLY valid JSON with shape: { columns: [{name,type}], rows: [record], summary: string, warnings?: string[] }. Keep rows realistic and coherent with the code intent.",
        },
        {
          role: "user",
          content: `Language: ${language}
Seed: ${seed ?? 0}
MaxRows: ${limit}
Intent: ${intent || "Infer from code"}

Code:
${code.slice(0, 8000)}
`,
        },
      ],
      0.1
    )

    let candidate: unknown
    try {
      candidate = parseJsonFromModel(modelText)
    } catch {
      candidate = fallbackRunResult(language)
    }

    const validated = FocusRunResultSchema.safeParse(candidate)
    if (!validated.success) {
      const fallback = {
        ...fallbackRunResult(language),
        rawResponse: modelText,
      }
      return new Response(JSON.stringify(fallback), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    const rows = validated.data.rows.slice(0, limit)
    return new Response(
      JSON.stringify({
        ...validated.data,
        rows,
        rawResponse: modelText,
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
