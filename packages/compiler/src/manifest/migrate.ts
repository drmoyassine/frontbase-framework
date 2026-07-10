/**
 * Version-flagged layout migration (M3.0.3, CF-9). Existing product-repo layouts
 * are builder exports (`{ version: 1, page: { layoutData: { content, root } } }`)
 * or bare content trees. The engine consumes a `PageLayoutData` (`{ root, content }`).
 *
 * `migrateLayout` detects the source version and upgrades to the CURRENT format,
 * so legacy JSON loads and renders byte-identically (proven against the golden
 * corpus in test/migrate.mjs). The migration is a pure, deterministic transform.
 */

/** The layout format the engine consumes today. */
export const CURRENT_LAYOUT_VERSION = 2;

export interface LayoutData {
    root: Record<string, unknown>;
    content: unknown[];
}

export interface VersionedLayout extends LayoutData {
    /** Format version; absent = infer from shape (legacy). */
    layoutVersion?: number;
}

/** A builder export (the legacy on-disk shape). */
interface BuilderExport {
    version?: number;
    page?: { layoutData?: unknown; title?: string; slug?: string };
}

/** Detect the source layout version from an arbitrary parsed JSON value. */
export function detectLayoutVersion(input: unknown): number {
    if (input && typeof input === 'object') {
        const o = input as Record<string, unknown>;
        if (typeof o.layoutVersion === 'number') return o.layoutVersion;
        // A builder export wrapper (`{ version, page: { layoutData } }`) = v1.
        if ('page' in o && o.page && typeof o.page === 'object' && 'layoutData' in (o.page as object)) return 1;
        // A bare `{ root, content }` with no version = the pre-flag current shape (v2).
        if ('content' in o && 'root' in o) return 2;
        // A bare `{ content }` (no root) = an early legacy tree = v1.
        if ('content' in o) return 1;
    }
    return 0; // unknown
}

/**
 * Migrate any recognized legacy layout to the CURRENT `LayoutData`. Idempotent:
 * a current-format layout passes through unchanged (byte-identical).
 */
export function migrateLayout(input: unknown): LayoutData {
    const version = detectLayoutVersion(input);
    switch (version) {
        case 2:
            // Already current — strip only the version flag if present.
            return normalizeCurrent(input as VersionedLayout);
        case 1:
            return migrateV1(input);
        default:
            throw new Error('unknown_layout_version');
    }
}

function normalizeCurrent(o: VersionedLayout): LayoutData {
    return { root: o.root ?? {}, content: o.content ?? [] };
}

/** v1 → v2: unwrap a builder export, ensure a `root`, keep `content` as-is. */
function migrateV1(input: unknown): LayoutData {
    const o = input as BuilderExport & Partial<LayoutData>;
    // Builder-export wrapper?
    if (o.page && typeof o.page === 'object' && 'layoutData' in o.page) {
        const inner = o.page.layoutData as Partial<LayoutData>;
        return { root: inner.root ?? {}, content: inner.content ?? [] };
    }
    // Bare early tree (content, maybe no root).
    return { root: (o.root as Record<string, unknown>) ?? {}, content: (o.content as unknown[]) ?? [] };
}

/** Migrate + stamp with the current version flag (for re-persisting). */
export function migrateAndStamp(input: unknown): VersionedLayout {
    return { ...migrateLayout(input), layoutVersion: CURRENT_LAYOUT_VERSION };
}
