/**
 * App identity for `frontbase deploy --app-name` (and the root deploy:cf-full
 * script). Cloudflare — via `wrangler` — is the SOURCE OF TRUTH for whether an
 * app (worker) already exists, not the local wrangler.toml. This lets the same
 * deploy command be used both to spin up a brand-new app and to redeploy an
 * existing one, without the caller having to track which is which.
 *
 * `wrangler` is invoked through an injectable runner (matches the pattern in
 * provision-d1.ts/interactive.ts) so the decision logic is testable without a
 * real Cloudflare account.
 */
export type WranglerCheckRunner = (args: string[], opts: { cwd: string }) => Promise<{ code: number; stdout: string; stderr: string }>;

/**
 * True iff a Cloudflare Worker with this name already exists on the account.
 *
 * Implementation: `wrangler deployments list --name <name>`. Verified against
 * the real CLI:
 *   - exists:      exit 0, deployment history printed.
 *   - not found:   exit 1, stderr contains "code: 10007" / "does not exist".
 * The error-code check is a belt-and-braces cross-check on top of the exit
 * code (mirrors `isLoggedIn`'s message-text approach in interactive.ts) — a
 * non-zero exit for a DIFFERENT reason (network blip, auth expired mid-run)
 * should not be silently read as "doesn't exist" and trigger an accidental
 * fresh provision on top of a real app.
 */
export async function workerExists(name: string, cwd: string, run: WranglerCheckRunner): Promise<boolean> {
    const res = await run(['deployments', 'list', '--name', name], { cwd });
    if (res.code === 0) return true;
    if (/code:\s*10007/.test(res.stderr) || /does not exist/i.test(res.stderr)) return false;
    // Any other failure (auth, network, rate limit) is NOT a "doesn't exist"
    // signal — surface it so the caller can fail loudly instead of guessing.
    throw new Error(`could_not_determine_worker_existence: ${res.stderr.trim().slice(0, 300) || `exit ${res.code}`}`);
}

/**
 * Look up an EXISTING D1 database's real id by name, directly from Cloudflare
 * (not the local wrangler.toml — a fresh checkout of an existing app has no
 * local binding at all, and that must still redeploy cleanly).
 *
 * Implementation: `wrangler d1 info <name> --json`. Verified against the real
 * CLI: exists → exit 0 + JSON `{ uuid, name, ... }`; not found → exit 1 with a
 * "Couldn't find a D1 DB with name..." message. Returns null on any
 * not-found/parse failure (the caller decides whether that means "create it"
 * or "error" — this function only answers "what's out there").
 */
export async function lookupExistingD1(name: string, cwd: string, run: WranglerCheckRunner): Promise<string | null> {
    const res = await run(['d1', 'info', name, '--json'], { cwd });
    if (res.code !== 0) return null;
    try {
        const parsed = JSON.parse(res.stdout) as { uuid?: string };
        return parsed.uuid ?? null;
    } catch {
        return null;
    }
}

// ---- app-name normalization / generation ----

export function sanitizeAppName(name: string): string {
    const normalized = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
    return normalized || 'frontbase';
}

// Small, curated word lists — deliberately short so names stay readable
// (Heroku/Docker-style "adjective-noun", e.g. "swift-heron", not
// "antidisestablishmentarian-hippopotamus").
const ADJECTIVES = [
    'swift', 'quiet', 'bold', 'calm', 'brave', 'lucky', 'sunny', 'misty',
    'amber', 'coral', 'azure', 'violet', 'golden', 'silver', 'crimson', 'emerald',
    'gentle', 'clever', 'happy', 'jolly', 'mighty', 'noble', 'proud', 'sturdy',
];
const NOUNS = [
    'heron', 'otter', 'falcon', 'badger', 'raven', 'lynx', 'panther', 'sparrow',
    'meadow', 'harbor', 'summit', 'canyon', 'river', 'forest', 'glacier', 'prairie',
    'comet', 'nebula', 'ember', 'quartz', 'willow', 'cedar', 'maple', 'juniper',
];

/** Generate a random two-word app name (e.g. "swift-heron"). Not guaranteed
 *  unique — the caller should verify via `workerExists` and retry on a
 *  collision (astronomically rare at this word-list size, but checked anyway
 *  since correctness shouldn't rely on probability alone). */
export function randomAppName(rand: () => number = Math.random): string {
    const adj = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(rand() * NOUNS.length)];
    return `${adj}-${noun}`;
}

/**
 * Pick a fresh, not-yet-taken app name — retries `randomAppName()` against
 * `workerExists` up to `maxAttempts` times. Only used when the caller gave no
 * --app-name at all, so a collision (vanishingly unlikely at 24×24=576
 * combinations, but not impossible) just means "try another word pair," not
 * "fail the deploy."
 */
export async function generateFreeAppName(
    cwd: string,
    run: WranglerCheckRunner,
    opts: { rand?: () => number; maxAttempts?: number } = {},
): Promise<string> {
    const rand = opts.rand ?? Math.random;
    const maxAttempts = opts.maxAttempts ?? 10;
    for (let i = 0; i < maxAttempts; i++) {
        const candidate = randomAppName(rand);
        if (!(await workerExists(candidate, cwd, run))) return candidate;
    }
    throw new Error('could_not_generate_free_app_name');
}
