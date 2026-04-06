// FORK: session providers for Claude Code, Codex, and OpenCode
// Reads AI tool session history from the filesystem.
// Used by the Launch Panel (worktree-scoped) and Landing page (global).
// Runs in Electron renderer with Node.js integration enabled.

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

export type SessionInfo = {
  id: string
  toolId: string
  title: string
  startedAt: number
  lastActiveAt: number
  resumeCommand: string
  // Present when the session belongs to a specific worktree path.
  // Used by the Landing page to show per-path badges.
  worktreePath?: string
}

type SessionProvider = {
  isAvailable(): boolean
  getRecentSessions(worktreePath: string | null, limit: number): SessionInfo[]
}

// Reverses Claude's directory-to-path encoding.
// Claude stores project dirs as encoded paths, e.g. `-Users-sasha-project`
// which maps back to `/Users/sasha/project`.
function decodeDirToPath(encoded: string): string {
  // Leading `-` represents the root `/`
  return encoded.replace(/^-/, '/').replace(/-/g, '/')
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

class ClaudeSessionProvider implements SessionProvider {
  private claudeDir = path.join(process.env.HOME || '', '.claude', 'projects')

  isAvailable(): boolean {
    try {
      return fs.existsSync(this.claudeDir)
    } catch {
      return false
    }
  }

  getRecentSessions(worktreePath: string | null, limit: number): SessionInfo[] {
    try {
      if (worktreePath !== null) {
        // Scoped mode: read only the encoded project dir for this path
        return this.readProjectDir(worktreePath, limit)
      }

      // Global mode: scan ALL project dirs under ~/.claude/projects/
      const entries = fs.readdirSync(this.claudeDir, { withFileTypes: true })
      const allSessions: SessionInfo[] = []

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue
        }
        const decodedPath = decodeDirToPath(entry.name)
        try {
          const sessions = this.readProjectDir(decodedPath, limit)
          allSessions.push(...sessions)
        } catch {
          // skip individual project dirs that fail
        }
      }

      return allSessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt).slice(0, limit)
    } catch {
      return []
    }
  }

  private readProjectDir(worktreePath: string, limit: number): SessionInfo[] {
    const encoded = worktreePath.replace(/\//g, '-')
    const projectDir = path.join(this.claudeDir, encoded)

    if (!fs.existsSync(projectDir)) {
      return []
    }

    const files = fs
      .readdirSync(projectDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => {
        const filePath = path.join(projectDir, f)
        const stat = fs.statSync(filePath)
        return { name: f, path: filePath, mtime: stat.mtimeMs }
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit)

    return files.map((f) => {
      const sessionId = f.name.replace('.jsonl', '')
      const title = this.extractTitle(f.path)
      const startedAt = this.extractStartTime(f.path)
      return {
        id: sessionId,
        toolId: 'claude-code',
        title,
        startedAt,
        lastActiveAt: f.mtime,
        resumeCommand: `claude --resume ${sessionId}`,
        worktreePath
      }
    })
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
        if (!line.trim()) {
          continue
        }
        try {
          const entry = JSON.parse(line)
          if (entry.type === 'user' && entry.message?.content) {
            const content =
              typeof entry.message.content === 'string'
                ? entry.message.content
                : (entry.message.content.find(
                    (b: { type: string; text?: string }) => b.type === 'text'
                  )?.text ?? '')
            const firstLine = content.split('\n')[0].trim()
            return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine
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
      const lines = chunk.split('\n')

      for (const line of lines) {
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
    } catch {
      /* file read error */
    }
    return 0
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

  getRecentSessions(worktreePath: string | null, limit: number): SessionInfo[] {
    const whereClause = worktreePath !== null ? `WHERE cwd LIKE '${worktreePath}%'` : ''

    const rows = querySqlite(
      this.dbPath,
      `SELECT id, title, created_at, updated_at, cwd FROM threads ${whereClause} ORDER BY updated_at DESC LIMIT ${limit}`
    )

    return rows.map((row) => {
      const title = (row.title || 'Untitled session').trim()
      return {
        id: row.id,
        toolId: 'codex',
        title: title.length > 60 ? `${title.slice(0, 57)}...` : title,
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

  getRecentSessions(worktreePath: string | null, limit: number): SessionInfo[] {
    const whereClause = worktreePath !== null ? `WHERE directory LIKE '${worktreePath}%'` : ''

    const rows = querySqlite(
      this.dbPath,
      `SELECT id, title, time_created, time_updated, directory FROM session ${whereClause} ORDER BY time_updated DESC LIMIT ${limit}`
    )

    return rows.map((row) => {
      const title = (row.title || 'Untitled session').trim()
      return {
        id: row.id,
        toolId: 'opencode',
        title: title.length > 60 ? `${title.slice(0, 57)}...` : title,
        startedAt: Number(row.time_created),
        lastActiveAt: Number(row.time_updated),
        resumeCommand: `opencode --session ${row.id}`,
        worktreePath: row.directory || undefined
      }
    })
  }
}

// Singleton instances — avoid re-constructing providers on every call
const providers: SessionProvider[] = [
  new ClaudeSessionProvider(),
  new CodexSessionProvider(),
  new OpenCodeSessionProvider()
]

/**
 * Aggregate recent sessions from all available AI tool providers.
 *
 * @param worktreePath - Filesystem path to scope results to, or null for global (all sessions).
 * @param limit - Maximum number of sessions to return, sorted by most recently active.
 */
export function getRecentSessions(worktreePath: string | null, limit: number = 10): SessionInfo[] {
  const allSessions: SessionInfo[] = []

  for (const provider of providers) {
    if (!provider.isAvailable()) {
      continue
    }
    try {
      allSessions.push(...provider.getRecentSessions(worktreePath, limit))
    } catch {
      // Individual provider failures must not break the aggregate result
    }
  }

  return allSessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt).slice(0, limit)
}
