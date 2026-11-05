import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { mergeSkill, newerVersion, skillHash } from '../dist/skill-files.js'

const root = fileURLToPath(new URL('../', import.meta.url))

const executable = join(root, 'dist', 'index.js')

const bundled = await readFile(join(root, 'skills', 'giftsofprometheus', 'SKILL.md'), 'utf8')

const history = JSON.parse(await readFile(join(root, 'skills', 'history.json'), 'utf8'))

const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

function cli(home, cwd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [executable, '--json', ...args], {
      cwd,
      // The server is unreachable on purpose: these commands must not depend on it
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: join(home, '.config'),
        GIFTSOFPROMETHEUS_URL: 'http://127.0.0.1:9',
        CI: '',
        GIFTSOFPROMETHEUS_NO_UPDATE_CHECK: '',
        ...env,
      },
      timeout: 10_000,
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => (stdout += chunk))
    child.stderr.on('data', chunk => (stderr += chunk))
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
}

test('the release history knows the skill of this version', () => {
  assert.ok(
    history.some(entry => entry.version === version && entry.hash === skillHash(bundled)),
    'run pnpm skill-history after changing SKILL.md or the version'
  )
})

test('skill hash ignores the description, merge keeps a custom one', () => {
  const custom = bundled.replace(/^description:.*$/m, 'description: My own words. Also: RAG evals, MCP security')
  assert.equal(skillHash(custom), skillHash(bundled))
  assert.notEqual(skillHash(bundled.replace('## Read', '## Read more')), skillHash(bundled))

  const stock = history.map(entry => entry.description)
  const old = execFileSync('git', ['show', 'v0.1.3:skills/giftsofprometheus/SKILL.md'], { cwd: root, encoding: 'utf8' })
  assert.equal(mergeSkill(bundled, old, stock), bundled, 'a stock description is replaced by the new one')
  assert.equal(mergeSkill(bundled, old.replace(/^description:.*$/m, 'description: Mine'), stock), bundled.replace(/^description:.*$/m, 'description: Mine'))

  assert.equal(newerVersion('0.2.10', '0.2.9'), true)
  assert.equal(newerVersion('0.2.2', '0.2.2'), false)
  assert.equal(newerVersion('0.1.9', '0.2.0'), false)
  assert.equal(newerVersion('garbage', '0.2.0'), false)
})

test('doctor finds installed skills; skill update replaces outdated copies and keeps a custom description', async () => {
  // Real path: macOS links /var to /private/var, and process.cwd() reports the resolved one
  const home = await realpath(await mkdtemp(join(tmpdir(), 'giftsofprometheus-update-')))
  const project = join(home, 'project')
  const old = execFileSync('git', ['show', 'v0.1.3:skills/giftsofprometheus/SKILL.md'], { cwd: root, encoding: 'utf8' })
  const personal = join(home, '.agents', 'skills', 'giftsofprometheus')
  const edited = join(project, '.claude', 'skills', 'giftsofprometheus')

  try {
    await mkdir(personal, { recursive: true })
    await writeFile(join(personal, 'SKILL.md'), old.replace(/^description:.*$/m, 'description: Mine. Also: RAG evals'))
    // skills.sh links agent folders to one copy: it is reported and updated once
    await mkdir(join(home, '.claude', 'skills'), { recursive: true })
    await symlink(personal, join(home, '.claude', 'skills', 'giftsofprometheus'))
    await mkdir(edited, { recursive: true })
    await writeFile(join(edited, 'SKILL.md'), bundled.replace('## Read', '## My notes\n\n## Read'))
    await mkdir(join(project, '.codex', 'skills'), { recursive: true })
    await symlink(join(root, 'skills', 'giftsofprometheus'), join(project, '.codex', 'skills', 'giftsofprometheus'))

    const doctor = JSON.parse((await cli(home, project, ['doctor'])).stdout)
    assert.deepEqual(doctor.update, {
      installed: false,
      current: version,
      latest: null,
      available: false,
      command: 'npm install -g @giftsofprometheus/cli@latest',
    })
    assert.deepEqual(
      doctor.skills.map(s => [s.path, s.status]),
      [
        ['~/.agents/skills/giftsofprometheus', 'outdated'],
        ['~/project/.claude/skills/giftsofprometheus', 'modified'],
        ['~/project/.codex/skills/giftsofprometheus', 'linked'],
      ]
    )

    // Once a day after a command: a hint on stderr, stdout stays one JSON document
    const first = await cli(home, project, ['onboarding', 'react', '1=like'])
    assert.match(first.stderr, /skills\/giftsofprometheus is older than this CLI\. Run: giftsofprometheus skill update/)
    assert.doesNotMatch(first.stderr, /is available/, 'npx and source runs are not offered a CLI update')
    JSON.parse(first.stdout)
    assert.equal((await cli(home, project, ['onboarding', 'react', '1=like'])).stderr, '', 'only once a day')

    const update = JSON.parse((await cli(home, project, ['skill', 'update'])).stdout)
    assert.deepEqual(update.updated, [{ path: '~/.agents/skills/giftsofprometheus', from: '0.1.3' }])
    assert.equal(await readFile(join(personal, 'SKILL.md'), 'utf8'), bundled.replace(/^description:.*$/m, 'description: Mine. Also: RAG evals'))
    assert.match(await readFile(join(edited, 'SKILL.md'), 'utf8'), /## My notes/, 'a copy edited by hand is left alone')

    const forced = JSON.parse((await cli(home, project, ['skill', 'update', '--force'])).stdout)
    assert.deepEqual(
      forced.updated.map(u => u.path),
      ['~/project/.claude/skills/giftsofprometheus']
    )
    assert.equal(await readFile(join(edited, 'SKILL.md'), 'utf8'), bundled)
    assert.deepEqual(
      JSON.parse((await cli(home, project, ['doctor'])).stdout).skills.map(s => s.status),
      ['current', 'current', 'linked']
    )
    assert.equal((await cli(home, project, ['onboarding', 'react', '1=like'], { GIFTSOFPROMETHEUS_NO_UPDATE_CHECK: '1' })).stderr, '')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
