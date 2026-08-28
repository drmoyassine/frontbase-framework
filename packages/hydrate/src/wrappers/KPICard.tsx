/**
 * Edge KPICard Component - React SSR Hydration
 *
 * Thin wrapper around the pure @frontbase/kpicard component.
 * We export it so that the SSR PageRenderer and the Client Hydrator
 * can attach to it uniformly (mirrors infolist/form/datatable wrappers).
 */
export { KPICard } from '@frontbase/kpicard';
