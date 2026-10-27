/**
 * Quick-fixes (M3.1.1) — machine-applicable edits for the diagnostic codes.
 *
 * Each fix is a `TextEdit` (a search-replace: `oldString` must be unique in the
 * file). An agent applies `edit` directly; `applyEdit` is the reference impl the
 * gate uses to prove "apply → check passes." Codes whose fix is semantic (FB001
 * browser-global usage, FB002 navigation, TS####) get a descriptive `fix` but no
 * `edit` (not safely automatable) — those are `fixable: false`.
 */
export interface TextEdit {
    type: 'insert' | 'replace' | 'delete';
    /** Unique search string in the file (replace/delete). */
    oldString?: string;
    /** Replacement / inserted text (insert/replace). */
    newString?: string;
    /** Anchor for insert-at-end. */
    atEnd?: boolean;
}

export interface QuickFixContext {
    code: string;
    /** Property name for FB003 / UNSUPPORTED_ZOD, when known. */
    path?: string;
    /** The offending source snippet, when known (e.g. the unsupported zod line). */
    snippet?: string;
}

/**
 * Return a machine-applicable edit for a diagnostic, or null if it's only
 * descriptive. The edit's `oldString` is chosen to be unique in a typical file.
 */
export function quickFixFor(ctx: QuickFixContext): TextEdit | null {
    switch (ctx.code) {
        case 'MISSING_SCHEMA':
            return { type: 'insert', atEnd: true, newString: MISSING_SCHEMA_STUB };

        case 'UNSUPPORTED_ZOD': {
            // Comment out the offending line with a TODO (always applicable).
            if (!ctx.snippet) return null;
            return { type: 'replace', oldString: ctx.snippet, newString: `// TODO(UNSUPPORTED_ZOD): ${ctx.snippet} — replace with z.enum/z.object` };
        }

        // FB003 is source-dependent (needs the property's zod chain) — the linter
        // calls buildDescribeFix(source, propName) directly. FB001/FB002/TS####
        // are semantic and not safely automatable.
        default:
            return null;
    }
}

/** The human description for a code (carried as `fix` even when no edit exists). */
export function fixDescription(code: string): string {
    switch (code) {
        case 'MISSING_SCHEMA': return "Add `export const Schema = z.object({...})`";
        case 'UNSUPPORTED_ZOD': return "Replace the unsupported Zod construct (z.union/z.record/etc.) with z.enum for literal sets or z.object for structured data.";
        case 'FB001': return "Move browser-only logic (window/document) into the client behaviors runtime (data-fb-* attrs), or guard with `typeof window !== 'undefined'`.";
        case 'FB002': return "Render navigation as <a href> so the service worker intercepts it; reserve data-navigate-to for button-styled links only.";
        case 'FB003': return "Add .describe('...') to the property.";
        default: return '';
    }
}

/**
 * Build an FB003 edit from the actual source: find `name: <zodchain>` and append
 * `.describe('TODO')` before the terminator. Returns null if it can't match or the
 * property already has .describe().
 */
export function buildDescribeFix(source: string, propName: string): TextEdit | null {
    // Match the property on its own line: (line-start whitespace)(propName : )(zod chain)(terminator).
    // Anchoring to \n+indent makes oldString unique (so `title:` doesn't match inside `subtitle:`).
    const re = new RegExp(`(\\n\\s*\\b${escapeRe(propName)}\\s*:\\s*)(z\\.[^\\n,)]+)(\\s*[,)])`);
    const m = source.match(re);
    if (!m || !m[1] || !m[2] || !m[3]) return null;
    const oldString = m[0];
    // Only emit if the property doesn't already end in .describe(...)
    if (/\.describe\(/.test(m[2])) return null;
    const newString = `${m[1]}${m[2]}.describe('TODO')${m[3]}`;
    return { type: 'replace', oldString, newString };
}

/** Apply an edit to source text and return the result. Throws if oldString isn't found/unique. */
export function applyEdit(source: string, edit: TextEdit): string {
    if (edit.type === 'insert' && edit.atEnd) {
        return source.endsWith('\n') ? source + (edit.newString ?? '') : source + '\n' + (edit.newString ?? '');
    }
    if (!edit.oldString) throw new Error('edit.oldString required for replace/delete');
    const count = source.split(edit.oldString).length - 1;
    if (count === 0) throw new Error(`quick-fix oldString not found`);
    if (count > 1) throw new Error(`quick-fix oldString is ambiguous (${count} matches)`);
    if (edit.type === 'delete') return source.replace(edit.oldString, '');
    return source.replace(edit.oldString, edit.newString ?? '');
}

export const MISSING_SCHEMA_STUB =
    `\nimport { z } from 'zod';\n\nexport const Schema = z.object({\n    // TODO: define this component's props\n    title: z.string().describe('Title'),\n});\n`;

function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
