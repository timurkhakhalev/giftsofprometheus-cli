import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const executable = fileURLToPath(new URL('../dist/index.js', import.meta.url))

async function harness(handler) {
  const requests = []

  const server = createServer(async (request, response) => {
    let body = ''

    for await (const chunk of request) body += chunk
    requests.push({ path: request.url, method: request.method, authorization: request.headers.authorization, body: body ? JSON.parse(body) : undefined })
    response.setHeader('Content-Type', 'application/json')
    handler(request, response)
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const config = await mkdtemp(join(tmpdir(), 'giftsofprometheus-security-'))

  // PATH is empty so login never opens a real browser
  const cli = (args, { json = true, env = {}, cwd } = {}) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [executable, ...(json ? ['--json'] : []), ...args], {
        env: { ...process.env, GIFTSOFPROMETHEUS_URL: base, XDG_CONFIG_HOME: config, PATH: '', ...env },
        timeout: 15000,
        cwd,
      })

      let stdout = '',
        stderr = ''

      child.stdout.on('data', chunk => (stdout += chunk))
      child.stderr.on('data', chunk => (stderr += chunk))
      child.on('error', reject)
      child.on('close', code => resolve({ code, stdout, stderr }))
    })

  const close = async () => {
    server.close()
    await rm(config, { recursive: true, force: true })
  }

  return { requests, base, config, cli, close }
}

test('profile update takes flags, not files, and keeps fields that were not passed', async () => {
  const h = await harness((request, response) => {
    if (request.method === 'GET')
      response.end(
        JSON.stringify({ interests: [{ topic: 'rag', level: 'high' }, { topic: 'evals', level: 'interested' }, { level: 'high' }], queryText: 'old' })
      )
    else response.end(JSON.stringify({ saved: true }))
  })

  try {
    const secret = join(h.config, 'secret.json')
    await writeFile(secret, JSON.stringify({ interests: [], queryText: 'SECRET' }))
    assert.equal((await h.cli(['profile', 'update', '--file', secret])).code, 1)
    assert.equal(h.requests.length, 0, 'a file argument is rejected before any request')

    const result = await h.cli(['profile', 'update', '--interest', 'agents=high', '--interest', 'evals=not_interested', '--remove-interest', 'rag'])
    assert.equal(result.code, 0, result.stdout)
    assert.deepEqual(h.requests.at(-1).body, {
      interests: [
        { topic: 'evals', level: 'not_interested' },
        { topic: 'agents', level: 'high' },
      ],
      queryText: 'old',
    })

    const before = h.requests.length
    assert.equal((await h.cli(['profile', 'update', '--interest', 'agents=urgent'])).code, 1)
    assert.equal((await h.cli(['profile', 'update', '--interest', 'agents'])).code, 1)
    assert.equal(
      h.requests.slice(before).some(r => r.method === 'PUT'),
      false
    )
  } finally {
    await h.close()
  }
})

test('logout keeps a session that belongs to another service', async () => {
  const h = await harness((_, response) => {
    response.statusCode = 401
    response.end('{}')
  })

  try {
    const file = join(h.config, 'giftsofprometheus', 'credentials.json')
    await mkdir(join(h.config, 'giftsofprometheus'))
    await writeFile(file, JSON.stringify({ base: 'https://giftsofprometheus.com', token: 'original' }))
    const result = await h.cli(['logout'])
    assert.equal(result.code, 1)
    assert.match(JSON.parse(result.stdout).error.message, /giftsofprometheus\.com/)
    assert.equal(h.requests.length, 0)
    assert.equal(JSON.parse(await readFile(file, 'utf8')).token, 'original')

    await writeFile(file, JSON.stringify({ base: h.base, token: 'local' }))
    assert.equal((await h.cli(['logout'])).code, 0)
    assert.equal(h.requests.at(-1).authorization, 'Bearer local')
    await assert.rejects(stat(file))

    // A damaged file may still hold a valid session: logout fails and keeps the file instead of reporting success
    const before = h.requests.length

    for (const damaged of ['{not json', JSON.stringify({ token: 'no base' })]) {
      await writeFile(file, damaged)
      const result = await h.cli(['logout'])
      assert.equal(result.code, 1, damaged)
      assert.match(JSON.parse(result.stdout).error.message, /\/account/)
      assert.equal(await readFile(file, 'utf8'), damaged)
    }

    assert.equal(h.requests.length, before)
  } finally {
    await h.close()
  }
})

test('server error text is stripped of terminal control characters', async () => {
  const h = await harness((_, response) => {
    response.statusCode = 400
    response.end(JSON.stringify({ error: 'bad\u001b]52;c;cHduZWQ=\u0007\u001b[31mred' }))
  })

  try {
    const result = await h.cli(['talks', 'list'], { json: false })
    assert.equal(result.code, 1)
    // oxlint-disable-next-line no-control-regex -- asserts that control characters are absent from terminal output
    assert.doesNotMatch(result.stderr, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/)
    assert.match(result.stderr, /bad\]52;c;cHduZWQ=\[31mred/)
  } finally {
    await h.close()
  }
})

test('login bounds the polling interval and stores the token atomically, 0600, outside a relative XDG_CONFIG_HOME', async () => {
  let interval = 0

  const h = await harness((request, response) => {
    if (request.url === '/api/auth/device/code') response.end(JSON.stringify({ user_code: 'ABCD-1234', device_code: 'dc', interval, expires_in: 30 }))
    else response.end(JSON.stringify({ access_token: 'tok', expires_in: 60 }))
  })

  try {
    assert.equal((await h.cli(['login'])).code, 1)
    assert.equal(
      h.requests.some(r => r.path === '/api/auth/device/token'),
      false
    )

    interval = 1
    const directory = join(h.config, 'giftsofprometheus')
    await mkdir(directory, { mode: 0o755 })
    await writeFile(join(directory, 'credentials.json'), '{}', { mode: 0o644 })
    const result = await h.cli(['login'])
    assert.equal(result.code, 0, result.stdout)
    assert.doesNotMatch(result.stdout + result.stderr, /tok/)
    assert.equal((await stat(join(directory, 'credentials.json'))).mode & 0o777, 0o600)
    assert.equal((await stat(directory)).mode & 0o777, 0o700)
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'credentials.json'), 'utf8')), { base: h.base, token: 'tok' })
    assert.deepEqual(await readdir(directory), ['credentials.json'])

    const checkout = await mkdtemp(join(tmpdir(), 'giftsofprometheus-checkout-'))
    const home = await mkdtemp(join(tmpdir(), 'giftsofprometheus-home-'))

    try {
      assert.equal((await h.cli(['login'], { cwd: checkout, env: { XDG_CONFIG_HOME: '.config', HOME: home } })).code, 0)
      assert.deepEqual(await readdir(checkout), [], 'nothing is written under the working directory')
      await stat(join(home, '.config', 'giftsofprometheus', 'credentials.json'))
    } finally {
      await rm(checkout, { recursive: true, force: true })
      await rm(home, { recursive: true, force: true })
    }
  } finally {
    await h.close()
  }
})
