/** Host-scoped workflow HTTP policy shared by direct, queued and recovery runs. */
import { defaultExecutorRegistry, type ExecuteOptions } from '@frontbase/edge-core/workflow';
import { guardedExternalFetch, type CompatFetch } from './compat/external-http.js';

export function workflowHttpOptions(fetchImpl: CompatFetch): ExecuteOptions {
    return { executors: defaultExecutorRegistry({ fetchImpl: async (input, init) => {
        try { return await guardedExternalFetch(fetchImpl, input, init); }
        catch { throw Error('workflow_http_failed'); }
    } }) };
}
