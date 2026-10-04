*This project has been created as part of the 42 curriculum by yukusano, sonakamu, ssawa, kaisuzuk.*

# Project T (ft_transcendence)

## Description

Project T is a modern, real-time competitive falling-block puzzle game built for the `ft_transcendence` project. It aims to provide a responsive and competitive gameplay experience with real-time one-on-one matches, spectator mode, AI opponents, and a fully functional tournament system.

## Instructions

### Prerequisites

- **Docker** and **Docker Compose**
- **Node.js 20 or later** and **npm 10 or later**
- **GNU Make**
- A web browser (the latest stable version of Google Chrome is recommended)
- Available ports 8080 and 8443 on the host machine

### Setup and Execution

1. Clone the repository:

   ```bash
   git clone <repository_url> ft_transcendence
   cd ft_transcendence
   ```

2. Configure the environment variables by copying the example file and adjusting it as needed:

   ```bash
   cp .env.example .env
   ```

   Register `https://localhost:8443/api/auth/42/callback` as the redirect URI for 42 OAuth. If the application is submitted with a different host or port, update both the registered URI and `.env` so that they use the same URL.

3. Build and start the application with Docker Compose. This command also installs dependencies, compiles the C++ AI, initializes Vault, and runs the database migrations:

   ```bash
   make build
   ```

   To start an environment that has already been built, run:

   ```bash
   make up
   ```

4. Open `https://localhost:8443` in a browser, or use the configured domain/IP and `NGINX_PORT`.

   The application uses a self-signed HTTPS certificate, so the browser will display a security warning that must be acknowledged before continuing.

## Technical Stack

- **Frontend framework:** React (Vite) with TypeScript
- **Backend framework:** NestJS with TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **Game rendering engine:** PixiJS (WebGL)
- **Security:** Nginx with ModSecurity (WAF) and HashiCorp Vault

### Rationale

React and Vite provide a modern frontend development environment, while PixiJS supplies efficient WebGL rendering for the game. NestJS manages the REST API and WebSocket gateways. PostgreSQL and Prisma provide relational persistence with type-safe database access.

## Database Schema

The application uses PostgreSQL, managed through Prisma. Its core entities and relationships are:

- **User:** Stores authentication information, profile data, and game settings.
- **GameResult:** Stores match results, APM, PPS, and cleared-line counts. It relates to Player 1 and Player 2 (`User`).
- **Tournament:** Manages tournament instances and their status: registration, in progress, or completed.
- **TournamentMatch:** Represents an individual tournament match and relates to both `GameResult` and `Tournament`.
- **Friendship / Block:** Self-referential relations on the `User` model that support social features.

## Team Information

- **Product Owner:** kaisuzuk
- **Project Manager:** yukusano
- **Technical Lead:** sonakamu
- **Developers:** kaisuzuk, sonakamu, ssawa, yukusano

- **sonakamu — Game Engine & Frontend Logic (Player 1):** Responsible for PixiJS rendering, game-state synchronization, and local input handling.
- **ssawa — AI & Multiplayer Logic (Player 2):** Responsible for integrating the headless C++ AI, collision detection, and real-time WebSocket synchronization.
- **kaisuzuk — UI/UX & React Developer (Player 3):** Responsible for the neon-style SPA, dashboard charts, tournament bracket, and responsive design.
- **yukusano — Backend, DevOps & Security (Player 4):** Responsible for the overall system architecture, including Docker, Nginx, WAF, Vault, the NestJS API, PostgreSQL, and Redis.

## Project Management

- **Organization:** We used an agile-inspired parallel development approach. Work was divided into specialist areas—frontend gameplay, frontend UI, and backend/infrastructure—to reduce bottlenecks.
- **Task management:** We used GitHub to manage the sprint backlog and track progress.
- **Communication:** We communicated through Discord and also held in-person meetings every two weeks.

## Features List

- **Game board UI:** Shuffled game-board backgrounds (implemented by kaisuzuk).
- **Real-time one-on-one matches:** Server-authoritative matches with garbage attacks (implemented by sonakamu).
- **Tournament system:** A single-elimination bracket that progresses in real time (implemented by sonakamu).
- **AI opponent:** Matches against a configurable AI opponent with multiple difficulty levels (implemented by ssawa).
- **Spectator mode:** Real-time viewing of active matches and player boards (implemented by sonakamu).
- **Analytics dashboard:** Visual charts for APM, PPS, and win rate (implemented by yukusano).
- **Public API:** Statistics endpoints protected by API keys and rate limiting (implemented by yukusano).
- **Social features:** Friends list, real-time chat, and profile customization (implemented by yukusano).
- **Advanced security:** Integration with ModSecurity WAF and HashiCorp Vault (implemented by yukusano).

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
  - **Contribution:** Implemented PixiJS board rendering, local controls, and multiplayer state display.
  - **Challenge:** Maintained consistency between READY state, active pieces, Next/Hold displays, and spectator transitions while applying server snapshots.
- **ssawa**
  - **Contribution:** Developed the headless C++ AI, integrated it with the Node.js backend, and managed the core collision-detection logic.
  - **Challenge:** Managed one C++ process per match with time limits and replayed the returned action sequences through the TypeScript game engine.
- **kaisuzuk**
  - **Contribution:** Designed and developed the React SPA, custom UI components, and analytics dashboard using a charting library.
  - **Challenge:** Separated chat, friends, tournaments, and the dashboard into reusable components, Zustand stores, and custom hooks.
- **yukusano**
  - **Contribution:** Implemented the Docker infrastructure, NestJS backend architecture, WAF, and Vault security integration.
  - **Challenge:** Kept OWASP CRS inspection enabled for REST traffic while narrowly excluding Socket.IO and Vite development assets, and established persistent Vault initialization and unsealing procedures.

## Resources and AI Usage

- [NestJS documentation](https://docs.nestjs.com/)
- [PixiJS documentation](https://pixijs.com/)
- [Socket.IO documentation](https://socket.io/)
- [An overview of the Cold Clear search algorithm](https://komorinfo.com/blog/cold-clear-search-algorithm/)
- **AI usage:** Debugging and proofreading the README.
