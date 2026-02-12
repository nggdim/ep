"use client"

import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"
import ReactMarkdown from "react-markdown"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  getOpenAICredentials,
  saveOpenAICredentials,
  type OpenAICredentials,
} from "@/lib/credential-store"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import {
  Send,
  Loader2,
  AlertCircle,
  Bot,
  User,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Plus,
  ArrowLeft,
  Settings,
  MoreVertical,
  Zap,
  Code,
  Lightbulb,
  PenLine,
  StopCircle,
  ArrowDown,
} from "lucide-react"

// ── Memoized Code Block ──────────────────────────────────────────────

const CodeBlock = memo(function CodeBlock({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const codeContent = String(children).replace(/\n$/, "")
  const language = className?.replace("language-", "") || ""

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [codeContent])

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-border/40">
      <div className="flex items-center justify-between px-4 py-2 bg-accent/40 border-b border-border/30">
        <span className="text-[11px] text-muted-foreground font-mono">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-success" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 bg-accent/20 text-[13px] leading-relaxed font-mono">
        <code className={className}>{codeContent}</code>
      </pre>
    </div>
  )
})

// ── Memoized Markdown Renderer ───────────────────────────────────────

const MarkdownContent = memo(function MarkdownContent({
  content,
}: {
  content: string
}) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="text-lg font-bold mb-3 mt-4 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-bold mb-2 mt-4 first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold mb-2 mt-3 first:mt-0">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="list-disc list-outside mb-3 space-y-1.5 ml-5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-outside mb-3 space-y-1.5 ml-5">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ className, children, ...props }) => {
          const isInline = !className
          if (isInline) {
            return (
              <code
                className="px-1.5 py-0.5 rounded-md bg-accent/60 text-[13px] font-mono"
                {...props}
              >
                {children}
              </code>
            )
          }
          return <CodeBlock className={className}>{children}</CodeBlock>
        },
        pre: ({ children }) => <>{children}</>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline underline-offset-2"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/40 pl-4 my-3 text-muted-foreground italic">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-3 rounded-lg border border-border/40">
            <table className="min-w-full text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-accent/30">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left font-medium border-b border-border/40">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 border-b border-border/20">{children}</td>
        ),
        hr: () => <hr className="my-4 border-border/40" />,
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
})

// ── Suggestion chips ─────────────────────────────────────────────────

const SUGGESTIONS = [
  {
    icon: Code,
    label: "Write code",
    prompt: "Help me write a function that ",
  },
  {
    icon: Lightbulb,
    label: "Explain a concept",
    prompt: "Explain to me how ",
  },
  {
    icon: Zap,
    label: "Debug an issue",
    prompt: "Help me debug this issue: ",
  },
  {
    icon: PenLine,
    label: "Draft content",
    prompt: "Help me write ",
  },
]

// ── Settings Dialog ──────────────────────────────────────────────────

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
            <Label htmlFor="baseUrl" className="text-sm">
              Base URL
            </Label>
            <Input
              id="baseUrl"
              placeholder="https://api.openai.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey" className="text-sm">
              API Key
            </Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model" className="text-sm">
              Model
            </Label>
            <Input
              id="model"
              placeholder="gpt-4o"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sslVerify"
              checked={!sslVerify}
              onChange={(e) => setSslVerify(!e.target.checked)}
              className="rounded border-border"
            />
            <Label htmlFor="sslVerify" className="text-sm text-muted-foreground">
              Skip SSL verification (for self-signed certs)
            </Label>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid} className="flex-1">
            Save & Connect
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Scroll-to-bottom button ──────────────────────────────────────────

function ScrollToBottomButton({
  visible,
  onClick,
}: {
  visible: boolean
  onClick: () => void
}) {
  if (!visible) return null
  return (
    <button
      onClick={onClick}
      className={cn(
        "absolute bottom-4 left-1/2 -translate-x-1/2 z-10",
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full",
        "bg-card border border-border/50 shadow-lg",
        "text-xs text-muted-foreground hover:text-foreground",
        "transition-all hover:shadow-xl hover:scale-105"
      )}
    >
      <ArrowDown className="h-3 w-3" />
      New messages
    </button>
  )
}

// ── Main Chat Page ───────────────────────────────────────────────────

export default function ChatPage() {
  const router = useRouter()
  const [credentials, setCredentials] = useState<OpenAICredentials | null>(null)
  const [isCredentialsLoading, setIsCredentialsLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const credentialsRef = useRef<OpenAICredentials | null>(null)

  // Load credentials
  useEffect(() => {
    const stored = getOpenAICredentials()
    setCredentials(stored)
    credentialsRef.current = stored
    setIsCredentialsLoading(false)
  }, [])

  // Listen for credential changes
  useEffect(() => {
    const handleUpdate = () => {
      const stored = getOpenAICredentials()
      setCredentials(stored)
      credentialsRef.current = stored
    }
    window.addEventListener("openai-credentials-updated", handleUpdate)
    window.addEventListener("storage", (e) => {
      if (e.key === "ep_credentials") handleUpdate()
    })
    return () => {
      window.removeEventListener("openai-credentials-updated", handleUpdate)
    }
  }, [])

  useEffect(() => {
    credentialsRef.current = credentials
  }, [credentials])

  const isConfigured =
    credentials !== null &&
    credentials.baseUrl?.trim() !== "" &&
    credentials.apiKey?.trim() !== "" &&
    credentials.model?.trim() !== ""

  // Transport
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

  const chatId = useMemo(() => {
    if (!credentials) return "chatbot-unconfigured"
    return `chatbot-${credentials.baseUrl}-${credentials.model}`
  }, [credentials])

  const { messages, setMessages, sendMessage, regenerate, status, error, stop } =
    useChat({
      id: chatId,
      transport,
      onError: (err) => {
        console.error("[ChatPage] Error:", err.message)
      },
    })

  const isChatLoading = status === "submitted" || status === "streaming"

  // Auto-scroll
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    setShowScrollButton(false)
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Detect when user has scrolled up
  const handleScroll = useCallback(() => {
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-slot='scroll-area-viewport']"
    )
    if (!viewport) return
    const { scrollTop, scrollHeight, clientHeight } = viewport
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
    setShowScrollButton(!isNearBottom && messages.length > 0)
  }, [messages.length])

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-slot='scroll-area-viewport']"
    )
    if (!viewport) return
    viewport.addEventListener("scroll", handleScroll)
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [handleScroll])

  // Input state
  const [input, setInput] = useState("")

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value)
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto"
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
      }
    },
    []
  )

  const handleSend = useCallback(() => {
    if (!input.trim() || !credentials || isChatLoading) return
    sendMessage({ text: input.trim() })
    setInput("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [input, credentials, isChatLoading, sendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleNewChat = useCallback(() => {
    setMessages([])
  }, [setMessages])

  const handleSuggestionClick = useCallback(
    (prompt: string) => {
      setInput(prompt)
      setTimeout(() => textareaRef.current?.focus(), 50)
    },
    []
  )

  const getMessageContent = (message: {
    parts?: Array<{ type: string; text?: string }>
    content?: string
  }): string => {
    if (message.parts) {
      return message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text || "")
        .join("")
    }
    return message.content || ""
  }

  // ── Render ───────────────────────────────────────────────────────

  if (isCredentialsLoading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      {/* Settings Modal */}
      {showSettings && (
        <SettingsPanel
          credentials={credentials}
          onSave={(creds) => setCredentials(creds)}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Header */}
      <header className="h-14 border-b border-border/50 flex items-center px-4 gap-3 shrink-0 bg-card/30 backdrop-blur-sm z-20">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push("/")}
          title="Back to workbench"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="h-5 w-px bg-border/50" />

        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">
              <span className="font-semibold">ep</span>
              <span className="text-primary">.</span>
              <span className="font-normal text-muted-foreground ml-1">chat</span>
            </h1>
          </div>
        </div>

        <div className="flex-1" />

        {isConfigured && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-accent/30 px-3 py-1.5 rounded-full">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            <span className="truncate max-w-[150px]">{credentials?.model}</span>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 text-xs"
          onClick={handleNewChat}
          disabled={messages.length === 0}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New Chat</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowSettings(true)}>
              <Settings className="h-4 w-4 mr-2" />
              API Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Workbench
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeToggle />
      </header>

      {/* Main Content */}
      {!isConfigured ? (
        /* ── Unconfigured State ───────────────────────── */
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-3">Welcome to ep.chat</h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Connect to any OpenAI-compatible API to start chatting. Your
              credentials are stored locally in your browser.
            </p>
            <Button
              size="lg"
              onClick={() => setShowSettings(true)}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              Configure API
            </Button>
          </div>
        </div>
      ) : (
        /* ── Chat Interface ───────────────────────────── */
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* Messages */}
          <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0">
            <div className="max-w-3xl mx-auto w-full px-4 sm:px-6">
              {messages.length === 0 ? (
                /* ── Empty State ────────────────────── */
                <div className="flex flex-col items-center justify-center min-h-[60vh] py-12">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                    <Sparkles className="h-7 w-7 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">
                    How can I help you today?
                  </h2>
                  <p className="text-sm text-muted-foreground mb-8 text-center max-w-sm">
                    Ask me anything — I can help with code, explanations,
                    debugging, writing, and more.
                  </p>

                  {/* Suggestion Chips */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion.label}
                        onClick={() => handleSuggestionClick(suggestion.prompt)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-xl text-left",
                          "border border-border/50 bg-card/50",
                          "hover:bg-accent/50 hover:border-border",
                          "transition-all duration-200 group"
                        )}
                      >
                        <suggestion.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                          {suggestion.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* ── Messages List ──────────────────── */
                <div className="py-6 space-y-6">
                  {messages.map((message) => {
                    const content = getMessageContent(message)
                    const isUser = message.role === "user"

                    return (
                      <div key={message.id} className="group">
                        {isUser ? (
                          /* User Message */
                          <div className="flex justify-end">
                            <div className="flex items-end gap-2.5 max-w-[85%]">
                              <div className="px-4 py-3 rounded-2xl rounded-br-md bg-primary text-primary-foreground text-sm leading-relaxed whitespace-pre-wrap break-words">
                                {content}
                              </div>
                              <div className="shrink-0 w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                                <User className="h-3.5 w-3.5 text-primary" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Assistant Message */
                          <div className="flex items-start gap-3">
                            <div className="shrink-0 w-7 h-7 rounded-full bg-accent flex items-center justify-center mt-0.5">
                              <Bot className="h-3.5 w-3.5 text-foreground" />
                            </div>
                            <div className="flex-1 min-w-0 text-sm leading-relaxed overflow-hidden">
                              <MarkdownContent content={content} />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Streaming indicator */}
                  {isChatLoading &&
                    messages.length > 0 &&
                    messages[messages.length - 1]?.role === "user" && (
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 w-7 h-7 rounded-full bg-accent flex items-center justify-center">
                          <Bot className="h-3.5 w-3.5 text-foreground" />
                        </div>
                        <div className="flex items-center gap-2 py-2">
                          <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Error */}
                  {error && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                      <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      <div className="flex-1 text-sm">
                        <p className="font-medium text-destructive mb-1">
                          Something went wrong
                        </p>
                        <p className="text-destructive/80 text-xs mb-3">
                          {error.message}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => regenerate()}
                          className="h-7 text-xs gap-1.5"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Try again
                        </Button>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Scroll-to-bottom */}
          <ScrollToBottomButton
            visible={showScrollButton}
            onClick={scrollToBottom}
          />

          {/* Input Area */}
          <div className="shrink-0 border-t border-border/50 bg-background/80 backdrop-blur-md">
            <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-4">
              <div className="relative flex items-end gap-2 rounded-2xl border border-border/50 bg-card/80 px-4 py-3 shadow-sm focus-within:border-primary/30 focus-within:shadow-md transition-all">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Send a message..."
                  className="flex-1 min-h-[24px] max-h-[200px] resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none placeholder:text-muted-foreground/60"
                  disabled={isChatLoading}
                  rows={1}
                />
                {isChatLoading ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => stop()}
                    className="h-8 w-8 shrink-0 rounded-xl hover:bg-destructive/10 hover:text-destructive"
                    title="Stop generating"
                  >
                    <StopCircle className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    disabled={!input.trim()}
                    onClick={handleSend}
                    className="h-8 w-8 shrink-0 rounded-xl"
                    title="Send message (Enter)"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/50 mt-2 text-center">
                Enter to send, Shift+Enter for new line.{" "}
                {credentials?.model && (
                  <span>
                    Using <span className="text-muted-foreground">{credentials.model}</span>
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
