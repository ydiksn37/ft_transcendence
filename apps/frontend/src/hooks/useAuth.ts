import { create } from 'zustand';
import type { AuthResponse } from '@transcendence/shared';

interface AuthState {
  token: string | null;
  user: AuthResponse['user'] | null;
  setAuth: (data: AuthResponse) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: (() => {
    try {
      const item = localStorage.getItem('user');
      return item && item !== 'undefined' ? JSON.parse(item) : null;
    } catch (e) {
      return null;
    }
  })(),
  setAuth: (data) => {
    localStorage.setItem('token', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    set({ token: data.accessToken, user: data.user });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null });
  },
}));
