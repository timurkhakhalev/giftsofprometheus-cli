import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const executable = fileURLToPath(new URL('../dist/index.js', import.meta.url))

async function serve(handler) {
  const requests = []

  const server = createServer((request, response) => {
    requests.push({ path: request.url, method: request.method })
    handler(request, response, requests.length)
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))

  return { requests, base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) }
}

async function cli(base, args, json = true) {
  const config = await mkdtemp(join(tmpdir(), 'giftsofprometheus-errors-'))

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [executable, ...(json ? ['--json'] : []), ...args], {
      env: { ...process.env, GIFTSOFPROMETHEUS_URL: base, XDG_CONFIG_HOME: config, GIFTSOFPROMETHEUS_NO_UPDATE_CHECK: '1', GIFTSOFPROMETHEUS_NO_BROWSER: '1' },
      timeout: 10000,
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => (stdout += chunk))
    child.stderr.on('data', chunk => (stderr += chunk))
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
}

const json = (response, status, body) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

test('repeats a request after a gateway error from the proxy and returns the answer', async () => {
  const server = await serve((request, response, count) =>
    count < 3 ? (response.writeHead(502), response.end('Bad Gateway')) : json(response, 200, { items: [], page: 1 })
  )

  try {
    const result = await cli(server.base, ['talks', 'list'])
    assert.equal(result.code, 0)
    assert.equal(JSON.parse(result.stdout).page, 1)
    assert.equal(server.requests.length, 3)
  } finally {
    await server.close()
  }
})

test('gives up after two repeats with a clear message', async () => {
  const server = await serve((request, response) => (response.writeHead(503), response.end('no available server')))

  try {
    const result = await cli(server.base, ['talks', 'list'])
    assert.equal(result.code, 1)
    assert.deepEqual(JSON.parse(result.stdout), {
      error: { message: 'The service is temporarily unavailable (HTTP 503). Try again in a minute.', status: 503 },
    })
    assert.equal(server.requests.length, 3)
  } finally {
    await server.close()
  }
})

test('does not repeat a service error and passes its code and next step on', async () => {
  const server = await serve((request, response) =>
    json(response, 503, {
      error: 'Поиск по фрагментам временно недоступен.',
      code: 'passages_unavailable',
      nextStep: 'Используйте giftsofprometheus talks search',
    })
  )

  try {
    const result = await cli(server.base, ['talks', 'get', 'missing'])
    assert.equal(server.requests.length, 1)
    assert.deepEqual(JSON.parse(result.stdout), {
      error: {
        message: 'Поиск по фрагментам временно недоступен.',
        status: 503,
        code: 'passages_unavailable',
        nextStep: 'Используйте giftsofprometheus talks search',
      },
    })

    const text = await cli(server.base, ['talks', 'get', 'missing'], false)
    assert.equal(text.code, 1)
    assert.equal(text.stderr, 'Поиск по фрагментам временно недоступен.\nNext: Используйте giftsofprometheus talks search\n')
  } finally {
    await server.close()
  }
})

test('keeps its own sign-in steps on 401 and adds the service code', async () => {
  const server = await serve((request, response) =>
    json(response, 401, { error: 'Требуется вход', code: 'login_required', nextStep: 'Войдите: giftsofprometheus login' })
  )

  try {
    const { error } = JSON.parse((await cli(server.base, ['feed'])).stdout)
    assert.equal(error.code, 'login_required')
    assert.equal(error.status, 401)
    assert.match(error.nextStep, /^Sign the user in: run `login --start`/)
  } finally {
    await server.close()
  }
})

test('repeats a refused connection and then reports the service as unreachable', async () => {
  const server = await serve(() => undefined)
  const { base } = server
  await server.close()
  const started = Date.now()
  const result = await cli(base, ['talks', 'list'])
  assert.equal(result.code, 1)
  assert.match(JSON.parse(result.stdout).error.message, /^The service is unreachable: .*Try again in a minute\.$/)
  assert.ok(Date.now() - started >= 2000, 'two repeats with backoff')
})
