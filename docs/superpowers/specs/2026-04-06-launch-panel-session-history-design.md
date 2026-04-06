# Launch Panel & Session History — Design Spec

**Date:** 2026-04-06
**Branch:** sasha-darkdepot/ui-polish-1
**Scope:** UX surface only (fork territory). No changes to `src/main/`, IPC, or shared types.

## Problem

Orca's terminal starts empty — no quick way to launch AI tools (Claude Code, Codex, OpenCode) or see what you've been working on. The Landing page is a dead end when no worktree is selected. Session history is invisible: close a session and it's gone.

## Solution

Two new UI surfaces + a data layer:

1. **Launch Panel** — shown inside a worktree when no PTY is running
2. **Landing Page** (rewrite) — shown when no worktree is selected
3. **Session Providers** — read session data from Claude/Codex/OpenCode, matched to worktrees

## Reference Implementation

Based on the Obsidian terminal plugin (`/Users/sasha/Projects/obsidian-terminal`) which implements the same pattern: tool buttons + session history with resume. Adapted for Orca's worktree model.

---

## Architecture

### New Files

| File                                          | Purpose                                                 |
| --------------------------------------------- | ------------------------------------------------------- |
| `src/renderer/src/lib/session-providers.ts`   | Session data providers for Claude Code, Codex, OpenCode |
| `src/renderer/src/components/LaunchPanel.tsx` | In-worktree launch panel + session history              |
| `src/renderer/src/components/Landing.tsx`     | Rewritten landing page (action-first)                   |

### Modified Files (minimal diff)

| File                                    | Change                                  |
| --------------------------------------- | --------------------------------------- |
| `src/renderer/src/store/slices/ui.ts`   | Add `toolConfigs: ToolConfig[]`         |
| `src/renderer/src/components/settings/` | Add Tools section with expandable cards |

### NOT Modified

- `src/main/` — no IPC changes
- `src/shared/` — no type changes
- `src/renderer/src/components/terminal-pane/` — upstream territory

---

## Data Layer: Session Providers

### Interface

```typescript
interface SessionInfo {
  id: string
  toolId: string // 'claude-code' | 'codex' | 'opencode' | custom
  title: string // First user message (truncated 60 chars)
  startedAt: number // epoch ms
  lastActiveAt: number // epoch ms
  resumeCommand: string // e.g. 'claude --resume abc123'
  worktreePath?: string // matched worktree path (for Landing badge)
}

interface ToolConfig {
  id: string
  name: string // Display name
  command: string // Shell command to launch
  color: string // Hex color for icon
  enabled: boolean
  builtin: boolean // true for presets, false for user-added
}
```

### Providers

**ClaudeSessionProvider**

- Reads `~/.claude/projects/{encoded-path}/*.jsonl`
- Path encoding: `worktree.path.replace(/\//g, '-')`
- Title: first user message from JSONL (first 8KB, parse until `type === 'user'`)
- Resume: `claude --resume {sessionId}`

**CodexSessionProvider**

- Queries `~/.codex/state_5.sqlite` via shell: `sqlite3 -json`
- Filter: `WHERE cwd LIKE '{worktree.path}%'`
- Resume: `codex resume {id}`

**OpenCodeSessionProvider**

- Queries `~/.local/share/opencode/opencode.db` via shell: `sqlite3 -json`
- Filter: `WHERE directory LIKE '{worktree.path}%'`
- Resume: `opencode --session {id}`

### Aggregation

```typescript
function getRecentSessions(worktreePath: string | null, limit: number): SessionInfo[]
```

- `worktreePath = null` → no path filter (all sessions, for Landing)
- `worktreePath = '/Users/.../ui-polish-1'` → scoped to worktree
- Sorted by `lastActiveAt` descending
- Graceful degradation: if a provider fails (no sqlite3, no dir), skip it silently

### Execution in Renderer

Session providers run in the renderer process:

- Claude: `fs` via Node.js integration (Electron renderer has access)
- Codex/OpenCode: `child_process.execSync('sqlite3 -json ...')` via shell
- If `sqlite3` binary is missing, those providers return empty arrays

---

## Launch Panel (in-worktree)

### When Shown

When a worktree is active (`activeWorktreeId !== null`) but no terminal tab has a live PTY (`ptyId === null` for all tabs of this worktree). Also shown after a process exits (with exit status pill).

### Integration Point

Rendered in `App.tsx` center area, same slot where `Terminal` component currently renders. Condition: if active worktree exists but has no live PTY tabs → show `<LaunchPanel>` instead of `<Terminal>`. When user clicks a tool/session → tab is created with startup command → PTY spawns → LaunchPanel unmounts, Terminal mounts.

### Layout: Centered Hero

```
┌─────────────────────────────────┐
│                                 │
│         UI-POLISH-1             │  ← worktree name, small caps, muted
│                                 │
│   ┌──────┐ ┌──────┐ ┌──────┐   │
│   │ icon │ │ icon │ │ icon │   │  ← tool buttons (from toolConfigs)
│   │Claude│ │Codex │ │O.Code│   │     click → spawn PTY with tool command
│   └──────┘ └──────┘ └──────┘   │
│                                 │
│   Today                         │  ← session groups (Today/Yesterday/etc)
│   ┌─ ● fix sidebar status  2h  │  ← tool color dot, title, relative time
│   └─ ● refactor WorktreeC  5h  │     click → spawn PTY with resume command
│   Yesterday                     │
│   └─ ● add folder icons    1d  │
│                                 │
└─────────────────────────────────┘
```

### Exit State

When a process exits, the Launch Panel reappears with a pill banner at top:

- Success: "Session ended" (neutral)
- Error: "Exited with code {N}" (red tint)
- Signal: "Process terminated" (red tint)

### Tool Button Behavior

Click a tool button → creates a new terminal tab → spawns PTY with:

- `cwd`: worktree path
- Startup command: tool's `command` field (e.g. `claude`)

### Session Row Behavior

Click a session row → creates a new terminal tab → spawns PTY with:

- `cwd`: worktree path
- Startup command: session's `resumeCommand` (e.g. `claude --resume abc123`)

### Keyboard

Number keys 1-N select tools (like Obsidian plugin). Focus auto-placed on last-used tool.

---

## Landing Page (no worktree)

### When Shown

When `activeWorktreeId === null` (no worktree selected).

### Layout: Action-first

Priority hierarchy: new work in existing repo → new project → recent activity.

```
┌─────────────────────────────────┐
│        🐋 ORCA                  │
│                                 │
│   Start new work                │  ← section label
│   ┌─────────────────────────┐   │
│   │ 📁 orca    4 worktrees  │+  │  ← repo card, click "+" → create worktree
│   │ 📁 zeni    2 worktrees  │+  │     (pre-selects repo in create dialog)
│   └─────────────────────────┘   │
│                                 │
│   ┌─ + Add new repository ──┐   │  ← dashed border, secondary
│                                 │
│   Recent activity               │  ← section label, de-emphasized
│   ● fix sidebar indicator  [ui-polish-1]  2h  │  ← tool dot, title, worktree badge, time
│   ● implement auth         [feature/auth] 4h  │     click → activate worktree + resume
│   ● refactor queries       [main]         1d  │
└─────────────────────────────────┘
```

### Repo Card Behavior

Click anywhere on repo card → opens Create Worktree dialog with `preselectedRepoId`. The entire card is the action — no separate expand behavior.

### Session Row Behavior

Click session row → `setActiveWorktree(matchedWorktreeId)` + spawn PTY with resume command.
If worktree no longer exists → row shown as disabled/faded.

### Worktree Badge

Small chip showing worktree `displayName`, helps orient across repos.

---

## Settings: Tools Configuration

### Location

New section in Settings pane, below existing sections.

### Layout: Expandable Cards

Each tool shown as a collapsed row (icon + name). Click to expand:

**Collapsed:**

```
┌─ [●] Claude Code                    ▾ ─┐
```

**Expanded:**

```
┌─ [●] Codex                          ▴ ─┐
│                                         │
│  Display name   [Codex            ]     │
│  Command        [codex            ]     │
│  Color          ● ● ● ● ●  (picker)    │
│                                         │
│  Enabled [toggle]          Remove       │
└─────────────────────────────────────────┘
```

### Default Tools

Three built-in tools (cannot be removed, only disabled):

| ID            | Name        | Command    | Color             | Enabled |
| ------------- | ----------- | ---------- | ----------------- | ------- |
| `claude-code` | Claude Code | `claude`   | `#d97706` (amber) | `true`  |
| `codex`       | Codex       | `codex`    | `#22c55e` (green) | `true`  |
| `opencode`    | OpenCode    | `opencode` | `#3b82f6` (blue)  | `true`  |

### Custom Tools

"+ Add custom tool" button at bottom. Custom tools have all fields editable + a "Remove" button.

### Persistence

`toolConfigs` stored in `UISlice` and persisted via existing `ui:set` / `ui:get` IPC (already used for sidebar width, sort order, etc.).

---

## Worktree ↔ Session Matching

Each worktree has a `path` on disk (e.g. `/Users/sasha/orca/workspaces/orca/ui-polish-1`).

| Tool        | Match strategy                                              |
| ----------- | ----------------------------------------------------------- |
| Claude Code | Directory: `~/.claude/projects/{path.replace(/\//g, '-')}/` |
| Codex       | SQL: `WHERE cwd LIKE '{path}%'`                             |
| OpenCode    | SQL: `WHERE directory LIKE '{path}%'`                       |

**Landing (global):** no path filter — returns all sessions across all worktrees. Each session is matched to a worktree by comparing `cwd`/path against known `worktreesByRepo` paths for badge display.

**Launch Panel (scoped):** filtered by active worktree's `path`.

---

## Out of Scope

- **Session persistence / daemon architecture** — requires src/main/ changes (upstream)
- **powerMonitor sleep/wake handlers** — requires src/main/ changes
- **PTY reconnection** — requires src/main/ changes
- **Scrollback buffer viewer** — future enhancement, data already in `buffersByLeafId`
- **Command palette** — future enhancement
