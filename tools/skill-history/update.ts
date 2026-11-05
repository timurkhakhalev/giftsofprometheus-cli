// Writes skills/history.json: the hash and description of SKILL.md in every release tag and in the working tree.
// The CLI compares an installed skill with it: a known older hash can be updated, an unknown one was edited by hand.
// Run `pnpm skill-history` after changing SKILL.md or the version; a test fails when the current skill is missing from the file.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { skillDescription, skillHash } from '../../src/skill-files.ts'

const root = new URL('../../', import.meta.url)

const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })

const { version } = z.object({ version: z.string() }).parse(JSON.parse(readFileSync(new URL('package.json', root), 'utf8')))

const entries = new Map<string, { version: string; hash: string; description: string | null }>()

for (const tag of git('tag', '-l', 'v*', '--sort=v:refname').split('\n').filter(Boolean)) {
  let text: string

  try {
    text = git('show', `${tag}:skills/giftsofprometheus/SKILL.md`)
  } catch {
    continue
  }

  entries.set(tag.slice(1), { version: tag.slice(1), hash: skillHash(text), description: skillDescription(text) })
}

const current = readFileSync(new URL('skills/giftsofprometheus/SKILL.md', root), 'utf8')

entries.set(version, { version, hash: skillHash(current), description: skillDescription(current) })

writeFileSync(new URL('skills/history.json', root), JSON.stringify([...entries.values()], null, 2) + '\n')
