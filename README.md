*This project has been created as part of the 42 curriculum by yukusano, sonakamu, ssawa, kaisuzuk.*

# Project T (ft_transcendence)

## Description
Project T is a modern, real-time multiplayer Tetris-like game web application built for the `ft_transcendence` project. It aims to provide a highly competitive and responsive gaming experience, featuring real-time 1v1 battles, spectator modes, an AI opponent, and a fully functional tournament system. The application encompasses a full-stack architecture with a robust backend to ensure server-authoritative gameplay, anti-cheat measures, and seamless real-time synchronization.

## Instructions

### Prerequisites
- **Docker** and **Docker Compose**
- Web Browser (Latest stable version of Google Chrome recommended)
- Port 80, 443, and 3000 available on your machine.

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
3. Run npm install:
   ```bash
   make install
   ```
4. Start the application using Docker Compose:
   ```bash
   make up
   # or docker-compose up --build
   ```
5. Access the application:
   - Open your browser and navigate to `https://localhost` (or the appropriate domain/IP).
   - *Note: Since we use self-signed certificates for HTTPS, you may need to bypass the browser security warning.*

## Technical Stack
- **Frontend Framework:** React (Vite) + TypeScript
- **Backend Framework:** NestJS + TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **In-Memory Cache & Pub/Sub:** Redis
- **Real-Time Communication:** Socket.IO / WebSockets
- **Game Rendering Engine:** PixiJS (WebGL)
- **Security:** Nginx with ModSecurity (WAF), HashiCorp Vault (Secrets Management)

**Justification:** 
We chose React + Vite for its rapid development cycle and rich ecosystem, which easily integrates with PixiJS for high-performance 60FPS WebGL game rendering. NestJS provides a solid, modular architecture for our backend, making it easy to manage WebSocket gateways alongside REST APIs. PostgreSQL + Prisma ensures type-safe and relational data management, while Redis handles scalable session management and socket broadcasting. WAF and Vault were integrated to provide enterprise-level security for secrets and application defense.

## Database Schema
The database uses PostgreSQL and is managed via Prisma. The core entities and their relationships include:
- **User:** Stores credentials, profile data, and game settings.
- **GameRecord:** Stores match outcomes, APM, PPS, and line clears. Relates to Player 1 and Player 2 (Users).
- **Tournament:** Manages tournament instances, state (registration, in-progress, completed).
- **Match:** Individual matches within a tournament, relating back to GameRecord and Tournament.
- **Friendship / Block:** Self-referential relations on the User model for social features.
*(Refer to `ER.md` for the detailed Entity-Relationship diagram)*

## Team Information
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
- **AI Opponent:** Play against an intelligent bot with adjustable difficulties (Responsible: ssawa).
- **Spectator Mode:** Watch live matches with real-time board updates (Responsible: sonakamu).
- **Analytics Dashboard:** Visual graphs for APM, PPS, and win rates (Responsible: yukusano).
- **Public API:** Rate-limited and secured API endpoints for fetching stats (Responsible: yukusano).
- **Social Features:** Friend lists, real-time chat, profile customization (Responsible: yukusano).
- **Advanced Security:** ModSecurity WAF and HashiCorp Vault integration (Responsible: yukusano).

## Modules (Total: 35 pts)
*Note: Point calculation: Major = 2pts, Minor = 1pt*

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
22. **GDPR Compliance (Minor - 1pt)**: Data deletion with confirmation capabilities.

### Cybersecurity
23. **WAF and HashiCorp Vault (Major - 2pts)**: Nginx with ModSecurity and Vault for secret management.

## Individual Contributions
- **sonakamu**: 
  - *Contributions:* Built the entire PixiJS rendering engine and handled local input latency mitigation.
  - *Challenges:* Synchronizing high-speed 60FPS local inputs with server state without causing visual stutter. Overcame this by implementing client-side prediction and server reconciliation.
- **ssawa**: 
  - *Contributions:* Developed the C++ headless AI and integrated it into the Node.js backend. Managed the core collision detection logic.
  - *Challenges:* The AI was initially too perfect and unbeatable. Solved this by introducing artificial "think delay" and a probability matrix for suboptimal moves to simulate human error.
- **kaisuzuk**: 
  - *Contributions:* Designed and developed the React SPA, custom UI components, and the analytics dashboard using chart libraries.
  - *Challenges:* Managing complex state across multiple real-time components (chat, friend list, tournament bracket). Utilized React Context and custom hooks to decouple state management from the UI.
- **yukusano**: 
  - *Contributions:* Architected the Docker infrastructure, NestJS backend, and implemented WAF/Vault security.
  - *Challenges:* Configuring ModSecurity to not block high-frequency WebSocket packets while maintaining strict protection for REST endpoints. Solved by writing custom SecRules to bypass WAF for Socket.IO traffic.

## Resources and AI Usage
- **NestJS Documentation**: https://docs.nestjs.com/
- **PixiJS Documentation**: https://pixijs.com/
- **Socket.IO Documentation**: https://socket.io/
- **AI Usage**: 
  - *Algorithm Assistance:* Consulted AI for optimizing and researching the Tetris AI evaluation function (calculating bumpiness and hole penalties).
  - *Debugging:* Used AI to help trace and resolve complex Docker networking and Vault initialization errors.
