// FORK: relative time display for session history
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)

  if (minutes < 1) {
    return 'now'
  }
  if (minutes < 60) {
    return `${minutes}m`
  }
  if (hours < 24) {
    return `${hours}h`
  }
  if (days < 7) {
    return `${days}d`
  }
  if (weeks < 52) {
    return `${weeks}w`
  }
  return `${Math.floor(weeks / 52)}y`
}
