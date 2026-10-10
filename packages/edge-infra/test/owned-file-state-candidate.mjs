// Experimental callback candidate, intentionally outside production exports/registration.
import { createClient } from '@libsql/client';

const failure = code => Object.assign(new Error(code), { code });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Test-only candidate. Hooks exist only for independent fault/acknowledgement controls. */
export async function ownedFileTransaction(url, work, options = {}) {
    let parsed;
    try { parsed = new URL(url); } catch { throw failure('state_file_required'); }
    if (parsed.protocol !== 'file:' || parsed.hostname || parsed.search || parsed.hash
        || !parsed.pathname || parsed.pathname === '/' || parsed.pathname.includes(':memory:'))
        throw failure('state_file_required');
    const retries = options.retries ?? 2;
    if (!Number.isSafeInteger(retries) || retries < 0 || retries > 3) throw failure('state_retry_limit');
    const timeoutMs = options.timeoutMs ?? 5000;
    const cleanupMs = options.cleanupMs ?? 100;
    const retryDelayMs = options.retryDelayMs ?? 10;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30000
        || !Number.isSafeInteger(cleanupMs) || cleanupMs < 10 || cleanupMs > 1000
        || !Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 100)
        throw failure('state_deadline_invalid');
    let interruption, notifyStop;
    const stopped = new Promise(resolve => { notifyStop = resolve; });
    const stop = code => { if (!interruption) { interruption = failure(code); notifyStop({ error: interruption }); } };
    const abort = () => stop('state_cancelled');
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(() => stop('state_deadline'), timeoutMs);
    const ensure = () => { if (interruption) throw interruption; };
    const wait = async promise => {
        const result = await Promise.race([Promise.resolve(promise).then(value => ({ value }), error => ({ error })), stopped]);
        if ('error' in result) throw result.error;
        return result.value;
    };
    const rollback = async client => {
        const bounded = async operation => {
            let cleanupTimer;
            try {
                await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
                    cleanupTimer = setTimeout(() => reject(failure('state_rollback_uncertain')), cleanupMs);
                })]);
            } finally { clearTimeout(cleanupTimer); }
        };
        try { await bounded(() => client.execute('ROLLBACK')); }
        catch {
            const error = failure('state_rollback_uncertain');
            // Installed local SDK executes this constant through native exec, not prepare.
            // Keep original uncertainty even if alternate cleanup acknowledges success.
            if (typeof client.executeMultiple === 'function') {
                try {
                    await bounded(() => client.executeMultiple('ROLLBACK'));
                    error.cleanupRecovered = true;
                } catch { /* Neither failure nor acknowledgement loss proves cleanup. */ }
            }
            throw error;
        }
    };
    const factory = options.clientFactory ?? (config => createClient(config));
    try {
    for (let attempt = 0; attempt <= retries; attempt++) {
        ensure();
        const client = factory({ url });
        let disposed = false;
        const close = () => { if (!disposed) { disposed = true; client.close(); } };
        const dispose = error => {
            try { close(); }
            catch {
                if (!error) error = failure('state_cleanup_uncertain');
                error.cleanupFailed = true;
            }
            return error;
        };
        try { await wait(client.execute('BEGIN IMMEDIATE')); }
        catch (error) {
            const cleanupError = dispose(); // Dispose before retry; cleanup failure forbids retry.
            if (cleanupError) throw cleanupError;
            if (interruption) throw interruption;
            if (error?.code === 'SQLITE_BUSY' && attempt < retries) {
                await wait(delay(retryDelayMs)); continue;
            }
            throw failure(error?.code === 'SQLITE_BUSY' ? 'state_busy' : 'state_begin_failed');
        }
        let active = true;
        const pending = new Set();
        const rejected = [];
        const run = (sql, params = []) => {
            if (!active) return Promise.reject(failure('state_transaction_closed'));
            // Trusted framework statements only in this experiment; not an arbitrary-SQL security parser.
            const first = sql.replace(/^(?:\s|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)*/, '');
            if (/^(?:BEGIN|COMMIT|ROLLBACK|END|SAVEPOINT|RELEASE|ATTACH|DETACH|PRAGMA|VACUUM)\b/i.test(first))
                return Promise.reject(failure('state_transaction_control'));
            const promise = Promise.resolve().then(() => {
                if (!active) throw failure('state_transaction_closed');
                ensure();
                return client.execute({ sql, args: params });
            });
            pending.add(promise);
            promise.then(() => pending.delete(promise), error => { rejected.push(error); pending.delete(promise); });
            return promise;
        };
        const runner = {
            dialect: 'sqlite',
            query: async (sql, params) => (await run(sql, params)).rows,
            exec: async (sql, params) => {
                try {
                    const count = (await run(sql, params)).rowsAffected;
                    if (!Number.isSafeInteger(count) || count < 0) throw failure('state_count_invalid');
                    return count;
                } catch (error) { rejected.push(error); throw error; }
            },
            transaction: async () => { throw failure('state_nested_transaction'); },
        };
        let value;
        let callbackFailure;
        try { value = await wait(Promise.resolve().then(() => { ensure(); return work(runner); })); }
        catch (error) { callbackFailure = error instanceof Error ? error : failure('state_callback_failed'); }
        active = false;
        const outstanding = pending.size;
        try { await wait(Promise.allSettled([...pending])); }
        catch (error) { callbackFailure ??= error; }
        if (!callbackFailure && (outstanding || rejected.length))
            callbackFailure = failure(outstanding ? 'state_callback_pending' : 'state_statement_failed');
        if (callbackFailure) {
            try { await rollback(client); }
            catch (error) { callbackFailure = error; }
            throw dispose(callbackFailure);
        }
        let commitFailure;
        try {
            ensure();
            await wait(client.execute('COMMIT'));
        } catch {
            // No replay or claim of successful rollback after any attempted commit.
            commitFailure = failure('state_commit_uncertain');
        }
        if (commitFailure) {
            // Best-effort release only; never convert an uncertain COMMIT into success/replay.
            try { await rollback(client); commitFailure.cleanupRecovered = true; }
            catch (error) { if (error.cleanupRecovered) commitFailure.cleanupRecovered = true; }
        }
        const finalError = dispose(commitFailure);
        if (finalError) throw finalError;
        return value;
    }
    } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
    }
}
