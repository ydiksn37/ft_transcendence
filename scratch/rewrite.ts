  private clientGameRoom: Map<string, string> = new Map();

  private startNextTournamentRound(roomId: string) {
    const room = this.customRooms.get(roomId);
    if (!room || !room.tournament) return;

    const tournament = room.tournament;
    
    // Find all ready matches
    const matchesToStart = tournament.matches.filter(m => 
      !m.winnerId && !m.isPlaying && 
      ((m.children.length > 0 && m.playerIds.length === m.children.length) || 
       (m.children.length === 0 && m.playerIds.length === 2))
    );

    let startedCount = 0;

    matchesToStart.forEach(currentMatch => {
      const activePlayerSockets = currentMatch.playerIds
        .map(id => room.players.find(p => p.socket.id === id))
        .filter((p): p is { socket: Socket; userId: string | null; username: string | null; wins: number } => !!p);

      if (activePlayerSockets.length < 2) {
        const survivor = activePlayerSockets.length === 1 ? activePlayerSockets[0]?.socket.id : (currentMatch.playerIds[0] || '');
        currentMatch.winnerId = survivor || '';
        
        const parentMatch = tournament.matches.find(m => m.children.some(c => c.id === currentMatch.id));
        if (parentMatch && survivor) {
          parentMatch.playerIds.push(survivor);
        }
        return;
      }

      startedCount++;
      currentMatch.isPlaying = true;

      const gameRoomId = `${roomId}_${currentMatch.id}`;
      const seed = Math.floor(Math.random() * 2147483647);
      
      const instance = new GameInstance(gameRoomId, this.server, seed, (rId, winnerSocketId, stats) => {
        currentMatch.winnerId = winnerSocketId || activePlayerSockets[0]?.socket.id || '';
        currentMatch.isPlaying = false;
        
        const parentMatch = tournament.matches.find(m => m.children.some(c => c.id === currentMatch.id));
        if (parentMatch) {
          parentMatch.playerIds.push(currentMatch.winnerId);
        }

        // Clean up clientGameRoom mappings
        for (const [sid, rId] of this.clientGameRoom.entries()) {
          if (rId === gameRoomId) {
            this.clientGameRoom.delete(sid);
          }
        }
        this.server.in(gameRoomId).socketsLeave(gameRoomId);

        this.rooms.delete(rId);

        const anyPlaying = tournament.matches.some(m => m.isPlaying);
        room.isPlaying = anyPlaying;

        if (!anyPlaying) {
          this.server.emit('custom_rooms_updated', this.getCustomRoomsList());
          if (!tournament.root.winnerId) {
            setTimeout(() => {
              this.startNextTournamentRound(roomId);
            }, 5000);
          }
        }
        
        room.players.forEach(p => {
          p.socket.emit('tournament_state', { tournament: room.tournament });
          p.socket.emit('custom_room_state', {
            inRoom: true,
            roomId: room.roomId,
            name: room.name,
            isOwner: room.ownerSocketId === p.socket.id,
            players: room.players.map(pl => ({ socketId: pl.socket.id, userId: pl.userId, username: pl.username, wins: pl.wins })),
            isPlaying: room.isPlaying,
            tournament: room.tournament
          });
        });
      }, this.aiAgentService);

      this.rooms.set(gameRoomId, instance);

      activePlayerSockets.forEach(p => {
        if (!p || !p.socket) return;
        instance.addPlayer(p.socket.id, p.userId);
        this.clientGameRoom.set(p.socket.id, gameRoomId);
        p.socket.join(gameRoomId);
        p.socket.emit('match:found', {
          roomId: gameRoomId,
          seed,
          players: activePlayerSockets.map(pl => pl?.socket?.id).filter(id => !!id),
          isSpectator: false
        });
      });

      instance.start();
    });

    if (startedCount > 0) {
      room.isPlaying = true;
      this.server.emit('custom_rooms_updated', this.getCustomRoomsList());

      const firstStartedMatch = matchesToStart.find(m => m.isPlaying);
      if (firstStartedMatch) {
        const gameRoomId = `${roomId}_${firstStartedMatch.id}`;
        const instance = this.rooms.get(gameRoomId);
        if (instance) {
          room.players.forEach(p => {
            if (!p || !p.socket) return;
            const isPlayingInAny = matchesToStart.some(m => m.isPlaying && m.playerIds.includes(p.socket.id));
            if (!isPlayingInAny) {
              instance.addSpectator(p.socket.id);
              this.clientGameRoom.set(p.socket.id, gameRoomId);
              p.socket.join(gameRoomId);
              p.socket.emit('spectating', { roomId: gameRoomId });
            }
          });
        }
      }
    } else {
      // If we didn't start any games (e.g. all were auto-advanced due to disconnects),
      // recursively start the next round if possible.
      const anyPlaying = tournament.matches.some(m => m.isPlaying);
      if (!anyPlaying && !tournament.root.winnerId) {
        this.startNextTournamentRound(roomId);
      }
      room.players.forEach(p => {
        p.socket.emit('tournament_state', { tournament: room.tournament });
      });
    }
  }
