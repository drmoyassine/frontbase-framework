/**
 * Vite plugin — `frontbasePlugin()`. Drives schema extraction over component
 * files during dev (HMR) and build. Vite is a peerDependency of consuming
 * projects, not a hard dependency here — only a minimal Plugin shape is used.
 * Tests drive the hooks directly without a running Vite server (test/vite.mjs).
 */
import { extname } from 'node:path';
import { extractFromSource } from '../extractor/schema.js';
import type { ComponentManifest } from '../extractor/types.js';
import type { ExtractionDiagnostic } from '../extractor/types.js';

export interface VitePlugin {
    name: string;
    enforce?: 'pre' | 'post';
    transform?: (this: unknown, code: string, id: string) => { code: string; map: null } | null;
    buildEnd?: (this: unknown) => void;
    handleHotUpdate?: (this: unknown, ctx: { file: string; server: { moduleGraph: { invalidateAll: () => void } } }) => void;
}

export interface FrontbasePluginOptions {
    include?: string[];
    exclude?: string[];
    manifestOutDir?: string;
}

interface PluginState {
    manifests: Map<string, { manifest: ComponentManifest; diagnostics: ExtractionDiagnostic[] }>;
}

const SCHEMA_EXPORT_RE = /\bexport\s+const\s+Schema\b/;

function makeMatcher(exclude: string[]): (id: string) => boolean {
    const ex = exclude.map((e) => e.replace(/\*/g, ''));
    return (id: string) => {
        const norm = id.replace(/\\/g, '/');
        if (ex.some((e) => norm.includes(e))) return false;
        return norm.endsWith('.tsx');
    };
}

export function frontbasePlugin(options: FrontbasePluginOptions = {}): VitePlugin & { __state: PluginState } {
    const matches = makeMatcher(options.exclude ?? ['**/node_modules/**', '**/dist/**']);
    const state: PluginState = { manifests: new Map() };

    return {
        name: 'vite-plugin-frontbase',
        enforce: 'pre',
        __state: state,

        transform(code, id) {
            if (extname(id) !== '.tsx' || !matches(id)) return null;
            if (!SCHEMA_EXPORT_RE.test(code)) return null;
            try {
                state.manifests.set(id, extractFromSource(code, id));
            } catch {
                return null; // not extractable; check command reports it
            }
            return { code, map: null };
        },

        buildEnd() {
            // Real impl writes assembled manifests to manifestOutDir; tested via __state.
        },

        handleHotUpdate({ file, server }) {
            if (extname(file) === '.tsx' && matches(file)) {
                state.manifests.delete(file);
                server.moduleGraph.invalidateAll();
            }
        },
    };
}

export function collectedManifests(plugin: VitePlugin & { __state: PluginState }): { manifest: ComponentManifest; diagnostics: ExtractionDiagnostic[] }[] {
    return [...plugin.__state.manifests.values()];
}
