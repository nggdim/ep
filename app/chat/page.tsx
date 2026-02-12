"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"
import { useRouter } from "next/navigation"
import packageJson from "../../package.json"

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
  ConversationEmptyState,
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
  PromptInputButton,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion"

// UI
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "@/components/ui/theme-toggle"

// Lib
import {
  getOpenAICredentials,
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
} from "lucide-react"

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

  const handleSave = () => {
    const creds: OpenAICredentials = {
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      sslVerify,
    }
    saveOpenAICredentials(creds)
    onSave(creds)
    onClose()
  }

  const isValid = baseUrl.trim() && apiKey.trim() && model.trim()

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
            <Label htmlFor="settings-baseUrl" className="text-sm">Base URL</Label>
            <Input id="settings-baseUrl" placeholder="https://api.openai.com" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
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
          <Button onClick={handleSave} disabled={!isValid} className="flex-1">Save & Connect</Button>
        </div>
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
  const releaseVersion = `v${packageJson.version}`

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
    if (!credentials) return undefined
    return new TextStreamChatTransport({
      api: "/api/chatbot",
      body: () => ({
        baseUrl: credentialsRef.current?.baseUrl,
        apiKey: credentialsRef.current?.apiKey,
        model: credentialsRef.current?.model,
        skipSslVerify: credentialsRef.current?.sslVerify === false,
      }),
    })
  }, [credentials])

  const chatId = useMemo(() => "chatbot-main", [])

  const { messages, setMessages, sendMessage, regenerate, status, error, stop } =
    useChat({
      id: chatId,
      transport,
      onError: (err) => console.error("[ChatPage] Error:", err.message),
    })

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

      <SidebarProvider defaultOpen>
        {/* ── Sidebar ── */}
        <Sidebar className="border-r border-border/50">
          <SidebarHeader className="p-3 gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold">
                ep<span className="text-primary">.</span>
                <span className="font-normal text-muted-foreground">chat</span>
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
            <Separator orientation="vertical" className="h-4" />
            <span className="text-sm text-muted-foreground truncate flex-1">
              {activeConversationId
                ? conversations.find((c) => c.id === activeConversationId)?.title || "Chat"
                : "New chat"
              }
            </span>
            <span className="hidden sm:inline-flex items-center rounded-full border border-border/60 bg-accent/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {releaseVersion}
            </span>
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
                <ConversationContent className="max-w-3xl mx-auto w-full px-4 pb-44">
                  {messages.length === 0 ? (
                    <ConversationEmptyState
                      icon={<Sparkles className="h-10 w-10 text-primary" />}
                      title="How can I help you today?"
                      description="Ask me anything — code, explanations, debugging, writing, and more."
                    >
                      <div className="flex flex-col items-center gap-6 mt-2">
                        <div className="space-y-1 text-center">
                          <h3 className="font-medium text-sm">How can I help you today?</h3>
                          <p className="text-muted-foreground text-sm">
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
                    </ConversationEmptyState>
                  ) : (
                    messages.map((message, idx) => {
                      const textContent = message.parts
                        ?.filter((p) => p.type === "text")
                        .map((p) => (p as { type: "text"; text: string }).text)
                        .join("") || ""

                      return (
                        <div key={message.id}>
                          <Message from={message.role}>
                            <MessageContent>
                              {message.parts?.map((part, i) => {
                                if (part.type === "text") {
                                  return (
                                    <MessageResponse key={`${message.id}-${i}`}>
                                      {part.text}
                                    </MessageResponse>
                                  )
                                }
                                return null
                              })}
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
                            </MessageActions>
                          )}
                        </div>
                      )
                    })
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
              <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-4">
                <div className="pointer-events-auto max-w-3xl mx-auto w-full px-4">
                  <PromptInput
                    onSubmit={handleSubmit}
                    className={cn(
                      "rounded-2xl border border-border/50 bg-background/90 backdrop-blur-md shadow-lg",
                      "transition-all duration-200",
                      "focus-within:border-primary/40 focus-within:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)]"
                    )}
                  >
                    <PromptInputTextarea
                      placeholder="Send a message..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                    />
                    <PromptInputFooter className="p-2">
                      <PromptInputTools>
                        <Suggestions>
                          {messages.length === 0 && SUGGESTIONS.map((s) => (
                            <Suggestion
                              key={s.label}
                              suggestion={s.prompt}
                              onClick={() => handleSuggestionClick(s.prompt)}
                              className="text-xs"
                            >
                              <s.icon className="h-3 w-3 mr-1" />
                              {s.label}
                            </Suggestion>
                          ))}
                        </Suggestions>
                      </PromptInputTools>
                      <PromptInputSubmit
                        status={status === "streaming" ? "streaming" : status === "submitted" ? "submitted" : "ready"}
                        disabled={!inputText.trim() || status === "streaming" || status === "submitted"}
                      />
                    </PromptInputFooter>
                  </PromptInput>
                  <p className="text-[11px] text-muted-foreground/50 mt-2 text-center drop-shadow-sm">
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
    </div>
  )
}
