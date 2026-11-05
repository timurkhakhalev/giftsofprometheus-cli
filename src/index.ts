#!/usr/bin/env node
import { z } from 'zod'
import { Command } from 'commander'
import { chmod, mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const { version } = z.object({ version: z.string() }).parse(createRequire(import.meta.url)('../package.json'))

const program = new Command()

const base = (process.env.GIFTSOFPROMETHEUS_URL || 'https://giftsofprometheus.com').replace(/\/$/, '')

// The CLI talks only to the public Knowledge and account APIs
const publicApi = ['/api/knowledge/', '/api/account/', '/api/auth/device/']

const directory = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'giftsofprometheus')

const credentials = join(directory, 'credentials.json')

type Credentials = { base: string; token: string }

async function stored(): Promise<Credentials | null> {
  try {
    const parsed = z.object({ base: z.literal(base), token: z.string() }).safeParse(JSON.parse(await readFile(credentials, 'utf8')))

    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 1
  ) {
    super(message)
  }
}

async function request(path: string, method = 'GET', body?: unknown, authenticated = true): Promise<unknown> {
  if (!path.startsWith('/') || path.includes('\\')) throw new ApiError('Invalid API path')
  const target = new URL(base + path)

  // Checked after URL normalization, so `..` cannot leave the public API
  if (target.origin !== new URL(base).origin || !publicApi.some(prefix => target.pathname.startsWith(prefix)))
    throw new ApiError(`Path must start with ${publicApi.join(', ')}`)

  if (target.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) throw new ApiError('HTTPS is required outside localhost')
  const credential = authenticated ? await stored() : null
  const headers = new Headers({ 'Content-Type': 'application/json', 'X-Knowledge-Client': 'agent', 'User-Agent': `giftsofprometheus/${version}` })

  if (credential) headers.set('Authorization', `Bearer ${credential.token}`)
  const response = await fetch(target, { method, headers, redirect: 'error', ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const failure = z.object({ error_description: z.string().optional(), error: z.string().optional() }).safeParse(data)
    throw new ApiError(
      failure.success ? failure.data.error_description || failure.data.error || `HTTP ${response.status}` : `HTTP ${response.status}`,
      response.status
    )
  }

  return data
}

function out(value: unknown) {
  console.log(JSON.stringify(value, null, program.opts().json ? 0 : 2))
}

function run<Args extends unknown[]>(fn: (...args: Args) => Promise<unknown>) {
  return async (...args: Args) => {
    try {
      out(await fn(...args))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error'

      if (program.opts().json) console.log(JSON.stringify({ error: { message, status: e instanceof ApiError ? e.status : 1 } }))
      else console.error(message)
      process.exitCode = 1
    }
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function login() {
  const data = z
    .object({ user_code: z.string(), device_code: z.string(), interval: z.number().optional(), expires_in: z.number().optional() })
    .parse(await request('/api/auth/device/code', 'POST', { client_id: 'giftsofprometheus' }, false))

  const code = String(data.user_code),
    device = String(data.device_code)

  const verification = new URL('/device', base)
  verification.searchParams.set('user_code', code)
  console.error(`Open ${verification} and confirm the code ${code}`)
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'

  const child = spawn(opener, process.platform === 'win32' ? ['/c', 'start', '', verification.toString()] : [verification.toString()], {
    detached: true,
    stdio: 'ignore',
  })

  child.on('error', () => {})
  child.unref()
  let interval = Number(data.interval || 5)
  const deadline = Date.now() + Number(data.expires_in || 900) * 1000

  while (Date.now() < deadline) {
    await sleep(interval * 1000)

    try {
      const token = z
        .object({ access_token: z.string(), expires_in: z.number().optional() })
        .parse(
          await request(
            '/api/auth/device/token',
            'POST',
            { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: device, client_id: 'giftsofprometheus' },
            false
          )
        )

      await mkdir(directory, { recursive: true, mode: 0o700 })
      await chmod(directory, 0o700)
      await writeFile(credentials, JSON.stringify({ base, token: token.access_token }), { mode: 0o600 })
      await chmod(credentials, 0o600)

      return { signedIn: true, expiresIn: token.expires_in }
    } catch (e) {
      const message = e instanceof Error ? e.message : ''

      if (/slow.down|too frequently/i.test(message)) {
        interval += 5
        continue
      }

      if (/authorization.pending|pending/i.test(message)) continue
      throw e
    }
  }

  throw new ApiError('Device code expired')
}

async function resolveTalk(value: string) {
  return z
    .object({ id: z.number(), slug: z.string() })
    .passthrough()
    .parse(await request(`/api/knowledge/talks/${encodeURIComponent(value)}`, 'GET', undefined, false))
}

async function event(talk: string, type: 'bookmark' | 'unbookmark') {
  const item = await resolveTalk(talk)

  return request('/api/knowledge/events', 'POST', [{ id: randomUUID(), type, talkId: item.id, context: 'talk_page' }])
}

program.exitOverride()

program.configureOutput({
  outputError: (str, write) => {
    if (!program.opts().json) write(str)
  },
})

program.name('giftsofprometheus').description('Gifts of Prometheus catalog and personal account').version(version).option('--json', 'machine-readable output')

program.command('login').description('Authorize this CLI in a browser').action(run(login))

program
  .command('logout')
  .description('Revoke this CLI session')
  .action(
    run(async () => {
      try {
        await request('/api/account/logout', 'POST')
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 401) throw e
      }

      await unlink(credentials).catch(() => {})

      return { signedOut: true }
    })
  )

program
  .command('whoami')
  .description('Show the current account')
  .action(run(() => request('/api/account/me')))

program
  .command('doctor')
  .description('Check configuration, server and authorization')
  .action(
    run(async () => {
      const credential = await stored()

      let reachable = false,
        authenticated = false

      try {
        await request('/api/knowledge/talks', 'GET', undefined, false)
        reachable = true

        if (credential) {
          await request('/api/account/me')
          authenticated = true
        }
      } catch {}

      return {
        base,
        reachable,
        authenticated,
        authSource: credential ? 'config' : 'missing',
        configPath: credentials,
        nextStep: !reachable ? 'Check GIFTSOFPROMETHEUS_URL and server availability' : !authenticated ? 'Run giftsofprometheus login' : null,
      }
    })
  )

const talks = program.command('talks').description('Browse talks')

talks
  .command('list')
  .option('--page <page>', 'page number', '1')
  .action(run((options: { page: string }) => request(`/api/knowledge/talks?page=${encodeURIComponent(options.page)}`, 'GET', undefined, false)))

talks
  .command('search')
  .argument('<query>')
  .option('--page <page>', 'page number', '1')
  .action(
    run((query: string, options: { page: string }) =>
      request(`/api/knowledge/talks?q=${encodeURIComponent(query)}&page=${encodeURIComponent(options.page)}`, 'GET', undefined, false)
    )
  )

talks.command('get').argument('<slug-or-id>').action(run(resolveTalk))

talks
  .command('content')
  .argument('<slug-or-id>')
  .action(
    run(async (id: string) => {
      const talk = await resolveTalk(id)

      return request(`/api/knowledge/talks/${encodeURIComponent(String(talk.slug))}/content`, 'POST')
    })
  )

const favorites = program.command('favorites').description('Manage bookmarks')

favorites
  .command('list')
  .option('--page <page>', 'page number', '1')
  .option('--limit <limit>', 'page size, max 50', '20')
  .action(
    run((o: { page: string; limit: string }) => request(`/api/knowledge/favorites?page=${encodeURIComponent(o.page)}&limit=${encodeURIComponent(o.limit)}`))
  )

favorites
  .command('add')
  .argument('<slug-or-id>')
  .action(run((id: string) => event(id, 'bookmark')))

favorites
  .command('remove')
  .argument('<slug-or-id>')
  .action(run((id: string) => event(id, 'unbookmark')))

const profile = program.command('profile').description('Read or update interests')

profile.command('get').action(run(() => request('/api/knowledge/profile')))

profile
  .command('update')
  .requiredOption('--file <path>', 'JSON with interests and queryText')
  .action(run(async (o: { file: string }) => request('/api/knowledge/profile', 'PUT', JSON.parse(await readFile(o.file, 'utf8')))))

program
  .command('feed')
  .description('Get personalized recommendations')
  .action(run(() => request('/api/knowledge/feed')))

program
  .command('request')
  .description('Make an authenticated GET request to a Knowledge API path, e.g. /api/knowledge/profile')
  .argument('<path>')
  .action(run((path: string) => request(path)))

program
  .command('skill')
  .description('Print the agent skill that matches this CLI version')
  .option('--path', 'print the skill directory instead, for linking into an agent')
  .action(async (options: { path?: boolean }) => {
    const skill = fileURLToPath(new URL('../skills/giftsofprometheus/', import.meta.url))
    process.stdout.write(options.path ? `${skill}\n` : await readFile(join(skill, 'SKILL.md'), 'utf8'))
  })

program.parseAsync().catch(e => {
  if (e.code === 'commander.helpDisplayed' || e.code === 'commander.version') return

  if (program.opts().json) console.log(JSON.stringify({ error: { message: e.message, status: 1 } }))
  else if (!e.code?.startsWith('commander.')) console.error(e.message)
  process.exitCode = 1
})
