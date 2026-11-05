# AGENTS.md

Instructions for AI coding agents working in this repository.

## Layout

- `src/index.ts`: the whole CLI (commander). Responses from the service are validated with zod before use.
- `skills/giftsofprometheus/SKILL.md`: the agent skill. It ships in the npm package, prints with `giftsofprometheus skill` and installs with `npx skills add`.
- `.claude-plugin/marketplace.json`: the Claude Code plugin marketplace entry for the skill.
- `tests/`: `node --test` suites that run the built CLI against a local fake server. Tests never call the real service.

## Commands

Use pnpm. `pnpm check` runs lint (oxlint), formatting (oxfmt), the type check, the build and the tests; it must pass before a commit.

## Rules

- The CLI calls only the public API prefixes listed in `publicApi` in `src/index.ts`. Do not add internal service endpoints, admin routes or hosts other than the configured origin.
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

## Releasing

1. Bump `version` in `package.json` and add a `CHANGELOG.md` section.
2. Commit, tag `vX.Y.Z` and push the tag. The `release` workflow runs the checks, publishes to npm with provenance and creates a GitHub release.
