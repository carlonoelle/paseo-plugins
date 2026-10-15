# Kaneo plugin for Paseo

Lists the tickets of a self-hosted [Kaneo](https://kaneo.app) instance in [Paseo](https://paseo.sh) and starts an agent on a ticket in a new worktree workspace, on any Paseo host your app is connected to. See [OVERVIEW.md](OVERVIEW.md) for what it does and how to set it up.

## Install

Enable plugins on the daemon (Settings → Plugins → Enable plugins), then install from Settings → Plugins with the source `github:carlonoelle/paseo-plugins:kaneo`, or from a terminal on the daemon machine:

```sh
paseo plugin install github:carlonoelle/paseo-plugins:kaneo
```

Then add the Kaneo URL and an API key under Settings → Plugins → kaneo → Kaneo.

## Development

```sh
npm install
npm run typecheck
paseo plugin install "$PWD"
paseo plugin reload kaneo
paseo plugin logs kaneo
```

- `index.client.tsx` and `index.server.ts` register the contributions.
- `shared/` holds the RPC contracts and the settings document.
- `server/` holds the Kaneo API client, caching, ticket text, and credential storage.
- `client/` holds the ticket list, ticket detail and start form, and settings screen.
