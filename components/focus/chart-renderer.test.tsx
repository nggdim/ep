import { describe, expect, it } from "vitest"

import { FocusChartRenderer } from "./chart-renderer"

describe("FocusChartRenderer", () => {
  it("returns null for empty rows", () => {
    const element = FocusChartRenderer({
      spec: {
        chartType: "bar",
        title: "Test",
        xKey: "x",
        yKeys: ["y"],
      },
      rows: [],
    })
    expect(element).toBeNull()
  })

  it("returns a React element for non-empty rows", () => {
    const element = FocusChartRenderer({
      spec: {
        chartType: "line",
        title: "Trend",
        xKey: "x",
        yKeys: ["y"],
      },
      rows: [{ x: "A", y: 1 }],
    })
    expect(element).not.toBeNull()
    expect(typeof element).toBe("object")
  })
})
