import { postSetupClaim } from './api';

/**
 * Capture the setup capability before HashRouter initializes. The setup SPA's
 * route and capability share the fragment (`#/setup?claim=...`), so consuming
 * it at module load both keeps it out of HTTP logs and lets the router start on
 * the clean `/setup` route.
 */
let initialClaim: string | undefined;
let exchangePromise: Promise<boolean> | null = null;
function captureClaim(): void {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    const queryIndex = hash.indexOf('?');
    const params = new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : hash.replace(/^#/, ''));
    const claim = params.get('claim');
    if (claim) { initialClaim = claim; exchangePromise = null; window.history.replaceState(null, '', `${window.location.pathname}#/setup`); }
}

captureClaim();

// StrictMode may run effects twice in development. Share one exchange promise
// so both runs observe the same successful authorization and the capability is
// submitted only once.
export function authorizeInitialSetupClaim(setupEnabled: boolean): Promise<boolean> {
    captureClaim();
    if (!setupEnabled) return Promise.resolve(false);
    if (exchangePromise) return exchangePromise;
    if (!initialClaim) return Promise.resolve(false);
    exchangePromise ??= postSetupClaim(initialClaim).then(() => {
        initialClaim = undefined;
        return true;
    });
    return exchangePromise;
}
