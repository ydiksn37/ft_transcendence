const fs = require('fs');
const file = 'apps/backend/src/game/game-instance.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    // Lock Out 判定用 (Vanish Zoneで完全に固定されたか)
    let maxLockY = -1;
    const shape = TETROMINOS[player.activeMino as keyof typeof TETROMINOS].shape[player.activeRotation];
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] !== 0) {
          maxLockY = Math.max(maxLockY, player.activeY + r);
        }
      }
    }`;

const replacement = `    // Lock Out 判定用 (Vanish Zoneで完全に固定されたか)
    const cells = getMinoCells(player.activeMino, player.activeX, player.activeY, player.activeRotation);
    let maxLockY = -1;
    for (const [r, c] of cells) {
      maxLockY = Math.max(maxLockY, r);
    }`;

code = code.replace(target, replacement);

const importTarget = `  TETROMINOS,\n} from '@transcendence/shared';`;
const importReplacement = `} from '@transcendence/shared';`;
code = code.replace(importTarget, importReplacement);

const extraImportTarget = `import {\n  createEmptyBoard,\n  isValidPosition,`;
const extraImportReplacement = `import {\n  getMinoCells,\n  createEmptyBoard,\n  isValidPosition,`;
code = code.replace(extraImportTarget, extraImportReplacement);

fs.writeFileSync(file, code);
