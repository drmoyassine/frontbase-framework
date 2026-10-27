/**
 * Edge InfoList Component - React SSR Hydration
 * 
 * Thin wrapper around the pure @frontbase/infolist component.
 * We export it so that the SSR PageRenderer and the Client Hydrator
 * can attach to it uniformly.
 */
export { InfoList } from '@frontbase/infolist';
