/**
 * Interactive deploy helpers (`frontbase deploy --interactive`): check/perform
 * wrangler login, and prompt for admin email/password with the password masked
 * on the terminal and NEVER touching argv or shell history.
 *
 * Both functions take injectable seams (spawn/prompt) so the CLI gate can test
 * the decision logic without a real terminal or Cloudflare account.
 */
import { spawn } from 'node:child_process';
import * as readline from 'node:readline';

export type SpawnRunner = (bin: string, args: string[], opts: { cwd: string; stdio?: 'inherit' | 'pipe' }) => Promise<{ code: number; stdout: string; stderr: string }>;

/** Default runner: spawn the real binary. `stdio: 'inherit'` for `wrangler login`
 *  (it opens a browser + waits — the user needs to see/interact with it). */
const defaultSpawn: SpawnRunner = (bin, args, { cwd, stdio }) => new Promise((resolvePromise) => {
    const child = spawn(bin, args, { cwd, stdio: stdio === 'inherit' ? 'inherit' : ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    if (stdio !== 'inherit') {
        child.stdout?.on('data', (d) => { stdout += d; });
        child.stderr?.on('data', (d) => { stderr += d; });
    }
    child.on('error', (e) => resolvePromise({ code: 1, stdout, stderr: stderr + String(e) }));
    child.on('close', (code) => resolvePromise({ code: code ?? 0, stdout, stderr }));
});

/** True iff `wrangler whoami`'s output indicates an authenticated session.
 *  wrangler exits 0 either way — the signal is the message text, not the code. */
export function isLoggedIn(whoamiStdout: string): boolean {
    return /you are logged in/i.test(whoamiStdout) && !/not authenticated/i.test(whoamiStdout);
}

/**
 * Ensure the user is logged into wrangler, running `wrangler login` (which opens
 * a browser and blocks until the OAuth flow completes) if `whoami` says they're not.
 * No-op if already logged in.
 */
export async function ensureWranglerLogin(cwd: string, run: SpawnRunner = defaultSpawn): Promise<{ wasLoggedIn: boolean }> {
    const who = await run('wrangler', ['whoami'], { cwd });
    if (isLoggedIn(who.stdout)) return { wasLoggedIn: true };
    // Not logged in — run the interactive login flow (inherits stdio so the
    // browser-based OAuth prompt is visible/usable).
    const login = await run('wrangler', ['login'], { cwd, stdio: 'inherit' });
    if (login.code !== 0) throw new Error('wrangler login failed or was cancelled');
    return { wasLoggedIn: false };
}

export interface PromptIO {
    /** Read a line of visible input (email). */
    question(prompt: string): Promise<string>;
    /** Read a line of MASKED input (password — never echoed to the terminal). */
    questionMasked(prompt: string): Promise<string>;
}

// Raw-mode byte codes for the masked-password reader (avoids embedding literal
// control characters in source, which are easy to mis-copy/mis-render).
const BYTE_LF = 10;         // \n
const BYTE_CR = 13;         // \r
const BYTE_ETX = 3;         // Ctrl+C
const BYTE_BACKSPACE = 8;   // \b
const BYTE_DEL = 127;       // DEL (what most terminals send for Backspace)

/** Read one line of input with the terminal echo suppressed (a plain password
 *  mask — no asterisks are drawn, matching "never appears on screen"). */
function readMaskedLine(prompt: string): Promise<string> {
    return new Promise((res) => {
        process.stdout.write(prompt);
        const stdin = process.stdin;
        let buf = '';
        const onData = (chunk: Buffer) => {
            for (const byte of chunk) {
                if (byte === BYTE_CR || byte === BYTE_LF) {
                    stdin.pause();
                    stdin.removeListener('data', onData);
                    stdin.setRawMode?.(false);
                    process.stdout.write('\n');
                    res(buf);
                    return;
                }
                if (byte === BYTE_ETX) { stdin.setRawMode?.(false); process.exit(130); }
                if (byte === BYTE_BACKSPACE || byte === BYTE_DEL) { buf = buf.slice(0, -1); continue; }
                buf += String.fromCharCode(byte);
            }
        };
        stdin.setRawMode?.(true);
        stdin.resume();
        stdin.on('data', onData);
    });
}

/** The default terminal prompt: readline for the email (visible), a raw-mode
 *  reader for the password (nothing echoes — not even asterisks). */
function defaultPromptIO(): PromptIO {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return {
        question: (prompt) => new Promise((res) => rl.question(prompt, (answer) => res(answer.trim()))),
        questionMasked: (prompt) => readMaskedLine(prompt),
    };
}

export interface AdminCredentials { email: string; password: string; }

/** Prompt for admin email + masked password. Values stay in-memory — the caller
 *  passes them straight to `deployCommand`, which pushes them to wrangler over
 *  stdin (never argv). Nothing here writes to argv, env, or shell history. */
export async function promptCredentials(io: PromptIO = defaultPromptIO()): Promise<AdminCredentials> {
    let email = '';
    while (!email) {
        email = await io.question('Admin email: ');
        if (!email.includes('@')) { console.log('  enter a valid email'); email = ''; }
    }
    let password = '';
    while (!password || password.length < 8) {
        password = await io.questionMasked('Admin password (min 8 chars): ');
        if (password.length < 8) console.log('  password must be at least 8 characters');
    }
    return { email, password };
}
