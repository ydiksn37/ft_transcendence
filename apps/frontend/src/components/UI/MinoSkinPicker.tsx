import { Fragment } from 'react';
import { Text } from '@pixi/react';
import { ManagedPixiStage } from '../ManagedPixiStage';
import { TextStyle } from 'pixi.js';
import Cell from '../Cell';
import { TETROMINOS } from '../../utils/tetrominos';

type Skin = 'NEON' | 'RETRO' | 'MINIMAL';
const pieces = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'] as const;
const labelStyle = new TextStyle({ fill: '#ffffff', fontSize: 12, fontFamily: 'monospace' });
const skinButtonClass = [
  'cursor-pointer rounded-none border-4 border-solid border-[#555] bg-[#111]',
  'px-[14px] py-[10px] text-[12px] leading-[1.4] text-[var(--color-text)]',
  'shadow-[4px_4px_0_#000] transition-[background-color,border-color,color,transform,box-shadow] duration-100',
  '[font-family:var(--font-display)]',
  'hover:border-[#888] hover:bg-[#222]',
  'active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_#000]',
  'focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#e7cf91]',
].join(' ');
const selectedSkinButtonClass = [
  'border-[#d8a43a] bg-[var(--color-surface-2)] text-[#f4dfaa]',
  'shadow-[4px_4px_0_#5c4317] hover:border-[#d8a43a] hover:bg-[var(--color-surface-2)]',
].join(' ');

export function MinoSkinPicker({ value, onChange }: { value: Skin; onChange: (skin: Skin) => void }) {
  return (
    <section className="mt-5 w-full max-w-[600px]" aria-label="Mino skin">
      <h2 className="text-center text-[14px]">MINO SKIN</h2>
      <div className="mb-[15px] flex flex-wrap justify-center gap-[10px]" role="group" aria-label="Select mino skin">
        {(['RETRO', 'NEON', 'MINIMAL'] as const).map(skin => (
          <button
            className={`${skinButtonClass} ${value === skin ? selectedSkinButtonClass : ''}`}
            key={skin}
            type="button"
            aria-pressed={value === skin}
            onClick={() => onChange(skin)}
          >
            {skin}
          </button>
        ))}
      </div>
      <div className="mx-auto w-full max-w-[400px]" role="img" aria-label={`${value} skin preview: I, J, L, O, S, T, Z`}>
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
