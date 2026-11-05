<p align="center">
  <a href="https://giftsofprometheus.com"><img alt="Gifts of Prometheus: the world's AI knowledge in Russian" src=".github/assets/banner.jpg" width="100%"></a>
</p>

# Gifts of Prometheus CLI

Search AI conference talks, read their transcripts, and keep your favorites on [Gifts of Prometheus](https://giftsofprometheus.com) from the shell or from an AI agent.

<p>
  <a href="https://github.com/timurkhakhalev/giftsofprometheus-cli/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/timurkhakhalev/giftsofprometheus-cli/ci.yml?branch=main&amp;style=for-the-badge&amp;labelColor=0a0f1c&amp;color=173a63&amp;label=CI" height="28"></a>
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/github/license/timurkhakhalev/giftsofprometheus-cli.svg?style=for-the-badge&amp;labelColor=0a0f1c&amp;color=173a63" height="28"></a>
  <a href="https://giftsofprometheus.com"><img alt="giftsofprometheus.com" src="https://img.shields.io/badge/catalog-giftsofprometheus.com-173a63.svg?style=for-the-badge&amp;labelColor=0a0f1c" height="28"></a>
</p>

Gifts of Prometheus collects talks from AI conferences (AI Engineer, BAAI, Apsara and others) and gives each one a Russian title and summary. The site is for reading. The CLI gives the same catalog to your coding agent: it finds talks for the task at hand, reads full transcripts, and saves what you ask it to save to the account you use on the site.

## Install

Requires Node.js 22.12 or later.

```bash
npm install -g https://github.com/timurkhakhalev/giftsofprometheus-cli/releases/download/v0.1.0/giftsofprometheus-cli-0.1.0.tgz
giftsofprometheus doctor
```

The npm package `@giftsofprometheus/cli` is on its way. Until it is published, install the build attached to the [latest release](https://github.com/timurkhakhalev/giftsofprometheus-cli/releases/latest) as above.

## Quick start

```bash
giftsofprometheus talks search 'agent evaluation'   # no account needed
giftsofprometheus talks get <slug>                   # summary, speakers, topics, video link

giftsofprometheus login                              # opens the browser, confirm the code there
giftsofprometheus talks content <slug>               # full transcript
giftsofprometheus favorites add <slug>               # appears in your favorites on the site
giftsofprometheus feed                               # recommendations for your interests
```

`login` signs this device in with a browser confirmation; you never copy tokens. The session lasts 30 days and is stored in `$XDG_CONFIG_HOME/giftsofprometheus/credentials.json` (by default `~/.config/giftsofprometheus/`), readable only by you. Your account page on the site lists signed-in devices and revokes any of them. `giftsofprometheus logout` revokes the current one.

## For AI agents

The repository ships a skill that teaches an agent when and how to use the CLI. Install it into Claude Code, Codex, Cursor and other agents with [skills](https://skills.sh):

```bash
npx skills add timurkhakhalev/giftsofprometheus-cli
```

In Claude Code you can also add it as a plugin:

```text
/plugin marketplace add timurkhakhalev/giftsofprometheus-cli
/plugin install giftsofprometheus@giftsofprometheus
```

Or add a line to your `AGENTS.md`:

```markdown
Use `giftsofprometheus` to find AI conference talks and transcripts. Before the first use, run `giftsofprometheus skill` and follow it.
```

`giftsofprometheus skill` prints the skill that matches the installed version, and `giftsofprometheus skill --path` prints its directory for linking.

The skill tells the agent to change your favorites and interests only when you ask. Searching and reading never save, like or hide anything.

## Commands

Add `--json` to any command for compact machine-readable output. Errors then print `{"error":{"message","status"}}` and exit with code 1.

| Command | What it does | Account |
|---|---|---|
| `talks search <query> [--page n]` | Search published talks by title, summary, speaker and topic | |
| `talks list [--page n]` | Page through the catalog | |
| `talks get <slug-or-id>` | One talk with its summary, speakers, topics and video | |
| `talks content <slug-or-id>` | The full transcript in the talk's original language | ✓ |
| `favorites list [--page n] [--limit n]` | Your saved talks | ✓ |
| `favorites add <slug-or-id>` / `remove` | Save or unsave a talk | ✓ |
| `profile get` | Your interests and current task | ✓ |
| `profile update --file <json>` | Replace them with the contents of a JSON file | ✓ |
| `feed` | Recommendations for your profile | ✓ |
| `request <path>` | A read-only GET to `/api/knowledge/…` or `/api/account/…` | ✓ |
| `login`, `logout`, `whoami`, `doctor` | Sign in, sign out, show the account, check the setup | |
| `skill [--path]` | Print the agent skill | |

## Configuration

| Variable | Default | |
|---|---|---|
| `GIFTSOFPROMETHEUS_URL` | `https://giftsofprometheus.com` | Service origin. Plain HTTP is accepted only for `localhost` |
| `XDG_CONFIG_HOME` | `~/.config` | Where the session is stored |

## Development

```bash
pnpm install
pnpm check      # lint, format, type check, build and tests
node dist/index.js --help
```

[AGENTS.md](AGENTS.md) describes the layout and what to update with each change.

## Contributing

Bug reports and ideas are welcome in [Issues](https://github.com/timurkhakhalev/giftsofprometheus-cli/issues) and [Discussions](https://github.com/timurkhakhalev/giftsofprometheus-cli/discussions). The repository does not accept pull requests, see [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
