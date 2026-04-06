// FORK: tool configuration types and defaults for Launch Panel

export type ToolConfig = {
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
