/**
 * Basic Property Components
 * Barrel export for all basic component property panels.
 *
 * Schema-driven (no bespoke panel — see registry/propertySchemas.ts for the
 * offline fallback, and lib/builder/registryDescriptor.ts for the framework
 * descriptor that drives these when the worker is reachable):
 *   Heading, Text, Link, Badge, Alert, Progress,
 *   Input, Textarea, Checkbox, Switch, Image, Avatar, Icon, Embed.
 *
 * The bespoke panels below remain because they own non-schema UX the
 * descriptor cannot express (data binding, action/icon composition).
 */

// Actions
export { ButtonProperties } from './ButtonProperties';

// Form Inputs
export { SelectProperties } from './SelectProperties';

// Data
export { ChartProperties } from './ChartProperties';
export { GridProperties } from './GridProperties';
export { KPICardProperties } from './KPICardProperties';
export { RepeaterProperties } from './RepeaterProperties';
