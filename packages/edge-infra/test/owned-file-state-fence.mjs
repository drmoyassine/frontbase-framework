// Experimental Node/file containment only; not registered as a production state adapter.
import { open, realpath, stat, access, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ownedFileTransaction } from './owned-file-state-candidate.mjs';

const failure = code => Object.assign(new Error(code), { code });

export async function createFencedFileState(url, directory) {
    let parsed;
    try { parsed = new URL(url); } catch { throw failure('state_file_required'); }
    if (parsed.protocol !== 'file:' || parsed.hostname || parsed.search || parsed.hash)
        throw failure('state_file_required');
    let path, root;
    try {
        path = await realpath(fileURLToPath(parsed)); root = await realpath(directory);
        if (!(await stat(path)).isFile() || !(await stat(root)).isDirectory()) throw new Error();
    } catch { throw failure('state_fence_unavailable'); }
    const identity = createHash('sha256').update(path).digest('hex');
    const marker = join(root, `${identity}.pending`);
    const stateUrl = pathToFileURL(path).href;
    return {
        status: async () => {
            try { await access(marker); return { state: 'blocked' }; }
            catch (error) {
                if (error.code === 'ENOENT') return { state: 'ready' };
                throw failure('state_fence_unavailable');
            }
        },
        transaction: async (operation, work, options = {}) => {
            if (typeof operation !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(operation))
                throw failure('state_operation_invalid');
            if (options.signal?.aborted) throw failure('state_cancelled');
            let handle;
            try { handle = await open(marker, 'wx', 0o600); }
            catch (error) { throw failure(error.code === 'EEXIST' ? 'state_recovery_required' : 'state_fence_unavailable'); }
            try {
                await handle.writeFile(JSON.stringify({ version: 1, operation }));
                await handle.sync(); await handle.close(); handle = undefined;
            } catch {
                try { await handle?.close(); } catch { /* Keep exclusive marker even on incomplete persistence. */ }
                throw failure('state_fence_unavailable');
            }
            let result;
            try { result = await ownedFileTransaction(stateUrl, work, options); }
            catch (error) {
                // Retain the marker on every failure; neither a code nor row equality authorizes release.
                throw error;
            }
            try { await unlink(marker); }
            catch { throw failure('state_fence_uncertain'); }
            return result;
        },
    };
}
