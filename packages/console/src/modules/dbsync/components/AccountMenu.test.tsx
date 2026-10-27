import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AccountMenu } from './AccountMenu';
import { Layout } from './Layout';

const { setTheme, logout } = vi.hoisted(() => ({ setTheme: vi.fn(), logout: vi.fn().mockResolvedValue(undefined) }));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'system', setTheme }) }));
vi.mock('@/stores/auth', () => ({ useAuthStore: (selector?: (s: unknown) => unknown) => {
    const state = { user: { id: 'owner', username: 'Site owner', email: 'owner@example.com' }, _realUser: null };
    return selector ? selector(state) : state;
} }));
vi.mock('@/lib/auth/useAuth', () => ({ useAuth: () => ({ logout }) }));
vi.mock('@/lib/edition', () => ({ isCloud: () => false }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function Location() { return <output>{useLocation().pathname}</output>; }
describe('account menu', () => {
    it('keeps appearance and logout inside the menu, with no sidebar logout', async () => {
        render(<MemoryRouter><Layout /></MemoryRouter>);
        expect(screen.queryByRole('menuitemradio')).toBeNull();
        expect(screen.queryByText('Log out')).toBeNull();
        expect(screen.queryByText('Log Out')).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: 'Open account menu' }));
        expect(screen.getByRole('menuitemradio', { name: 'Light' })).toBeTruthy();
        expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toBeTruthy();
        expect(screen.getByRole('menuitemradio', { name: 'System' }).getAttribute('aria-checked')).toBe('true');
        expect(screen.getAllByRole('menuitem', { name: 'Log out' })).toHaveLength(1);
    });
    it('uses the theme provider and existing logout action', async () => {
        render(<MemoryRouter><AccountMenu logout={logout} /></MemoryRouter>);
        await userEvent.click(screen.getByRole('button', { name: 'Open account menu' }));
        for (const mode of ['Light', 'Dark', 'System']) {
            await userEvent.click(screen.getByRole('menuitemradio', { name: mode }));
            expect(setTheme).toHaveBeenLastCalledWith(mode.toLowerCase());
            expect(screen.getByRole('menuitemradio', { name: mode }).getAttribute('title')).toBe(mode);
        }
        await userEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));
        expect(logout).toHaveBeenCalledTimes(1);
    });
    it('navigates to existing settings and displays the signed-in account', async () => {
        render(<MemoryRouter><AccountMenu logout={logout} /><Location /></MemoryRouter>);
        await userEvent.click(screen.getByRole('button', { name: 'Open account menu' }));
        expect(screen.getByText('owner@example.com')).toBeTruthy();
        await userEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
        expect(screen.getByRole('status').textContent).toBe('/settings');
    });
});
