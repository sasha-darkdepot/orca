// FORK: detect and clean up ghost worktrees — directories that exist on disk
// but are not tracked by git (missing .git file). This happens when worktrees
// are pruned externally or their .git links are broken.
import { access, rm } from 'fs/promises'
import { join } from 'path'

/**
 * Check if a worktree path is a "ghost" — directory missing or has no .git file.
 * Ghost worktrees can't be removed via `git worktree remove` because git
 * doesn't know about them.
 */
export async function isGhostWorktree(worktreePath: string): Promise<boolean> {
  try {
    await access(join(worktreePath, '.git'))
    return false
  } catch {
    return true
  }
}

/**
 * Remove a ghost worktree's leftover directory (if it exists) from disk.
 */
export async function cleanGhostWorktree(worktreePath: string): Promise<void> {
  await rm(worktreePath, { recursive: true, force: true }).catch(() => {})
}
