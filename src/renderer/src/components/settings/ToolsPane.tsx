// FORK: Settings pane for configuring Launch Panel tools.
// Expandable cards with name, command, color, enabled toggle.
import { useState, useCallback } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '@/store'
import { TOOL_COLOR_PRESETS, type ToolConfig } from '@/lib/tool-defaults'

function ToolCard({
  tool,
  onUpdate,
  onRemove
}: {
  tool: ToolConfig
  onUpdate: (updates: Partial<ToolConfig>) => void
  onRemove: (() => void) | null
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`border rounded-lg overflow-hidden ${expanded ? 'border-ring/50' : 'border-border/50'}`}
    >
      {/* Collapsed header */}
      <button
        className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-accent/20 transition-colors outline-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-5 h-5 rounded-md shrink-0" style={{ backgroundColor: tool.color }} />
        <span className="text-[15px] font-medium text-foreground flex-1">{tool.name}</span>
        {!tool.enabled && (
          <span className="text-[14px] text-muted-foreground/50 bg-secondary/50 px-1.5 py-0.5 rounded">
            off
          </span>
        )}
        {expanded ? (
          <ChevronUp className="size-3.5 text-muted-foreground/50" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground/50" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/30 flex flex-col gap-3">
          {/* Display name */}
          <div>
            <label className="text-[14px] uppercase tracking-wider text-muted-foreground/60 block mb-1">
              Display name
            </label>
            <input
              type="text"
              className="w-full bg-background border border-border/50 rounded-md px-2.5 py-1.5 text-[14px] text-foreground outline-none focus:border-ring/50"
              value={tool.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
            />
          </div>

          {/* Command */}
          <div>
            <label className="text-[14px] uppercase tracking-wider text-muted-foreground/60 block mb-1">
              Command
            </label>
            <input
              type="text"
              className="w-full bg-background border border-border/50 rounded-md px-2.5 py-1.5 text-[14px] text-foreground font-mono outline-none focus:border-ring/50"
              value={tool.command}
              onChange={(e) => onUpdate({ command: e.target.value })}
            />
          </div>

          {/* Color */}
          <div>
            <label className="text-[14px] uppercase tracking-wider text-muted-foreground/60 block mb-1">
              Color
            </label>
            <div className="flex gap-1.5">
              {TOOL_COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  className="w-5 h-5 rounded-md outline-none transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    border:
                      tool.color === color ? '2px solid white' : '1px solid rgba(255,255,255,0.1)'
                  }}
                  onClick={() => onUpdate({ color })}
                />
              ))}
            </div>
          </div>

          {/* Toggle + Remove */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-[14px] text-muted-foreground">Enabled</span>
              <button
                className="w-9 h-5 rounded-full transition-colors relative"
                style={{ backgroundColor: tool.enabled ? '#3b82f6' : '#333' }}
                onClick={() => onUpdate({ enabled: !tool.enabled })}
              >
                <div
                  className="w-4 h-4 rounded-full absolute top-0.5 transition-all"
                  style={{
                    backgroundColor: tool.enabled ? 'white' : '#666',
                    left: tool.enabled ? '18px' : '2px'
                  }}
                />
              </button>
            </label>
            {onRemove && (
              <button
                className="text-[15px] text-destructive hover:underline outline-none flex items-center gap-1"
                onClick={onRemove}
              >
                <Trash2 className="size-3" />
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ToolsPane(): React.JSX.Element {
  const toolConfigs = useAppStore((s) => s.toolConfigs)
  const setToolConfigs = useAppStore((s) => s.setToolConfigs)

  const updateTool = useCallback(
    (id: string, updates: Partial<ToolConfig>) => {
      const next = toolConfigs.map((t) => (t.id === id ? { ...t, ...updates } : t))
      setToolConfigs(next)
    },
    [toolConfigs, setToolConfigs]
  )

  const removeTool = useCallback(
    (id: string) => {
      setToolConfigs(toolConfigs.filter((t) => t.id !== id))
    },
    [toolConfigs, setToolConfigs]
  )

  const addTool = useCallback(() => {
    const newTool: ToolConfig = {
      id: `custom-${Date.now()}`,
      name: 'New Tool',
      command: '',
      color: TOOL_COLOR_PRESETS[Math.floor(Math.random() * TOOL_COLOR_PRESETS.length)],
      enabled: true,
      builtin: false
    }
    setToolConfigs([...toolConfigs, newTool])
  }, [toolConfigs, setToolConfigs])

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h3 className="text-[15px] font-semibold text-foreground mb-1">Tools</h3>
        <p className="text-[15px] text-muted-foreground/60">
          Configure which tools appear in the Launch Panel
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        {toolConfigs.map((tool) => (
          <ToolCard
            key={tool.id}
            tool={tool}
            onUpdate={(updates) => updateTool(tool.id, updates)}
            onRemove={tool.builtin ? null : () => removeTool(tool.id)}
          />
        ))}

        <button
          className="flex items-center justify-center gap-1.5 w-full px-3 py-2.5 border border-dashed border-border/50 rounded-lg cursor-pointer hover:bg-accent/20 transition-colors text-muted-foreground/50 outline-none"
          onClick={addTool}
        >
          <Plus className="size-3.5" />
          <span className="text-[15px]">Add custom tool</span>
        </button>
      </div>
    </div>
  )
}
