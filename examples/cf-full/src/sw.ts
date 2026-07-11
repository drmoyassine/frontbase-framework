/**
 * Service-worker entry — the same Chimera engine running in the browser. Boots
 * @frontbase/edge-core with the proxy provider so, once installed, navigations
 * render locally and data comes back over /api/data. Inlined into the worker
 * artifact at build time (virtual:sw-bundle).
 */
/// <reference lib="webworker" />
import { createEngine, proxyProvider, attachServiceWorker } from '@frontbase/edge-core';
import { manifest } from './manifest.js';

const engine = createEngine({
    manifest,
    data: proxyProvider('/api/data'),
    environment: 'service-worker',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
attachServiceWorker(self as any, engine, manifest);
