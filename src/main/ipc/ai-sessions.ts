// FORK: IPC handler for reading AI tool session history.
// Runs in main process — no sandbox restrictions on filesystem access.
// Claude Code sessions are read from ~/.claude/projects/.
import { ipcMain } from 'electron'
import { readdir, readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

type SessionInfo = {
  id: string
  toolId: string
  title: string
  startedAt: number
  lastActiveAt: number
  resumeCommand: string
  worktreePath?: string
}

function decodeDirToPath(encoded: string): string {
  return encoded.replace(/^-/, '/').replace(/-/g, '/')
}

function extractTitle(content: string): string {
  for (const line of content.split('\n')) {
    if (!line.trim()) {
      continue
    }
    try {
      const entry = JSON.parse(line)
      if (entry.type === 'user' && entry.message?.content) {
        const text =
          typeof entry.message.content === 'string'
            ? entry.message.content
            : (entry.message.content.find((b: { type: string; text?: string }) => b.type === 'text')
                ?.text ?? '')
        // Skip system-injected messages (local-command-caveat, system-reminder, etc.)
        if (text.startsWith('<')) {
          continue
        }
        const firstLine = text.split('\n')[0].trim()
        if (!firstLine) {
          continue
        }
        return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine
      }
    } catch {
      /* skip */
    }
  }
  return 'Untitled session'
}

function extractStartTime(content: string): number {
  for (const line of content.split('\n')) {
    if (!line.trim()) {
      continue
    }
    try {
      const entry = JSON.parse(line)
      if (entry.timestamp) {
        return new Date(entry.timestamp).getTime()
      }
    } catch {
      /* skip */
    }
  }
  return 0
}

async function readClaudeProjectDir(
  projectDir: string,
  worktreePath: string,
  limit: number
): Promise<SessionInfo[]> {
  if (!existsSync(projectDir)) {
    return []
  }
  const entries = await readdir(projectDir)
  const jsonlFiles = entries.filter((f) => f.endsWith('.jsonl'))

  const filesWithStats: { name: string; path: string; mtime: number }[] = []
  for (const name of jsonlFiles) {
    const filePath = join(projectDir, name)
    try {
      const s = await stat(filePath)
      filesWithStats.push({ name, path: filePath, mtime: s.mtimeMs })
    } catch {
      /* skip */
    }
  }

  filesWithStats.sort((a, b) => b.mtime - a.mtime)
  const top = filesWithStats.slice(0, limit)

  const sessions: SessionInfo[] = []
  for (const f of top) {
    try {
      const raw = await readFile(f.path, 'utf-8')
      const chunk = raw.slice(0, 8192)
      const sessionId = f.name.replace('.jsonl', '')
      sessions.push({
        id: sessionId,
        toolId: 'claude-code',
        title: extractTitle(chunk),
        startedAt: extractStartTime(chunk),
        lastActiveAt: f.mtime,
        resumeCommand: `claude --resume ${sessionId}`,
        worktreePath
      })
    } catch {
      /* skip */
    }
  }
  return sessions
}

async function getClaudeSessions(
  worktreePath: string | null,
  limit: number
): Promise<SessionInfo[]> {
  const claudeDir = join(homedir(), '.claude', 'projects')
  if (!existsSync(claudeDir)) {
    return []
  }

  if (worktreePath !== null) {
    const encoded = worktreePath.replace(/\//g, '-')
    return readClaudeProjectDir(join(claudeDir, encoded), worktreePath, limit)
  }

  // Global: scan all project dirs
  const entries = await readdir(claudeDir, { withFileTypes: true })
  const all: SessionInfo[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    try {
      const decoded = decodeDirToPath(entry.name)
      const sessions = await readClaudeProjectDir(join(claudeDir, entry.name), decoded, limit)
      all.push(...sessions)
    } catch {
      /* skip */
    }
  }
  return all.sort((a, b) => b.lastActiveAt - a.lastActiveAt).slice(0, limit)
}

export function registerAiSessionHandlers(): void {
  ipcMain.handle(
    'ai-sessions:getRecent',
    async (
      _event,
      args: { worktreePath: string | null; limit: number }
    ): Promise<SessionInfo[]> => {
      try {
        return await getClaudeSessions(args.worktreePath, args.limit)
      } catch {
        return []
      }
    }
  )
}
