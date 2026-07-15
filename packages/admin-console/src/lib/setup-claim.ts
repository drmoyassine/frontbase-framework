import { postSetupClaim } from './api';

/**
 * Capture the setup capability before HashRouter initializes. The setup SPA's
 * route and capability share the fragment (`#/setup?claim=...`), so consuming
 * it at module load both keeps it out of HTTP logs and lets the router start on
 * the clean `/setup` route.
 */
let initialClaim: string | undefined;
if (typeof window !== 'undefined') {
    const hash = window.location.hash;
    const queryIndex = hash.indexOf('?');
    const params = new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : hash.replace(/^#/, ''));
    initialClaim = params.get('claim') ?? undefined;
    if (initialClaim) window.history.replaceState(null, '', `${window.location.pathname}#/setup`);
}

// StrictMode may run effects twice in development. Share one exchange promise
// so both runs observe the same successful authorization and the capability is
// submitted only once.
let exchangePromise: Promise<boolean> | null = null;

export function authorizeInitialSetupClaim(setupEnabled: boolean): Promise<boolean> {
    if (!setupEnabled || !initialClaim) return Promise.resolve(false);
    exchangePromise ??= postSetupClaim(initialClaim).then(() => {
        initialClaim = undefined;
        return true;
    });
    return exchangePromise;
}
