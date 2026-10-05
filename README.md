*This project has been created as part of the 42 curriculum by yukusano, sonakamu, ssawa, kaisuzuk.*

# Project T (ft_transcendence)

## Description

Project T is a modern, real-time competitive falling-block puzzle game built for the `ft_transcendence` project. It aims to provide a responsive and competitive gameplay experience with real-time one-on-one matches, spectator mode, AI opponents, and a fully functional tournament system.

## Instructions

### Prerequisites

- **Docker Engine 24 or later** with **Docker Compose v2.20 or later**
- **GNU Make 3.81 or later**
- A web browser (the latest stable version of Google Chrome is recommended)
- Available default host ports: 8080, 8443, 54320, and 63790 (or change them in `.env`)

Node.js, npm, CMake, and OpenSSL run inside containers for the production deployment and are not host prerequisites. They are only needed on the host for optional developer commands that invoke them directly.

### Setup and Execution

1. Clone the repository:

   ```bash
   git clone https://github.com/ydiksn37/ft_transcendence.git
   cd ft_transcendence
   ```

2. Configure the environment variables by copying the example file and adjusting it as needed:

   ```bash
   cp .env.example .env
   ```

   `POSTGRES_USER`, `POSTGRES_DB`, `FT_CALLBACK_URL`, and `ALLOWED_ORIGINS` must remain non-empty. The provided defaults work for a local evaluation. Port variables and `DEV_BIND_ADDRESS` may be changed if the defaults conflict with the host.

   Local accounts work without 42 OAuth. To demonstrate OAuth, set `FT_CLIENT_ID` and `FT_CLIENT_SECRET`, then register `https://localhost:8443/api/auth/42/callback` as the redirect URI. If the application uses a different host or port, update the registered URI, `FT_CALLBACK_URL`, `VITE_WS_URL`, and `ALLOWED_ORIGINS` consistently. Never commit the resulting `.env`; it is ignored by Git.

3. Build and start the application with Docker Compose. This command also installs dependencies, compiles the C++ AI, initializes Vault, and runs the database migrations:

   ```bash
   make build
   ```

   `make build` validates the manually created `.env`, builds all application artifacts inside Docker, generates the ignored development secret files under `secrets/dev/`, initializes Vault, starts the containers, applies database migrations, and waits for the services to become healthy. It never creates or overwrites `.env`.

   To start an environment that has already been built, run:

   ```bash
   make up
   ```

   For the hot-reload development configuration, use `make dev`. `make up` only starts an already built production environment and does not repeat dependency, C++, or Vault builds.

4. Open `https://localhost:8443` in a browser, or use the configured domain/IP and `NGINX_PORT`.

   The application uses a self-signed HTTPS certificate, so the browser will display a security warning that must be acknowledged before continuing.

## Technical Stack

| Area | Technologies | Rationale |
| --- | --- | --- |
| Frontend | React, TypeScript, Vite, Zustand | React provides component-based UI composition, Vite keeps builds and hot reload fast, and Zustand keeps shared client state small and explicit. |
| Styling and accessibility | Tailwind CSS, custom CSS design system, ARIA semantics | Tailwind supplies utility-based styling while reusable components, shared design tokens, keyboard navigation, and focus states keep the interface consistent and accessible. |
| Game rendering | PixiJS / WebGL | GPU-accelerated canvas rendering keeps board updates and effects responsive without tying the game engine to the DOM. |
| Backend and real-time communication | NestJS, TypeScript, Socket.IO | NestJS structures REST, authentication, validation, and WebSocket gateways; Socket.IO handles matches, chat, presence, reconnection, and spectating. |
| Data and state | PostgreSQL, Prisma ORM, Redis | PostgreSQL stores relational application data, Prisma supplies a typed schema and migrations, and Redis supports short-lived shared state and session-related workloads. |
| Analytics and exports | Recharts, jsPDF, CSV/JSON import and export | Interactive charts, date filters, PDF/CSV reports, and validated archives make gameplay data understandable and portable. |
| AI | C++17, CMake, a headless process bridge | Native search agents provide multiple difficulty levels while the NestJS bridge validates and applies their actions to the authoritative TypeScript game engine. |
| API documentation | Swagger / OpenAPI | Interactive endpoint documentation makes the API-key-protected public API directly demonstrable during evaluation. |
| Security and delivery | Nginx, HTTPS, ModSecurity with OWASP CRS, HashiCorp Vault, bcrypt, JWT, TOTP 2FA | Nginx provides a single TLS entry point, the WAF filters hostile traffic, Vault separates runtime secrets, and established authentication primitives protect accounts. |
| Deployment | Docker, Docker Compose, multi-stage builds | The complete frontend, backend, database, cache, Vault, WAF, and AI toolchain can be built and started reproducibly with one Make target. |

## Architecture Documentation

- [Site map and frontend routes](docs/sitemap.md)
- [Complete database ER diagram, fields, types, constraints, and relations](docs/ER.md)
- Swagger UI: `https://localhost:8443/api/docs` while the application is running

## Database Schema

The application uses PostgreSQL through Prisma. UUID strings are primary and foreign keys unless stated otherwise. The complete generated schema reference is [docs/ER.md](docs/ER.md); it contains all 19 tables, every field and Prisma type, constraints, deletion behavior, and a Mermaid ER diagram.

| Area | Tables and principal typed fields | Main relationships |
| --- | --- | --- |
| Identity | `User` (`email: String`, `passwordHash: String?`, `role: Role`, `twoFactorSecret: String?`), `UserStats` (`wins: Int`, `winRate: Decimal`, `rank: Rank`), `UserGameSettings` (`keyBindings: Json?`, `arr/das/dcd/sdf: Int`) | `User` has optional one-to-one stats and settings records. |
| Games and analytics | `GameResult` (`gameMode: GameMode`, APM/PPS as `Decimal`, line counts as `Int`), `GameAnalytic` (`date: DateTime`, aggregate values), `SprintRecord`, `ImportedGameArchive` | Results reference player 1, player 2, and winner; analytics and solo records belong to one user. Deleted users are detached from retained match records. |
| Social | `Friendship` (`status: FriendshipStatus`), `Block`, `ChatRoom` (`type: ChatRoomType`), `ChatRoomMembership`, `ChatMessage` (`content: String`) | Friendship and block rows join two users; memberships join users to rooms; messages belong to a room and optionally a sender. |
| Tournaments | `Tournament` (`status: TournamentStatus`, `minPlayers/maxPlayers: Int`), `TournamentEntry`, `TournamentMatch` (`round/matchNumber: Int`, `status: MatchStatus`) | Entries join users to tournaments; matches reference a tournament, players, winner, and optional game result. |
| Platform features | `Achievement`, `UserAchievement`, `ApiKey` (`keyHash: String`, `rateLimit: Int`), `FileUpload` (`mimeType: String`, `sizeBytes: BigInt`) | Join rows award achievements to users; API keys and uploads belong to their owners. |

## Team Information

- **Product Owner:** kaisuzuk
- **Project Manager:** yukusano
- **Technical Lead:** sonakamu
- **Developers:** kaisuzuk, sonakamu, ssawa, yukusano

- **sonakamu — Game Engine & Frontend Logic (Player 1):** Responsible for PixiJS rendering, game-state synchronization, and local input handling.
- **ssawa — AI & Multiplayer Logic (Player 2):** Responsible for integrating the headless C++ AI, collision detection, and real-time WebSocket synchronization.
- **kaisuzuk — UI/UX & React Developer (Player 3):** Responsible for the retro arcade-style SPA, dashboard charts, tournament bracket, and responsive design.
- **yukusano — Backend, DevOps & Security (Player 4):** Responsible for the overall system architecture, including Docker, Nginx, WAF, Vault, the NestJS API, PostgreSQL, and Redis.

## Project Management

- **Organization:** We used an agile-inspired parallel development approach. Work was divided into specialist areas—frontend gameplay, frontend UI, and backend/infrastructure—to reduce bottlenecks.
- **Task management:** We used GitHub to manage the sprint backlog and track progress.
- **Communication:** We communicated through Discord and also held in-person meetings every two weeks.

## Features List

| Feature | Description | Lead |
| --- | --- | --- |
| Local game modes | Marathon, 40 Lines, and 4-Wide with scoring, Hold/Next, ghost pieces, and configurable controls. | sonakamu |
| Real-time one-on-one matches | Server-authoritative matchmaking, synchronized boards, garbage attacks, disconnect handling, and reconnection. | sonakamu |
| Custom rooms and multiplayer | Public/private rooms, room-ID joining, and games with three or more participants. | sonakamu |
| Tournament system | Four-or-more-player registration, single-elimination brackets, match progression, and winner tracking. | sonakamu |
| AI opponent | C++ AI matches with selectable difficulty. | ssawa |
| Spectator mode | Real-time viewing of both boards and the state of an active tournament match. | sonakamu |
| Accounts and security | Local registration/login, bcrypt password hashing, 42 OAuth, TOTP 2FA, refresh sessions, and account deletion. | yukusano |
| Profiles and avatars | Editable display name and bio, preset or uploaded/cropped avatar, public profiles, and online status. | ssawa |
| Social features | Friend requests, blocking, global chat, direct messages, and links from chat or search to profiles. | yukusano |
| User search | Text search with online-status filters, ranking/win-rate/game-count sorting, and pagination. | ssawa |
| Statistics and progression | Match history, APM/PPS/win-rate charts, date filters, ranks, XP, levels, streaks, and achievements. | ssawa |
| Data portability | JSON/CSV account export, PDF/CSV analytics export, validated import previews, and settings/history import. | ssawa |
| Customization and responsive UI | Key bindings, timing controls, skins, backgrounds, audio settings, reusable design-system components, and desktop/mobile layouts. | kaisuzuk |
| Legal pages and accessibility | Reachable Privacy Policy and Terms of Service pages, semantic landmarks, keyboard navigation, visible focus states, reduced-motion support, and responsive layouts. | yukusano, ssawa, kaisuzuk |
| Input validation | Client-side form checks plus strict NestJS DTO validation, rejected unknown fields, bounded WebSocket payloads, and validated file uploads/imports. | yukusano |
| Public API | API-key-protected settings, leaderboard, profile, statistics, history, and tournament endpoints with rate limits and Swagger documentation. | yukusano |
| Administration | Role-based user viewing, creation, editing, banning, role management, and deletion for administrators/moderators. | yukusano |
| Infrastructure security | HTTPS through Nginx, ModSecurity/OWASP CRS, Vault-managed application secrets, validation, and protected service boundaries. | yukusano |

## Chosen Modules

Major modules are worth 2 points, and Minor modules are worth 1 point.

| Category | Module | Level | Points | Rationale and Implementation | Lead | Demonstration |
| --- | --- | --- | ---: | --- | --- | --- |
| Web | Frontend and backend frameworks | Major | 2 | React/Vite and NestJS provide a consistent structure for REST and real-time communication. | kaisuzuk | Show page navigation and the NestJS module structure. |
| Web | Database ORM | Minor | 1 | Prisma provides type-safe management of PostgreSQL relations, migrations, and constraints. | yukusano | Show the Prisma schema. |
| Web | WebSockets | Major | 2 | Socket.IO delivers low-latency synchronization for games, chat, rooms, reconnection, and spectating. | sonakamu | Demonstrate a match and spectator view in separate Chrome contexts. |
| Web | User interaction | Major | 2 | Real-time chat, profile viewing, and friend management support interaction between opponents. | yukusano | Use two accounts to demonstrate chat, profiles, and friend operations. |
| Web | Advanced search | Minor | 1 | User search includes online-status filtering, sorting, and pagination to help players find opponents. | ssawa | Change the search criteria, sorting, and page. |
| Web | Public API | Major | 2 | External clients can securely access statistics and settings through API keys, rate limiting, Swagger documentation, and GET/POST/PUT/DELETE endpoints. | yukusano | Execute the endpoints through Swagger UI. |
| Web | Custom design system | Minor | 1 | A shared color palette, typography, icons, and more than ten reusable components provide consistent UI and accessibility. | kaisuzuk | Show the design-system components and the screens that use them. |
| User Management | Standard user management | Major | 2 | Registration, login, profiles, avatars, friends, online status, and settings let users maintain an identity across matches and social interactions. | ssawa | Demonstrate registration, profile editing, avatar selection, and adding a friend. |
| User Management | Game statistics and match history | Minor | 1 | The application stores and displays wins, losses, APM, PPS, rank, level, achievements, and match history. | ssawa | Complete a match and show statistics, history, and progression on the profile page. |
| User Management | OAuth 2.0 | Minor | 1 | 42 accounts can sign in through an HTTPS callback that securely creates or reuses an OAuth identity. | yukusano | Sign in with 42 OAuth and open the resulting profile. |
| User Management | Two-factor authentication (2FA) | Minor | 1 | TOTP-based QR enrollment, login challenges, verification, and deactivation improve account security. | yukusano | Enable 2FA, sign in again, and enter a TOTP code. |
| Gaming and UX | Web-based game | Major | 2 | The browser game implements a 7-bag randomizer, rotation, lock delay, scoring, line clearing, and clear win/loss conditions. | sonakamu | Demonstrate the core rules and win/loss behavior in Solo and one-on-one modes. |
| Gaming and UX | Remote players | Major | 2 | Server-authoritative state, garbage attacks, disconnect handling, and reconnection support real-time play on separate computers. | sonakamu | Demonstrate a one-on-one match and reconnection in two Chrome contexts. |
| Gaming and UX | Multiplayer game (three or more players) | Major | 2 | Custom rooms, synchronized state, and spectator broadcasts support game sessions with three or more participants. | sonakamu | Join a room with at least three participants and show synchronized progress. |
| Gaming and UX | Game customization | Minor | 1 | Key bindings, mino skins, backgrounds, control speed, and default settings let players customize their experience. | sonakamu | Change settings and show the resulting game appearance and persisted values. |
| Gaming and UX | Tournament system | Minor | 1 | Registration, matchmaking, brackets, and match-result progression manage the order and winners of multi-player tournaments. | sonakamu | Register four players and progress the bracket through the final. |
| Gaming and UX | Spectator mode | Minor | 1 | Both player boards and match state are broadcast in real time to users watching an active game. | sonakamu | Watch an active match as a third user. |
| Artificial Intelligence | AI opponent | Major | 2 | A C++ AI with selectable difficulty and human-like thinking delays is integrated with the TypeScript game engine for solo practice. | ssawa | Change the difficulty and demonstrate the AI making decisions during a match. |
| Data and Analytics | Data export and import | Minor | 1 | JSON/CSV export, validated previews, and bulk import let users back up and restore settings and history. | ssawa | Export data, preview it, and import it again. |
| Data and Analytics | Advanced analytics dashboard | Major | 2 | Interactive charts, date-range filters, and PDF/CSV export help users analyze gameplay trends. | ssawa | Change the date range, inspect the charts, and export PDF/CSV files. |
| **Total** |  |  | **30** |  |  |  |

## Individual Contributions

- **sonakamu**
  - **Role and modules:** Technical Lead for the WebSockets, web-based game, remote-player, three-player multiplayer, customization, tournament, and spectator modules.
  - **Specific work:** Implemented PixiJS board rendering, local controls and game-state presentation, synchronized one-on-one/custom-room flows, tournament progression, reconnection, and spectator transitions.
  - **Challenge and solution:** Server snapshots could desynchronize READY state, active pieces, Next/Hold displays, and spectator transitions. Centralized snapshot application and explicit state transitions kept the views consistent.
- **ssawa**
  - **Role and modules:** Developer for the AI opponent, standard user management, advanced search, game statistics/history, data portability, and analytics modules.
  - **Specific work:** Developed the headless C++ AI and collision logic; implemented profiles, avatars, player search, statistics and progression views, account archives, and analytics/export workflows.
  - **Challenge and solution:** AI processes could outlive a match or return late actions. Per-match process ownership, time limits, cleanup, and validated action replay kept the TypeScript engine synchronized.
- **kaisuzuk**
  - **Role and modules:** Product Owner and UI/UX developer for the frontend framework and custom design-system modules.
  - **Specific work:** Designed the React SPA, responsive desktop/mobile layouts, reusable UI components, game configuration screens, tournament presentation, and chart-based analytics interface.
  - **Challenge and solution:** Shared state and repeated UI made the SPA difficult to maintain. Reusable components, Zustand stores, and custom hooks separated chat, friends, tournaments, and analytics concerns.
- **yukusano**
  - **Role and modules:** Project Manager and backend/DevOps/security developer for ORM, user interaction, Public API, OAuth 2.0, and 2FA modules.
  - **Specific work:** Implemented the NestJS API, Prisma persistence, local/42/TOTP authentication, chat and friend services, API keys and rate limits, administration, Docker deployment, Nginx, ModSecurity, and Vault integration.
  - **Challenge and solution:** OWASP CRS rules interfered with long-lived Socket.IO traffic and Vite assets. Narrow exclusions preserved REST inspection, while scripted initialization and unsealing made Vault startup repeatable.

## Resources and AI Usage

- [NestJS documentation](https://docs.nestjs.com/)
- [PixiJS documentation](https://pixijs.com/)
- [Socket.IO documentation](https://socket.io/)
- [Prisma documentation](https://www.prisma.io/docs)
- [OWASP Core Rule Set documentation](https://coreruleset.org/docs/)
- [HashiCorp Vault documentation](https://developer.hashicorp.com/vault/docs)
- [An overview of the Cold Clear search algorithm](https://komorinfo.com/blog/cold-clear-search-algorithm/)
- **AI usage:** AI assisted with diagnosing runtime and rendering problems, reviewing configuration and security-sensitive code, suggesting cleanup and validation cases, and proofreading the README and architecture documents. Team members reviewed every proposed change, compared it with the subject and implementation, and validated accepted changes with type checks, linting, tests, or manual browser checks as appropriate.
