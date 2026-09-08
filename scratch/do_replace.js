const fs = require('fs');
let code = fs.readFileSync('apps/backend/src/game/game.gateway.ts', 'utf8');
const lines = code.split('\n');

// 444:   @SubscribeMessage('game:start_tournament_match')
// 538:   }

const before = lines.slice(0, 443);
const after = lines.slice(539);

let rewrite = fs.readFileSync('scratch/rewrite.ts', 'utf8').split('\n');
rewrite = rewrite.slice(1); // skip the first line (clientGameRoom)

const newLines = [...before, ...rewrite, ...after];
fs.writeFileSync('apps/backend/src/game/game.gateway.ts', newLines.join('\n'));
