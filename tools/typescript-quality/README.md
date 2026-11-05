# TypeScript quality rules

Copied from the main giftsofprometheus repository (`tools/typescript-quality`). The root `oxlint.config.ts` loads this rule set and plugin together. Keep the copies in sync when updating.

Run `pnpm test:quality` from the repository root to verify rules, exact-file exceptions, and formatting stability using the installed tool versions. The bundle stays outside application workspace and formatting scans. Boundary guidance lives in the root AGENTS.md.
