import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const executable = fileURLToPath(new URL('../dist/index.js', import.meta.url))

test('CLI validates credentials and business responses while preserving raw JSON output', async () => {
  const requests = []

  const server = createServer((request, response) => {
    requests.push({ path: request.url, method: request.method, authorization: request.headers.authorization, agent: request.headers['user-agent'] })
    response.setHeader('Content-Type', 'application/json')

    if (request.url === '/api/knowledge/talks/good') response.end(JSON.stringify({ id: 1, slug: 'good', title: 'Keep this field' }))
    else if (request.url === '/api/knowledge/talks/bad') response.end(JSON.stringify({ title: 'Missing ID and slug' }))
    else if (request.url === '/api/auth/device/code') response.end(JSON.stringify({ user_code: 123 }))
    else response.end(JSON.stringify({ items: [], page: 2 }))
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()

  const base = `http://127.0.0.1:${address.port}`
  const config = await mkdtemp(join(tmpdir(), 'giftsofprometheus-quality-'))

  const cli = args =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [executable, '--json', ...args], {
        env: { ...process.env, GIFTSOFPROMETHEUS_URL: base, XDG_CONFIG_HOME: config },
        timeout: 5000,
      })

      let output = ''
      child.stdout.on('data', chunk => (output += chunk))
      child.on('error', reject)
      child.on('close', code => resolve({ code, data: JSON.parse(output) }))
    })

  try {
    await mkdir(join(config, 'giftsofprometheus'))
    await writeFile(join(config, 'giftsofprometheus', 'credentials.json'), JSON.stringify({ base, token: 7 }))
    const list = await cli(['talks', 'list', '--page', '2'])
    assert.equal(list.code, 0)
    assert.match(requests.at(-1).agent, /^giftsofprometheus\/\d/, 'the service names CLI devices by this prefix')
    assert.equal(list.data.page, 2)
    assert.equal(requests.at(-1).path, '/api/knowledge/talks?page=2')
    const raw = await cli(['request', '/api/account/me'])
    assert.equal(raw.code, 0)
    assert.equal(requests.at(-1).authorization, undefined)
    const sent = requests.length

    for (const path of ['/api/users', '/api/knowledge/../users', '/api/knowledge/%2e%2e/graphql', 'http://example.com/api/knowledge/talks']) {
      const outside = await cli(['request', path])
      assert.equal(outside.code, 1, path)
      assert.ok(outside.data.error.message, path)
    }

    assert.equal(requests.length, sent, 'paths outside the public API are rejected before any request')
    assert.equal((await cli(['talks', 'get', 'good'])).data.title, 'Keep this field')
    assert.equal((await cli(['favorites', 'add', 'bad'])).code, 1)
    assert.equal(
      requests.some(request => request.method === 'POST' && request.path === '/api/knowledge/events'),
      false
    )
    assert.equal((await cli(['login'])).code, 1)
    assert.equal(
      requests.some(request => request.path === '/api/auth/device/token'),
      false
    )
  } finally {
    server.close()
    await rm(config, { recursive: true, force: true })
  }
})
