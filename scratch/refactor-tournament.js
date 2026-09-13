const fs = require('fs');
const file = 'apps/backend/src/game/game.gateway.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Modify handleCreateTournament
code = code.replace(
  /room\.players\.forEach\(p => \{\n\s*p\.socket\.emit\('tournament_state', \{ tournament: room\.tournament \}\);\n\s*\}\);\n  \}/g,
  `room.players.forEach(p => {
      p.socket.emit('tournament_state', { tournament: room.tournament });
    });

    setTimeout(() => {
      this.startNextTournamentRound(roomId);
    }, 5000);
  }`
);

// 2. Rename handleStartTournamentMatch to startNextTournamentRound
code = code.replace(
  /@SubscribeMessage\('game:start_tournament_match'\)\n  handleStartTournamentMatch\(@ConnectedSocket\(\) client: Socket\) \{\n    const roomId = this\.clientRoom\.get\(client\.id\);\n    if \(!roomId\) return;\n    const room = this\.customRooms\.get\(roomId\);\n    if \(!room || room\.ownerSocketId !== client\.id || !room\.tournament\) return;/g,
  `startNextTournamentRound(roomId: string) {
    const room = this.customRooms.get(roomId);
    if (!room || !room.tournament) return;`
);

// 3. Inside startNextTournamentRound, add setTimeout
code = code.replace(
  /if \(!anyPlaying\) \{\n\s*\/\/ If all matches finished[^\}]*\n\s*this\.server\.emit\('custom_rooms_updated', this\.getCustomRoomsList\(\)\);\n\s*\}/g,
  `if (!anyPlaying) {
          this.server.emit('custom_rooms_updated', this.getCustomRoomsList());
          if (!tournament.root.winnerId) {
            setTimeout(() => {
              this.startNextTournamentRound(roomId);
            }, 5000);
          }
        }`
);

fs.writeFileSync(file, code);
