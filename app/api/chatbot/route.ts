import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { streamText, convertToModelMessages, type UIMessage, type ModelMessage } from "ai"
import { Agent, fetch as undiciFetch } from "undici"

export const runtime = "nodejs"
export const maxDuration = 60

const insecureAgent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
})

const SYSTEM_PROMPT = `You are a helpful, knowledgeable, and friendly AI assistant. You excel at:

1. **Clear Communication**: Provide concise, well-structured answers
2. **Code Assistance**: Write clean, well-commented code in any language
3. **Problem Solving**: Break down complex problems into manageable steps
4. **Creative Thinking**: Help brainstorm ideas and explore possibilities
5. **Technical Knowledge**: Explain concepts clearly at any skill level

Guidelines:
- Be direct and helpful — get to the point quickly
- Use markdown formatting for readability (headers, lists, code blocks, etc.)
- When writing code, include brief comments explaining key logic
- If you're unsure about something, say so honestly
- Ask clarifying questions when the request is ambiguous`

const CONTEXT_CHAR_BUDGET = 24_000

function trimMessagesToBudget(messages: ModelMessage[], budgetChars: number) {
  const selected: ModelMessage[] = []
  let usedChars = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    const current = messages[i]
    const estimatedChars = JSON.stringify(current).length
    // Always keep at least the most recent message.
    if (selected.length > 0 && usedChars + estimatedChars > budgetChars) {
      break
    }
    usedChars += estimatedChars
    selected.push(current)
  }

  return selected.reverse()
}

function resolveProviderBaseUrl(baseUrl: string, urlMode?: "base" | "endpoint") {
  const normalized = baseUrl.trim().replace(/\/+$/, "")

  if (urlMode === "endpoint") {
    // Convert full endpoint (.../chat/completions) back to provider base URL.
    return normalized.replace(/\/chat\/completions$/i, "")
  }

  if (normalized.endsWith("/v1")) {
    return normalized
  }
  return `${normalized}/v1`
}

export async function POST(req: Request) {
  const requestStartedAt = Date.now()
  try {
    const body = await req.json()
    const { messages, baseUrl, apiKey, model, skipSslVerify, systemPrompt, urlMode } = body

    if (!baseUrl || !apiKey || !model) {
      return new Response(
        JSON.stringify({ error: "Missing required credentials (baseUrl, apiKey, model)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const modelMessages = await convertToModelMessages(messages as UIMessage[])

    const trimmedMessages = trimMessagesToBudget(modelMessages, CONTEXT_CHAR_BUDGET)
    const messagesWithSystem: ModelMessage[] = [
      { role: "system", content: systemPrompt || SYSTEM_PROMPT },
      ...trimmedMessages,
    ]

    const providerBaseUrl = resolveProviderBaseUrl(baseUrl, urlMode)

    // Custom fetch for SSL bypass
    const customFetch = skipSslVerify
      ? async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url

          let headers: Record<string, string> = {}
          if (init?.headers) {
            if (init.headers instanceof Headers) {
              init.headers.forEach((value, key) => {
                headers[key] = value
              })
            } else if (Array.isArray(init.headers)) {
              for (const [key, value] of init.headers) {
                headers[key] = value
              }
            } else {
              headers = init.headers as Record<string, string>
            }
          }

          const response = await undiciFetch(url, {
            method: init?.method || "GET",
            headers,
            body: init?.body as string | undefined,
            dispatcher: insecureAgent,
          })

          return response as unknown as Response
        }
      : undefined

    const provider = createOpenAICompatible({
      name: "custom-openai",
      apiKey,
      baseURL: providerBaseUrl,
      fetch: customFetch,
    })

    let firstTokenMs: number | null = null
    let finishReason: string | undefined
    let usage:
      | {
          inputTokens?: number
          outputTokens?: number
          totalTokens?: number
        }
      | undefined

    const result = streamText({
      model: provider(model),
      messages: messagesWithSystem,
      temperature: 0.7,
      onFinish: (event) => {
        finishReason = event.finishReason
        usage = event.usage
      },
    })

    const response = result.toTextStreamResponse()
    if (!response.body) {
      return response
    }

    const instrumentedStream = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          if (firstTokenMs === null) {
            firstTokenMs = Date.now() - requestStartedAt
          }
          controller.enqueue(chunk)
        },
        flush() {
          const totalResponseMs = Date.now() - requestStartedAt
          console.log(
            "[Chatbot API] metrics",
            JSON.stringify({
              model,
              totalResponseMs,
              firstTokenMs,
              inputTokens: usage?.inputTokens ?? null,
              outputTokens: usage?.outputTokens ?? null,
              totalTokens: usage?.totalTokens ?? null,
              finishReason: finishReason ?? null,
            })
          )
        },
      })
    )

    return new Response(instrumentedStream, {
      status: response.status,
      headers: response.headers,
    })
  } catch (error) {
    console.error("[Chatbot API] Error:", error instanceof Error ? error.message : String(error))
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
