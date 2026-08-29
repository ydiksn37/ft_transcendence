import { GameInstance } from './src/game/game-instance';
import { Server } from 'socket.io';

const io = new Server(3001);
const inst = new GameInstance('room1', io, 1234, (r, w, stats) => {
    console.log("Game Over Stats:", stats);
    process.exit(0);
});

inst.addPlayer('socket1', 'user1');
inst.addPlayer('socket2', 'user2');

inst.start(); // This sets a 3 second timeout

setTimeout(() => {
    console.log("Simulating 60s of play...");
    // At this point, startTime is set.
    setTimeout(() => {
        // Send some garbage
        inst.receiveGarbageFromClient('socket1', 5, 5); // 5 generated, 5 leftover
        inst.receiveGarbageFromClient('socket1', 5, 10); // 10 generated, 5 leftover
        
        // socket1 attacksSent should be 15.
        // duration should be ~60 seconds.
        // APM should be ~15.
        inst['handleGameOver']('socket2');
    }, 60000);
}, 3100);

