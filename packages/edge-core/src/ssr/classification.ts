/**
 * Component classification — Sets + classifier.
 * Pure code move from PageRenderer; no logic change.
 */

const STATIC_COMPONENTS = new Set([
    'Text', 'Heading', 'Paragraph', 'Image', 'Badge', 'Divider', 'Spacer',
    'Icon', 'Avatar', 'Logo', 'Label', 'MarkdownContent', 'Embed',
    'Alert', 'Progress', 'Input', 'Textarea', 'Select', 'Breadcrumb'
]);

const INTERACTIVE_COMPONENTS = new Set([
    'Button', 'Link', 'Tabs', 'Accordion', 'Modal', 'Dropdown', 'Tooltip',
    'Toggle', 'Checkbox', 'Radio', 'Switch',
    'AuthForm' // has a full renderer in interactive.ts; without this it fell through to fb-unknown
]);

const DATA_COMPONENTS = new Set([
    'DataTable', 'Form', 'InfoList', 'Chart', 'Grid',
    'Card', 'KPICard',
    'Repeater' // has a full skeleton renderer in data.ts; without this it fell through to fb-unknown
]);

// NOTE: 'Grid' is intentionally NOT a layout component. There is exactly one
// Grid in the system — the data-bound Grid (see DATA_COMPONENTS). Use Container
// with display:grid for pure layout grids.
const LAYOUT_COMPONENTS = new Set([
    'Container', 'Section', 'Row', 'Column', 'Flex',
    'Stack', 'Group', 'Box', 'Paper', 'Panel'
]);

// Landing page section components
const LANDING_COMPONENTS = new Set([
    'Hero', 'Features', 'FeatureSection', 'Pricing', 'CTA', 'Navbar', 'FAQ', 'LogoCloud', 'Footer'
]);

/**
 * Classify a component by its type.
 */
export function classifyComponent(type: string): 'static' | 'interactive' | 'data' | 'layout' | 'landing' | 'unknown' {
    if (STATIC_COMPONENTS.has(type)) return 'static';
    if (INTERACTIVE_COMPONENTS.has(type)) return 'interactive';
    if (DATA_COMPONENTS.has(type)) return 'data';
    if (LAYOUT_COMPONENTS.has(type)) return 'layout';
    if (LANDING_COMPONENTS.has(type)) return 'landing';
    return 'unknown';
}
