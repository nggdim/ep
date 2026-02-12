"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"
import { useRouter } from "next/navigation"

// shadcn sidebar
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar"

// AI Elements
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"

// UI
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

// Lib
import {
  getOpenAICredentials,
  getDremioCredentials,
  saveOpenAICredentials,
  type OpenAICredentials,
} from "@/lib/credential-store"
import { useChatConversations } from "@/lib/use-chat-history"
import { syncChatMessages, getChatMessages } from "@/lib/db"
import { cn } from "@/lib/utils"

// Icons
import {
  Sparkles,
  Plus,
  ArrowLeft,
  Settings,
  MoreHorizontal,
  Trash2,
  Pencil,
  MessageSquare,
  Search,
  Code,
  Lightbulb,
  Zap,
  PenLine,
  RefreshCcw,
  CopyIcon,
  Check,
  Play,
} from "lucide-react"

const CHAT_RELEASE_TAG = "v0.1"

// ── Settings Panel ───────────────────────────────────────────────────

function SettingsPanel({
  credentials,
  onSave,
  onClose,
}: {
  credentials: OpenAICredentials | null
  onSave: (creds: OpenAICredentials) => void
  onClose: () => void
}) {
  const [baseUrl, setBaseUrl] = useState(credentials?.baseUrl || "")
  const [apiKey, setApiKey] = useState(credentials?.apiKey || "")
  const [model, setModel] = useState(credentials?.model || "")
  const [sslVerify, setSslVerify] = useState(credentials?.sslVerify !== false)
  const [urlMode, setUrlMode] = useState<"base" | "endpoint">(credentials?.urlMode || "base")
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleSave = () => {
    const creds: OpenAICredentials = {
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      sslVerify,
      urlMode,
    }
    saveOpenAICredentials(creds)
    onSave(creds)
    onClose()
  }

  const isValid = baseUrl.trim() && apiKey.trim() && model.trim()

  const handleTest = async () => {
    if (!isValid || isTesting) return

    setIsTesting(true)
    setTestResult(null)

    try {
      const res = await fetch("/api/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
          skipSslVerify: sslVerify === false,
          urlMode,
          messages: [
            { role: "system", content: "You are a test assistant." },
            { role: "user", content: "Respond with exactly: CONNECTION_OK" },
          ],
          temperature: 0,
          maxTokens: 12,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || "Connection test failed")
      }

      setTestResult({
        ok: true,
        message: `Success: ${data?.text || "Connection test passed"}`,
      })
    } catch (error) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : "Connection test failed",
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border/50 bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">API Configuration</h2>
            <p className="text-sm text-muted-foreground">
              Connect to any OpenAI-compatible API
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">URL Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={urlMode === "base" ? "default" : "outline"}
                onClick={() => setUrlMode("base")}
                className="text-xs"
              >
                Base URL
              </Button>
              <Button
                type="button"
                variant={urlMode === "endpoint" ? "default" : "outline"}
                onClick={() => setUrlMode("endpoint")}
                className="text-xs"
              >
                Full Endpoint
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {urlMode === "base"
                ? "Use values like https://openrouter.ai/api (the app adds /v1/chat/completions)."
                : "Use a full chat completions URL like https://openrouter.ai/api/v1/chat/completions."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-baseUrl" className="text-sm">
              {urlMode === "base" ? "Base URL" : "Chat Completions Endpoint"}
            </Label>
            <Input
              id="settings-baseUrl"
              placeholder={urlMode === "base" ? "https://api.openai.com" : "https://openrouter.ai/api/v1/chat/completions"}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-apiKey" className="text-sm">API Key</Label>
            <Input id="settings-apiKey" type="password" placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-model" className="text-sm">Model</Label>
            <Input id="settings-model" placeholder="gpt-4o" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="settings-ssl" checked={!sslVerify} onChange={(e) => setSslVerify(!e.target.checked)} className="rounded border-border" />
            <Label htmlFor="settings-ssl" className="text-sm text-muted-foreground">Skip SSL verification</Label>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={!isValid || isTesting}
            className="flex-1"
          >
            {isTesting ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="size-3.5" />
                Testing...
              </span>
            ) : "Test Connection"}
          </Button>
          <Button onClick={handleSave} disabled={!isValid} className="flex-1">Save & Connect</Button>
        </div>
        {testResult && (
          <p
            className={cn(
              "mt-3 text-xs",
              testResult.ok ? "text-success" : "text-destructive"
            )}
          >
            {testResult.message}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Group conversations by date bucket */
function groupConversations(convos: { id: string; title: string; updatedAt: Date }[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
  const monthAgo = new Date(today.getTime() - 30 * 86400000)

  const groups: { label: string; items: typeof convos }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 Days", items: [] },
    { label: "Previous 30 Days", items: [] },
    { label: "Older", items: [] },
  ]

  for (const c of convos) {
    const d = new Date(c.updatedAt)
    if (d >= today) groups[0].items.push(c)
    else if (d >= yesterday) groups[1].items.push(c)
    else if (d >= weekAgo) groups[2].items.push(c)
    else if (d >= monthAgo) groups[3].items.push(c)
    else groups[4].items.push(c)
  }

  return groups.filter((g) => g.items.length > 0)
}

/** Extract a short title from the first user message */
function titleFromMessage(text: string): string {
  const clean = text.replace(/\n/g, " ").trim()
  if (clean.length <= 50) return clean
  return clean.slice(0, 47) + "..."
}

type ExtractedCodeBlock = {
  id: string
  language: string
  code: string
  messageId: string
  indexInMessage: number
}

function sanitizeStreamedMarkdown(content: string) {
  // While streaming, a fence can transiently end as ```s / ```sq before newline.
  // That can make highlighters treat it as an unknown language token.
  return content.replace(/```[^\n`]*$/, "```")
}

function extractCodeBlocks(content: string, messageId: string): ExtractedCodeBlock[] {
  const blocks: ExtractedCodeBlock[] = []
  const fenceRegex = /```([\w-]+)?\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  let idx = 0
  while ((match = fenceRegex.exec(content)) !== null) {
    blocks.push({
      id: `${messageId}-code-${idx}`,
      language: (match[1] || "text").toLowerCase(),
      code: (match[2] || "").trimEnd(),
      messageId,
      indexInMessage: idx,
    })
    idx++
  }
  return blocks
}

function fallbackCodeTitle(block: ExtractedCodeBlock) {
  const firstLine = block.code.split("\n").find((line) => line.trim().length > 0)?.trim() || ""
  if (!firstLine) return `${block.language.toUpperCase()} block`
  return firstLine.slice(0, 72)
}

function ChatMessageMarkdown({ content }: { content: string }) {
  const safeContent = useMemo(() => sanitizeStreamedMarkdown(content), [content])
  return <MessageResponse>{safeContent}</MessageResponse>
}

// ── Suggestion data ──────────────────────────────────────────────────

const SUGGESTIONS = [
  { icon: Code, label: "Write code", prompt: "Help me write a function that " },
  { icon: Lightbulb, label: "Explain a concept", prompt: "Explain to me how " },
  { icon: Zap, label: "Debug an issue", prompt: "Help me debug this issue: " },
  { icon: PenLine, label: "Draft content", prompt: "Help me write " },
]

// ── Main Page ────────────────────────────────────────────────────────

export default function ChatPage() {
  const router = useRouter()

  // ── Credentials ──
  const [credentials, setCredentials] = useState<OpenAICredentials | null>(null)
  const [isCredentialsLoading, setIsCredentialsLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const credentialsRef = useRef<OpenAICredentials | null>(null)

  useEffect(() => {
    const stored = getOpenAICredentials()
    setCredentials(stored)
    credentialsRef.current = stored
    setIsCredentialsLoading(false)
  }, [])

  useEffect(() => {
    const handleUpdate = () => {
      const stored = getOpenAICredentials()
      setCredentials(stored)
      credentialsRef.current = stored
    }
    window.addEventListener("openai-credentials-updated", handleUpdate)
    return () => window.removeEventListener("openai-credentials-updated", handleUpdate)
  }, [])

  useEffect(() => { credentialsRef.current = credentials }, [credentials])

  const isConfigured = credentials !== null &&
    credentials.baseUrl?.trim() !== "" &&
    credentials.apiKey?.trim() !== "" &&
    credentials.model?.trim() !== ""

  // ── Dexie conversations ──
  const { conversations, create, rename, remove } = useChatConversations()
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)

  // ── Transport ──
  const transport = useMemo(() => {
    return new TextStreamChatTransport({
      api: "/api/chatbot",
      // Read credentials at send-time to avoid stale/undefined transport state.
      body: () => ({
        baseUrl: credentialsRef.current?.baseUrl,
        apiKey: credentialsRef.current?.apiKey,
        model: credentialsRef.current?.model,
        skipSslVerify: credentialsRef.current?.sslVerify === false,
        urlMode: credentialsRef.current?.urlMode || "base",
      }),
    })
  }, [])

  const chatId = useMemo(() => "chatbot-main", [])

  const { messages, setMessages, sendMessage, regenerate, status, error, stop } =
    useChat({
      id: chatId,
      transport,
      onError: (err) => console.error("[ChatPage] Error:", err.message),
    })

  const assistantCodeBlocks = useMemo(() => {
    const blocks: ExtractedCodeBlock[] = []
    for (const message of messages) {
      if (message.role !== "assistant") continue
      const text = message.parts
        ?.filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("") || ""
      if (!text) continue
      blocks.push(...extractCodeBlocks(sanitizeStreamedMarkdown(text), message.id))
    }
    return blocks
  }, [messages])

  const [isFocusModeOpen, setIsFocusModeOpen] = useState(false)
  const [selectedCodeBlockId, setSelectedCodeBlockId] = useState<string | null>(null)
  const [focusEditorCode, setFocusEditorCode] = useState("")
  const [focusSqlResult, setFocusSqlResult] = useState<{
    rowCount: number
    schema?: Array<{ name: string; type: { name: string } }>
    rows?: Array<Record<string, unknown>>
    error?: string
    details?: string
  } | null>(null)
  const [isRunningFocusSql, setIsRunningFocusSql] = useState(false)
  const [focusCopied, setFocusCopied] = useState(false)
  const [codeSummaries, setCodeSummaries] = useState<Record<string, string>>({})
  const [summarizingIds, setSummarizingIds] = useState<Record<string, boolean>>({})

  const selectedCodeBlock = useMemo(
    () => assistantCodeBlocks.find((b) => b.id === selectedCodeBlockId) || null,
    [assistantCodeBlocks, selectedCodeBlockId]
  )

  useEffect(() => {
    if (assistantCodeBlocks.length === 0) {
      setSelectedCodeBlockId(null)
      if (isFocusModeOpen) setIsFocusModeOpen(false)
      return
    }
    if (!selectedCodeBlockId || !assistantCodeBlocks.some((b) => b.id === selectedCodeBlockId)) {
      const next = assistantCodeBlocks[assistantCodeBlocks.length - 1]
      setSelectedCodeBlockId(next.id)
      setFocusEditorCode(next.code)
      setFocusSqlResult(null)
    }
  }, [assistantCodeBlocks, selectedCodeBlockId, isFocusModeOpen])

  useEffect(() => {
    if (!selectedCodeBlock) return
    setFocusEditorCode(selectedCodeBlock.code)
    setFocusSqlResult(null)
  }, [selectedCodeBlock?.id])

  const openFocusMode = useCallback((blockId?: string) => {
    if (assistantCodeBlocks.length === 0) return
    const targetId = blockId || selectedCodeBlockId || assistantCodeBlocks[assistantCodeBlocks.length - 1].id
    setSelectedCodeBlockId(targetId)
    const targetBlock = assistantCodeBlocks.find((b) => b.id === targetId)
    if (targetBlock) {
      setFocusEditorCode(targetBlock.code)
      setFocusSqlResult(null)
    }
    setIsFocusModeOpen(true)
  }, [assistantCodeBlocks, selectedCodeBlockId])

  const focusLanguageIsSql = useMemo(() => {
    const lang = selectedCodeBlock?.language || ""
    return ["sql", "postgresql", "mysql", "sqlite", "tsql", "plsql"].includes(lang)
  }, [selectedCodeBlock?.language])

  const runSqlInFocusMode = useCallback(async () => {
    const sql = focusEditorCode.trim()
    if (!sql) return
    const creds = getDremioCredentials()
    if (!creds?.endpoint || !creds?.pat) {
      setFocusSqlResult({
        rowCount: 0,
        error: "Dremio credentials not configured",
        details: "Configure Dremio credentials in Workbench settings to run SQL from chat focus mode.",
      })
      return
    }

    setIsRunningFocusSql(true)
    setFocusSqlResult(null)
    try {
      const response = await fetch("/api/dremio/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: creds.endpoint,
          pat: creds.pat,
          sql,
          sslVerify: creds.sslVerify,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        setFocusSqlResult({
          rowCount: 0,
          error: data?.error || `SQL execution failed (${response.status})`,
          details: data?.details,
        })
        return
      }
      setFocusSqlResult({
        rowCount: data.rowCount ?? 0,
        schema: data.schema,
        rows: data.rows,
      })
    } catch (error) {
      setFocusSqlResult({
        rowCount: 0,
        error: error instanceof Error ? error.message : "Unknown SQL execution error",
      })
    } finally {
      setIsRunningFocusSql(false)
    }
  }, [focusEditorCode])

  const copyFocusCode = useCallback(async () => {
    if (!focusEditorCode.trim()) return
    await navigator.clipboard.writeText(focusEditorCode)
    setFocusCopied(true)
    setTimeout(() => setFocusCopied(false), 1200)
  }, [focusEditorCode])

  useEffect(() => {
    if (!isFocusModeOpen || assistantCodeBlocks.length === 0) return

    let cancelled = false
    const openAiCreds = getOpenAICredentials()
    const canSummarizeWithEndpoint = Boolean(
      openAiCreds?.baseUrl?.trim() && openAiCreds?.apiKey?.trim() && openAiCreds?.model?.trim()
    )

    const summarize = async () => {
      for (const block of assistantCodeBlocks) {
        if (cancelled) return
        if (codeSummaries[block.id]) continue

        if (!canSummarizeWithEndpoint) {
          setCodeSummaries((prev) => ({
            ...prev,
            [block.id]: fallbackCodeTitle(block),
          }))
          continue
        }

        setSummarizingIds((prev) => ({ ...prev, [block.id]: true }))
        try {
          const res = await fetch("/api/openai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              baseUrl: openAiCreds?.baseUrl?.trim(),
              apiKey: openAiCreds?.apiKey?.trim(),
              model: openAiCreds?.model?.trim(),
              skipSslVerify: openAiCreds?.sslVerify === false,
              urlMode: openAiCreds?.urlMode || "base",
              temperature: 0,
              maxTokens: 24,
              messages: [
                {
                  role: "system",
                  content:
                    "You create concise code titles. Return only one short title, max 8 words, no quotes, no markdown.",
                },
                {
                  role: "user",
                  content: `Language: ${block.language}\n\nCode:\n${block.code.slice(0, 3000)}`,
                },
              ],
            }),
          })

          const data = await res.json()
          const rawTitle = (data?.text || "").toString().replace(/\s+/g, " ").trim()
          const title = rawTitle || fallbackCodeTitle(block)
          if (!cancelled) {
            setCodeSummaries((prev) => ({
              ...prev,
              [block.id]: title,
            }))
          }
        } catch {
          if (!cancelled) {
            setCodeSummaries((prev) => ({
              ...prev,
              [block.id]: fallbackCodeTitle(block),
            }))
          }
        } finally {
          if (!cancelled) {
            setSummarizingIds((prev) => {
              const next = { ...prev }
              delete next[block.id]
              return next
            })
          }
        }
      }
    }

    void summarize()

    return () => {
      cancelled = true
    }
  }, [assistantCodeBlocks, codeSummaries, isFocusModeOpen])

  // ── Persist messages to Dexie when they change ──
  const prevMessagesLenRef = useRef(0)
  useEffect(() => {
    if (!activeConversationId) return
    if (messages.length === 0) return
    if (status === "submitted" || status === "streaming") return
    // Only sync when messages actually changed
    if (messages.length === prevMessagesLenRef.current) return
    prevMessagesLenRef.current = messages.length

    const toSync = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.parts
          ?.filter((p) => p.type === "text")
          .map((p) => (p as { type: "text"; text: string }).text)
          .join("") || "",
      }))
      .filter((m) => m.content.length > 0)

    syncChatMessages(activeConversationId, toSync)
  }, [messages, activeConversationId, status])

  // ── Load messages when switching conversations ──
  const loadConversation = useCallback(async (conversationId: string) => {
    setActiveConversationId(conversationId)
    prevMessagesLenRef.current = 0
    const stored = await getChatMessages(conversationId)
    if (stored.length > 0) {
      const uiMessages = stored.map((m, i) => ({
        id: m.id || `msg-${i}`,
        role: m.role as "user" | "assistant",
        content: m.content,
        parts: [{ type: "text" as const, text: m.content }],
        createdAt: m.createdAt,
      }))
      setMessages(uiMessages)
      prevMessagesLenRef.current = uiMessages.length
    } else {
      setMessages([])
    }
  }, [setMessages])

  // ── New chat ──
  const handleNewChat = useCallback(() => {
    setActiveConversationId(null)
    setMessages([])
    prevMessagesLenRef.current = 0
  }, [setMessages])

  // ── Send ──
  const handleSubmit = useCallback(async (message: PromptInputMessage) => {
    if (!message.text?.trim() || !credentials) return

    // If no active conversation, create one
    let convId = activeConversationId
    if (!convId) {
      const conv = await create(titleFromMessage(message.text))
      convId = conv.id
      setActiveConversationId(convId)
      prevMessagesLenRef.current = 0
    }

    sendMessage({ text: message.text })
    setInputText("")
  }, [credentials, activeConversationId, create, sendMessage])

  // ── Rename ──
  const handleRenameSubmit = useCallback(async () => {
    if (renamingId && renameValue.trim()) {
      await rename(renamingId, renameValue.trim())
      setRenamingId(null)
      setRenameValue("")
    }
  }, [renamingId, renameValue, rename])

  // ── Delete ──
  const handleDelete = useCallback(async (id: string) => {
    await remove(id)
    if (activeConversationId === id) {
      handleNewChat()
    }
  }, [remove, activeConversationId, handleNewChat])

  // ── Copy message ──
  const handleCopyMessage = useCallback((text: string, messageId: string) => {
    navigator.clipboard.writeText(text)
    setCopiedMessageId(messageId)
    setTimeout(() => setCopiedMessageId(null), 2000)
  }, [])

  // ── Filter conversations ──
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations
    const q = searchQuery.toLowerCase()
    return conversations.filter((c) => c.title.toLowerCase().includes(q))
  }, [conversations, searchQuery])

  const groups = useMemo(() => groupConversations(filteredConversations), [filteredConversations])
  const isWaitingForAssistant = (status === "submitted" || status === "streaming") &&
    (messages.length === 0 || messages[messages.length - 1]?.role !== "assistant")

  // ── Suggestion click ──
  const [inputText, setInputText] = useState("")
  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInputText(suggestion)
  }, [])

  // ── Loading ──
  if (isCredentialsLoading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <Sparkles className="h-8 w-8 text-primary animate-pulse" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-background">
      {showSettings && (
        <SettingsPanel
          credentials={credentials}
          onSave={(creds) => setCredentials(creds)}
          onClose={() => setShowSettings(false)}
        />
      )}

      <SidebarProvider defaultOpen className="[--sidebar:var(--background)]">
        {/* ── Sidebar ── */}
        <Sidebar className="border-r border-border/50 bg-background">
          <SidebarHeader className="p-3 gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold">
                ep<span className="text-primary">.</span>
                <span className="font-normal text-muted-foreground">chat</span>
              </span>
              <span className="rounded-full border border-border/60 bg-accent/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {CHAT_RELEASE_TAG}
              </span>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleNewChat}
                title="New chat"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs bg-sidebar-accent/50"
              />
            </div>
          </SidebarHeader>

          <SidebarContent className="scrollbar-subtle">
            {groups.length === 0 && (
              <div className="px-4 py-8 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  {searchQuery ? "No matching chats" : "No conversations yet"}
                </p>
              </div>
            )}

            {groups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/70 px-3">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((conv) => (
                      <SidebarMenuItem key={conv.id}>
                        {renamingId === conv.id ? (
                          <form
                            onSubmit={(e) => { e.preventDefault(); handleRenameSubmit() }}
                            className="flex-1 px-2 py-1"
                          >
                            <Input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={handleRenameSubmit}
                              className="h-7 text-xs"
                            />
                          </form>
                        ) : (
                          <>
                            <SidebarMenuButton
                              isActive={conv.id === activeConversationId}
                              onClick={() => loadConversation(conv.id)}
                              className="text-xs truncate"
                              tooltip={conv.title}
                            >
                              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{conv.title}</span>
                            </SidebarMenuButton>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <SidebarMenuAction>
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </SidebarMenuAction>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent side="right" align="start">
                                <DropdownMenuItem onClick={() => {
                                  setRenamingId(conv.id)
                                  setRenameValue(conv.title)
                                }}>
                                  <Pencil className="h-3.5 w-3.5 mr-2" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => handleDelete(conv.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-border/50">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setShowSettings(true)} className="text-xs">
                  <Settings className="h-3.5 w-3.5" />
                  <span>Settings</span>
                  {isConfigured && (
                    <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                      {credentials?.model}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => router.push("/")} className="text-xs">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Workbench</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        {/* ── Main Content ── */}
        <SidebarInset>
          <header className="h-12 flex items-center gap-2 px-4 border-b border-border/50 shrink-0">
            <SidebarTrigger />
            <span className="text-sm text-muted-foreground truncate flex-1">
              {activeConversationId
                ? conversations.find((c) => c.id === activeConversationId)?.title || "Chat"
                : "New chat"
              }
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => openFocusMode()}
              disabled={assistantCodeBlocks.length === 0}
            >
              <Code className="h-3.5 w-3.5" />
              Focus mode
            </Button>
            <ThemeToggle />
          </header>

          {!isConfigured ? (
            /* ── Unconfigured ── */
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-3">Welcome to ep.chat</h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Connect to any OpenAI-compatible API to start chatting. Your credentials are stored locally.
                </p>
                <Button size="lg" onClick={() => setShowSettings(true)} className="gap-2">
                  <Settings className="h-4 w-4" />
                  Configure API
                </Button>
              </div>
            </div>
          ) : (
            /* ── Chat ── */
            <div className="relative flex flex-col h-[calc(100vh-3rem)]">
              <Conversation>
                <ConversationContent className={cn(
                  "max-w-4xl mx-auto w-full px-4",
                  messages.length > 0 ? "pb-44" : "pb-8"
                )}>
                  {messages.length === 0 ? null : (
                    messages.map((message, idx) => {
                      const textContent = message.parts
                        ?.filter((p) => p.type === "text")
                        .map((p) => (p as { type: "text"; text: string }).text)
                        .join("") || ""
                      const messageCodeBlocks = message.role === "assistant"
                        ? extractCodeBlocks(sanitizeStreamedMarkdown(textContent), message.id)
                        : []

                      return (
                        <div key={message.id}>
                          <Message from={message.role} className={message.role === "assistant" ? "max-w-full" : undefined}>
                            <MessageContent className={message.role === "assistant" ? "w-full" : undefined}>
                              {textContent ? (
                                <ChatMessageMarkdown content={textContent} />
                              ) : null}
                            </MessageContent>
                          </Message>
                          {message.role === "assistant" && textContent && (
                            <MessageActions className="mt-1 ml-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MessageAction
                                tooltip="Copy"
                                onClick={() => handleCopyMessage(textContent, message.id)}
                              >
                                {copiedMessageId === message.id
                                  ? <Check className="h-3 w-3" />
                                  : <CopyIcon className="h-3 w-3" />
                                }
                              </MessageAction>
                              {idx === messages.length - 1 && (
                                <MessageAction tooltip="Regenerate" onClick={() => regenerate()}>
                                  <RefreshCcw className="h-3 w-3" />
                                </MessageAction>
                              )}
                              {messageCodeBlocks.length > 0 && (
                                <MessageAction
                                  tooltip="Open in focus mode"
                                  onClick={() => openFocusMode(messageCodeBlocks[0].id)}
                                >
                                  <Code className="h-3 w-3" />
                                </MessageAction>
                              )}
                            </MessageActions>
                          )}
                        </div>
                      )
                    })
                  )}
                  {isWaitingForAssistant && (
                    <Message from="assistant">
                      <MessageContent>
                        <div className="inline-flex items-center gap-2 text-muted-foreground">
                          <Spinner className="size-4" />
                          <span className="text-sm">Thinking...</span>
                        </div>
                      </MessageContent>
                    </Message>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 max-w-3xl">
                      <div className="flex-1 text-sm">
                        <p className="font-medium text-destructive mb-1">Something went wrong</p>
                        <p className="text-destructive/80 text-xs mb-3">{error.message}</p>
                        <Button variant="outline" size="sm" onClick={() => regenerate()} className="h-7 text-xs gap-1.5">
                          <RefreshCcw className="h-3 w-3" /> Try again
                        </Button>
                      </div>
                    </div>
                  )}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>

              {/* ── Input ── */}
              <div className={cn(
                "pointer-events-none absolute inset-x-0",
                messages.length === 0
                  ? "top-1/2 -translate-y-1/2"
                  : "bottom-0 pb-4"
              )}>
                <div className="pointer-events-auto max-w-4xl mx-auto w-full px-4">
                  {messages.length === 0 && (
                    <div className="mb-5 flex flex-col items-center gap-4">
                      <div className="space-y-1 text-center">
                        <h3 className="font-semibold text-2xl">How can I help you today?</h3>
                        <p className="text-muted-foreground text-base">
                          Ask me anything — code, explanations, debugging, writing, and more.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                        {SUGGESTIONS.map((s) => (
                          <button
                            key={s.label}
                            onClick={() => handleSuggestionClick(s.prompt)}
                            className={cn(
                              "flex items-center gap-2.5 px-4 py-3 rounded-xl text-left text-sm",
                              "border border-border/50 bg-card/50",
                              "hover:bg-accent/50 hover:border-border transition-all group"
                            )}
                          >
                            <s.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                            <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                              {s.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <PromptInput
                    onSubmit={handleSubmit}
                    className="chat-prompt-neutral bg-white dark:bg-card shadow-lg rounded-2xl overflow-hidden"
                  >
                    <PromptInputTextarea
                      placeholder="Send a message..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      className="px-5 py-4"
                    />
                    <PromptInputFooter>
                      <PromptInputTools />
                      <PromptInputSubmit
                        status={status === "streaming" ? "streaming" : status === "submitted" ? "submitted" : "ready"}
                        disabled={!inputText.trim() || status === "streaming" || status === "submitted"}
                      />
                    </PromptInputFooter>
                  </PromptInput>
                  <p className="text-[11px] text-muted-foreground/50 mt-2 text-center">
                    Enter to send, Shift+Enter for new line
                    {credentials?.model && (
                      <span className="ml-1">
                        · Using <span className="text-muted-foreground">{credentials.model}</span>
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </SidebarInset>
      </SidebarProvider>

      <Sheet
        open={isFocusModeOpen}
        onOpenChange={(open) => {
          setIsFocusModeOpen(open)
          if (!open) {
            setFocusSqlResult(null)
            setIsRunningFocusSql(false)
          }
        }}
      >
        <SheetContent side="right" className="!w-screen !max-w-none sm:!max-w-none sm:!w-screen !h-screen border-l-0 p-0 gap-0">
          <SheetHeader className="border-b border-border/50 px-4 py-3">
            <SheetTitle className="text-sm">Focus Mode</SheetTitle>
            <SheetDescription>
              Browse code blocks on the left and edit/run on the right.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 grid grid-cols-[280px_1fr]">
            <div className="border-r border-border/50 overflow-auto">
              <div className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border/50">
                Code blocks ({assistantCodeBlocks.length})
              </div>
              <div className="p-2 space-y-1">
                {assistantCodeBlocks.map((block) => (
                  <button
                    key={block.id}
                    onClick={() => setSelectedCodeBlockId(block.id)}
                    className={cn(
                      "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                      selectedCodeBlockId === block.id
                        ? "border-primary/40 bg-primary/10"
                        : "border-border/40 hover:bg-accent/40"
                    )}
                  >
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="uppercase tracking-wide">{block.language}</span>
                      {summarizingIds[block.id] && <Spinner className="h-3 w-3" />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs font-medium text-foreground/90">
                      {codeSummaries[block.id] || "Summarizing..."}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex flex-col">
              {selectedCodeBlock ? (
                <>
                  <div className="border-b border-border/50 px-3 py-2 flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      Editing <span className="text-foreground">{selectedCodeBlock.language}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {focusLanguageIsSql && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5"
                          onClick={runSqlInFocusMode}
                          disabled={isRunningFocusSql || !focusEditorCode.trim()}
                        >
                          {isRunningFocusSql ? (
                            <>
                              <Spinner className="h-3.5 w-3.5" />
                              Running...
                            </>
                          ) : (
                            <>
                              <Play className="h-3.5 w-3.5" />
                              Run SQL
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1.5"
                        onClick={copyFocusCode}
                      >
                        {focusCopied ? <Check className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                        {focusCopied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>

                  <textarea
                    value={focusEditorCode}
                    onChange={(e) => setFocusEditorCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (focusLanguageIsSql && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault()
                        runSqlInFocusMode()
                      }
                    }}
                    className="flex-1 min-h-0 resize-none border-0 bg-background px-4 py-3 font-mono text-sm leading-6 outline-none"
                    spellCheck={false}
                  />

                  {focusSqlResult && (
                    <div className="max-h-[34vh] overflow-auto border-t border-border/50">
                      <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border/50 bg-card/40">
                        {focusSqlResult.error
                          ? "SQL execution error"
                          : `${focusSqlResult.rowCount} row${focusSqlResult.rowCount === 1 ? "" : "s"} returned`}
                      </div>
                      {focusSqlResult.error ? (
                        <div className="p-4 text-sm">
                          <p className="text-destructive">{focusSqlResult.error}</p>
                          {focusSqlResult.details && (
                            <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                              {focusSqlResult.details}
                            </pre>
                          )}
                        </div>
                      ) : focusSqlResult.rows && focusSqlResult.rows.length > 0 ? (
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-card/80 backdrop-blur">
                            <tr className="border-b border-border/50">
                              {focusSqlResult.schema?.map((col) => (
                                <th key={col.name} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                                  {col.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {focusSqlResult.rows.map((row, rowIdx) => (
                              <tr key={rowIdx} className="border-b border-border/30">
                                {focusSqlResult.schema?.map((col) => (
                                  <td key={`${rowIdx}-${col.name}`} className="px-3 py-2 font-mono whitespace-nowrap">
                                    {String(row[col.name] ?? "NULL")}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-4 text-xs text-muted-foreground">
                          Query executed successfully. No rows returned.
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                  No code block selected.
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
