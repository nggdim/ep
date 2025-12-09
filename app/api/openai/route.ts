import { createOpenAI } from "@ai-sdk/openai"
import { streamText } from "ai"

export async function POST(req: Request) {
  try {
    const { baseUrl, apiKey, model, messages, temperature, maxTokens } = await req.json()

    if (!baseUrl || !apiKey) {
      return new Response(JSON.stringify({ error: "Base URL and API Key are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Create a custom OpenAI-compatible client
    const openai = createOpenAI({
      baseURL: `${baseUrl}/v1`,
      apiKey: apiKey,
      // Disable SSL verification for internal endpoints
      fetch: async (url, options) => {
        return fetch(url, {
          ...options,
          // @ts-expect-error - Node.js specific option for self-signed certs
          rejectUnauthorized: false,
        })
      },
    })

    const result = streamText({
      model: openai(model || "gpt-3.5-turbo"),
      messages: messages || [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say hello in one sentence." },
      ],
      temperature: temperature ?? 0.1,
      maxTokens: maxTokens ?? 100,
    })

    return result.toDataStreamResponse()
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
