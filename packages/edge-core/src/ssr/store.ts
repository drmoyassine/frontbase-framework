/**
 * Variable Store - 3 Scope State Management
 * 
 * Provides unified state management for SSR pages:
 * - Page Variables: In-memory, temporary UI state (cleared on refresh)
 * - Session Variables: localStorage sync, cleared on logout
 * - Cookies: Persistent, server-readable (auth, theme, consent)
 * 
 * Edge-compatible: Uses vanilla patterns, no Node.js dependencies.
 */

// Type definitions
export interface VariableValue {
    value: unknown;
    type?: string;
    timestamp?: number;
}

export interface VariableStore {
    // Page Variables (in-memory, temp UI state)
    getPageVariable: (key: string) => unknown;
    setPageVariable: (key: string, value: unknown) => void;
    getPageVariables: () => Record<string, unknown>;

    // Session Variables (localStorage, tied to login session)
    getSessionVariable: (key: string) => unknown;
    setSessionVariable: (key: string, value: unknown) => void;
    getSessionVariables: () => Record<string, unknown>;

    // Cookies (persistent, server-readable)
    getCookie: (key: string) => string | undefined;
    setCookie: (key: string, value: string, options?: CookieOptions) => void;
    getCookies: () => Record<string, string>;

    // Utility
    resolveVariable: (expression: string) => unknown;
    clearSessionVariables: () => void;
}

export interface CookieOptions {
    maxAge?: number;       // Seconds
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    path?: string;
}

/**
 * Create a new variable store instance.
 * For SSR, this is created per-request.
 * For client hydration, this syncs with localStorage.
 */
export function createVariableStore(initialState?: {
    pageVariables?: Record<string, unknown>;
    sessionVariables?: Record<string, unknown>;
    cookies?: Record<string, string>;
}): VariableStore {
    // Internal state
    const pageVariables: Record<string, unknown> = { ...initialState?.pageVariables };
    const sessionVariables: Record<string, unknown> = { ...initialState?.sessionVariables };
    const cookies: Record<string, string> = { ...initialState?.cookies };

    // Cookie options storage (for client-side setting)
    const cookieOptions: Record<string, CookieOptions> = {};

    return {
        // =========================================================================
        // Page Variables (In-memory, cleared on refresh)
        // =========================================================================
        getPageVariable(key: string): unknown {
            return pageVariables[key];
        },

        setPageVariable(key: string, value: unknown): void {
            pageVariables[key] = value;
        },

        getPageVariables(): Record<string, unknown> {
            return { ...pageVariables };
        },

        // =========================================================================
        // Session Variables (localStorage sync, cleared on logout)
        // =========================================================================
        getSessionVariable(key: string): unknown {
            return sessionVariables[key];
        },

        setSessionVariable(key: string, value: unknown): void {
            sessionVariables[key] = value;
        },

        getSessionVariables(): Record<string, unknown> {
            return { ...sessionVariables };
        },

        // =========================================================================
        // Cookies (Persistent, server-readable)
        // =========================================================================
        getCookie(key: string): string | undefined {
            return cookies[key];
        },

        setCookie(key: string, value: string, options?: CookieOptions): void {
            cookies[key] = value;
            if (options) {
                cookieOptions[key] = options;
            }
        },

        getCookies(): Record<string, string> {
            return { ...cookies };
        },

        // =========================================================================
        // Variable Resolution (for dynamic binding in components)
        // =========================================================================
        /**
         * Resolve a variable expression.
         * Supports prefixed notation:
         * - `page.variableName` → Page variable
         * - `session.variableName` → Session variable  
         * - `cookie.cookieName` → Cookie value
         * - `variableName` → Auto-search (page → session → cookie)
         */
        resolveVariable(expression: string): unknown {
            if (!expression) return undefined;

            // Handle prefixed access
            if (expression.startsWith('page.')) {
                return pageVariables[expression.slice(5)];
            }
            if (expression.startsWith('local.')) {
                return pageVariables[expression.slice(6)];
            }
            if (expression.startsWith('session.')) {
                return sessionVariables[expression.slice(8)];
            }
            if (expression.startsWith('cookie.')) {
                return cookies[expression.slice(7)];
            }

            // Auto-search: page → session → cookie
            if (expression in pageVariables) {
                return pageVariables[expression];
            }
            if (expression in sessionVariables) {
                return sessionVariables[expression];
            }
            if (expression in cookies) {
                return cookies[expression];
            }

            return undefined;
        },

        // =========================================================================
        // Utility
        // =========================================================================
        clearSessionVariables(): void {
            Object.keys(sessionVariables).forEach(key => delete sessionVariables[key]);
        },
    };
}

/**
 * Client-side store initialization.
 * Creates a store that syncs with localStorage for session variables.
 */
export function createClientStore(initialState?: {
    pageVariables?: Record<string, unknown>;
    sessionVariables?: Record<string, unknown>;
    cookies?: Record<string, string>;
}): VariableStore {
    // Load session variables from localStorage
    let storedSession: Record<string, unknown> = {};
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            const stored = localStorage.getItem('fb_session_variables');
            if (stored) {
                storedSession = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Failed to load session variables from localStorage:', e);
        }
    }

    // Merge initial state with stored session
    const mergedSession = { ...storedSession, ...initialState?.sessionVariables };

    // Create base store
    const store = createVariableStore({
        ...initialState,
        sessionVariables: mergedSession,
    });

    // Wrap setSessionVariable to sync with localStorage
    const originalSetSession = store.setSessionVariable.bind(store);
    store.setSessionVariable = (key: string, value: unknown) => {
        originalSetSession(key, value);

        // Sync to localStorage
        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                const current = store.getSessionVariables();
                localStorage.setItem('fb_session_variables', JSON.stringify(current));
            } catch (e) {
                console.warn('Failed to save session variable to localStorage:', e);
            }
        }
    };

    // Wrap clearSessionVariables to clear localStorage
    const originalClear = store.clearSessionVariables.bind(store);
    store.clearSessionVariables = () => {
        originalClear();

        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                localStorage.removeItem('fb_session_variables');
            } catch (e) {
                console.warn('Failed to clear session variables from localStorage:', e);
            }
        }
    };

    return store;
}
