*This project has been created as part of the 42 curriculum by yukusano, sonakamu, ssawa, kaisuzuk.*

# Project T (ft_transcendence)

## Description
Project T is a modern, real-time multiplayer Tetris-like game web application built for the `ft_transcendence` project. It aims to provide a highly competitive and responsive gaming experience, featuring real-time 1v1 battles, spectator modes, an AI opponent, and a fully functional tournament system. The application encompasses a full-stack architecture with a robust backend to ensure server-authoritative gameplay, anti-cheat measures, and seamless real-time synchronization.

## Instructions

### Prerequisites
- **Docker** and **Docker Compose**
- **Node.js 20 or later** and **npm 10 or later**
- Web Browser (Latest stable version of Google Chrome recommended)
- Ports 8080 and 8443 available on your machine (defaults; configurable with
  `NGINX_HTTP_PORT` and `NGINX_PORT`). Development binds the optional direct
  ports 3000, 5173, 54320, and 63790 to `127.0.0.1` only; remote clients must
  use the Nginx HTTPS entry point.

### Setup and Execution
1. Clone the repository:
   ```bash
   git clone <repository_url> transcendence
   cd transcendence
   ```
2. Setup environment variables:
   Copy the example environment file and adjust if necessary.
   ```bash
   cp .env.example .env
   ```
   Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and
   `SMTP_FROM`; account deletion uses email confirmation and cannot be
   requested without a working SMTP transport.
   Register `https://localhost:8443/api/auth/42/callback` as the 42 OAuth
   redirect URI (replace the host and port consistently for another deployment).
3. Install dependencies and generate Prisma Client:
   ```bash
   make install
   ```
   `make install` runs `prisma generate` from
   `apps/backend/prisma/schema.prisma` automatically.
4. Start the application using Docker Compose:
   ```bash
   make up
   # Use this instead when every image must be rebuilt:
   make build
   ```
   These targets also build the browser AI and initialize/unseal Vault before
   starting the Compose stack.
5. Access the application:
   - Open your browser and navigate to `https://localhost:8443` (or the configured domain/IP and `NGINX_PORT`).
   - *Note: Since we use self-signed certificates for HTTPS, you may need to bypass the browser security warning.*

### Prisma Client generation

Run the following command whenever `apps/backend/prisma/schema.prisma` changes or
after switching to a branch with schema changes:

```bash
make generate
```

Backend builds and type checks also regenerate Prisma Client automatically. The
backend Docker image uses the same npm script, and the development container
regenerates the client before applying the schema and starting NestJS.

### Quality checks

```bash
npm run type-check
npm run lint
npm test --workspace apps/backend -- --runInBand
node --test apps/frontend/tests/*.test.cjs
npm run build --workspace apps/frontend
npm run test:browser # requires Chrome and the HTTPS stack on :8443
npm run test:websocket # requires the HTTPS/Socket.IO stack on :8443
```

`BROWSER_BASE_URL` can point the browser smoke test at another deployment.

### Secret checks and rotation

Run `make secret-scan` before committing. `make secret-scan-history` can be used
to audit every reachable Git revision; historical findings must be treated as
compromised and their credentials rotated. If development credentials may have
leaked, run `make rotate-dev-secrets`; this
rotates JWT/session, PostgreSQL, Redis, Vault KV history, and the backend Vault
token, then recreates the affected services. It invalidates existing sessions.
OAuth, SMTP, and SMS credentials must be revoked and reissued by their providers.

## Technical Stack
- **Frontend Framework:** React (Vite) + TypeScript
- **Backend Framework:** NestJS + TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **Cache and short-lived security state:** Redis
- **Real-Time Communication:** Socket.IO / WebSockets
- **Game Rendering Engine:** PixiJS (WebGL)
- **Security:** Nginx with ModSecurity (WAF), HashiCorp Vault (Secrets Management)

**Justification:** 
We chose React + Vite for its rapid development cycle and rich ecosystem, which integrates with PixiJS for WebGL game rendering. NestJS manages the REST API and WebSocket gateway. PostgreSQL + Prisma provides type-safe relational storage. Redis stores refresh-token revocation, deletion-confirmation hashes, and Public API rate-limit counters; Socket.IO rooms and reconnect state remain in one backend process and do not use a Redis adapter. WAF and Vault protect HTTP traffic and application secrets.

## Database Schema
The database uses PostgreSQL and is managed via Prisma. The core entities and their relationships include:
- **User:** Stores credentials, profile data, and game settings.
- **GameResult:** Stores match outcomes, APM, PPS, and line clears. Relates to Player 1 and Player 2 (Users).
- **Tournament:** Manages tournament instances, state (registration, in-progress, completed).
- **TournamentMatch:** Individual matches within a tournament, relating back to GameResult and Tournament.
- **Friendship / Block:** Self-referential relations on the User model for social features.
See the [schema-synchronized ER diagram](ER.md) for all 20 Prisma models,
15 enums, field constraints, and 30 foreign-key relationships. Verify it with
`node tools/schema-doc.cjs --check`; regenerate its Markdown with
`node tools/schema-doc.cjs` after changing the schema. This checks documentation,
not whether migrations have been applied to a running database.

## Team Information
- **Product Owner:** kaisuzuk
- **Project Manager:** yukusano
- **Technical Lead:** sonakamu
- **Developers:** kaisuzuk, sonakamu, ssawa, yukusano

- **sonakamu - Game Engine & Frontend Logic (Player 1)**: Responsible for PixiJS rendering, game state synchronization, local input handling.
- **ssawa - AI & Multiplayer Logic (Player 2)**: Focused on the C++ headless AI integration, collision detection, and WebSocket real-time synchronization.
- **kaisuzuk - UI/UX & React Developer (Player 3)**: Designed the neon-themed SPA, dashboard charts, tournament brackets, and overall responsive design.
- **yukusano - Backend, DevOps & Security (Player 4)**: Managed Docker, Nginx, WAF, Vault, NestJS API, PostgreSQL, Redis, and overall system architecture.

## Project Management
- **Organization:** We adopted an agile-like parallel development approach. The team split into specialized roles (Frontend Game, Frontend UI, Backend/Infra) to prevent bottlenecks.
- **Task Tracking:** We used GitHub to manage our sprint backlogs and track progress.
- **Communication:** Daily stand-ups and real-time collaboration were conducted via Discord.

## Features List
- **Real-time 1v1 Battle:** Server-authoritative Tetris with garbage lines (Responsible: sonakamu).
- **Tournament System:** Single-elimination brackets with real-time progress (Responsible: sonakamu).
  Custom-room tournaments accept 4, 8, or 16 players, including guests and guest hosts.
  Brackets are persisted only when all players have distinct registered accounts;
  guest-containing brackets remain in server memory. Existing per-match result
  saving still applies. The same registered account cannot enter twice.
- **AI Opponent:** Play against an intelligent bot with adjustable difficulties (Responsible: ssawa).
- **Spectator Mode:** Watch live matches with real-time board updates (Responsible: sonakamu).
- **Analytics Dashboard:** Visual graphs for APM, PPS, and win rates (Responsible: yukusano).
- **Public API:** Rate-limited and secured API endpoints for fetching stats (Responsible: yukusano).
- **Social Features:** Friend lists, real-time chat, profile customization (Responsible: yukusano).
- **Advanced Security:** ModSecurity WAF and HashiCorp Vault integration (Responsible: yukusano).

## Implemented Module Candidates
*The 23 entries below total at most 35 points (Major = 2, Minor = 1), but this
is not a score claim. A module is claimed for evaluation only after its complete
requirement and live demonstration pass; see `REMAINING_TASKS.md`.*

### Web
1. **Use a Framework as backend and frontend (Major - 2pts)**: React (Vite) and NestJS.
2. **Use a database ORM (Minor - 1pt)**: Prisma.
3. **Use WebSockets (Major - 2pts)**: Socket.IO for game state, chat, and live spectator modes.
4. **User Interaction (Major - 2pts)**: Real-time chat, friend system, profile views.
5. **Advanced Search (Minor - 1pt)**: Filter and search through users and game history.
6. **Public API (Major - 2pts)**: 5+ endpoints protected by API keys with Swagger documentation.
7. **Custom Design System (Minor - 1pt)**: Reusable neon/cyberpunk UI components.

### User Management
8. **Standard User Management (Major - 2pts)**: Avatars, display names, friend status.
9. **Game Statistics (Minor - 1pt)**: APM, PPS, and win-rate tracking.
10. **OAuth 2.0 (Minor - 1pt)**: 42 Intranet authentication.
11. **Two-Factor Authentication (Minor - 1pt)**: TOTP based 2FA via authenticator apps.
12. **Advanced Permission System (Major - 2pts)**: Admin/Moderator roles with BAN functionality.

### Game and User Experience
13. **Web-based Game (Major - 2pts)**: Tetris-like game with T-spins, 7-bag randomizer, and lock delay.
14. **Remote Players (Major - 2pts)**: Networked 1v1 multiplayer over WebSockets.
15. **Multiplayer (3+ players) (Major - 2pts)**: Support for custom rooms and spectator broadcasting.
16. **Game Customization (Minor - 1pt)**: Modifiable keybinds, ghost piece toggle.
17. **Tournament System (Minor - 1pt)**: Automated matchmaking and bracket progression.
18. **Spectator Mode (Minor - 1pt)**: Live viewing of ongoing matches.

### Artificial Intelligence
19. **AI Opponent (Major - 2pts)**: Headless C++ bot evaluating height, holes, and bumpiness.

### Data and Analytics
20. **Data Export/Import (Minor - 1pt)**: Export and import user settings and stats via JSON.
21. **Advanced Analytics Dashboard (Major - 2pts)**: Interactive charts and graphs for user performance.
22. **GDPR Compliance (Minor - 1pt)**: Password/2FA reauthentication, an emailed confirmation code, permanent personal-data deletion, anonymized match retention, and a completion email.

### Cybersecurity
23. **WAF and HashiCorp Vault (Major - 2pts)**: Nginx with ModSecurity and Vault for secret management.

### Administrative permission policy

| Operation | ADMIN | MODERATOR | USER / GUEST |
| --- | --- | --- | --- |
| List users in the admin API | Yes | Yes | No |
| Change another user's role | Yes | No | No |
| Ban / unban USER or GUEST | Yes | Yes | No |
| Ban / unban ADMIN or MODERATOR | Yes | No | No |
| Change own role or own ban state | No | No | No |
| Create a USER account | Yes | No | No |
| Edit another user's display name / bio | Yes | No | No |
| Permanently delete another user (explicit confirmation) | Yes | No | No |

Mutations recheck the actor's current database role and ban/deletion state.
Authorization and writes run in a serializable transaction; serialization
conflicts retry up to three attempts, then return HTTP 409. The last usable
(not deleted or currently banned) administrator cannot be demoted, banned,
or deleted through the account-deletion flow. Promote another administrator
before deleting that account. Creation uses `POST /api/admin/users`, profile editing
uses `PATCH /api/admin/users/:id`, and permanent deletion uses
`DELETE /api/admin/users/:id` with `{"confirmation":"DELETE USER"}`.
Deletion removes personal data and anonymizes retained match history; it cannot
be undone. CRUD is covered at the service and HTTP boundaries and through a Chrome
interaction smoke test. Persistent administrative audit storage is intentionally
out of scope: it is not part of the module rubric and would require a separate
GDPR retention/minimization policy for administrator and deleted-user identifiers.

### Public API usage

Create an API key through authenticated `POST /api/keys` (JWT bearer token).
The returned 64-character key is shown only once. Send it in the `X-API-Key`
header for every `/api/public` request. `DELETE /api/keys/:id` revokes your own
key; expired/revoked keys and keys owned by deleted or currently banned users
are rejected. Each key has a fixed one-hour quota shared across these routes.

| Method | Path (after `/api/public`) | Purpose |
| --- | --- | --- |
| GET | `/leaderboard` | Paginated rankings |
| GET | `/users/:username` | Public profile |
| GET | `/users/:username/stats` | Player statistics |
| GET | `/users/:username/history` | Paginated match history |
| GET | `/tournaments` | Tournament list |
| GET | `/me/settings` | Read the key owner's saved preferences |
| POST | `/me/settings` | Create preferences (201; existing resource returns 409) |
| PUT | `/me/settings` | Replace existing preferences (200; absent resource returns 404) |
| DELETE | `/me/settings` | Remove preferences only (204, including already absent) |

Example POST/PUT JSON: `{"showGhost":true,"arr":33,"das":170,"sdf":6,"volume":50}`.
PUT is replacement, not PATCH: omitted/null fields reset to schema defaults,
and omitted key bindings reset to null. These are personal preferences, not
match rules or score submission. Ownership is derived exclusively from the
authenticated key; `userId`, `role`, `score` and unknown fields are rejected.
After deleting preferences, use POST to recreate them (normal settings save
also recreates them). Newly registered accounts generally already have settings,
so use PUT for their first API update.

Malformed requests return 400; invalid/missing keys return 401; quota excess
returns 429 with `retryAfter` in seconds in the response JSON. Swagger exposes
the API-key scheme, validated input schemas, preference examples and status
descriptions. HTTP contract tests exercise the actual Nest routing, guards,
validation and services with isolated database/Redis fakes; they do not prove
real PostgreSQL/Redis integration. Tests bind only to `127.0.0.1` on a temporary
port and require permission to open a local listener.

### Progression rules

For newly saved results, a competitive win grants 50 XP; other results grant
20 XP. Level is `floor(XP / 1000) + 1`. Solo runs and draws count toward games
played, but not wins/losses, and do not reset a winning streak. Win rate is
`wins / (wins + losses)` (0 when no decisive games exist).

Only matches between two distinct registered human users change rank points:
win +25, loss -15, draw 0, with a floor of 0. AI, guest and solo matches do not
change rank points. Ranks are BRONZE (0–499), SILVER (500–999), GOLD (1000–1499),
PLATINUM (1500–1999), DIAMOND (2000–2499), MASTER (2500+).
Results and statistics are saved in one transaction. Existing historical
statistics are not automatically recalculated; old records cannot reliably
distinguish a guest/AI victory from a draw using winner user ID alone.

Game achievements are awarded once per account on result saving: first victory
(100 XP), 10 victories (200 XP), 100 games (200 XP), 10 cumulative T-spins
(150 XP), and 100 cumulative Tetrises (300 XP). Multiple achievements can unlock
in the same game; their XP is added before calculating the new level. Definitions
are created on demand, so reseeding or deleting existing data is not required.
Solo/AI games contribute to play and technique totals; solo runs do not count as
victories. Historical threshold eligibility is checked at the next saved game.

Daily analytics group newly saved games by completion date in UTC. APM and PPS
are arithmetic means across that day's games (not time-weighted); cleared lines
and playtime are summed. Existing incomplete daily aggregates are not backfilled.

## Individual Contributions
- **sonakamu**: 
  - *Contributions:* Built PixiJS board rendering, local controls, and multiplayer state presentation.
  - *Challenges:* Kept READY, active-piece, Next/Hold, and spectator transitions consistent while applying authoritative server snapshots.
- **ssawa**: 
  - *Contributions:* Developed the C++ headless AI and integrated it into the Node.js backend. Managed the core collision detection logic.
  - *Challenges:* Integrated per-match C++ processes with bounded decision time and replayed the returned actions in the TypeScript game engine.
- **kaisuzuk**: 
  - *Contributions:* Designed and developed the React SPA, custom UI components, and the analytics dashboard using chart libraries.
  - *Challenges:* Kept chat, friend, tournament, and dashboard views maintainable through reusable components, Zustand stores, and custom hooks.
- **yukusano**: 
  - *Contributions:* Architected the Docker infrastructure, NestJS backend, and implemented WAF/Vault security.
  - *Challenges:* Preserved strict OWASP CRS checks for REST while narrowly excluding Socket.IO and Vite development assets, and implemented persistent Vault initialization/unseal workflows.

## Resources and AI Usage
- **NestJS Documentation**: https://docs.nestjs.com/
- **PixiJS Documentation**: https://pixijs.com/
- **Socket.IO Documentation**: https://socket.io/
- **AI Usage**: 
  - *Algorithm Assistance:* AI was used to research and review evaluation features such as height, holes, and bumpiness; final behavior is implemented in the checked-in C++ source and covered by CTest.
  - *Engineering Assistance:* AI helped investigate Docker/Vault/WAF issues, generate candidate fixes, and draft tests and documentation. Changes were reviewed against source, builds, and automated tests before acceptance.
