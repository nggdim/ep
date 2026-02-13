"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type ChartSpec = {
  chartType: "bar" | "line" | "area" | "pie" | "scatter"
  title: string
  description?: string
  xKey?: string
  yKeys?: string[]
  categoryKey?: string
  valueKey?: string
}

const CHART_STROKE = "#111111"
const CHART_GRID = "#d4d4d4"
const CHART_FILL = "#262626"
const CHART_AREA_FILL = "#a3a3a3"
const PIE_COLORS = ["#111111", "#404040", "#737373", "#a3a3a3", "#d4d4d4"]
const TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  border: "1px solid #d4d4d4",
  color: "#111111",
}

export function FocusChartRenderer({
  spec,
  rows,
}: {
  spec: ChartSpec
  rows: Array<Record<string, unknown>>
}) {
  const xKey = spec.xKey || "label"
  const yKey = spec.yKeys?.[0] || "value"
  const categoryKey = spec.categoryKey || xKey
  const valueKey = spec.valueKey || yKey

  if (!rows || rows.length === 0) return null

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        {spec.chartType === "line" ? (
          <LineChart data={rows}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Line type="monotone" dataKey={yKey} stroke={CHART_STROKE} strokeWidth={2} dot={false} />
          </LineChart>
        ) : spec.chartType === "area" ? (
          <AreaChart data={rows}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area type="monotone" dataKey={yKey} stroke={CHART_STROKE} fill={CHART_AREA_FILL} />
          </AreaChart>
        ) : spec.chartType === "pie" ? (
          <PieChart>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Pie data={rows} dataKey={valueKey} nameKey={categoryKey} outerRadius={110}>
              {rows.map((_, idx) => (
                <Cell key={`slice-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        ) : spec.chartType === "scatter" ? (
          <ScatterChart>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
            <XAxis dataKey={xKey} />
            <YAxis dataKey={yKey} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Scatter data={rows} fill={CHART_FILL} />
          </ScatterChart>
        ) : (
          <BarChart data={rows}>
            <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
            <XAxis dataKey={xKey} />
            <YAxis />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey={yKey} fill={CHART_FILL} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
