/**
 * @frontbase/builder — the React builder shell. Browser SPA.
 *
 * RULE 1: this package NEVER imports @frontbase/edge-infra (no drivers/secrets).
 * It talks to the console API over HTTP and renders the draft through the SAME
 * @frontbase/edge-core engine (preview parity). The no-leak gate asserts the
 * built bundle contains no edge-infra driver/secret.
 */
export { localDraftProvider } from './draft/localDraftProvider.js';
export type { DraftRow } from './draft/localDraftProvider.js';
export { BuilderWorkspace } from './components/BuilderWorkspace.js';
export type { BuilderWorkspaceProps } from './components/BuilderWorkspace.js';
export { panelFieldsFromManifest } from './components/PropertyPanel.js';
export type { PanelField } from './components/PropertyPanel.js';
