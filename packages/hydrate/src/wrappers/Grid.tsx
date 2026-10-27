/**
 * Edge Grid Component - React SSR Hydration
 *
 * Thin wrapper around the pure @frontbase/grid component.
 * We export it so that the SSR PageRenderer and the Client Hydrator
 * can attach to it uniformly (mirrors infolist/form/datatable wrappers).
 */
export { Grid } from '@frontbase/grid';
