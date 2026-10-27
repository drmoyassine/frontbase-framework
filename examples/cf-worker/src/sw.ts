/**
 * Service-worker entry — the Chimera engine running in the browser.
 * Boots @frontbase/edge-core with the proxy provider and attaches to SW events.
 * The compiler will emit this file automatically in M1.4; here it's hand-written
 * to prove the package's SW primitives boot on a real worker (M1.1 last criterion).
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
