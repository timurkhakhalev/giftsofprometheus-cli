# Changelog

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
