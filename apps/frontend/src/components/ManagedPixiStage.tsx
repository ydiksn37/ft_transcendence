import type { ComponentProps } from 'react';
import { Stage } from '@pixi/react';

type ManagedPixiStageProps = Omit<ComponentProps<typeof Stage>, 'raf'>;

/**
 * Render Pixi only when React changes the scene. Stage keeps its normal
 * unmount cleanup, which destroys the Pixi application and WebGL context.
 */
export function ManagedPixiStage(props: ManagedPixiStageProps) {
  return <Stage {...props} raf={false} />;
}
