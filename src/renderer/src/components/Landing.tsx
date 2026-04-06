// FORK: action-first Landing page — repos, new worktree, recent activity.
import { useState, useEffect, useMemo } from 'react'
import { FolderPlus, GitBranchPlus } from 'lucide-react'
import { useAppStore } from '../store'
import { getRecentSessions, type SessionInfo } from '@/lib/session-providers'
import { formatRelativeTime } from '@/lib/relative-time'
import React from 'react'
import { TOOL_ICON_COMPONENTS, GenericToolIcon } from '@/lib/tool-icons'
import logo from '../../../../resources/logo.svg'

export default function Landing(): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const addRepo = useAppStore((s) => s.addRepo)
  const openModal = useAppStore((s) => s.openModal)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const setActiveWorktree = useAppStore((s) => s.setActiveWorktree)
  const createTab = useAppStore((s) => s.createTab)
  const queueTabStartupCommand = useAppStore((s) => s.queueTabStartupCommand)

  const [sessions, setSessions] = useState<SessionInfo[]>([])

  useEffect(() => {
    getRecentSessions(null, 8)
      .then(setSessions)
      .catch(() => setSessions([]))
  }, [])

  // Match sessions to worktree display names for badges
  const allWorktrees = useMemo(() => {
    return Object.values(worktreesByRepo).flat()
  }, [worktreesByRepo])

  // FORK: match sessions to worktrees. For scoped sessions, worktreePath is
  // an actual path. For global sessions, it's an encoded directory name
  // (e.g. "-Users-sasha-project"). We try both: direct path prefix match,
  // then encoded path match.
  const matchWorktree = (session: SessionInfo) => {
    if (!session.worktreePath) {
      return null
    }
    const sp = session.worktreePath
    return allWorktrees.find((w) => sp.startsWith(w.path) || sp === w.path.replace(/\//g, '-'))
  }

  const handleSessionClick = (session: SessionInfo) => {
    const wt = matchWorktree(session)
    if (!wt) {
      return
    }
    // Activate worktree then create tab with resume command.
    // createTab works synchronously on the store, so no race condition.
    setActiveWorktree(wt.id)
    const tab = createTab(wt.id)
    queueTabStartupCommand(tab.id, { command: session.resumeCommand })
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
              <div className="text-[14px] uppercase tracking-wider text-muted-foreground/50 mb-2">
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
                        <div className="text-[15px] font-semibold text-foreground">
                          {repo.displayName}
                        </div>
                        <div className="text-[15px] text-muted-foreground/50">
                          {worktreeCount} worktree{worktreeCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="text-[14px] text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-md shrink-0">
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
              <span className="text-[15px]">Add new repository</span>
            </button>
          </div>

          {/* Tertiary: recent activity */}
          {sessions.length > 0 && (
            <div className="w-full max-w-sm mt-2">
              <div className="text-[14px] uppercase tracking-wider text-muted-foreground/40 mb-2">
                Recent activity
              </div>
              <div className="flex flex-col gap-0.5">
                {sessions.map((session) => {
                  const wt = matchWorktree(session)
                  return (
                    <button
                      key={`${session.toolId}-${session.id}`}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-accent/20 transition-colors w-full text-left outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => handleSessionClick(session)}
                      disabled={!wt}
                      title={wt ? `Resume in ${wt.displayName}` : 'Worktree no longer exists'}
                    >
                      {React.createElement(
                        TOOL_ICON_COMPONENTS[session.toolId] ?? GenericToolIcon,
                        { className: 'w-4 h-4 shrink-0 text-foreground/50' }
                      )}
                      <span className="text-[14px] text-foreground/60 truncate flex-1">
                        {session.title}
                      </span>
                      {wt && (
                        <span className="text-[14px] text-muted-foreground/40 bg-secondary/50 px-1.5 py-0.5 rounded shrink-0">
                          {wt.displayName}
                        </span>
                      )}
                      <span className="text-[14px] text-muted-foreground/30 shrink-0">
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
