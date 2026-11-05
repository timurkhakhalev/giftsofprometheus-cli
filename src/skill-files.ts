import { createHash } from 'node:crypto'

// The `description:` line is the user's to change (a custom wording or a personal tail), so it is left out of the comparison
const DESCRIPTION = /^description:.*$/m

export function skillDescription(text: string): string | null {
  return text.replace(/\r\n/g, '\n').match(DESCRIPTION)?.[0] ?? null
}

/** Hash of SKILL.md without its description line and without trailing whitespace differences */
export function skillHash(text: string): string {
  const body = text
    .replace(/\r\n/g, '\n')
    .replace(DESCRIPTION, '')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim()

  return createHash('sha256').update(body).digest('hex').slice(0, 16)
}

/** The bundled skill with the installed description kept, unless that description is one the CLI shipped */
export function mergeSkill(bundled: string, installed: string, stockDescriptions: string[]): string {
  const own = skillDescription(installed)

  if (!own || stockDescriptions.includes(own)) return bundled

  return bundled.replace(/\r\n/g, '\n').replace(DESCRIPTION, () => own)
}

export function newerVersion(latest: string, current: string): boolean {
  const parse = (value: string) => value.split('-')[0]?.split('.').map(Number) ?? []
  const [a, b] = [parse(latest), parse(current)]

  for (let i = 0; i < 3; i++) {
    const [x = 0, y = 0] = [a[i], b[i]]

    if (Number.isNaN(x) || Number.isNaN(y)) return false

    if (x !== y) return x > y
  }

  return false
}
