/**
 * Service-worker entry for the FULL-CMS worker.
 *
 * DELIBERATELY MINIMAL: this SW no longer renders pages (the edge worker is the
 * single source of truth for published pages — see attachServiceWorker). It only
 * installs/activates so an updated sw.js takes over immediately and neutralises
 * any previously-installed version. Crucially it does NOT import the engine, so
 * the /sw.js bundle stays small (it would otherwise carry all of edge-core,
 * including the lucide icon map, for nothing).
 *
 * When offline/on-device rendering is restored (the local-first milestone), this
 * entry will re-import createEngine + a sync layer here.
 */
/// <reference lib="webworker" />
import { attachServiceWorker } from '@frontbase/edge-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
attachServiceWorker(self as any);
