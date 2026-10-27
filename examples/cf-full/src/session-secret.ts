/**
 * resolveSessionSecret — the boot-time SESSION_SECRET fallback.
 *
 * SESSION_SECRET signs sessions AND derives the at-rest cipher for secret
 * variables, so every isolate of a deployment MUST agree on one value — a
 * generate-per-boot secret would break sessions the moment the platform
 * schedules a second isolate. But one-click deploys (Deploy Buttons) never
 * run operator code: there is no click-time generation. The secret can only
 * be minted where the shared state DB already exists — at engine boot, right
 * after migrateUp.
 *
 * Precedence:
 *   1. env SESSION_SECRET (non-empty) — wins, byte-identical to the old
 *      contract: CLI deploys generate + set it, Docker compose requires it,
 *      the smokes pass an explicit value.
 *   2. previously generated — read back from the state DB
 *      (settings['_system', 'boot.session_secret']) and reused. Every
 *      isolate of the deployment reads the same row ⇒ consistent across
 *      isolates and stable across redeploys. The row is unreachable by the
 *      console API: tenant slugs always come from authenticated principals,
 *      and no principal ever resolves to '_system'.
 *   3. nothing persisted — generate (32 random bytes, hex) and INSERT OR
 *      IGNORE; a re-SELECT returns the winner, so two isolates racing the
 *      first boot converge on one value.
 *
 * Tradeoff, stated plainly: a generated secret lives in the state DB, so
 * anyone with raw DB read access holds it (for D1/Turso that is already
 * operator-level access). Setting SESSION_SECRET explicitly overrides the
 * generated value — with the usual rotation caveat: every session resets
 * and stored secret variables must be re-entered.
 */

/** The reserved settings row: (tenant_slug, key) → hex secret. */
const SYSTEM_SLUG = '_system';
const SECRET_KEY = 'boot.session_secret';

/** 32 crypto-random bytes as 64 hex chars (256-bit key, HS256-grade). */
function generateSecret(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function resolveSessionSecret(
    runner: { query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>; exec(sql: string, params?: unknown[]): Promise<number> },
    envSecret: string | undefined,
): Promise<string> {
    // 1. Explicit env — the documented contract everywhere an operator (or a
    // CLI deploy script) has provided one. Whitespace-only is unset.
    const trimmed = envSecret?.trim();
    if (trimmed) return trimmed;

    // 2. Previously generated — stable across isolates and redeploys.
    const existing = await runner.query(
        `SELECT value FROM settings WHERE tenant_slug = ? AND key = ? LIMIT 1`,
        [SYSTEM_SLUG, SECRET_KEY],
    );
    const persisted = existing[0]?.value;
    if (typeof persisted === 'string' && persisted.trim()) return persisted;

    // 3. First boot on this state DB — generate and persist. OR IGNORE keeps
    // the race benign: the loser's re-SELECT reads the winner's row.
    const generated = generateSecret();
    await runner.exec(
        `INSERT OR IGNORE INTO settings (tenant_slug, key, value, updated_at) VALUES (?, ?, ?, ?)`,
        [SYSTEM_SLUG, SECRET_KEY, generated, new Date().toISOString()],
    );
    const rows = await runner.query(
        `SELECT value FROM settings WHERE tenant_slug = ? AND key = ? LIMIT 1`,
        [SYSTEM_SLUG, SECRET_KEY],
    );
    const winner = rows[0]?.value;
    if (typeof winner === 'string' && winner.trim()) return winner;
    throw new Error('session secret: generated but could not be persisted to the state DB');
}
