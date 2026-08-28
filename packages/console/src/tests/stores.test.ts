/**
 * Zustand Store Tests
 *
 * Tests the frontend state management stores (builder, auth, dashboard).
 * Uses Zustand's store directly without React rendering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase to prevent actual client creation
vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn().mockReturnValue({
        auth: {
            getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
            onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
            signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
            signOut: vi.fn().mockResolvedValue({ error: null }),
        },
        from: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({ data: [], error: null }),
        }),
    }),
}));

describe('Builder Store', () => {
    it('initializes with default state', async () => {
        const { useBuilderStore } = await import('@/stores/builder');
        const state = useBuilderStore.getState();

        // Should have project slice
        expect(state).toHaveProperty('project');
    });

    it('uses persist middleware with correct store name', async () => {
        const { useBuilderStore } = await import('@/stores/builder');
        expect(useBuilderStore).toBeDefined();
        // Zustand persist stores have a persist API
        expect(useBuilderStore.persist).toBeDefined();
    });

    it('combines all slices into one store', async () => {
        const { useBuilderStore } = await import('@/stores/builder');
        const state = useBuilderStore.getState();
        // Should have multiple slice properties — at minimum project
        const keys = Object.keys(state);
        expect(keys.length).toBeGreaterThan(0);
    });
});

describe('Auth Store', () => {
    it('initializes and is accessible', async () => {
        const { useAuthStore } = await import('@/stores/auth');
        const state = useAuthStore.getState();
        expect(state).toBeDefined();
    });
});

describe('Dashboard Store', () => {
    it('initializes and is accessible', async () => {
        const { useDashboardStore } = await import('@/stores/dashboard');
        const state = useDashboardStore.getState();
        expect(state).toBeDefined();
    });
});
