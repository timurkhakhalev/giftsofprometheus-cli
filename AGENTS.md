# AGENTS.md

Instructions for AI coding agents working in this repository.

## Layout

- `src/index.ts`: the whole CLI (commander). Responses from the service are validated with zod before use.
- `skills/giftsofprometheus/SKILL.md`: the agent skill. It ships in the npm package, prints with `giftsofprometheus skill` and installs with `npx skills add`.
- `.claude-plugin/marketplace.json`: the Claude Code plugin marketplace entry for the skill.
- `tests/`: `node --test` suites that run the built CLI against a local fake server. Tests never call the real service.
- `tools/typescript-quality/`: the local Oxlint rule plugin and its self-test, copied from the main giftsofprometheus repository. Keep it in sync with that copy when the rules change.

## Commands

Use pnpm. `pnpm check` runs lint (oxlint with the quality plugin), formatting (oxfmt), the type check and build with tsrs, the quality-rule self-test and the tests; it must pass before a commit.

`unknown` is acceptable only at genuine boundaries (HTTP responses, JSON parsing, errors). Validate such values with zod before using them. A rule exception is an exact-file override in `oxlint.config.ts` with a comment explaining why.

## Rules

- The CLI calls only the public API prefixes listed in `publicApi` in `src/index.ts`. Do not add internal service endpoints, admin routes or hosts other than the configured origin.
- The `User-Agent` stays `giftsofprometheus/<version>`: the service recognizes the CLI by this prefix when it names the device on the account page.
- Never log, print or include the stored session token in errors.
- `--json` output is a contract for agents: one JSON document on stdout, errors as `{"error":{"message","status"}}` with exit code 1. Keep it stable.
- Commands that change the user's data (`favorites add/remove`, `profile update`) run only on an explicit command. Do not add side effects to read commands.

## When a command changes

Update all of the following in the same change:

1. The command's `.description()` and options in `src/index.ts`.
2. `skills/giftsofprometheus/SKILL.md`, so agents find the change.
3. The commands table in `README.md`.
4. `CHANGELOG.md`.
5. A test in `tests/`.

## Documentation

Do not hard-wrap prose in Markdown. Do not use emojis.

The README is in Russian and also brings readers to the site. Keep it so:

- Every link to giftsofprometheus.com carries `utm_source=github&utm_medium=readme&utm_campaign=cli`.
- The conference and topic links in «Что есть в каталоге» use the site's catalog filters (`/?event=<slug>`, `/?topic=<slug>`). When the catalog gains a conference or the taxonomy changes, update them and check that each link opens a non-empty list.
- Numbers about the catalog (talk counts) are approximate and must not exceed what the site shows.

## Releasing

1. Bump `version` in `package.json` and add a `CHANGELOG.md` section.
2. Commit, tag `vX.Y.Z` and push the tag. The `release` workflow runs the checks, creates a GitHub release with the package tarball attached and, when the `NPM_TOKEN` secret is set, publishes to npm with provenance.
3. Until the package is on npm, update the release URL in the README install section.
