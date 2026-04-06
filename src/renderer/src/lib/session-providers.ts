// FORK: session provider — thin wrapper around ai-sessions IPC.
// All filesystem access happens in main process (no sandbox restrictions).

export type SessionInfo = {
  id: string
  toolId: string
  title: string
  startedAt: number
  lastActiveAt: number
  resumeCommand: string
  worktreePath?: string
}

/**
 * Fetch recent AI tool sessions, optionally scoped to a worktree path.
 * @param worktreePath - null for global (Landing), or worktree.path for scoped (LaunchPanel)
 * @param limit - max sessions to return (default 10)
 */
export async function getRecentSessions(
  worktreePath: string | null,
  limit: number = 10
): Promise<SessionInfo[]> {
  try {
    return await window.api.aiSessions.getRecent({ worktreePath, limit })
  } catch {
    return []
  }
}
