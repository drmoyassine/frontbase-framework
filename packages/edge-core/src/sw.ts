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

export function attachServiceWorker(self: SWGlobal, engine: Hono, manifest: SiteManifest): void {
    self.addEventListener('install', () => {
        // Publish semantics (CHM-1): the new engine takes over ASAP.
        void self.skipWaiting();
    });

    self.addEventListener('activate', (event) => {
        event.waitUntil(self.clients.claim());
    });

    self.addEventListener('fetch', (event: SWFetchEvent) => {
        const url = new URL(event.request.url);
        const isNavigation = (event.request as Request & { mode: string }).mode === 'navigate';
        const isEngineRoute = url.origin === self.location.origin && url.pathname in manifest.pages;

        if (isNavigation && isEngineRoute) {
            event.respondWith(engine.fetch(new Request(event.request)));
        }
        // Everything else → network (the edge renders it).
    });
}
