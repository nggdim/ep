import { Agent, fetch as undiciFetch } from "undici"

import {
  FocusReportRequestSchema,
  FocusReportResultSchema,
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
  temperature = 0.2
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
    max_tokens: 1400,
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

export async function POST(req: Request) {
  try {
    const parsed = FocusReportRequestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request payload", details: parsed.error.flatten() }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { language, code, runResult, buildResult, credentials } = parsed.data
    const sampleRows = runResult.rows.slice(0, 15)

    const reportMarkdown = await callAgent(
      credentials,
      [
        {
          role: "system",
          content:
            "You are an analytics insights agent. Produce concise markdown focused on insights from output data. Use sections: Executive Summary, Insights from Results, Chart Interpretation (if chart exists), Recommendations, Caveats. Reference concrete signals from provided rows/columns and avoid generic statements.",
        },
        {
          role: "user",
          content: `Language: ${language}
Code:
${code.slice(0, 4000)}

Run summary: ${runResult.summary}
Columns: ${JSON.stringify(runResult.columns)}
Sample rows: ${JSON.stringify(sampleRows)}
Build result: ${buildResult ? JSON.stringify(buildResult.chartSpec) : "none"}
`,
        },
      ]
    )

    const title = `Report: ${runResult.summary.slice(0, 60)}`
    const validated = FocusReportResultSchema.safeParse({
      title,
      reportMarkdown: reportMarkdown || "No report content generated.",
    })
    if (!validated.success) {
      return new Response(
        JSON.stringify({ error: "Report generation failed validation", details: validated.error.flatten() }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    return new Response(JSON.stringify(validated.data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
