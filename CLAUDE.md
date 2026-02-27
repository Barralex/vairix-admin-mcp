# CLAUDE.md

## Project Overview

MCP (Model Context Protocol) server that connects Claude to Vairix Admin (https://admin.vairix.com) for automated time tracking. Built with TypeScript, runs locally via stdio transport.

## Architecture

```
src/
├── index.ts   # MCP server entry point, tool definitions
├── auth.ts    # Browser-based auth (playwright-core), session storage (keytar)
└── api.ts     # HTTP client for admin.vairix.com (GET/POST/DELETE)
```

- **auth.ts**: Opens system Chrome for manual login, captures cookies, stores session in OS keychain via `keytar`. No passwords stored.
- **api.ts**: Stateless HTTP requests using session cookies + CSRF tokens. Parses Active Admin HTML responses (no official API).
- **index.ts**: Registers 8 MCP tools (auth, auth_status, logout, get_pending_days, get_hours, get_projects, create_hours, delete_hours).

## Tech Stack

- TypeScript (ES2022, Node16 module resolution, strict mode)
- `@modelcontextprotocol/sdk` - MCP server framework
- `playwright-core` - Browser automation for auth only (uses system Chromium-based browser: Chrome, Edge, or Brave)
- `keytar` - OS keychain integration (macOS Keychain / Linux libsecret / Windows Credential Vault)
- `zod` - Tool input validation

## Key Details

- The target app is **Active Admin 3.3.0** (Rails). There is no official API — we scrape HTML and use `.json` endpoints where available.
- CSRF tokens must be fetched fresh before every POST/DELETE operation.
- `POST` to create hours returns `302` on success, `200` on validation error (re-renders form with `<li>` error tags).
- `DELETE` requires `X-CSRF-Token` header.
- Category mapping: 1=Desarrollador, 2=PM, 3=Testing, 4=Arquitecto, 5=Otro.
- Session validation: GET `/admin/daily_hours.json?scope=today` — 200 means valid, redirect means expired.

## Commands

```bash
npm run build     # Compile TypeScript
npm run dev       # Watch mode
npm start         # Run MCP server
```

## Git Conventions

- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:` prefixes.
- **No Co-Authored-By** lines in commit messages.
- **No emojis** in commits or code.
- Keep commit messages short and in English.
- Examples:
  - `feat: add bulk hour creation for date ranges`
  - `fix: handle CSRF token refresh on expired session`
  - `docs: update README installation instructions`

## Code Style

- No comments unless the logic is non-obvious.
- No docstrings on every function — the code should be self-explanatory.
- Minimal error handling: only catch at tool boundaries (index.ts), let errors propagate from api.ts/auth.ts.
- No `.env` files. All config is hardcoded (base URL) or stored in OS keychain (session).
- Keep dependencies minimal. Don't add libraries for things Node can do natively (e.g., use `fetch` not `axios`).

## Testing

To test locally:

```bash
npm run build
# Then reconnect the MCP in Claude Code: /mcp > Reconnect vairix-admin
```

No automated tests yet. Manual testing via Claude Code tool calls.
