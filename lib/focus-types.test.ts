import { describe, expect, it } from "vitest"

import {
  FocusBuildRequestSchema,
  FocusChartSpecSchema,
  FocusRunRequestSchema,
  FocusRunResultSchema,
} from "./focus-types"

describe("focus schemas", () => {
  it("parses a valid run request", () => {
    const parsed = FocusRunRequestSchema.safeParse({
      language: "sql",
      code: "select 1",
      rowLimit: 20,
      credentials: {
        baseUrl: "https://openrouter.ai/api",
        apiKey: "key",
        model: "openai/gpt-5.2-codex",
      },
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects invalid run result shape", () => {
    const parsed = FocusRunResultSchema.safeParse({
      columns: [],
      rows: [],
      summary: "",
    })
    expect(parsed.success).toBe(false)
  })

  it("parses a valid chart spec and build request", () => {
    const spec = FocusChartSpecSchema.safeParse({
      chartType: "bar",
      title: "Sales by month",
      xKey: "month",
      yKeys: ["sales"],
    })
    expect(spec.success).toBe(true)

    const buildReq = FocusBuildRequestSchema.safeParse({
      runResult: {
        columns: [
          { name: "month", type: "string" },
          { name: "sales", type: "number" },
        ],
        rows: [
          { month: "Jan", sales: 10 },
          { month: "Feb", sales: 20 },
        ],
        summary: "Mocked monthly sales",
      },
      credentials: {
        baseUrl: "https://openrouter.ai/api",
        apiKey: "key",
        model: "openai/gpt-5.2-codex",
      },
    })
    expect(buildReq.success).toBe(true)
  })
})
