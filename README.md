<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:1a1b27,100:6366f1&height=180&section=header&text=vairix-admin-mcp&fontSize=36&fontColor=ffffff&fontAlignY=35&desc=Log%20your%20hours%20with%20Claude%2C%20not%20clicks&descSize=16&descColor=a5b4fc&descAlignY=55" width="100%" />

[![Node](https://img.shields.io/badge/node-%3E%3D18-43853d?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-6366f1?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiPjxwYXRoIGQ9Ik0xMiAyTDIgN2wxMCA1IDEwLTUtMTAtNXoiLz48cGF0aCBkPSJNMiAxN2wxMCA1IDEwLTUiLz48cGF0aCBkPSJNMiAxMmwxMCA1IDEwLTUiLz48L3N2Zz4=)](https://modelcontextprotocol.io)

**MCP server that connects Claude to [Vairix Admin](https://admin.vairix.com) for automated time tracking.**

</div>

---

<img src="assets/demo.gif" width="100%" alt="Demo" />

---

## How it works

1. **Auth** - Opens your browser (Chrome, Edge, or Brave). You login. Cookies are stored in your OS keychain.
2. **Everything else** - Direct HTTP requests. No browser, sub-second responses.
3. **Session expired?** - Just say "authenticate" again.

## Quick start

```bash
claude mcp add vairix-admin -- npx github:Barralex/vairix-admin-mcp
```

Then tell Claude:

> "Authenticate with Vairix Admin"

Your browser opens. You login. It closes. Done.

<details>
<summary><strong>Alternative: clone manually</strong></summary>

```bash
git clone git@github.com:Barralex/vairix-admin-mcp.git
cd vairix-admin-mcp
npm install
claude mcp add vairix-admin -- node $(pwd)/build/index.js
```

</details>

## Usage

**Step 1** - Authenticate (only needed once per session)

```
"Authenticate with Vairix Admin"
```

↓

**Step 2** - Ask away

```
"What days am I missing hours for?"
"Log 8 hours on Seekr for today: Working on feature X"
"Log 8h of Seekr for Monday through Friday: Sprint planning"
"Show my hours for this month"
"Delete the hour entry from today"
```

## Tools

| Tool | Description |
|:-----|:------------|
| `auth` | Opens Chrome for login. Saves session to OS keychain. |
| `auth_status` | Checks if your session is still valid. |
| `logout` | Clears session from keychain. |
| `get_pending_days` | Lists workdays missing hour entries. |
| `get_hours` | Lists logged hours (`current_month` `today` `yesterday` `all`). |
| `get_projects` | Lists your available projects. |
| `create_hours` | Logs hours for one or more dates. |
| `delete_hours` | Deletes an hour entry by ID. |

## Security

| | |
|:--|:--|
| **Passwords** | Never stored. Anywhere. Ever. |
| **Session** | OS keychain (macOS Keychain / Linux libsecret / Windows Credential Vault). |
| **Browser** | Uses your existing Chrome, Edge, or Brave. No bundled browser. |

## Troubleshooting

<details>
<summary><strong>Common issues</strong></summary>

| Error | Fix |
|:------|:----|
| "No Chromium-based browser found" | Install Chrome, Edge, or Brave. |
| "Not authenticated" | Run `auth` tool. |
| "Session expired" | Run `auth` tool again. |
| Hours creation fails | Check the error - admin has validation rules (no future dates, etc). |

</details>

## Development

```bash
npm run dev          # watch mode
npm run build        # compile
npm start            # run server
```

## Requirements

- Node.js >= 18
- Chrome, Edge, or Brave
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI

<div align="center">

---

**[Vairix](https://vairix.com)** | MIT License

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:1a1b27,100:6366f1&height=80&section=footer" width="100%" />

</div>
