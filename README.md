# Vairix Admin MCP

MCP server for [Vairix Admin](https://admin.vairix.com). Log your hours with Claude instead of clicking around the admin panel.

```
You  ->  Claude Code  ->  MCP Server (local)  ->  admin.vairix.com
```

## Tools

| Tool | What it does |
|------|-------------|
| `auth` | Opens Chrome for login. Saves session to OS keychain. |
| `auth_status` | Checks if your session is still valid. |
| `logout` | Clears session from keychain. |
| `get_pending_days` | Lists days missing hour entries. |
| `get_hours` | Lists logged hours (scopes: `current_month`, `today`, `yesterday`, `all`). |
| `get_projects` | Lists your available projects. |
| `create_hours` | Logs hours for one or more dates. |
| `delete_hours` | Deletes an hour entry by ID. |

## Setup

```bash
claude mcp add vairix-admin -- npx github:vairix/admin-mcp
```

That's it. Requires access to the private repo (must be part of the Vairix GitHub org).

<details>
<summary>Alternative: clone manually</summary>

```bash
git clone git@github.com:vairix/admin-mcp.git
cd admin-mcp
npm install
claude mcp add vairix-admin -- node $(pwd)/build/index.js
```
</details>

Then in Claude Code:

> "Authenticate with Vairix Admin"

Chrome opens. You login. Chrome closes. Done.

## Usage

```
"What days am I missing hours for?"
"Log 8 hours on Seekr for today: Working on feature X"
"Log 8h of Seekr for Monday through Friday: Sprint planning"
"Show my hours for this month"
"Delete the hour entry from today"
```

## How it works

1. **Auth** - Opens system Chrome via `playwright-core`. You login manually. Cookies are captured and stored in your OS keychain (`keytar`).
2. **Everything else** - Direct HTTP requests with those cookies. No browser, sub-second responses.
3. **Session expires?** - Just say "authenticate" again.

## Security

- No passwords stored. Anywhere. Ever.
- Session cookies live in your OS keychain (macOS Keychain / Linux libsecret / Windows Credential Vault).
- Auth uses your system Chrome - no bundled browser, no Chromium downloads.

## Requirements

- Node.js >= 18
- Google Chrome
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI

## Troubleshooting

| Error | Fix |
|-------|-----|
| "Google Chrome not found" | Install Chrome. |
| "Not authenticated" | Run `auth` tool. |
| "Session expired" | Run `auth` tool again. |
| Hours creation fails | Check the error - admin has validation rules (no future dates, etc). |

## Development

```bash
npm run dev          # watch mode
npm run build        # compile
npm start            # run server
```

## License

MIT
