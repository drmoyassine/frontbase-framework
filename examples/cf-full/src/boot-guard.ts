/**
 * Boot guard for the lazy edge entries (vercel.ts, deno.ts) — a boot that
 * never settles must be a LEGIBLE 503, not the platform's opaque request kill.
 *
 * The engine's first queries go to the operator's state DB. A DB URL that is
 * unreachable from the host's network in a way that never errors (firewalled
 * endpoint, suspended node, internal hostname) can hold the init promise open
 * indefinitely: locally such a fetch errors in seconds, but on Vercel's edge
 * it hung every request until the platform killed it at its own 300s limit —
 * and every request was awaiting the SAME pending init. Bounding boot turns
 * that into the repo's standard legible failure, and the caller resets its
 * memo so a later request retries after a transient fault.
 */

export class BootTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BootTimeoutError';
    }
}

/** Fail `boot` with BootTimeoutError when it exceeds `timeoutMs`. */
export async function raceBootTimeout<T>(boot: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    // If the timeout wins, `boot` is still pending and may reject later —
    // swallow that late rejection so it cannot surface as an unhandled one.
    boot.catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new BootTimeoutError(
            `The state database did not answer within ${Math.round(timeoutMs / 1000)}s — gave up initializing ${label}. ` +
            'Verify APP_DB_URL points at a publicly reachable libsql/HRANA endpoint (e.g. Turso), or configure the D1-over-REST trio.',
        )), timeoutMs);
    });
    try {
        return await Promise.race([boot, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

/** The boot budget: FRONTBASE_BOOT_TIMEOUT_MS overrides; junk falls to 15s. */
export function bootTimeoutMs(env: { FRONTBASE_BOOT_TIMEOUT_MS?: string }, fallbackMs = 15_000): number {
    const parsed = Number(env.FRONTBASE_BOOT_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed >= 1000 ? parsed : fallbackMs;
}
