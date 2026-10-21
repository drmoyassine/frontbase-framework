/** Compatibility bridge; the standalone translation package owns this implementation. */
export * from '@frontbase/translation';

export * from './surfaces.js';

export {localizePublicHref,localizeNavigationProps} from './navigation.js';

export {localeDirection} from './direction.js';

export {formatLocalePattern,pluralPatternLabel} from './patterns.js';
