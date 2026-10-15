# Paseo plugins

Plugins for [Paseo](https://paseo.sh). Each directory is one plugin and is installed on its own.

| Plugin | What it does | Install source |
| --- | --- | --- |
| [kaneo](kaneo) | Lists your Kaneo tickets and starts an agent on one in a new worktree workspace | `github:carlonoelle/paseo-plugins:kaneo` |

Enable plugins on the daemon first (Settings → Plugins → Enable plugins). Then paste the install source into Settings → Plugins, or run `paseo plugin install <source>` on the daemon machine. Plugins are trusted code that runs on the daemon and in the Paseo app.
