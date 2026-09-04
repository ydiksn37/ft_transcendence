import { GameInstance } from './src/game/game-instance';
const inst = new GameInstance('room1', {to: () => ({emit: () => {}})} as any, 1234, () => {}, {} as any);
inst.addPlayer('socket1', 'user1');
inst.addPlayer('socket2', 'user2');

inst['players'].get('socket1')!.startTime = Date.now() - 60000;
inst['players'].get('socket2')!.startTime = Date.now() - 60000;

inst.receiveGarbageFromClient('socket1', 5);

let statsCalled = null;
inst['onGameOver'] = (rId, wId, stats) => { statsCalled = stats; };
inst['handleGameOver']('socket2');

console.log(statsCalled);
