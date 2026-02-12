import Dexie, { type EntityTable } from "dexie"

/**
 * Workspace - top-level container for notes about a collection of tables
 */
export interface Workspace {
  id: string           // UUID
  name: string
  description: string  // Collection-level notes
  createdAt: Date
  updatedAt: Date
}

/**
 * Table notes - linked to Dremio table paths within a workspace
 */
export interface TableNote {
  id: string
  workspaceId: string
  tablePath: string    // e.g., "source.schema.table"
  description: string
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Column notes - linked to specific columns within a table
 */
export interface ColumnNote {
  id: string
  tableNoteId: string
  columnName: string
  description: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Linked table - represents a table added to a workspace (separate from notes)
 */
export interface LinkedTable {
  id: string
  workspaceId: string
  tablePath: string    // e.g., "source.schema.table"
  addedAt: Date
}

/**
 * Chat conversation - a single chat thread
 */
export interface ChatConversation {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Chat message - a single message within a conversation
 */
export interface ChatMessage {
  id: string
  conversationId: string
  role: "user" | "assistant"
  content: string
  createdAt: Date
}

/**
 * Dexie database instance for workspace notes
 */
class WorkspaceDatabase extends Dexie {
  workspaces!: EntityTable<Workspace, "id">
  tableNotes!: EntityTable<TableNote, "id">
  columnNotes!: EntityTable<ColumnNote, "id">
  linkedTables!: EntityTable<LinkedTable, "id">
  chatConversations!: EntityTable<ChatConversation, "id">
  chatMessages!: EntityTable<ChatMessage, "id">

  constructor() {
    super("ep-workspace-notes")
    
    this.version(1).stores({
      // Primary key is 'id', indexed fields follow
      workspaces: "id, name, createdAt, updatedAt",
      tableNotes: "id, workspaceId, tablePath, [workspaceId+tablePath], createdAt, updatedAt",
      columnNotes: "id, tableNoteId, columnName, [tableNoteId+columnName], createdAt, updatedAt",
    })
    
    // Version 2: Add linkedTables for explicit table-to-workspace linking
    this.version(2).stores({
      workspaces: "id, name, createdAt, updatedAt",
      tableNotes: "id, workspaceId, tablePath, [workspaceId+tablePath], createdAt, updatedAt",
      columnNotes: "id, tableNoteId, columnName, [tableNoteId+columnName], createdAt, updatedAt",
      linkedTables: "id, workspaceId, tablePath, [workspaceId+tablePath], addedAt",
    })

    // Version 3: Add chat conversations and messages
    this.version(3).stores({
      workspaces: "id, name, createdAt, updatedAt",
      tableNotes: "id, workspaceId, tablePath, [workspaceId+tablePath], createdAt, updatedAt",
      columnNotes: "id, tableNoteId, columnName, [tableNoteId+columnName], createdAt, updatedAt",
      linkedTables: "id, workspaceId, tablePath, [workspaceId+tablePath], addedAt",
      chatConversations: "id, title, createdAt, updatedAt",
      chatMessages: "id, conversationId, role, createdAt",
    })
  }
}

// Singleton database instance - lazy initialized to avoid SSR issues
let _db: WorkspaceDatabase | null = null

function getDb(): WorkspaceDatabase {
  if (typeof window === 'undefined') {
    throw new Error('Database can only be accessed on the client side')
  }
  if (!_db) {
    _db = new WorkspaceDatabase()
  }
  return _db
}

// Proxy to lazily access the database
export const db = new Proxy({} as WorkspaceDatabase, {
  get(_, prop) {
    return getDb()[prop as keyof WorkspaceDatabase]
  }
})

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/**
 * Helper to create a new workspace
 */
export async function createWorkspace(name: string, description: string = ""): Promise<Workspace> {
  const now = new Date()
  const workspace: Workspace = {
    id: generateId(),
    name,
    description,
    createdAt: now,
    updatedAt: now,
  }
  await db.workspaces.add(workspace)
  return workspace
}

/**
 * Helper to update a workspace
 */
export async function updateWorkspace(
  id: string, 
  updates: Partial<Pick<Workspace, "name" | "description">>
): Promise<void> {
  await db.workspaces.update(id, {
    ...updates,
    updatedAt: new Date(),
  })
}

/**
 * Helper to delete a workspace and all its related data
 */
export async function deleteWorkspace(id: string): Promise<void> {
  await db.transaction("rw", [db.workspaces, db.tableNotes, db.columnNotes, db.linkedTables], async () => {
    // Get all table notes for this workspace
    const tableNotes = await db.tableNotes.where("workspaceId").equals(id).toArray()
    const tableNoteIds = tableNotes.map(tn => tn.id)
    
    // Delete all column notes for these table notes
    await db.columnNotes.where("tableNoteId").anyOf(tableNoteIds).delete()
    
    // Delete all table notes for this workspace
    await db.tableNotes.where("workspaceId").equals(id).delete()
    
    // Delete all linked tables for this workspace
    await db.linkedTables.where("workspaceId").equals(id).delete()
    
    // Delete the workspace
    await db.workspaces.delete(id)
  })
}

/**
 * Helper to create or update a table note
 */
export async function upsertTableNote(
  workspaceId: string,
  tablePath: string,
  description: string,
  tags: string[] = []
): Promise<TableNote> {
  const existing = await db.tableNotes
    .where("[workspaceId+tablePath]")
    .equals([workspaceId, tablePath])
    .first()
  
  const now = new Date()
  
  if (existing) {
    await db.tableNotes.update(existing.id, {
      description,
      tags,
      updatedAt: now,
    })
    return { ...existing, description, tags, updatedAt: now }
  }
  
  const tableNote: TableNote = {
    id: generateId(),
    workspaceId,
    tablePath,
    description,
    tags,
    createdAt: now,
    updatedAt: now,
  }
  await db.tableNotes.add(tableNote)
  return tableNote
}

/**
 * Helper to get a table note by workspace and path
 */
export async function getTableNote(
  workspaceId: string,
  tablePath: string
): Promise<TableNote | undefined> {
  return db.tableNotes
    .where("[workspaceId+tablePath]")
    .equals([workspaceId, tablePath])
    .first()
}

/**
 * Helper to delete a table note and its column notes
 */
export async function deleteTableNote(id: string): Promise<void> {
  await db.transaction("rw", [db.tableNotes, db.columnNotes], async () => {
    await db.columnNotes.where("tableNoteId").equals(id).delete()
    await db.tableNotes.delete(id)
  })
}

/**
 * Helper to create or update a column note
 */
export async function upsertColumnNote(
  tableNoteId: string,
  columnName: string,
  description: string
): Promise<ColumnNote> {
  const existing = await db.columnNotes
    .where("[tableNoteId+columnName]")
    .equals([tableNoteId, columnName])
    .first()
  
  const now = new Date()
  
  if (existing) {
    await db.columnNotes.update(existing.id, {
      description,
      updatedAt: now,
    })
    return { ...existing, description, updatedAt: now }
  }
  
  const columnNote: ColumnNote = {
    id: generateId(),
    tableNoteId,
    columnName,
    description,
    createdAt: now,
    updatedAt: now,
  }
  await db.columnNotes.add(columnNote)
  return columnNote
}

/**
 * Helper to get all column notes for a table note
 */
export async function getColumnNotes(tableNoteId: string): Promise<ColumnNote[]> {
  return db.columnNotes.where("tableNoteId").equals(tableNoteId).toArray()
}

/**
 * Helper to delete a column note
 */
export async function deleteColumnNote(id: string): Promise<void> {
  await db.columnNotes.delete(id)
}

/**
 * Get all table notes for a workspace with their column notes
 */
export async function getWorkspaceNotesWithColumns(workspaceId: string): Promise<{
  tableNotes: (TableNote & { columnNotes: ColumnNote[] })[]
}> {
  const tableNotes = await db.tableNotes.where("workspaceId").equals(workspaceId).toArray()
  
  const tableNotesWithColumns = await Promise.all(
    tableNotes.map(async (tableNote) => {
      const columnNotes = await db.columnNotes.where("tableNoteId").equals(tableNote.id).toArray()
      return { ...tableNote, columnNotes }
    })
  )
  
  return { tableNotes: tableNotesWithColumns }
}

/**
 * Get notes for specific table paths within a workspace
 */
export async function getNotesForTables(
  workspaceId: string,
  tablePaths: string[]
): Promise<Map<string, { tableNote: TableNote; columnNotes: ColumnNote[] }>> {
  const result = new Map<string, { tableNote: TableNote; columnNotes: ColumnNote[] }>()
  
  for (const tablePath of tablePaths) {
    const tableNote = await db.tableNotes
      .where("[workspaceId+tablePath]")
      .equals([workspaceId, tablePath])
      .first()
    
    if (tableNote) {
      const columnNotes = await db.columnNotes.where("tableNoteId").equals(tableNote.id).toArray()
      result.set(tablePath, { tableNote, columnNotes })
    }
  }
  
  return result
}

// ============================================================================
// Linked Tables Functions
// ============================================================================

/**
 * Link a table to a workspace
 */
export async function linkTable(workspaceId: string, tablePath: string): Promise<LinkedTable> {
  // Check if already linked
  const existing = await db.linkedTables
    .where("[workspaceId+tablePath]")
    .equals([workspaceId, tablePath])
    .first()
  
  if (existing) {
    return existing
  }
  
  const linkedTable: LinkedTable = {
    id: generateId(),
    workspaceId,
    tablePath,
    addedAt: new Date(),
  }
  await db.linkedTables.add(linkedTable)
  return linkedTable
}

/**
 * Unlink a table from a workspace (also removes associated notes)
 */
export async function unlinkTable(workspaceId: string, tablePath: string): Promise<void> {
  await db.transaction("rw", [db.linkedTables, db.tableNotes, db.columnNotes], async () => {
    // Delete linked table record
    await db.linkedTables
      .where("[workspaceId+tablePath]")
      .equals([workspaceId, tablePath])
      .delete()
    
    // Delete associated table note and column notes
    const tableNote = await db.tableNotes
      .where("[workspaceId+tablePath]")
      .equals([workspaceId, tablePath])
      .first()
    
    if (tableNote) {
      await db.columnNotes.where("tableNoteId").equals(tableNote.id).delete()
      await db.tableNotes.delete(tableNote.id)
    }
  })
}

/**
 * Check if a table is linked to a workspace
 */
export async function isTableLinked(workspaceId: string, tablePath: string): Promise<boolean> {
  const linked = await db.linkedTables
    .where("[workspaceId+tablePath]")
    .equals([workspaceId, tablePath])
    .first()
  return !!linked
}

/**
 * Get all linked tables for a workspace
 */
export async function getLinkedTables(workspaceId: string): Promise<LinkedTable[]> {
  return db.linkedTables.where("workspaceId").equals(workspaceId).toArray()
}

/**
 * Get all linked table paths for a workspace (for filtering)
 */
export async function getLinkedTablePaths(workspaceId: string): Promise<Set<string>> {
  const linkedTables = await db.linkedTables.where("workspaceId").equals(workspaceId).toArray()
  return new Set(linkedTables.map(lt => lt.tablePath))
}

/**
 * Get linked tables with their notes for a workspace
 */
export async function getLinkedTablesWithNotes(workspaceId: string): Promise<{
  linkedTables: (LinkedTable & { 
    tableNote?: TableNote & { columnNotes: ColumnNote[] } 
  })[]
}> {
  const linkedTables = await db.linkedTables.where("workspaceId").equals(workspaceId).toArray()
  
  const linkedTablesWithNotes = await Promise.all(
    linkedTables.map(async (linkedTable) => {
      const tableNote = await db.tableNotes
        .where("[workspaceId+tablePath]")
        .equals([workspaceId, linkedTable.tablePath])
        .first()
      
      if (tableNote) {
        const columnNotes = await db.columnNotes.where("tableNoteId").equals(tableNote.id).toArray()
        return { ...linkedTable, tableNote: { ...tableNote, columnNotes } }
      }
      
      return linkedTable
    })
  )
  
  return { linkedTables: linkedTablesWithNotes }
}

// ============================================================================
// Chat Conversation Functions
// ============================================================================

/**
 * Create a new chat conversation
 */
export async function createChatConversation(title: string = "New Chat"): Promise<ChatConversation> {
  const now = new Date()
  const conversation: ChatConversation = {
    id: generateId(),
    title,
    createdAt: now,
    updatedAt: now,
  }
  await db.chatConversations.add(conversation)
  return conversation
}

/**
 * Update a chat conversation's title or updatedAt
 */
export async function updateChatConversation(
  id: string,
  updates: Partial<Pick<ChatConversation, "title">>
): Promise<void> {
  await db.chatConversations.update(id, {
    ...updates,
    updatedAt: new Date(),
  })
}

/**
 * Delete a chat conversation and all its messages
 */
export async function deleteChatConversation(id: string): Promise<void> {
  await db.transaction("rw", [db.chatConversations, db.chatMessages], async () => {
    await db.chatMessages.where("conversationId").equals(id).delete()
    await db.chatConversations.delete(id)
  })
}

/**
 * Add a message to a conversation and touch the conversation's updatedAt
 */
export async function addChatMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Promise<ChatMessage> {
  const msg: ChatMessage = {
    id: generateId(),
    conversationId,
    role,
    content,
    createdAt: new Date(),
  }
  await db.transaction("rw", [db.chatMessages, db.chatConversations], async () => {
    await db.chatMessages.add(msg)
    await db.chatConversations.update(conversationId, { updatedAt: new Date() })
  })
  return msg
}

/**
 * Get all messages for a conversation, ordered by creation time
 */
export async function getChatMessages(conversationId: string): Promise<ChatMessage[]> {
  return db.chatMessages.where("conversationId").equals(conversationId).sortBy("createdAt")
}

/**
 * Replace all messages for a conversation (used when syncing from useChat)
 */
export async function syncChatMessages(
  conversationId: string,
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<void> {
  await db.transaction("rw", [db.chatMessages, db.chatConversations], async () => {
    await db.chatMessages.where("conversationId").equals(conversationId).delete()
    const now = new Date()
    const records: ChatMessage[] = messages.map((m, i) => ({
      id: generateId(),
      conversationId,
      role: m.role,
      content: m.content,
      createdAt: new Date(now.getTime() + i), // ensure ordering
    }))
    await db.chatMessages.bulkAdd(records)
    await db.chatConversations.update(conversationId, { updatedAt: new Date() })
  })
}

/**
 * Delete all chat conversations and messages
 */
export async function clearAllChatConversations(): Promise<void> {
  await db.transaction("rw", [db.chatConversations, db.chatMessages], async () => {
    await db.chatMessages.clear()
    await db.chatConversations.clear()
  })
}
