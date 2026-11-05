---
name: giftsofprometheus
description: Find AI conference talks (AI Engineer, BAAI, Apsara and others) with Russian summaries, read their full transcripts, and manage the signed-in user's favorites, interests and personal feed through the giftsofprometheus CLI. Use when the user asks for talks, speakers or transcripts on an AI engineering topic, or wants to save, list or remove favorites on Gifts of Prometheus.
allowed-tools: Bash(giftsofprometheus:*)
---

# Gifts of Prometheus

[Gifts of Prometheus](https://giftsofprometheus.com) is a catalog of AI conference talks with Russian titles and summaries. The `giftsofprometheus` CLI reads it and acts for the signed-in user.

## Setup

Run `command -v giftsofprometheus`. If it is missing, ask the user to install it as described in https://github.com/timurkhakhalev/giftsofprometheus-cli#install. Then run `giftsofprometheus --json doctor`:

- `reachable: false`: the service is unavailable; report it and stop.
- `authenticated: false`: search and talk metadata still work. For transcripts, favorites, interests and the feed, ask the user to run `giftsofprometheus login` and confirm the code in their browser.

The CLI stores its session outside the project. Never print, copy or ask for it.

## Read

```bash
giftsofprometheus --json talks search 'agent evaluation'   # published talks by title, summary, speaker or topic
giftsofprometheus --json talks list --page 2               # the whole catalog, page by page
giftsofprometheus --json talks get <slug-or-id>            # one talk: summary, speakers, topics, publication
giftsofprometheus --json talks content <slug-or-id>        # full transcript, requires login
giftsofprometheus --json feed                              # personal recommendations, requires login
giftsofprometheus --json favorites list                    # saved talks, requires login
giftsofprometheus --json profile get                       # interests and current task, requires login
```

- Lists are paginated: check `totalPages` and pass `--page`.
- Search and use the returned `slug` or `id` for exact reads.
- A transcript is in the talk's original language. Segment timecodes are in milliseconds from the start of the talk. When a talk is a part of a longer recording, `sourceRange` gives its bounds in that recording. A talk without a transcript returns an empty array.
- `request <path>` makes a read-only GET to a path under `/api/knowledge/` or `/api/account/` that no command covers.

## Change

Change the user's data only when they ask for that change:

```bash
giftsofprometheus --json favorites add <slug-or-id>
giftsofprometheus --json favorites remove <slug-or-id>
giftsofprometheus --json profile update --file profile.json
```

Before `profile update`, read `profile get` and keep the fields the user did not ask to change. Reading, searching or opening a transcript is never approval to save a talk, react to it or change interests.

## Errors

With `--json` a failure prints `{"error":{"message","status"}}` and exits with code 1. Status 401 means the session is missing, expired or revoked: ask the user to run `giftsofprometheus login` again.
