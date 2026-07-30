import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../guards/auth.guard';

/** このデコレータを付けたルートは JWT 認証をスキップする */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
