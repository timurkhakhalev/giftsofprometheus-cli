# Security policy

## Supported versions

Only the latest release of the CLI receives fixes.

## Reporting a vulnerability

Report vulnerabilities in the CLI or in the giftsofprometheus.com API privately through [GitHub security advisories](https://github.com/timurkhakhalev/giftsofprometheus-cli/security/advisories/new). Do not open a public issue.

Include the affected version, steps to reproduce and the impact you expect. You will get a reply within a few days.

## How the CLI handles your session

- `login` uses the device authorization flow: the CLI shows a code and you confirm it in a browser where you are signed in. No password or token passes through the terminal.
- The session token is stored in `$XDG_CONFIG_HOME/giftsofprometheus/credentials.json` with mode `0600`, in a directory with mode `0700`. It is bound to the service origin and is not sent to any other host.
- Requests go only to the public API paths `/api/knowledge/`, `/api/account/` and `/api/auth/device/`, over HTTPS. Plain HTTP is accepted only for `localhost`. Redirects are refused.
- `logout` revokes the session on the server and deletes the local file. Any device can also be revoked from the account page on the site.
