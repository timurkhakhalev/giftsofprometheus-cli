import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const executable = fileURLToPath(new URL('../dist/index.js', import.meta.url))

const recId = '6f1c2a40-1111-4a2b-9c3d-0123456789ab'

test('similar talks, transcript and favorites carry the recId of the list and suggest the next step', async () => {
  const requests = []

  const server = createServer((request, response) => {
    let body = ''
    request.on('data', chunk => (body += chunk))
    request.on('end', () => {
      requests.push({ path: request.url, method: request.method, authorization: request.headers.authorization, body: body ? JSON.parse(body) : undefined })
      response.setHeader('Content-Type', 'application/json')

      if (request.url === '/api/knowledge/talks/anchor') response.end(JSON.stringify({ id: 1, slug: 'anchor' }))
      else if (request.url === '/api/knowledge/talks/next') response.end(JSON.stringify({ id: 2, slug: 'next' }))
      else if (request.url === '/api/knowledge/talks/anchor/similar')
        response.end(JSON.stringify({ recId, items: [{ id: 2, slug: 'next', reason: 'Тема: агенты' }] }))
      else response.end(JSON.stringify({ recorded: true }))
    })
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const config = await mkdtemp(join(tmpdir(), 'giftsofprometheus-similar-'))

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
      let errors = ''
      child.stdout.on('data', chunk => (output += chunk))
      child.stderr.on('data', chunk => (errors += chunk))
      child.on('error', reject)
      child.on('close', code => resolve({ code, data: JSON.parse(output), stderr: errors }))
    })

  try {
    await mkdir(join(config, 'giftsofprometheus'), { mode: 0o700 })
    await writeFile(join(config, 'giftsofprometheus', 'credentials.json'), JSON.stringify({ base, token: 'secret' }), { mode: 0o600 })

    const similar = await cli(['talks', 'similar', 'anchor'])
    assert.equal(similar.code, 0)
    assert.equal(similar.data.items[0].slug, 'next')
    assert.equal(requests.at(-1).path, '/api/knowledge/talks/anchor/similar')
    assert.equal(requests.at(-1).authorization, 'Bearer secret', 'the session is sent so the list gets a recId')
    assert.match(similar.stderr, new RegExp(`talks content <slug> --rec-id ${recId}`))

    const content = await cli(['talks', 'content', 'next', '--rec-id', recId])
    assert.equal(content.code, 0)
    assert.deepEqual(requests.at(-1), {
      path: `/api/knowledge/talks/next/content?recId=${recId}`,
      method: 'POST',
      authorization: 'Bearer secret',
      body: undefined,
    })
    assert.match(content.stderr, /talks similar next/)
    assert.match(content.stderr, /favorites add next/)

    const plain = await cli(['talks', 'content', 'next'])
    assert.equal(plain.code, 0)
    assert.equal(requests.at(-1).path, '/api/knowledge/talks/next/content')

    const bookmark = await cli(['favorites', 'add', 'next', '--rec-id', recId])
    assert.equal(bookmark.code, 0)
    assert.deepEqual(
      requests.at(-1).body.map(({ id: _id, ...rest }) => rest),
      [{ type: 'bookmark', talkId: 2, context: 'similar', recId }]
    )

    const count = requests.length
    const invalid = await cli(['talks', 'content', 'next', '--rec-id', 'not-a-uuid'])
    assert.equal(invalid.code, 1)
    assert.equal(
      requests.filter(r => r.path.includes('/content')).length,
      requests.slice(0, count).filter(r => r.path.includes('/content')).length,
      'an invalid recId is refused before the request'
    )
  } finally {
    server.close()
    await rm(config, { recursive: true, force: true })
  }
})
