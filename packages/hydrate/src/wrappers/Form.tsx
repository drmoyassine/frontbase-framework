/**
 * Edge Form Component - React SSR Hydration
 * 
 * Thin wrapper around the pure @frontbase/form component.
 * We export it so that the SSR PageRenderer and the Client Hydrator
 * can attach to it uniformly.
 */
export { Form } from '@frontbase/form';
