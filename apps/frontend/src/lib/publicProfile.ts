import type { GameRecordView, UserStats } from './types';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  isOnline: boolean;
  stats: UserStats | null;
}

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

interface HistoryRecord {
  id: string;
  createdAt: string;
  gameMode: GameRecordView['mode'];
  player1Id: string;
  winnerId: string | null;
  player1Apm: number | string | null;
  player2Apm: number | string | null;
  player1Pps: number | string | null;
  player2Pps: number | string | null;
  player1LinesCleared: number;
  player2LinesCleared: number;
}

export class ProfileRequestError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(status === 404 || status === 400 ? 'User not found.'
      : status === 401 ? 'Please sign in again.' : 'Request failed. Please try again.');
    this.status = status;
  }
}

export async function profileRequest<T>(path: string, token: string, signal: AbortSignal,
  init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/users/${path}`, {
    ...init, signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new ProfileRequestError(response.status);
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function loadPublicProfile(id: string, token: string, signal: AbortSignal) {
  const path = encodeURIComponent(id);
  // A deleted/unknown profile must fail before requesting its history.
  const user = await profileRequest<PublicUser>(path, token, signal);
  const [me, friendships, history] = await Promise.all([
    profileRequest<{ id: string }>('me', token, signal),
    profileRequest<Friendship[]>('friends', token, signal),
    profileRequest<{ data: HistoryRecord[] }>(`${path}/history?limit=20`, token, signal),
  ]);
  const games: GameRecordView[] = history.data.map(game => {
    const first = game.player1Id === user.id;
    return {
      id: game.id, date: game.createdAt.slice(0, 10), mode: game.gameMode,
      apm: Number((first ? game.player1Apm : game.player2Apm) ?? 0),
      pps: Number((first ? game.player1Pps : game.player2Pps) ?? 0),
      lines: first ? game.player1LinesCleared : game.player2LinesCleared,
      result: !game.winnerId ? null : game.winnerId === user.id ? 'WIN' : 'LOSE',
    };
  });
  const friendship = friendships.find(friend =>
    (friend.requesterId === me.id && friend.addresseeId === user.id) ||
    (friend.addresseeId === me.id && friend.requesterId === user.id));
  return { user, games, me, friendship };
}
