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

/**
 * The bundled skill with the installed description kept, unless that description is one the CLI shipped.
 * A shipped description with a personal tail becomes the new shipped description with the same tail.
 */
export function mergeSkill(bundled: string, installed: string, stockDescriptions: string[]): string {
  const own = skillDescription(installed)
  const text = bundled.replace(/\r\n/g, '\n')

  if (!own) return bundled

  if (stockDescriptions.includes(baseDescription(own))) {
    const fresh = skillDescription(text)

    return fresh ? text.replace(DESCRIPTION, () => `${fresh}${personalTail(own)}`) : bundled
  }

  return text.replace(DESCRIPTION, () => own)
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

// A personal tail: up to ten words in all, naming the user's topics, so the agent also reaches for the skill on them
const TAIL_PREFIX = ' Also good for '

const TAIL = / Also good for [^\n]*$/

const TAIL_WORDS = 10

/** Topic titles that fit the tail, in the given order; characters YAML or the line could trip on are dropped */
export function tailTopics(titles: string[]): string[] {
  const chosen: string[] = []
  let words = TAIL_PREFIX.trim().split(/\s+/).length

  for (const raw of titles) {
    const title = raw
      .replace(/[:#"'`\n\r;]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const count = title ? title.split(' ').length : 0

    if (!count || chosen.includes(title) || words + count > TAIL_WORDS) continue
    chosen.push(title)
    words += count
  }

  return chosen
}

/** The description line without a personal tail */
export function baseDescription(line: string): string {
  return line.replace(TAIL, '')
}

/** The description line with a tail for these topics, or without one when there are none */
export function personalDescription(line: string, topics: string[]): string {
  const base = baseDescription(line)

  return topics.length ? `${base}${TAIL_PREFIX}${topics.join('; ')}.` : base
}

export function personalTail(line: string): string {
  return line.match(TAIL)?.[0] ?? ''
}
