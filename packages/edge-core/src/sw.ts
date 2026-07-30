/**
 * Service-worker attachment — the Chimera in the visitor's browser (M0.1 primitives).
 *
 * The compiler-emitted sw.js entry (M1.4) calls `attachServiceWorker(self, ...)`.
 * Navigations to manifest routes render locally through the SAME engine; every
 * other request (proxy calls, /sw.js itself, unknown routes) falls through to
 * the network — fallback-by-design (CHIMERA §1.B).
 */
import type { Hono } from 'hono';
import type { SiteManifest } from './manifest.js';

/** Structural SW typings — avoids pulling the WebWorker lib into a DOM-lib build. */
interface SWFetchEvent {
    readonly request: Request;
    respondWith(response: Response | Promise<Response>): void;
    waitUntil(promise: Promise<unknown>): void;
}
interface SWGlobal {
    location: { origin: string };
    skipWaiting(): Promise<void>;
    clients: { claim(): Promise<void> };
    addEventListener(type: 'install' | 'activate', listener: (event: { waitUntil(p: Promise<unknown>): void }) => void): void;
    addEventListener(type: 'fetch', listener: (event: SWFetchEvent) => void): void;
}

export function attachServiceWorker(self: SWGlobal, _engine?: Hono, _manifest?: SiteManifest): void {
    self.addEventListener('install', () => {
        // Publish semantics (CHM-1): the new engine takes over ASAP.
        void self.skipWaiting();
    });

    self.addEventListener('activate', (event) => {
        event.waitUntil(self.clients.claim());
    });

    // DYNAMIC-CMS FIX: this SW does NOT intercept navigations. An earlier
    // version rendered baked manifest routes (e.g. '/') locally via the embedded
    // engine — for a dynamic CMS that shadows the real DB-published page with a
    // frozen demo page (visitor saw stale "A whole CMS…" demo, not their
    // homepage; hard-refresh bypassed the SW and showed the real page). The edge
    // worker is the single source of truth; every navigation must reach it. The
    // lifecycle hooks are retained so an updated sw.js takes over immediately and
    // neutralises any previously-installed intercepting version.
    self.addEventListener('fetch', () => {
        /* intentional no-op — all requests fall through to the network/edge */
    });
}
