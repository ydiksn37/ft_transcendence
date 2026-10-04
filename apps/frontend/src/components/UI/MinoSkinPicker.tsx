import { Fragment } from 'react';
import { Text } from '@pixi/react';
import { ManagedPixiStage } from '../ManagedPixiStage';
import { TextStyle } from 'pixi.js';
import Cell from '../Cell';
import { TETROMINOS } from '../../utils/tetrominos';

type Skin = 'NEON' | 'RETRO' | 'MINIMAL';
const pieces = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'] as const;
const labelStyle = new TextStyle({ fill: '#ffffff', fontSize: 12, fontFamily: 'monospace' });

export function MinoSkinPicker({ value, onChange }: { value: Skin; onChange: (skin: Skin) => void }) {
  return (
    <section className="config-section config-skin-section" aria-label="Mino skin">
      <h2 style={{ fontSize: 14, textAlign: 'center' }}>MINO SKIN</h2>
      <div role="group" aria-label="Select mino skin" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginBottom: 15 }}>
        {(['RETRO', 'NEON', 'MINIMAL'] as const).map(skin => (
          <button className="config-skin-button" key={skin} type="button" aria-pressed={value === skin} onClick={() => onChange(skin)}>
            {skin}
          </button>
        ))}
      </div>
      <div role="img" aria-label={`${value} skin preview: I, J, L, O, S, T, Z`} style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
        <ManagedPixiStage width={400} height={180} options={{ backgroundColor: 0x111111, antialias: true, resolution: typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1 }} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {pieces.map((piece, index) => {
            const shape = TETROMINOS[piece].shape;
            const cells = shape.flatMap((row, y) => row.flatMap((cell, x) => cell === 0 ? [] : [{ x, y }]));
            const minX = Math.min(...cells.map(cell => cell.x));
            const minY = Math.min(...cells.map(cell => cell.y));
            const width = Math.max(...cells.map(cell => cell.x)) - minX + 1;
            const x = (index % 4) * 100 + (100 - width * 20) / 2;
            const y = Math.floor(index / 4) * 90 + 30;
            return <Fragment key={piece}>
              <Text text={piece} x={(index % 4) * 100 + 46} y={Math.floor(index / 4) * 90 + 8} style={labelStyle} />
              {cells.map(cell => <Cell key={`${cell.x}-${cell.y}`} type={piece} skin={value} status="merged" size={20} x={x + (cell.x - minX) * 20} y={y + (cell.y - minY) * 20} />)}
            </Fragment>;
          })}
        </ManagedPixiStage>
      </div>
    </section>
  );
}
