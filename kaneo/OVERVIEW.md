Kaneo brings the tickets from your self-hosted [Kaneo](https://kaneo.app) instance into Paseo and starts an agent on one of them in a fresh worktree workspace.

## What it does

- **Ticket list** under Sidebar → Kaneo, or ⌘K → "Open Kaneo tickets". It shows the tickets of every Kaneo project you can access. By default you see open tickets assigned to you or to nobody, yours first, then by priority and due date. Chips switch to "Mine" or "Everyone", show done tickets, and filter by project. The filter field matches ID, title, status, assignee, and project. The list refreshes every two minutes while it is visible.
- **Ticket detail** with status, priority, assignee, due date, labels, description, subtasks and other related tickets, links such as GitHub pull requests, and comments.
- **Start work** from the detail view. Pick a Paseo project, a model, and a branch name (prefilled as `kan-42-short-title`), add a note or leave it empty, and press Enter. The plugin creates a worktree workspace on that branch and starts the agent there. The full ticket is attached to the first message, and images from the ticket description are attached as images. If your Paseo app is connected to several daemons, a Host field lets you start the agent on any of them; the plugin only has to be installed on one. The plugin remembers the host and Paseo project per Kaneo project and your last model.
- **Attach a ticket to any message** through the composer's attachment menu. Search by ticket ID, such as `KAN-42`, or by title.
- **Back to the ticket**: agents started from a ticket carry a `kaneo` label. ⌘K → "Open this agent's Kaneo ticket" opens it again.

## Setup

1. In Kaneo, open Settings → Account → API keys and create a key. The plugin only reads, so a key with read access is enough.
2. In Paseo, open Settings → Plugins → kaneo → Kaneo, or ⌘K → "Configure Kaneo". Enter the address you open Kaneo at and the key, then press Save. The plugin checks both against Kaneo before storing them.

The URL and key are stored on the daemon in `$PASEO_HOME/plugin-data/kaneo/credentials.json` with `0600` permissions. The key is never sent to a Paseo client. If you set `KANEO_URL` and `KANEO_API_KEY` in the daemon environment, they take precedence over the stored values.

## What it reads and sends

The daemon calls your Kaneo instance's API with the key: your user, workspaces, projects, tickets, comments, labels, relations, and links. Images are downloaded only from the Kaneo host itself, never from other hosts. Ticket text and images go to the agent you start, and so to that agent's provider. The plugin never writes to Kaneo.

## Limits

- Kaneo allows 100 API requests per minute per key. The plugin caches responses on the daemon. When Kaneo answers with a rate limit, the plugin pauses requests and shows the last loaded list.
- A project shows at most 500 tickets. Search by ticket ID reaches the rest.
- At most 8 images are attached per ticket, up to 5 MB each and 12 MB in total, in PNG, JPEG, GIF, or WebP.
- Descriptions and comments are shown as plain text, not rendered Markdown.
- Starting on another host needs that host to be connected in your Paseo app. Ticket text and images travel through the app to that host.
- The ticket attachment in the composer and "Open this agent's Kaneo ticket" are available on hosts where the plugin is installed. Each installation keeps its own Kaneo URL, key, and settings.
- Requires Paseo 0.11.2 or later.
