/**
 * Cloudflare Worker entry — the whole demo CMS as ONE worker, built entirely
 * on @frontbase/edge-core (contrast the spike, which used a hand-rolled engine).
 *
 * createEngine() already provides the full priority router (/sw.js, Edge Data
 * Proxy, eSSR catch-all), environment-gated for 'edge'. The SW bundle is inlined
 * at build time (virtual:sw-bundle) so the deploy is a single artifact.
 */
import { createEngine, directProvider, configureEngine } from '@frontbase/edge-core';
import { manifest } from './manifest.js';
import SW_BUNDLE from 'virtual:sw-bundle';

// Host config: no process.env on Workers; supply edition/env explicitly.
configureEngine({ edition: 'community', nodeEnv: 'production' });

const engine = createEngine({
    manifest,
    data: directProvider(manifest),
    environment: 'edge',
    swBundle: SW_BUNDLE,
});

export default engine;
