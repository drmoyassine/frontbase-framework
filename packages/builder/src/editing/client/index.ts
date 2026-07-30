/**
 * @frontbase/builder/editing/client — Public API for browser bundle.
 *
 * This is the browser-optimized entry point for the editing layer.
 * It provides all editing functionality in a simplified API.
 *
 * Usage:
 * ```ts
 * import { Editor } from '@frontbase/builder/editing/client';
 *
 * const editor = new Editor({
 *   iframe: document.querySelector('iframe')!,
 *   overlay: document.querySelector('.overlay')!,
 *   onRender: (html) => { iframe.srcdoc = html; }
 * });
 *
 * editor.load(components);
 * ```
 */

// Main Editor class
export { Editor } from './editor.js';
export type { EditorConfig } from './editor.js';

// Selection utilities
export * from './selection.js';

// Drag & Drop utilities
export * from './drag-drop.js';
