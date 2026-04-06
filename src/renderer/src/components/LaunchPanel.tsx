// FORK: Launch Panel — shown inside a worktree when no terminal tabs exist.
// Displays tool launch buttons and worktree-scoped session history.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/store'
import { getRecentSessions, type SessionInfo } from '@/lib/session-providers'
import { formatRelativeTime } from '@/lib/relative-time'
import type { ToolConfig } from '@/lib/tool-defaults'
import { TOOL_ICONS, GENERIC_TOOL_ICON } from '@/lib/tool-icons'

function groupSessionsByPeriod(
  sessions: SessionInfo[]
): { label: string; sessions: SessionInfo[] }[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86_400_000
  const weekStart = todayStart - 7 * 86_400_000

  const today: SessionInfo[] = []
  const yesterday: SessionInfo[] = []
  const lastWeek: SessionInfo[] = []
  const older: SessionInfo[] = []

  for (const session of sessions) {
    if (session.lastActiveAt >= todayStart) {
      today.push(session)
    } else if (session.lastActiveAt >= yesterdayStart) {
      yesterday.push(session)
    } else if (session.lastActiveAt >= weekStart) {
      lastWeek.push(session)
    } else {
      older.push(session)
    }
  }

  const groups: { label: string; sessions: SessionInfo[] }[] = []
  if (today.length) {
    groups.push({ label: 'Today', sessions: today })
  }
  if (yesterday.length) {
    groups.push({ label: 'Yesterday', sessions: yesterday })
  }
  if (lastWeek.length) {
    groups.push({ label: 'Last week', sessions: lastWeek })
  }
  if (older.length) {
    groups.push({ label: 'Older', sessions: older })
  }
  return groups
}

export default function LaunchPanel({
  worktreePath,
  worktreeName
}: {
  worktreePath: string
  worktreeName: string
}): React.JSX.Element {
  const toolConfigs = useAppStore((s) => s.toolConfigs)
  const createTab = useAppStore((s) => s.createTab)
  const queueTabStartupCommand = useAppStore((s) => s.queueTabStartupCommand)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)

  const [sessions, setSessions] = useState<SessionInfo[]>([])

  useEffect(() => {
    getRecentSessions(worktreePath, 10)
      .then(setSessions)
      .catch(() => setSessions([]))
  }, [worktreePath])

  const enabledTools = useMemo(() => toolConfigs.filter((t) => t.enabled), [toolConfigs])
  const sessionGroups = useMemo(() => groupSessionsByPeriod(sessions), [sessions])

  const launchTool = useCallback(
    (tool: ToolConfig) => {
      if (!activeWorktreeId) {
        return
      }
      const tab = createTab(activeWorktreeId)
      queueTabStartupCommand(tab.id, { command: tool.command })
    },
    [activeWorktreeId, createTab, queueTabStartupCommand]
  )

  const resumeSession = useCallback(
    (session: SessionInfo) => {
      if (!activeWorktreeId) {
        return
      }
      const tab = createTab(activeWorktreeId)
      queueTabStartupCommand(tab.id, { command: session.resumeCommand })
    },
    [activeWorktreeId, createTab, queueTabStartupCommand]
  )

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background overflow-auto">
      <div className="w-full max-w-md px-6 py-8 flex flex-col items-center">
        {/* Worktree name */}
        <div className="text-[13px] uppercase tracking-widest text-muted-foreground/60 mb-5">
          {worktreeName}
        </div>

        {/* Tool buttons */}
        <div className="flex gap-4 mb-8">
          {enabledTools.map((tool, index) => (
            <button
              key={tool.id}
              className="flex flex-col items-center gap-2 w-[96px] py-5 bg-secondary/50 border border-border/60 rounded-xl cursor-pointer hover:bg-accent/50 transition-colors outline-none focus:ring-1 focus:ring-ring"
              onClick={() => launchTool(tool)}
              title={`Launch ${tool.name} (${index + 1})`}
            >
              <div
                className="w-10 h-10 text-foreground/80"
                dangerouslySetInnerHTML={{ __html: TOOL_ICONS[tool.id] ?? GENERIC_TOOL_ICON }}
              />
              <span className="text-[13px] text-muted-foreground">{tool.name}</span>
            </button>
          ))}
        </div>

        {/* Session history */}
        {sessionGroups.length > 0 && (
          <div className="w-full max-w-sm">
            {sessionGroups.map((group) => (
              <div key={group.label} className="mb-3">
                <div className="text-[12px] uppercase tracking-wider text-muted-foreground/50 mb-2 px-1">
                  {group.label}
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.sessions.map((session) => (
                    <button
                      key={session.id}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer hover:bg-accent/30 transition-colors w-full text-left outline-none"
                      onClick={() => resumeSession(session)}
                      title={`Resume: ${session.resumeCommand}`}
                    >
                      <div
                        className="w-[18px] h-[18px] shrink-0 text-foreground/50"
                        dangerouslySetInnerHTML={{
                          __html: TOOL_ICONS[session.toolId] ?? GENERIC_TOOL_ICON
                        }}
                      />
                      <span className="text-[14px] text-foreground/70 truncate flex-1">
                        {session.title}
                      </span>
                      <span className="text-[13px] text-muted-foreground/40 shrink-0">
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
