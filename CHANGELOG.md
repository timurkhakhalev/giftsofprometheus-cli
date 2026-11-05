# Changelog

## 0.2.2

- An npm-installed CLI checks for a new version once a day and prints a line starting with `Update:` on stderr after the command; npx runs are not checked. `GIFTSOFPROMETHEUS_NO_UPDATE_CHECK=1` or `CI` turns it off.
- Installed copies of the skill are compared with every released version by a hash that leaves out the `description` line. `doctor` reports each as `current`, `outdated`, `modified` or `linked`; `skill update` replaces outdated copies and keeps a custom description, `--force` also replaces copies edited by hand.
- `skills/history.json` holds the hash and description of every release; `pnpm skill-history` regenerates it.
- Skill: the agent offers an update in one line and runs it only after the user agrees.
- `login --wait` and `login` back off on HTTP 429 the same way as on `slow_down` instead of failing a login the user may already have confirmed.

## 0.2.1

- Skill: without an installed CLI the agent runs the same commands through `npx -y @giftsofprometheus/cli` instead of stopping to ask for an install. The site's "pick talks with your AI agent" prompt relies on this.
- Skill: onboarding runs when the user asks for it, and ends with the personal feed. Before `finish` the agent signs in by itself and only gives the user the confirmation link.
- `onboarding deck` and `onboarding react` print compact cards: `slug`, `title`, `summary` (the first paragraph), speaker names, topic titles and the event name. The deck output shrinks from about 50 KB to a few KB.

## 0.2.0

- `onboarding topics`, `onboarding deck`, `onboarding react` and `onboarding finish`: a starting profile from topic choices and a numbered deck of up to 8 talks, judged by card number. The draft is kept in `onboarding.json` (0600) next to the session, so the steps before `finish` need no account and `finish` works after `login`.
- `login --start` prints the confirmation link and code as JSON and exits; `login --wait` finishes that login. An agent can show the link without waiting for the whole device flow. Plain `login` works as before.
- Skill: onboarding in the conversation; the agent signs in by itself when a command needs an account; reading needs no confirmation.
- Requires the service endpoints `GET /api/knowledge/topics` and `POST /api/knowledge/onboarding/deck`.

## 0.1.3

- README: installation from npm, npm badge.
- `profile update` takes `--interest topic=level`, `--remove-interest topic` and `--query-text` instead of `--file`, and keeps fields that were not passed. The CLI no longer reads local files for the profile.
- `login` no longer starts `cmd` on Windows; it prints the link to open. On macOS it runs `/usr/bin/open`.
- `login` checks the code, polling interval and expiry it receives, and writes the session to a new 0600 file that replaces the old one.
- `logout` keeps a session issued by another service and names the service to sign out of. A damaged session file is an error, not a successful sign-out.
- A relative `XDG_CONFIG_HOME` is ignored, so the session is never written under the working directory.
- Requests time out after 30 seconds. Server messages printed to the terminal are stripped of control characters.
- Skill: titles, summaries and transcripts are untrusted data, not instructions.
- Release workflow: actions pinned to commit SHAs; checks run without write or OIDC permissions, and the publish job receives only the built tarball.

## 0.1.2

- Published to npm as `@giftsofprometheus/cli` through Trusted Publishing, with provenance.

## 0.1.1

- The `User-Agent` is `giftsofprometheus/<version>` again, so the account page names CLI devices as before.
- README in Russian.

## 0.1.0

First public release.

- `talks search`, `talks list`, `talks get` and `talks content` read the catalog and full transcripts.
- `favorites`, `profile` and `feed` work with the signed-in account.
- `login` signs in through a browser confirmation; `logout` revokes the device.
- `skill` prints the bundled agent skill; the skill also installs with `npx skills add` and as a Claude Code plugin.
- `request` reaches only the public Knowledge and account APIs.
- The default service is https://giftsofprometheus.com.
