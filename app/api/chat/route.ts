import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { streamText, convertToModelMessages, type UIMessage, type ModelMessage } from "ai"
import { Agent, fetch as undiciFetch } from "undici"

export const runtime = "nodejs"
export const maxDuration = 60

// Create a reusable agent for SSL bypass
const insecureAgent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
})

interface TableContext {
  path: string
  columns: { name: string; type: string }[]
}

interface DataContext {
  tables: TableContext[]
}

/**
 * Build a system prompt for the SQL assistant with schema context
 */
function buildSystemPrompt(dataContext?: DataContext): string {
  const basePrompt = `You are an expert SQL assistant specialized in helping users discover data and build queries. You have deep knowledge of SQL syntax, query optimization, and data analysis best practices.

Your capabilities include:
- Writing efficient SQL queries (SELECT, JOIN, GROUP BY, window functions, CTEs, etc.)
- Explaining query logic and suggesting optimizations
- Helping users understand their data schema and relationships
- Suggesting analytical approaches and data exploration strategies
- Debugging SQL errors and providing fixes

Guidelines:
- Always use proper SQL formatting with clear indentation
- Prefer explicit JOINs over implicit ones
- Use meaningful aliases for tables and columns
- Add comments for complex query logic when helpful
- Consider performance implications and suggest optimizations when relevant
- When referencing tables, use the full qualified path (e.g., source.schema.table)`

  if (!dataContext || dataContext.tables.length === 0) {
    return basePrompt + `

Note: No specific data context has been provided. Ask the user about their data schema if you need more information to help them.`
  }

  // Build schema context from selected tables
  let schemaContext = `

## Available Data Schema

The user has selected the following tables for context:

`

  for (const table of dataContext.tables) {
    schemaContext += `### Table: \`${table.path}\`\n`
    if (table.columns.length > 0) {
      schemaContext += `| Column | Type |\n|--------|------|\n`
      for (const col of table.columns) {
        schemaContext += `| ${col.name} | ${col.type} |\n`
      }
    } else {
      schemaContext += `(Column information not available)\n`
    }
    schemaContext += `\n`
  }

  schemaContext += `Use this schema information to help the user write accurate queries and explore their data. Reference these exact table and column names when generating SQL.`

  return basePrompt + schemaContext
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { messages, baseUrl, apiKey, model, skipSslVerify, dataContext } = body

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
    
    // Convert messages from UI format (with parts) to model format (with content)
    const modelMessages = await convertToModelMessages(messages as UIMessage[])
    
    // Build the system prompt with data context
    const systemPrompt = buildSystemPrompt(dataContext as DataContext | undefined)
    
    // Prepend system message
    const messagesWithSystem: ModelMessage[] = [
      { role: "system", content: systemPrompt },
      ...modelMessages
    ]

    // Normalize base URL - ensure it ends with /v1
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "")
    if (!normalizedBaseUrl.endsWith("/v1")) {
      normalizedBaseUrl = `${normalizedBaseUrl}/v1`
    }

    // Create a custom fetch for SSL verification bypass if needed
    const customFetch = skipSslVerify
      ? async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url
          
          // Convert headers to a plain object if needed
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

    // Create the OpenAI compatible provider
    const provider = createOpenAICompatible({
      name: "custom-openai",
      apiKey,
      baseURL: normalizedBaseUrl,
      fetch: customFetch,
    })

    // Stream the response using the messages with system prompt
    const result = streamText({
      model: provider(model),
      messages: messagesWithSystem,
      temperature: 0.7,
    })

    // Return the streaming response
    return result.toTextStreamResponse()
  } catch (error) {
    console.error("[Chat API] Error:", error instanceof Error ? error.message : String(error))
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
