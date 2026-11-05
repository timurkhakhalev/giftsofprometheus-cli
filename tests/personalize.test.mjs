import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmod, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { mergeSkill, personalDescription, tailTopics } from '../dist/skill-files.js'

const executable = fileURLToPath(new URL('../dist/index.js', import.meta.url))

const stock = 'description: Find AI conference talks.'

test('the personal tail fits ten words, keeps YAML plain and survives a skill update', () => {
  assert.deepEqual(tailTopics(['RAG, поиск и эмбеддинги', 'Evals и бенчмарки', 'Паттерны построения агентов', 'RAG, поиск и эмбеддинги']), [
    'RAG, поиск и эмбеддинги',
    'Evals и бенчмарки',
  ])
  assert.deepEqual(tailTopics(['Безопасность: governance #1']), ['Безопасность governance 1'])
  assert.deepEqual(tailTopics(['one two three four five six seven eight']), [])

  const personal = personalDescription(stock, ['Evals и бенчмарки'])
  assert.equal(personal, 'description: Find AI conference talks. Also good for Evals и бенчмарки.')
  assert.equal(personal.split(' ').length - 1, stock.split(' ').length - 1 + 6, 'the tail is six words here')
  assert.equal(personalDescription(personal, ['Голосовые агенты и речь']), `${stock} Also good for Голосовые агенты и речь.`, 'a new tail replaces the old one')
  assert.equal(personalDescription(personal, []), stock, 'no topics, no tail')

  const bundled = '---\nname: giftsofprometheus\ndescription: Find AI conference talks, newer wording.\n---\nBody v2\n'
  const installed = `---\nname: giftsofprometheus\n${personal}\n---\nBody v1\n`
  assert.equal(
    mergeSkill(bundled, installed, [stock]),
    '---\nname: giftsofprometheus\ndescription: Find AI conference talks, newer wording. Also good for Evals и бенчмарки.\n---\nBody v2\n',
    'a shipped description with a tail gets the new wording and keeps the tail'
  )
  assert.equal(
    mergeSkill(bundled, installed.replace(stock, 'description: Mine'), [stock]),
    bundled.replace(/^description:.*$/m, 'description: Mine Also good for Evals и бенчмарки.')
  )
})

test('react records what the user said, and personalize rewrites only the loaded skill copy', async () => {
  const requests = []

  const server = createServer((request, response) => {
    let body = ''
    request.on('data', chunk => (body += chunk))
    request.on('end', () => {
      requests.push({ path: request.url, method: request.method, body: body ? JSON.parse(body) : undefined })
      response.setHeader('Content-Type', 'application/json')

      if (request.url === '/api/knowledge/talks/good') response.end(JSON.stringify({ id: 5, slug: 'good' }))
      else if (request.url === '/api/knowledge/profile')
        response.end(
          JSON.stringify({
            interests: [
              { topic: 'quality', level: 'interested' },
              { topic: 'voice', level: 'not_interested' },
              { topic: 'evals', level: 'interested' },
              { topic: 'rag', level: 'high' },
              { level: 'high' },
            ],
            queryText: '',
            topics: [
              { slug: 'quality', title: 'Качество', section: null },
              { slug: 'evals', title: 'Evals и бенчмарки', section: 'quality' },
              { slug: 'rag', title: 'RAG, поиск и эмбеддинги', section: 'data' },
              { slug: 'voice', title: 'Голосовые агенты', section: 'interfaces' },
            ],
            needsOnboarding: false,
          })
        )
      else response.end(JSON.stringify({ recorded: true }))
    })
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const config = await mkdtemp(join(tmpdir(), 'giftsofprometheus-personal-'))

  const cli = args =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [executable, '--json', ...args], {
        env: {
          ...process.env,
          GIFTSOFPROMETHEUS_URL: base,
          XDG_CONFIG_HOME: config,
          GIFTSOFPROMETHEUS_NO_UPDATE_CHECK: '1',
          GIFTSOFPROMETHEUS_NO_BROWSER: '1',
        },
        timeout: 5000,
      })

      let output = ''
      child.stdout.on('data', chunk => (output += chunk))
      child.on('error', reject)
      child.on('close', code => resolve({ code, data: JSON.parse(output) }))
    })

  try {
    await mkdir(join(config, 'giftsofprometheus'), { mode: 0o700 })
    await writeFile(join(config, 'giftsofprometheus', 'credentials.json'), JSON.stringify({ base, token: 'secret' }), { mode: 0o600 })

    for (const [reaction, type] of [
      ['like', 'like'],
      ['not-interested', 'not_interested'],
      ['clear', 'clear_reaction'],
    ]) {
      const result = await cli(['talks', 'react', 'good', reaction])
      assert.equal(result.code, 0, JSON.stringify(result.data))
      assert.deepEqual(
        requests.at(-1).body.map(({ id: _id, ...rest }) => rest),
        [{ type, talkId: 5, context: 'talk_page' }]
      )
    }

    const count = requests.length
    assert.equal((await cli(['talks', 'react', 'good', 'love'])).code, 1)
    assert.equal(requests.length, count, 'an unknown reaction sends nothing')

    const folder = join(config, 'skill')
    await mkdir(folder)
    const file = join(folder, 'SKILL.md')
    await writeFile(file, `---\nname: giftsofprometheus\n${stock}\n---\nBody\n`)

    const done = await cli(['skill', 'personalize', '--file', folder])
    assert.equal(done.code, 0, JSON.stringify(done.data))
    assert.deepEqual(done.data, { personalized: true, changed: true, path: file, topics: ['RAG, поиск и эмбеддинги', 'Evals и бенчмарки'] })
    assert.equal(await readFile(file, 'utf8'), `---\nname: giftsofprometheus\n${stock} Also good for RAG, поиск и эмбеддинги; Evals и бенчмарки.\n---\nBody\n`)
    assert.equal((await cli(['skill', 'personalize', '--file', file])).data.changed, false, 'running it again changes nothing')

    const other = join(config, 'other.md')
    await writeFile(other, `---\nname: something-else\n${stock}\n---\n`)
    assert.equal((await cli(['skill', 'personalize', '--file', other])).code, 1, 'another skill is never touched')

    if (process.getuid?.() !== 0) {
      await writeFile(file, `---\nname: giftsofprometheus\n${stock}\n---\nBody\n`)
      await chmod(folder, 0o500)
      const blocked = await cli(['skill', 'personalize', '--file', file])
      await chmod(folder, 0o700)
      assert.equal(blocked.code, 0)
      assert.equal(blocked.data.personalized, false)
      assert.match(blocked.data.command, /skill personalize --file '.*SKILL\.md'$/)
      assert.equal(await readFile(file, 'utf8'), `---\nname: giftsofprometheus\n${stock}\n---\nBody\n`, 'a failed write leaves the file as it was')
    }
  } finally {
    server.close()
    await chmod(join(config, 'skill'), 0o700).catch(() => {})
    await rm(config, { recursive: true, force: true })
  }
})
