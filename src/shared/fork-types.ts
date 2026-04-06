// FORK: types used by fork-specific features (session history, tool config).
// Kept separate from upstream types.ts to avoid merge conflicts.

export type SessionInfo = {
  id: string
  toolId: string
  title: string
  startedAt: number
  lastActiveAt: number
  resumeCommand: string
  worktreePath?: string
}
