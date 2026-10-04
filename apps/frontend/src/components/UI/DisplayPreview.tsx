import { Container, Stage } from '@pixi/react';
import GameBoard from '../GameBoard';
import { calculateGhostY, type Cell } from '../../utils/gameHelpers';
import { TETROMINOS } from '../../utils/tetrominos';
import { gameBackgroundImage } from '../../utils/gameAppearance';
import type { Player } from '../../hooks/usePlayer';
import type { useConfig } from '../../hooks/useConfig';
import background from '../../assets/images/tetrisbg_tokyo.png';
import './TetrisUI.css';
import './Config.css';

type Props = Pick<ReturnType<typeof useConfig>,
  'minoSkin' | 'showGhost' | 'displayTheme' | 'mapStyle' | 'backgroundStyle'>;

// Static fixture: no game loop, random bag, input handlers, or network traffic.
const stage: Cell[][] = Array.from({ length: 40 }, () =>
  Array.from({ length: 10 }, () => [0, 'clear'] as Cell));
['JJJ....LLL', 'JSS.OO.ZZL', 'SSIIOOZZ.I'].forEach((row, y) => {
  [...row].forEach((piece, x) => {
    if (piece !== '.') stage[37 + y][x] = [piece, 'merged'];
  });
});
const player: Player = {
  pos: { x: 3, y: 24 }, tetromino: TETROMINOS.T.shape,
  collided: false, rotationIndex: 0, spawnCount: 0,
};
const ghostY = calculateGhostY(player, stage);

export function DisplayPreview({ minoSkin, showGhost, displayTheme, mapStyle, backgroundStyle }: Props) {
  return (
    <figure className={`tetris-ui-container config-display-preview map-${mapStyle.toLowerCase()} background-${backgroundStyle.toLowerCase()}`} style={{ backgroundImage: gameBackgroundImage(backgroundStyle, background) }}>
      <figcaption>LIVE PREVIEW · {displayTheme}</figcaption>
      <div className="config-preview-hud"><span>SCORE 012400</span><span>LEVEL 01</span></div>
      <div className="tetris-board-container config-preview-board" role="img" aria-label={`${minoSkin} skin, ${mapStyle} board, ${backgroundStyle} background, ghost ${showGhost ? 'on' : 'off'}`}>
        <Stage width={150} height={300} options={{ backgroundAlpha: 0, antialias: true, resolution: typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1 }}>
          <Container scale={0.5} y={-300}>
            <GameBoard stage={stage} player={player} ghostY={ghostY} showGhost={showGhost} minoSkin={minoSkin} mapStyle={mapStyle} />
          </Container>
        </Stage>
      </div>
      <p>THEME / MAP / BACKGROUND / GHOST / SKIN</p>
    </figure>
  );
}
