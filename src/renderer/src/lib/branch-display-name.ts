// FORK: generate human-readable display names from git branch names.
// Strips username prefixes, type prefixes (fix/, feat/), and converts
// kebab-case/snake_case to Title Case.

const TYPE_PREFIXES = [
  'fix/',
  'feat/',
  'feature/',
  'chore/',
  'refactor/',
  'docs/',
  'test/',
  'ci/',
  'hotfix/',
  'release/',
  'bugfix/'
]

export function humanizeBranchName(branch: string): string {
  let name = branch.replace(/^refs\/heads\//, '')

  // Strip username prefix: "username/something" → "something"
  // But keep it if the remaining part is empty or too short
  const slashIdx = name.indexOf('/')
  if (slashIdx > 0 && slashIdx < name.length - 1) {
    const afterSlash = name.slice(slashIdx + 1)
    // Check if prefix looks like a username (contains no further slashes after type strip)
    const lowerName = name.toLowerCase()
    const matchedType = TYPE_PREFIXES.find((p) => lowerName.startsWith(p))
    if (matchedType) {
      // Strip type prefix: "fix/chat-error" → "chat-error"
      name = name.slice(matchedType.length)
    } else {
      // Assume username prefix: "sasha-darkdepot/ui-polish" → "ui-polish"
      name = afterSlash
      // Strip type prefix again if present after username
      const lowerAfter = name.toLowerCase()
      const matchedTypeAfter = TYPE_PREFIXES.find((p) => lowerAfter.startsWith(p))
      if (matchedTypeAfter) {
        name = name.slice(matchedTypeAfter.length)
      }
    }
  }

  // Convert separators to spaces: kebab-case, snake_case
  name = name.replace(/[-_]+/g, ' ')

  // Title case each word
  name = name
    .split(' ')
    .filter((w) => w.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  return name || branch
}
