/**
 * Auth store. The fb_session cookie is HttpOnly (JS can't read it), so there is
 * NO token held here — `user`/`role` are re-derived from GET /api/console/me on
 * each load. login() POSTs /login (the response sets the cookie), then refresh()
 * populates the user from /me.
 */
import { create } from 'zustand';
import { api, type AuthUser } from '@/lib/api';

interface AuthState {
    user: AuthUser | null;
    loading: boolean;   // initial /me probe in flight
    error: string | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    loading: true,
    error: null,

    async refresh() {
        set({ loading: true, error: null });
        try {
            const { user } = await api<{ user: AuthUser | null }>('/me');
            set({ user: user ?? null, loading: false });
        } catch {
            // 401 (or any error) → not authenticated.
            set({ user: null, loading: false });
        }
    },

    async login(email, password) {
        set({ error: null });
        try {
            await api('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
            await useAuthStore.getState().refresh();
        } catch (e) {
            const code = e instanceof Error ? e.message : 'login_failed';
            set({ error: code === 'invalid_credentials' ? 'invalid_credentials' : 'login_failed' });
            throw e;
        }
    },

    async logout() {
        try { await api('/logout', { method: 'POST' }); } catch { /* ignore */ }
        set({ user: null });
    },
}));
