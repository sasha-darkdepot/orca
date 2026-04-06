# Launch Panel & Session History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI tool launch buttons and session history to Orca's worktree and landing views, so users can quickly start Claude/Codex/OpenCode or resume past sessions.

**Architecture:** New session providers read data from `~/.claude/projects/`, Codex SQLite, and OpenCode SQLite. A LaunchPanel component replaces auto-tab-creation for worktrees. Landing page is rewritten as an action-first hub. Tool configs are persisted in UISlice.

**Tech Stack:** React, Zustand, xterm.js (existing), Node.js fs/child_process (renderer), lucide-react icons

**Spec:** `docs/superpowers/specs/2026-04-06-launch-panel-session-history-design.md`

---

## File Structure

| File                                                 | Action  | Responsibility                                            |
| ---------------------------------------------------- | ------- | --------------------------------------------------------- |
| `src/renderer/src/lib/session-providers.ts`          | Create  | Session data providers + aggregation                      |
| `src/renderer/src/lib/relative-time.ts`              | Create  | "2h", "1d" time formatting                                |
| `src/renderer/src/lib/tool-defaults.ts`              | Create  | Default tool configs + ToolConfig type                    |
| `src/renderer/src/components/LaunchPanel.tsx`        | Create  | In-worktree launch panel with tool buttons + session list |
| `src/renderer/src/components/Landing.tsx`            | Rewrite | Action-first landing: repos, add repo, recent activity    |
| `src/renderer/src/store/slices/ui.ts`                | Modify  | Add `toolConfigs` field + setter + persistence            |
| `src/renderer/src/components/settings/ToolsPane.tsx` | Create  | Expandable card UI for tool configuration                 |
| `src/renderer/src/components/settings/Settings.tsx`  | Modify  | Add 'tools' pane to sidebar + content area                |
| `src/renderer/src/components/Terminal.tsx`           | Modify  | Skip auto-tab-creation when LaunchPanel should show       |
| `src/renderer/src/App.tsx`                           | Modify  | Render LaunchPanel when worktree has no tabs              |

---

### Task 1: Utility — relative-time formatter

**Files:**

- Create: `src/renderer/src/lib/relative-time.ts`

- [ ] **Step 1: Create relative-time.ts**

```typescript
// FORK: relative time display for session history
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)

  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`
  if (weeks < 52) return `${weeks}w`
  return `${Math.floor(weeks / 52)}y`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/lib/relative-time.ts
git commit -m "feat: add relative time formatter for session history"
```

---

### Task 2: Tool defaults and types

**Files:**

- Create: `src/renderer/src/lib/tool-defaults.ts`

- [ ] **Step 1: Create tool-defaults.ts**

```typescript
// FORK: tool configuration types and defaults for Launch Panel

export interface ToolConfig {
  id: string
  name: string
  command: string
  color: string
  enabled: boolean
  builtin: boolean
}

export const DEFAULT_TOOLS: ToolConfig[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    color: '#d97706',
    enabled: true,
    builtin: true
  },
  { id: 'codex', name: 'Codex', command: 'codex', color: '#22c55e', enabled: true, builtin: true },
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    color: '#3b82f6',
    enabled: true,
    builtin: true
  }
]

export const TOOL_COLOR_PRESETS = [
  '#d97706',
  '#22c55e',
  '#3b82f6',
  '#ef4444',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16'
]
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/lib/tool-defaults.ts
git commit -m "feat: add tool config types and defaults"
```

---

### Task 3: Session providers

**Files:**

- Create: `src/renderer/src/lib/session-providers.ts`

Reference: `/Users/sasha/Projects/obsidian-terminal/src/session-provider.ts`

- [ ] **Step 1: Create session-providers.ts**

Port the session provider pattern from the Obsidian plugin, adapted for Orca:

```typescript
// FORK: session data providers for Launch Panel + Landing page.
// Reads session history from Claude Code (.jsonl), Codex (SQLite), OpenCode (SQLite).
// Matches sessions to worktrees by filesystem path.
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

export interface SessionInfo {
  id: string
  toolId: string
  title: string
  startedAt: number
  lastActiveAt: number
  resumeCommand: string
  worktreePath?: string
}

interface SessionProvider {
  isAvailable(): boolean
  getRecentSessions(projectPath: string | null, limit: number): SessionInfo[]
}

class ClaudeSessionProvider implements SessionProvider {
  private claudeDir = path.join(process.env.HOME || '', '.claude', 'projects')

  isAvailable(): boolean {
    try {
      return fs.existsSync(this.claudeDir)
    } catch {
      return false
    }
  }

  getRecentSessions(projectPath: string | null, limit: number): SessionInfo[] {
    try {
      if (projectPath) {
        return this.getSessionsForPath(projectPath, limit)
      }
      // Global: scan all project dirs
      const dirs = fs.readdirSync(this.claudeDir).filter((d) => {
        try {
          return fs.statSync(path.join(this.claudeDir, d)).isDirectory()
        } catch {
          return false
        }
      })
      const all: SessionInfo[] = []
      for (const dir of dirs) {
        all.push(...this.getSessionsForDir(path.join(this.claudeDir, dir), limit))
      }
      return all.sort((a, b) => b.lastActiveAt - a.lastActiveAt).slice(0, limit)
    } catch {
      return []
    }
  }

  private getSessionsForPath(projectPath: string, limit: number): SessionInfo[] {
    const encoded = projectPath.replace(/\//g, '-')
    const projectDir = path.join(this.claudeDir, encoded)
    if (!fs.existsSync(projectDir)) return []
    return this.getSessionsForDir(projectDir, limit)
  }

  private getSessionsForDir(dirPath: string, limit: number): SessionInfo[] {
    try {
      const files = fs
        .readdirSync(dirPath)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => {
          const filePath = path.join(dirPath, f)
          const stat = fs.statSync(filePath)
          return { name: f, path: filePath, mtime: stat.mtimeMs }
        })
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, limit)

      return files.map((f) => {
        const sessionId = f.name.replace('.jsonl', '')
        const title = this.extractTitle(f.path)
        return {
          id: sessionId,
          toolId: 'claude-code',
          title,
          startedAt: this.extractStartTime(f.path),
          lastActiveAt: f.mtime,
          resumeCommand: `claude --resume ${sessionId}`,
          worktreePath: this.decodeDirToPath(path.basename(path.dirname(f.path)))
        }
      })
    } catch {
      return []
    }
  }

  private decodeDirToPath(encoded: string): string {
    // Reverse of path.replace(/\//g, '-'): first char is always '-' (leading /)
    // e.g. '-Users-sasha-project' → '/Users/sasha/project'
    return encoded.replace(/-/g, '/')
  }

  private extractTitle(filePath: string): string {
    try {
      const fd = fs.openSync(filePath, 'r')
      const buf = Buffer.alloc(8192)
      const bytesRead = fs.readSync(fd, buf, 0, 8192, 0)
      fs.closeSync(fd)

      const chunk = buf.toString('utf-8', 0, bytesRead)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line)
          if (entry.type === 'user' && entry.message?.content) {
            const content =
              typeof entry.message.content === 'string'
                ? entry.message.content
                : entry.message.content.find(
                    (b: { type: string; text?: string }) => b.type === 'text'
                  )?.text || ''
            const firstLine = content.split('\n')[0].trim()
            return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine
          }
        } catch {
          /* skip malformed line */
        }
      }
    } catch {
      /* file read error */
    }
    return 'Untitled session'
  }

  private extractStartTime(filePath: string): number {
    try {
      const fd = fs.openSync(filePath, 'r')
      const buf = Buffer.alloc(4096)
      const bytesRead = fs.readSync(fd, buf, 0, 4096, 0)
      fs.closeSync(fd)

      const chunk = buf.toString('utf-8', 0, bytesRead)
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line)
          if (entry.timestamp) return new Date(entry.timestamp).getTime()
        } catch {
          /* skip */
        }
      }
    } catch {
      /* file read error */
    }
    return 0
  }
}

function querySqlite(dbPath: string, sql: string): Record<string, string>[] {
  try {
    const result = execSync(`sqlite3 -json "${dbPath}" "${sql.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      timeout: 5000
    })
    return JSON.parse(result)
  } catch {
    return []
  }
}

class CodexSessionProvider implements SessionProvider {
  private dbPath = path.join(process.env.HOME || '', '.codex', 'state_5.sqlite')

  isAvailable(): boolean {
    try {
      return fs.existsSync(this.dbPath)
    } catch {
      return false
    }
  }

  getRecentSessions(projectPath: string | null, limit: number): SessionInfo[] {
    const whereClause = projectPath ? `WHERE cwd LIKE '${projectPath}%'` : ''
    const rows = querySqlite(
      this.dbPath,
      `SELECT id, title, created_at, updated_at, cwd FROM threads ${whereClause} ORDER BY updated_at DESC LIMIT ${limit}`
    )
    return rows.map((row) => {
      const title = (row.title || 'Untitled session').trim()
      return {
        id: row.id,
        toolId: 'codex',
        title: title.length > 60 ? title.slice(0, 57) + '...' : title,
        startedAt: Number(row.created_at) * 1000,
        lastActiveAt: Number(row.updated_at) * 1000,
        resumeCommand: `codex resume ${row.id}`,
        worktreePath: row.cwd || undefined
      }
    })
  }
}

class OpenCodeSessionProvider implements SessionProvider {
  private dbPath = path.join(process.env.HOME || '', '.local', 'share', 'opencode', 'opencode.db')

  isAvailable(): boolean {
    try {
      return fs.existsSync(this.dbPath)
    } catch {
      return false
    }
  }

  getRecentSessions(projectPath: string | null, limit: number): SessionInfo[] {
    const whereClause = projectPath ? `WHERE directory LIKE '${projectPath}%'` : ''
    const rows = querySqlite(
      this.dbPath,
      `SELECT id, title, time_created, time_updated, directory FROM session ${whereClause} ORDER BY time_updated DESC LIMIT ${limit}`
    )
    return rows.map((row) => {
      const title = (row.title || 'Untitled session').trim()
      return {
        id: row.id,
        toolId: 'opencode',
        title: title.length > 60 ? title.slice(0, 57) + '...' : title,
        startedAt: Number(row.time_created),
        lastActiveAt: Number(row.time_updated),
        resumeCommand: `opencode --session ${row.id}`,
        worktreePath: row.directory || undefined
      }
    })
  }
}

// Singleton provider instances
const providers: SessionProvider[] = [
  new ClaudeSessionProvider(),
  new CodexSessionProvider(),
  new OpenCodeSessionProvider()
]

/**
 * Fetch recent sessions, optionally scoped to a worktree path.
 * @param worktreePath - null for global (Landing), or worktree.path for scoped (LaunchPanel)
 * @param limit - max sessions to return (default 10)
 */
export function getRecentSessions(worktreePath: string | null, limit: number = 10): SessionInfo[] {
  const allSessions: SessionInfo[] = []
  for (const provider of providers) {
    if (!provider.isAvailable()) continue
    try {
      allSessions.push(...provider.getRecentSessions(worktreePath, limit))
    } catch {
      /* skip failing provider */
    }
  }
  return allSessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt).slice(0, limit)
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm dev` — check no build errors in console.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/lib/session-providers.ts
git commit -m "feat: add session providers for Claude Code, Codex, OpenCode"
```

---

### Task 4: UISlice — add toolConfigs

**Files:**

- Modify: `src/renderer/src/store/slices/ui.ts`

- [ ] **Step 1: Add import at top of ui.ts**

```typescript
import { type ToolConfig, DEFAULT_TOOLS } from '@/lib/tool-defaults'
```

- [ ] **Step 2: Add state field and setter**

Add `toolConfigs` to the state interface and initial state. Add `setToolConfigs` setter. Find the existing fields near `worktreeCardProperties` and add after them.

In the state type (near other fields):

```typescript
toolConfigs: ToolConfig[]
setToolConfigs: (configs: ToolConfig[]) => void
```

In the initial state:

```typescript
toolConfigs: [...DEFAULT_TOOLS],
setToolConfigs: (configs) =>
  set(() => {
    window.api.ui.set({ toolConfigs: configs }).catch(console.error)
    return { toolConfigs: configs }
  }),
```

- [ ] **Step 3: Add hydration in `hydratePersistedUI`**

In the `hydratePersistedUI` function, where other fields are restored from `data`, add:

```typescript
if (data.toolConfigs) {
  updates.toolConfigs = data.toolConfigs
}
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm dev` — check no build errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/slices/ui.ts
git commit -m "feat: add toolConfigs to UISlice with persistence"
```

---

### Task 5: LaunchPanel component

**Files:**

- Create: `src/renderer/src/components/LaunchPanel.tsx`

This is the in-worktree view: centered hero layout with tool buttons + scoped session history.

- [ ] **Step 1: Create LaunchPanel.tsx**

```typescript
// FORK: Launch Panel — shown inside a worktree when no terminal tabs exist.
// Displays tool launch buttons and worktree-scoped session history.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/store'
import { getRecentSessions, type SessionInfo } from '@/lib/session-providers'
import { formatRelativeTime } from '@/lib/relative-time'
import type { ToolConfig } from '@/lib/tool-defaults'

function groupSessionsByPeriod(sessions: SessionInfo[]): { label: string; sessions: SessionInfo[] }[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86_400_000
  const weekStart = todayStart - 7 * 86_400_000

  const today: SessionInfo[] = []
  const yesterday: SessionInfo[] = []
  const lastWeek: SessionInfo[] = []
  const older: SessionInfo[] = []

  for (const session of sessions) {
    if (session.lastActiveAt >= todayStart) today.push(session)
    else if (session.lastActiveAt >= yesterdayStart) yesterday.push(session)
    else if (session.lastActiveAt >= weekStart) lastWeek.push(session)
    else older.push(session)
  }

  const groups: { label: string; sessions: SessionInfo[] }[] = []
  if (today.length) groups.push({ label: 'Today', sessions: today })
  if (yesterday.length) groups.push({ label: 'Yesterday', sessions: yesterday })
  if (lastWeek.length) groups.push({ label: 'Last week', sessions: lastWeek })
  if (older.length) groups.push({ label: 'Older', sessions: older })
  return groups
}

export default function LaunchPanel({ worktreePath, worktreeName }: { worktreePath: string; worktreeName: string }): React.JSX.Element {
  const toolConfigs = useAppStore((s) => s.toolConfigs)
  const createTab = useAppStore((s) => s.createTab)
  const queueTabStartupCommand = useAppStore((s) => s.queueTabStartupCommand)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)

  const [sessions, setSessions] = useState<SessionInfo[]>([])

  useEffect(() => {
    const result = getRecentSessions(worktreePath, 10)
    setSessions(result)
  }, [worktreePath])

  const enabledTools = useMemo(() => toolConfigs.filter((t) => t.enabled), [toolConfigs])
  const sessionGroups = useMemo(() => groupSessionsByPeriod(sessions), [sessions])

  const launchTool = useCallback(
    (tool: ToolConfig) => {
      if (!activeWorktreeId) return
      const tab = createTab(activeWorktreeId)
      queueTabStartupCommand(tab.id, { command: tool.command })
    },
    [activeWorktreeId, createTab, queueTabStartupCommand]
  )

  const resumeSession = useCallback(
    (session: SessionInfo) => {
      if (!activeWorktreeId) return
      const tab = createTab(activeWorktreeId)
      queueTabStartupCommand(tab.id, { command: session.resumeCommand })
    },
    [activeWorktreeId, createTab, queueTabStartupCommand]
  )

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background overflow-auto">
      <div className="w-full max-w-md px-6 py-8 flex flex-col items-center">
        {/* Worktree name */}
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground/60 mb-5">
          {worktreeName}
        </div>

        {/* Tool buttons */}
        <div className="flex gap-3 mb-7">
          {enabledTools.map((tool, index) => (
            <button
              key={tool.id}
              className="flex flex-col items-center gap-1.5 w-[72px] py-3.5 bg-secondary/50 border border-border/60 rounded-xl cursor-pointer hover:bg-accent/50 transition-colors outline-none focus:ring-1 focus:ring-ring"
              onClick={() => launchTool(tool)}
              title={`Launch ${tool.name} (${index + 1})`}
            >
              <div
                className="w-7 h-7 rounded-md"
                style={{ backgroundColor: tool.color }}
              />
              <span className="text-[11px] text-muted-foreground">{tool.name}</span>
            </button>
          ))}
        </div>

        {/* Session history */}
        {sessionGroups.length > 0 && (
          <div className="w-full max-w-sm">
            {sessionGroups.map((group) => (
              <div key={group.label} className="mb-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5 px-1">
                  {group.label}
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.sessions.map((session) => (
                    <button
                      key={session.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-accent/30 transition-colors w-full text-left outline-none"
                      onClick={() => resumeSession(session)}
                      title={`Resume: ${session.resumeCommand}`}
                    >
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: toolConfigs.find((t) => t.id === session.toolId)?.color ?? '#666' }}
                      />
                      <span className="text-[12px] text-foreground/70 truncate flex-1">{session.title}</span>
                      <span className="text-[11px] text-muted-foreground/40 shrink-0">
                        {formatRelativeTime(session.lastActiveAt)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {sessions.length === 0 && (
          <div className="text-[12px] text-muted-foreground/40 mt-2">No recent sessions</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm dev` — check no build errors. (Component not yet wired in.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/LaunchPanel.tsx
git commit -m "feat: add LaunchPanel component with tool buttons and session history"
```

---

### Task 6: Wire LaunchPanel into App.tsx + Terminal.tsx

**Files:**

- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/Terminal.tsx`

The key integration: when a worktree is active but has zero tabs, show LaunchPanel instead of Terminal. Terminal.tsx currently auto-creates a tab on worktree activation — we need to suppress that.

- [ ] **Step 1: Modify Terminal.tsx — skip auto-tab-creation**

In `src/renderer/src/components/Terminal.tsx`, find the effect at ~line 124-147 that auto-creates a tab when `tabs.length === 0`. Add a store field check to skip auto-creation.

The simplest approach: add a UI store field `launchPanelEnabled` (default `true`). When enabled and tabs.length === 0, don't auto-create.

Actually simpler: just remove the auto-create behavior entirely for the case when tabs.length === 0. The LaunchPanel or manual "new tab" button will create tabs instead.

Find this code block in Terminal.tsx (~line 124-147):

```typescript
useEffect(() => {
  if (!workspaceSessionReady) {
    return
  }
  if (!activeWorktreeId) {
    initialTabCreationGuardRef.current = null
    return
  }

  if (tabs.length > 0) {
    if (initialTabCreationGuardRef.current === activeWorktreeId) {
      initialTabCreationGuardRef.current = null
    }
    return
  }

  // In React StrictMode (dev), mount effects are intentionally invoked twice.
  // Track the worktree we already initialized so we only create one first tab.
  if (initialTabCreationGuardRef.current === activeWorktreeId) {
    return
  }
  initialTabCreationGuardRef.current = activeWorktreeId
  createTab(activeWorktreeId)
}, [workspaceSessionReady, activeWorktreeId, tabs.length, createTab])
```

Replace the last 4 lines (the `createTab` call and its guard) so that auto-creation is skipped. The entire effect becomes:

```typescript
// FORK: don't auto-create tabs — LaunchPanel handles initial tab creation
// when user clicks a tool button. Only clear the guard when tabs exist.
useEffect(() => {
  if (!workspaceSessionReady) {
    return
  }
  if (!activeWorktreeId) {
    initialTabCreationGuardRef.current = null
    return
  }

  if (tabs.length > 0) {
    if (initialTabCreationGuardRef.current === activeWorktreeId) {
      initialTabCreationGuardRef.current = null
    }
    return
  }
}, [workspaceSessionReady, activeWorktreeId, tabs.length])
```

- [ ] **Step 2: Modify App.tsx — render LaunchPanel**

In `src/renderer/src/App.tsx`, add the LaunchPanel import and rendering logic.

Add import at top:

```typescript
import LaunchPanel from './components/LaunchPanel'
```

Add selectors in the AppLayout component (near existing selectors):

```typescript
const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)
```

Add a derived value:

```typescript
// FORK: determine if LaunchPanel should show (worktree active, no tabs)
const showLaunchPanel = useMemo(() => {
  if (!activeWorktreeId || activeView !== 'terminal') return null
  const tabs = tabsByWorktree[activeWorktreeId] ?? []
  if (tabs.length > 0) return null
  // Find the worktree object for path + name
  for (const worktrees of Object.values(worktreesByRepo)) {
    const wt = worktrees.find((w) => w.id === activeWorktreeId)
    if (wt) return { path: wt.path, name: wt.displayName }
  }
  return null
}, [activeWorktreeId, activeView, tabsByWorktree, worktreesByRepo])
```

Replace the rendering block (~line 424-433). Change from:

```tsx
;<div
  className={
    activeView === 'settings' || !activeWorktreeId
      ? 'hidden flex-1 min-w-0 min-h-0'
      : 'flex flex-1 min-w-0 min-h-0'
  }
>
  <Terminal />
</div>
{
  activeView === 'settings' ? <Settings /> : !activeWorktreeId ? <Landing /> : null
}
```

To:

```tsx
;<div
  className={
    activeView === 'settings' || !activeWorktreeId || showLaunchPanel
      ? 'hidden flex-1 min-w-0 min-h-0'
      : 'flex flex-1 min-w-0 min-h-0'
  }
>
  <Terminal />
</div>
{
  activeView === 'settings' ? (
    <Settings />
  ) : !activeWorktreeId ? (
    <Landing />
  ) : showLaunchPanel ? (
    <LaunchPanel worktreePath={showLaunchPanel.path} worktreeName={showLaunchPanel.name} />
  ) : null
}
```

- [ ] **Step 3: Test manually**

Run `pnpm dev`. Select a worktree that has no open tabs (or close all tabs in a worktree). You should see:

- Worktree name in small caps
- Tool buttons for Claude Code, Codex, OpenCode
- Recent sessions for that worktree (if any exist in `~/.claude/projects/`)
- Clicking a tool button creates a tab and spawns the CLI

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/Terminal.tsx
git commit -m "feat: wire LaunchPanel into App — show when worktree has no tabs"
```

---

### Task 7: Rewrite Landing page

**Files:**

- Modify: `src/renderer/src/components/Landing.tsx`

Rewrite to action-first layout: repos with "+ New branch", add repo, recent activity.

- [ ] **Step 1: Rewrite Landing.tsx**

```typescript
// FORK: action-first Landing page — repos, new worktree, recent activity.
import { useState, useEffect, useMemo } from 'react'
import { FolderPlus, GitBranchPlus } from 'lucide-react'
import { useAppStore } from '../store'
import { getRecentSessions, type SessionInfo } from '@/lib/session-providers'
import { formatRelativeTime } from '@/lib/relative-time'
import logo from '../../../../resources/logo.svg'

export default function Landing(): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const addRepo = useAppStore((s) => s.addRepo)
  const openModal = useAppStore((s) => s.openModal)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const setActiveWorktree = useAppStore((s) => s.setActiveWorktree)
  const createTab = useAppStore((s) => s.createTab)
  const queueTabStartupCommand = useAppStore((s) => s.queueTabStartupCommand)
  const toolConfigs = useAppStore((s) => s.toolConfigs)

  const [sessions, setSessions] = useState<SessionInfo[]>([])

  useEffect(() => {
    const result = getRecentSessions(null, 8)
    setSessions(result)
  }, [])

  // Match sessions to worktree display names for badges
  const allWorktrees = useMemo(() => {
    return Object.values(worktreesByRepo).flat()
  }, [worktreesByRepo])

  const matchWorktree = (session: SessionInfo) => {
    if (!session.worktreePath) return null
    return allWorktrees.find((w) => session.worktreePath?.startsWith(w.path))
  }

  const handleSessionClick = (session: SessionInfo) => {
    const wt = matchWorktree(session)
    if (!wt) return
    setActiveWorktree(wt.id)
    // Small delay to let worktree activation settle, then create tab with resume
    setTimeout(() => {
      const tab = createTab(wt.id)
      queueTabStartupCommand(tab.id, { command: session.resumeCommand })
    }, 50)
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background overflow-auto">
      <div className="w-full max-w-lg px-6 py-8">
        <div className="flex flex-col items-center gap-5">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center size-8 rounded-lg border border-border/80 shadow-lg shadow-black/40"
              style={{ backgroundColor: '#12181e' }}
            >
              <img src={logo} alt="Orca" className="size-5" />
            </div>
            <h1 className="text-lg font-bold text-foreground tracking-wide">ORCA</h1>
          </div>

          {/* Primary: repos with create worktree */}
          {repos.length > 0 && (
            <div className="w-full max-w-sm">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">
                Start new work
              </div>
              <div className="flex flex-col gap-1">
                {repos.map((repo) => {
                  const worktreeCount = (worktreesByRepo[repo.id] ?? []).length
                  return (
                    <button
                      key={repo.id}
                      className="flex items-center gap-2.5 px-3.5 py-3 bg-secondary/30 border border-border/50 rounded-lg cursor-pointer hover:bg-accent/30 transition-colors w-full text-left outline-none"
                      onClick={() => openModal('create-worktree', { preselectedRepoId: repo.id })}
                    >
                      <span style={{ color: repo.badgeColor }}>
                        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden>
                          <path d="M3.5 4A1.5 1.5 0 0 0 2 5.5V7h3.879a2.5 2.5 0 0 1 1.768.732l1.414 1.415a.5.5 0 0 0 .354.146H18V7.5A1.5 1.5 0 0 0 16.5 6h-5.086a1 1 0 0 1-.707-.293L9.293 4.293A1 1 0 0 0 8.586 4H3.5Z" />
                          <path d="M2 9.5v5A1.5 1.5 0 0 0 3.5 16h13a1.5 1.5 0 0 0 1.5-1.5v-5H9.415a2.5 2.5 0 0 1-1.768-.732L6.232 7.354a.5.5 0 0 0-.354-.147H2v2.293Z" />
                        </svg>
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-foreground">{repo.displayName}</div>
                        <div className="text-[11px] text-muted-foreground/50">{worktreeCount} worktree{worktreeCount !== 1 ? 's' : ''}</div>
                      </div>
                      <div className="text-[12px] text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-md shrink-0">
                        <GitBranchPlus className="size-3.5 inline mr-1" />
                        New branch
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Secondary: add repo */}
          <div className="w-full max-w-sm">
            <button
              className="flex items-center justify-center gap-2 w-full px-3.5 py-2.5 border border-dashed border-border/60 rounded-lg cursor-pointer hover:bg-accent/20 transition-colors text-muted-foreground/60 outline-none"
              onClick={addRepo}
            >
              <FolderPlus className="size-3.5" />
              <span className="text-[13px]">Add new repository</span>
            </button>
          </div>

          {/* Tertiary: recent activity */}
          {sessions.length > 0 && (
            <div className="w-full max-w-sm mt-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/40 mb-2">
                Recent activity
              </div>
              <div className="flex flex-col gap-0.5">
                {sessions.map((session) => {
                  const wt = matchWorktree(session)
                  const toolColor = toolConfigs.find((t) => t.id === session.toolId)?.color ?? '#666'
                  return (
                    <button
                      key={`${session.toolId}-${session.id}`}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-accent/20 transition-colors w-full text-left outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => handleSessionClick(session)}
                      disabled={!wt}
                      title={wt ? `Resume in ${wt.displayName}` : 'Worktree no longer exists'}
                    >
                      <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: toolColor }} />
                      <span className="text-[12px] text-foreground/60 truncate flex-1">{session.title}</span>
                      {wt && (
                        <span className="text-[10px] text-muted-foreground/40 bg-secondary/50 px-1.5 py-0.5 rounded shrink-0">
                          {wt.displayName}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground/30 shrink-0">
                        {formatRelativeTime(session.lastActiveAt)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Test manually**

Run `pnpm dev`. With no worktree selected:

- Should see Orca logo + repos with "New branch" buttons
- "Add new repository" dashed button
- Recent activity at bottom (if sessions exist)
- Clicking a repo card opens Create Worktree dialog
- Clicking a session activates its worktree and resumes

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Landing.tsx
git commit -m "feat: rewrite Landing as action-first hub with repos and session history"
```

---

### Task 8: Settings — Tools pane

**Files:**

- Create: `src/renderer/src/components/settings/ToolsPane.tsx`
- Modify: `src/renderer/src/components/settings/Settings.tsx`

- [ ] **Step 1: Create ToolsPane.tsx**

```typescript
// FORK: Settings pane for configuring Launch Panel tools.
// Expandable cards with name, command, color, enabled toggle.
import { useState, useCallback } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '@/store'
import { TOOL_COLOR_PRESETS, type ToolConfig } from '@/lib/tool-defaults'

function ToolCard({ tool, onUpdate, onRemove }: {
  tool: ToolConfig
  onUpdate: (updates: Partial<ToolConfig>) => void
  onRemove: (() => void) | null
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`border rounded-lg overflow-hidden ${expanded ? 'border-ring/50' : 'border-border/50'}`}>
      {/* Collapsed header */}
      <button
        className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-accent/20 transition-colors outline-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-5 h-5 rounded-md shrink-0" style={{ backgroundColor: tool.color }} />
        <span className="text-[13px] font-medium text-foreground flex-1">{tool.name}</span>
        {!tool.enabled && (
          <span className="text-[10px] text-muted-foreground/50 bg-secondary/50 px-1.5 py-0.5 rounded">off</span>
        )}
        {expanded ? <ChevronUp className="size-3.5 text-muted-foreground/50" /> : <ChevronDown className="size-3.5 text-muted-foreground/50" />}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/30 flex flex-col gap-3">
          {/* Display name */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block mb-1">Display name</label>
            <input
              type="text"
              className="w-full bg-background border border-border/50 rounded-md px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-ring/50"
              value={tool.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
            />
          </div>

          {/* Command */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block mb-1">Command</label>
            <input
              type="text"
              className="w-full bg-background border border-border/50 rounded-md px-2.5 py-1.5 text-[12px] text-foreground font-mono outline-none focus:border-ring/50"
              value={tool.command}
              onChange={(e) => onUpdate({ command: e.target.value })}
            />
          </div>

          {/* Color */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 block mb-1">Color</label>
            <div className="flex gap-1.5">
              {TOOL_COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  className="w-5 h-5 rounded-md outline-none transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    border: tool.color === color ? '2px solid white' : '1px solid rgba(255,255,255,0.1)'
                  }}
                  onClick={() => onUpdate({ color })}
                />
              ))}
            </div>
          </div>

          {/* Toggle + Remove */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-[12px] text-muted-foreground">Enabled</span>
              <button
                className="w-9 h-5 rounded-full transition-colors relative"
                style={{ backgroundColor: tool.enabled ? '#3b82f6' : '#333' }}
                onClick={() => onUpdate({ enabled: !tool.enabled })}
              >
                <div
                  className="w-4 h-4 rounded-full absolute top-0.5 transition-all"
                  style={{
                    backgroundColor: tool.enabled ? 'white' : '#666',
                    left: tool.enabled ? '18px' : '2px'
                  }}
                />
              </button>
            </label>
            {onRemove && (
              <button
                className="text-[11px] text-destructive hover:underline outline-none flex items-center gap-1"
                onClick={onRemove}
              >
                <Trash2 className="size-3" />
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ToolsPane(): React.JSX.Element {
  const toolConfigs = useAppStore((s) => s.toolConfigs)
  const setToolConfigs = useAppStore((s) => s.setToolConfigs)

  const updateTool = useCallback(
    (id: string, updates: Partial<ToolConfig>) => {
      const next = toolConfigs.map((t) => (t.id === id ? { ...t, ...updates } : t))
      setToolConfigs(next)
    },
    [toolConfigs, setToolConfigs]
  )

  const removeTool = useCallback(
    (id: string) => {
      setToolConfigs(toolConfigs.filter((t) => t.id !== id))
    },
    [toolConfigs, setToolConfigs]
  )

  const addTool = useCallback(() => {
    const newTool: ToolConfig = {
      id: `custom-${Date.now()}`,
      name: 'New Tool',
      command: '',
      color: TOOL_COLOR_PRESETS[Math.floor(Math.random() * TOOL_COLOR_PRESETS.length)],
      enabled: true,
      builtin: false
    }
    setToolConfigs([...toolConfigs, newTool])
  }, [toolConfigs, setToolConfigs])

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h3 className="text-[13px] font-semibold text-foreground mb-1">Tools</h3>
        <p className="text-[11px] text-muted-foreground/60">Configure which tools appear in the Launch Panel</p>
      </div>

      <div className="flex flex-col gap-1.5">
        {toolConfigs.map((tool) => (
          <ToolCard
            key={tool.id}
            tool={tool}
            onUpdate={(updates) => updateTool(tool.id, updates)}
            onRemove={tool.builtin ? null : () => removeTool(tool.id)}
          />
        ))}

        <button
          className="flex items-center justify-center gap-1.5 w-full px-3 py-2.5 border border-dashed border-border/50 rounded-lg cursor-pointer hover:bg-accent/20 transition-colors text-muted-foreground/50 outline-none"
          onClick={addTool}
        >
          <Plus className="size-3.5" />
          <span className="text-[13px]">Add custom tool</span>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire ToolsPane into Settings.tsx**

In `src/renderer/src/components/settings/Settings.tsx`:

Add import:

```typescript
import ToolsPane from './ToolsPane'
```

Add `'tools'` to the `selectedPane` union type (~line 26):

```typescript
const [selectedPane, setSelectedPane] = useState<
  'general' | 'appearance' | 'terminal' | 'shortcuts' | 'tools' | 'repo'
>('general')
```

Add a boolean (~line 173):

```typescript
const showToolsPane = selectedPane === 'tools'
```

Add sidebar button after the Shortcuts button (~line 277, copy the pattern of adjacent buttons):

```html
<button className="{`...same" classes as shortcuts button...`} onClick="{()" ="">
  setSelectedPane('tools')} >
  <Wrench className="h-4 w-4 shrink-0" />
  Tools
</button>
```

Add `Wrench` to the lucide-react import.

Add the pane render in the content area (~line 367, before the closing tags):

```tsx
{
  showToolsPane ? <ToolsPane /> : null
}
```

Also hide the tools pane title in the sticky header by adjusting the page title logic:

```typescript
const pageTitle = showGeneralPane
  ? 'General'
  : showAppearancePane
    ? 'Appearance'
    : showTerminalPane
      ? 'Terminal'
      : showShortcutsPane
        ? 'Shortcuts'
        : showToolsPane
          ? 'Tools'
          : showRepoPane
            ? (selectedRepo?.displayName ?? 'Repository')
            : ''
```

- [ ] **Step 3: Test manually**

Run `pnpm dev`. Open Settings → click "Tools" in sidebar:

- See Claude Code, Codex, OpenCode cards
- Click to expand → edit name, command, color
- Toggle enabled/disabled
- Add custom tool
- Changes persist after restart

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/settings/ToolsPane.tsx src/renderer/src/components/settings/Settings.tsx
git commit -m "feat: add Tools settings pane with expandable card configuration"
```

---

### Task 9: Final integration test

- [ ] **Step 1: Full flow test**

Run `pnpm dev` and test the complete flow:

1. **No worktree selected** → Landing shows repos, "add repo", recent activity
2. Click a repo → Create Worktree dialog opens (pre-selected repo)
3. **Select a worktree with no tabs** → LaunchPanel shows with tool buttons + sessions
4. Click "Claude Code" button → terminal tab opens, `claude` command starts
5. Close the tab → LaunchPanel reappears
6. Click a session row → terminal tab opens with resume command
7. **Settings > Tools** → all three tools visible, can toggle/edit/add custom
8. Disable a tool in settings → it disappears from LaunchPanel
9. **Light mode** → verify colors work in both themes

- [ ] **Step 2: Build test**

Run: `pnpm build:mac`
Verify no build errors.

- [ ] **Step 3: Final commit if any fixes needed**

---

## Summary

| Task | What                     | Files                                             |
| ---- | ------------------------ | ------------------------------------------------- |
| 1    | Relative time formatter  | `lib/relative-time.ts`                            |
| 2    | Tool defaults + types    | `lib/tool-defaults.ts`                            |
| 3    | Session providers        | `lib/session-providers.ts`                        |
| 4    | UISlice toolConfigs      | `store/slices/ui.ts`                              |
| 5    | LaunchPanel component    | `components/LaunchPanel.tsx`                      |
| 6    | Wire into App + Terminal | `App.tsx`, `Terminal.tsx`                         |
| 7    | Landing page rewrite     | `components/Landing.tsx`                          |
| 8    | Settings Tools pane      | `settings/ToolsPane.tsx`, `settings/Settings.tsx` |
| 9    | Integration test         | —                                                 |
