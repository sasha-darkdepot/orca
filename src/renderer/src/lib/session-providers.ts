// FORK: session providers for Claude Code (and future Codex, OpenCode).
// Reads AI tool session history via Electron's preload API (window.api.fs).
// Renderer is sandboxed — no direct Node.js access.
// Used by the Launch Panel (worktree-scoped) and Landing page (global).

export type SessionInfo = {
  id: string
  toolId: string
  title: string
  startedAt: number
  lastActiveAt: number
  resumeCommand: string
  worktreePath?: string
}

// Reverses Claude's directory-to-path encoding.
// Claude stores project dirs as encoded paths, e.g. `-Users-sasha-project`
// which maps back to `/Users/sasha/project`.
function decodeDirToPath(encoded: string): string {
  return encoded.replace(/^-/, '/').replace(/-/g, '/')
}

function homePath(...segments: string[]): string {
  // HOME is available via preload environment
  const home = typeof process !== 'undefined' && process.env?.HOME ? process.env.HOME : '/tmp'
  return [home, ...segments].join('/')
}

// Extract session title from JSONL content (first user message)
function extractTitle(content: string): string {
  const lines = content.split('\n')
  for (const line of lines) {
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
        const firstLine = text.split('\n')[0].trim()
        return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine
      }
    } catch {
      /* skip malformed line */
    }
  }
  return 'Untitled session'
}

// Extract start time from JSONL content (first timestamp)
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

async function getClaudeSessions(
  worktreePath: string | null,
  limit: number
): Promise<SessionInfo[]> {
  const claudeDir = homePath('.claude', 'projects')

  try {
    const exists = await window.api.shell.pathExists(claudeDir)
    if (!exists) {
      return []
    }
  } catch {
    return []
  }

  try {
    if (worktreePath !== null) {
      // Scoped mode: only read the encoded dir for this worktree
      return await readClaudeProjectDir(claudeDir, worktreePath, limit)
    }

    // Global mode: scan all project dirs
    const entries = await window.api.fs.readDir({ dirPath: claudeDir })
    const allSessions: SessionInfo[] = []

    for (const entry of entries) {
      if (!entry.isDirectory) {
        continue
      }
      const decodedPath = decodeDirToPath(entry.name)
      try {
        const sessions = await readClaudeProjectDir(claudeDir, decodedPath, limit)
        allSessions.push(...sessions)
      } catch {
        // skip individual dirs that fail
      }
    }

    return allSessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt).slice(0, limit)
  } catch {
    return []
  }
}

async function readClaudeProjectDir(
  claudeDir: string,
  worktreePath: string,
  limit: number
): Promise<SessionInfo[]> {
  const encoded = worktreePath.replace(/\//g, '-')
  const projectDir = `${claudeDir}/${encoded}`

  try {
    const exists = await window.api.shell.pathExists(projectDir)
    if (!exists) {
      return []
    }
  } catch {
    return []
  }

  const entries = await window.api.fs.readDir({ dirPath: projectDir })
  const jsonlFiles = entries.filter((e) => e.name.endsWith('.jsonl'))

  // Get stats for sorting by mtime
  const filesWithStats: { name: string; path: string; mtime: number }[] = []
  for (const entry of jsonlFiles) {
    const filePath = `${projectDir}/${entry.name}`
    try {
      const stat = await window.api.fs.stat({ filePath })
      filesWithStats.push({ name: entry.name, path: filePath, mtime: stat.mtime })
    } catch {
      // skip files we can't stat
    }
  }

  // Sort by most recent, limit
  filesWithStats.sort((a, b) => b.mtime - a.mtime)
  const top = filesWithStats.slice(0, limit)

  const sessions: SessionInfo[] = []
  for (const f of top) {
    try {
      const { content } = await window.api.fs.readFile({ filePath: f.path })
      // Only use first ~8KB for title/startTime extraction
      const chunk = content.slice(0, 8192)
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
      // skip files we can't read
    }
  }

  return sessions
}

// TODO: Codex and OpenCode providers require shell exec (sqlite3) which is
// not available in the sandboxed renderer. These will be added when an IPC
// handler for shell commands is available. For now, only Claude Code sessions
// are shown.

/**
 * Fetch recent sessions, optionally scoped to a worktree path.
 * @param worktreePath - null for global (Landing), or worktree.path for scoped (LaunchPanel)
 * @param limit - max sessions to return (default 10)
 */
export async function getRecentSessions(
  worktreePath: string | null,
  limit: number = 10
): Promise<SessionInfo[]> {
  const allSessions: SessionInfo[] = []

  try {
    const claudeSessions = await getClaudeSessions(worktreePath, limit)
    allSessions.push(...claudeSessions)
  } catch {
    // Claude provider failed — continue
  }

  return allSessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt).slice(0, limit)
}
