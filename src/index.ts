#!/usr/bin/env node
import { z } from 'zod'
import { Command } from 'commander'
import { chmod, lstat, mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const { version } = z.object({ version: z.string() }).parse(createRequire(import.meta.url)('../package.json'))

const program = new Command()

const base = (process.env.GIFTSOFPROMETHEUS_URL || 'https://giftsofprometheus.com').replace(/\/$/, '')

// The CLI talks only to the public Knowledge and account APIs
const publicApi = ['/api/knowledge/', '/api/account/', '/api/auth/device/']

// The XDG spec says to ignore a relative XDG_CONFIG_HOME; honouring it would put the token under the working directory, often a Git checkout
const configHome = process.env.XDG_CONFIG_HOME && isAbsolute(process.env.XDG_CONFIG_HOME) ? process.env.XDG_CONFIG_HOME : join(homedir(), '.config')

const directory = join(configHome, 'giftsofprometheus')

const credentials = join(directory, 'credentials.json')

type Credentials = { base: string; token: string }

const credentialsSchema = z.object({ base: z.string(), token: z.string() })

/** Only a missing file means "no session"; a file that cannot be read or parsed may still hold a valid session */
async function storedAny(): Promise<Credentials | null | 'unreadable'> {
  let text: string

  try {
    text = await readFile(credentials, 'utf8')
  } catch (e) {
    return e instanceof Error && 'code' in e && e.code === 'ENOENT' ? null : 'unreadable'
  }

  try {
    const parsed = credentialsSchema.safeParse(JSON.parse(text))

    return parsed.success ? parsed.data : 'unreadable'
  } catch {
    return 'unreadable'
  }
}

async function stored(): Promise<Credentials | null> {
  const value = await storedAny()

  return value !== 'unreadable' && value?.base === base ? value : null
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 1
  ) {
    super(message)
  }
}

// Server text reaches a terminal: remove control characters so a response cannot inject ANSI or OSC escape sequences
// oxlint-disable-next-line no-control-regex -- matching control characters is the purpose of this function
const printable = (value: string) => value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')

// A fresh 0600 file renamed into place: the token never lands in an existing file with loose permissions or behind a symlink
async function saveCredentials(value: Credentials) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const info = await lstat(directory)

  if (!info.isDirectory() || (process.getuid && info.uid !== process.getuid())) throw new ApiError(`Unsafe config directory: ${directory}`)
  await chmod(directory, 0o700)
  const temporary = join(directory, `.credentials-${randomUUID()}.json`)

  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' })
    await rename(temporary, credentials)
  } catch (e) {
    await unlink(temporary).catch(() => {})
    throw e
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

  const response = await fetch(target, {
    method,
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const failure = z.object({ error_description: z.string().optional(), error: z.string().optional() }).safeParse(data)
    const message = failure.success ? failure.data.error_description || failure.data.error || `HTTP ${response.status}` : `HTTP ${response.status}`
    throw new ApiError(printable(message).slice(0, 500), response.status)
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
      else console.error(printable(message))
      process.exitCode = 1
    }
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Windows is skipped: a short program name is looked up in the current directory before PATH, so a checkout could plant cmd.exe,
// and cmd.exe also interprets & | ^ in the URL. The printed link is enough there
function openBrowser(url: URL) {
  const opener = process.platform === 'darwin' ? '/usr/bin/open' : process.platform === 'win32' ? null : 'xdg-open'

  if (!opener) return
  const child = spawn(opener, [url.href], { detached: true, stdio: 'ignore', shell: false })
  child.on('error', () => {})
  child.unref()
}

async function login() {
  // Bounded: a zero interval would poll without pause and a huge expiry would poll forever
  const data = z
    .object({
      user_code: z.string().regex(/^[A-Z0-9-]{4,32}$/i),
      device_code: z.string().min(1).max(512),
      interval: z.number().int().min(1).max(60).optional(),
      expires_in: z.number().int().min(1).max(1800).optional(),
    })
    .parse(await request('/api/auth/device/code', 'POST', { client_id: 'giftsofprometheus' }, false))

  const verification = new URL('/device', base)
  verification.searchParams.set('user_code', data.user_code)
  console.error(`Open ${verification} and confirm the code ${data.user_code}`)
  openBrowser(verification)
  let interval = data.interval ?? 5
  const deadline = Date.now() + (data.expires_in ?? 900) * 1000

  while (Date.now() < deadline) {
    await sleep(interval * 1000)

    try {
      const token = z
        .object({ access_token: z.string().min(1), expires_in: z.number().optional() })
        .parse(
          await request(
            '/api/auth/device/token',
            'POST',
            { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: data.device_code, client_id: 'giftsofprometheus' },
            false
          )
        )

      await saveCredentials({ base, token: token.access_token })

      return { signedIn: true, expiresIn: token.expires_in }
    } catch (e) {
      const message = e instanceof Error ? e.message : ''

      if (/slow.down|too frequently/i.test(message)) {
        interval = Math.min(interval + 5, 60)
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
    .loose()
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
      const saved = await storedAny()

      // The session in an unreadable file cannot be revoked from here, and deleting the file would hide that it may still be valid
      if (saved === 'unreadable')
        throw new ApiError(
          `Cannot read ${credentials}, so this session was not revoked. Disconnect the device on ${new URL('/account', base)}, then delete the file`
        )

      // A session issued by another service is neither revoked nor deleted: removing the file would leave that session valid
      if (saved && saved.base !== base) throw new ApiError(`The stored session belongs to ${saved.base}; run logout with GIFTSOFPROMETHEUS_URL=${saved.base}`)

      if (!saved) return { signedOut: true }

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

const levels = z.enum(['high', 'interested', 'not_interested'])

// The service omits the slug of a deleted topic; such interests are dropped on update
const currentProfile = z.object({ interests: z.array(z.object({ topic: z.string().optional(), level: levels })), queryText: z.string() })

const collect = (value: string, previous: string[]) => [...previous, value]

type ProfileOptions = { interest: string[]; removeInterest: string[]; queryText?: string }

// Flags only, no file input: an agent steered by untrusted text cannot be made to upload a local file
async function updateProfile(o: ProfileOptions) {
  const current = currentProfile.parse(await request('/api/knowledge/profile'))
  const interests = new Map(current.interests.flatMap(i => (i.topic ? [[i.topic, i.level] as const] : [])))

  for (const topic of o.removeInterest) interests.delete(topic)

  for (const entry of o.interest) {
    const [topic, level, ...rest] = entry.split('=')
    const parsed = levels.safeParse(level)

    if (!topic || rest.length || !parsed.success) throw new ApiError(`Invalid --interest ${printable(entry)}: use topic=high|interested|not_interested`)
    interests.set(topic, parsed.data)
  }

  return request('/api/knowledge/profile', 'PUT', {
    interests: [...interests].map(([topic, level]) => ({ topic, level })),
    queryText: o.queryText ?? current.queryText,
  })
}

profile
  .command('update')
  .description('Change interests or the current task; fields you do not pass keep their values')
  .option('--interest <topic=level>', 'set a topic to high, interested or not_interested; repeatable', collect, [])
  .option('--remove-interest <topic>', 'remove a topic; repeatable', collect, [])
  .option('--query-text <text>', 'replace the current task; an empty string clears it')
  .action(run(updateProfile))

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
  else if (!e.code?.startsWith('commander.')) console.error(printable(String(e.message)))
  process.exitCode = 1
})
