<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:1a1b27,100:6366f1&height=180&section=header&text=vairix-admin-mcp&fontSize=36&fontColor=ffffff&fontAlignY=35&desc=Log%20your%20hours%20with%20Claude%2C%20not%20clicks&descSize=16&descColor=a5b4fc&descAlignY=55" width="100%" />

[![Node](https://img.shields.io/badge/node-%3E%3D18-43853d?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-6366f1?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiPjxwYXRoIGQ9Ik0xMiAyTDIgN2wxMCA1IDEwLTUtMTAtNXoiLz48cGF0aCBkPSJNMiAxN2wxMCA1IDEwLTUiLz48cGF0aCBkPSJNMiAxMmwxMCA1IDEwLTUiLz48L3N2Zz4=)](https://modelcontextprotocol.io)

</div>

<div align="center">

### Talk to Claude. Your hours get logged.

An [MCP server](https://modelcontextprotocol.io) that gives Claude direct access to [Vairix Admin](https://admin.vairix.com).<br>
No more clicking through forms -- just describe what you need in plain language.

</div>

---

<img src="assets/demo.gif" width="100%" alt="Demo" />

---

## Install

One command. That's it.

```bash
claude mcp add vairix-admin -s user -- npx --yes github:Barralex/vairix-admin-mcp
```

> `-s user` makes it available across **all** your projects, not just the current one.

<details>
<summary>Clone manually instead</summary>

```bash
git clone git@github.com:Barralex/vairix-admin-mcp.git
cd vairix-admin-mcp
npm install
claude mcp add vairix-admin -s user -- node $(pwd)/build/index.js
```

</details>

<details>
<summary>Uninstall</summary>

```bash
claude mcp remove vairix-admin -s user
```

</details>

## How it works

```
You: "Log 8 hours on Seekr for today: API refactor"
                          |
                    Claude Code (MCP)
                          |
               admin.vairix.com (HTTP)
                          |
                       Done.
```

**First time?** Claude will open your browser (Chrome, Edge, or Brave) so you can login normally. Your session cookies are stored in the OS keychain -- passwords are **never** saved. After that, everything runs via direct HTTP requests. Sub-second. No browser needed.

Session expired? Just say _"authenticate"_ again.

## What you can say

```
"Authenticate with Vairix Admin"              -- login (once per session)

"What days am I missing this month?"           -- find gaps
"Log 8h on Seekr for Monday through Friday"    -- bulk log
"Log 4 hours on Cordage for today: Bug fixes"  -- single entry

"How many hours did I log on Seekr?"           -- totals
"Show me a breakdown by category"              -- summary
"Show my hours for this month"                 -- list entries

"Delete the hour entry from today"             -- remove entry
```

No special syntax. No commands to memorize. Just describe what you want.

## Tools under the hood

Claude picks the right tool automatically. You don't need to call them directly.

| Tool | What it does |
|:-----|:-------------|
| **`auth`** | Opens your browser for login. Session saved to OS keychain. |
| **`auth_status`** | Checks if your session is still valid. |
| **`logout`** | Clears saved session. |
| **`set_main_project`** | Sets your default project so you don't have to specify it every time. |
| **`get_pending_days`** | Finds workdays where you haven't logged hours yet. |
| **`get_hours`** | Lists your entries. Filter by project, date range, or scope. |
| **`get_hours_summary`** | Totals and breakdowns by project, category, or date. |
| **`get_projects`** | Shows which projects you can log to. |
| **`create_hours`** | Logs hours for one or more dates at once. |
| **`delete_hours`** | Removes an entry by ID. |

## Security

Your credentials are handled carefully:

- **Passwords** are never stored. You login through your real browser.
- **Session cookies** live in your OS keychain (macOS Keychain / Linux libsecret / Windows Credential Vault).
- **No bundled browser**. Uses your existing Chrome, Edge, or Brave.

## WSL Setup

Running inside WSL requires extra steps since there's no default browser or keychain.

**1. Install a browser inside WSL:**

```bash
# Option A: Chromium
sudo apt install -y chromium-browser

# Option B: Google Chrome
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo dpkg -i google-chrome-stable_current_amd64.deb
sudo apt -f install -y
```

**2. Install keychain dependencies:**

```bash
sudo apt install -y libsecret-1-dev gnome-keyring
```

Start the keyring daemon (add to your `.bashrc`):

```bash
eval $(gnome-keyring-daemon --start --components=secrets 2>/dev/null)
export GNOME_KEYRING_CONTROL
```

**3. Verify setup:**

```bash
npx --yes github:Barralex/vairix-admin-mcp --health-check
```

> **Note:** Browser auth requires a display server. WSL2 with WSLg provides this automatically. If using WSL1 or WSLg isn't working, you'll need an X11 server (e.g., VcXsrv) with `export DISPLAY=:0`.

## Troubleshooting

| Problem | Solution |
|:--------|:---------|
| "No Chromium-based browser found" | Install Chrome, Edge, or Brave. |
| "No Chromium-based browser found inside WSL" | Install a browser _inside_ WSL, not on Windows. See [WSL Setup](#wsl-setup). |
| "Not authenticated" | Say _"authenticate with Vairix"_. |
| "Session expired" | Same -- just authenticate again. |
| Hours creation fails | Check the error. Admin validates dates (no future dates, etc). |
| Keychain errors on WSL/Linux | Install libsecret and gnome-keyring. See [WSL Setup](#wsl-setup). |
| Server won't start | Run `--health-check` to diagnose: `npx --yes github:Barralex/vairix-admin-mcp --health-check` |

## Development

```bash
npm run dev          # watch mode
npm run build        # compile
npm test             # run tests
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
