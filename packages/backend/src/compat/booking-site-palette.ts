import type { PageComponent, PageLayoutData } from '@frontbase/edge-core';
import {
    bookingPaletteSchema, defaultTemplateSettings, readLandingSettings, templateColorHsl, templatePalette,
} from '@frontbase/edge-core/directory/configuration';
import { menuComponent } from '@frontbase/edge-core/menu-components';
import { bookingMenus, bookingPages, bookingTemplate } from './booking-template.js';

export const BOOKING_PALETTE_KEY = 'booking_site_palette:v1';
type Role = typeof bookingTemplate.roles[number];
type Colors = ReturnType<typeof templatePalette>;

// Compare legacy inline values to the actual installer, by node and property.
// Custom nodes, responsive styles and version overrides retain their values.
let defaults: Promise<Map<Role, Map<string, PageComponent>>> | undefined;
function bookingDefaults() {
    return defaults ??= bookingPages('booking-palette-defaults').then(pages => {
        const menus = bookingMenus().menus.map(menu => menuComponent(menu, null));
        return new Map(pages.map(page => {
            const nodes = new Map<string, PageComponent>();
            const collect = (items: PageComponent[]) => {
                for (const node of items) {
                    nodes.set(node.id, node);
                    if (node.children) collect(node.children);
                    for (const version of node.versions ?? []) {
                        if (version.overrides.children) collect(version.overrides.children);
                    }
                }
            };
            collect([...page.layout.content, ...menus]);
            return [page.role, nodes];
        }));
    });
}

const accents = new Set(['#122d50', '#123052', '#252a32', '#0f172a']);
const softSurfaces = new Set(['#ffffff', '#f4f6f8', '#f8fafc', '#eef4fa']);
const mutedText = new Set(['#475569', '#536174', '#64748b']);
const normalText = new Set(['#172033', '#0f172a', '#334155']);

function colorDefaults(styles: Record<string, unknown>, stock: Record<string, unknown>, palette: Colors, root = false) {
    const result = { ...styles };
    if (typeof styles.backgroundColor === 'string' && styles.backgroundColor === stock.backgroundColor) {
        if (accents.has(styles.backgroundColor)) result.backgroundColor = palette.primary;
        if (softSurfaces.has(styles.backgroundColor)) result.backgroundColor = root ? palette.background : palette.surface;
    }
    if (typeof styles.color === 'string' && styles.color === stock.color) {
        if (mutedText.has(styles.color)) result.color = palette.muted;
        else if (normalText.has(styles.color)) result.color = palette.text;
        else if (accents.has(styles.color)) result.color = palette.primary;
    }
    if (typeof styles.border === 'string' && styles.border === stock.border) {
        result.border = styles.border.replace(/#(?:dbe2ea|dce2e9)$/i, palette.border);
    }
    return result;
}

export async function applyBookingSitePalette(layout: PageLayoutData, value: unknown): Promise<PageLayoutData> {
    const marker = layout.root?.bookingForX as { version?: unknown; role?: Role } | undefined;
    if (!value || marker?.version !== 1 || !marker.role || !bookingTemplate.roles.includes(marker.role)) return layout;
    const checked = bookingPaletteSchema.safeParse(value);
    if (!checked.success) return layout;
    const colors = templatePalette({ ...defaultTemplateSettings(), ...checked.data });
    const baseline = (await bookingDefaults()).get(marker.role)!;
    const landing = readLandingSettings(layout);
    const landingPrimary = landing && templatePalette(landing).primary;
    const walk = (items: PageComponent[]): PageComponent[] => items.map(node => {
        const reference = baseline.get(node.id);
        let styles = node.styles;
        let props = node.props;
        if (reference?.type === node.type && styles) {
            if (styles.values && reference.styles?.values) {
                const values = colorDefaults(styles.values, reference.styles.values, colors);
                if (node.type === 'Navbar' || node.type === 'Footer') {
                    if (values.backgroundColor !== styles.values.backgroundColor) values['--background'] = templateColorHsl(String(values.backgroundColor));
                    if (values.color !== styles.values.color) {
                        values['--foreground'] = templateColorHsl(String(values.color));
                        values['--muted-foreground'] = values['--foreground'];
                    }
                }
                styles = { ...styles, values };
            } else if (reference.styles) {
                styles = colorDefaults(styles, reference.styles, colors);
            }
            if (landingPrimary && (props?.templateStyle === 'button' || props?.templateStyle === 'header')
                && reference.styles?.backgroundColor === undefined && styles?.backgroundColor === landingPrimary) {
                styles = { ...styles, backgroundColor: colors.primary };
            }
            if (props?.templateStyle === 'card' && reference.styles?.backgroundColor === undefined
                && styles?.backgroundColor === 'hsl(var(--background))') {
                styles = { ...styles, backgroundColor: 'hsl(var(--card))' };
            }
            if (Array.isArray(props?.templateHeroState) && props.templateHeroState.length === 1) {
                props = { ...props, templateHeroState: [{ ...props.templateHeroState[0], palette: colors }] };
            }
        }
        const versions = node.versions?.map(version => version.overrides.children ? {
            ...version, overrides: { ...version.overrides, children: walk(version.overrides.children) },
        } : version);
        return { ...node, styles, props, ...(node.children ? { children: walk(node.children) } : {}), ...(versions ? { versions } : {}) };
    });
    const raw = layout.root?.containerStyles as Record<string, unknown> | undefined;
    const values = colorDefaults(
        (raw?.values ?? raw ?? {}) as Record<string, unknown>,
        { backgroundColor: '#f8fafc', color: '#0f172a' }, colors, true,
    );
    return {
        ...layout,
        root: {
            ...layout.root,
            className: [layout.root?.className, 'fb-site-palette'].filter(value => typeof value === 'string').join(' '),
            containerStyles: {
                ...(raw?.values ? raw : {}),
                values: {
                    ...values,
                    '--fb-template-primary': colors.primary,
                    '--primary': templateColorHsl(colors.primary),
                    '--primary-foreground': '0 0% 100%',
                    '--background': templateColorHsl(colors.background),
                    '--foreground': templateColorHsl(colors.text),
                    '--card': templateColorHsl(colors.surface),
                    '--card-foreground': templateColorHsl(colors.text),
                    '--muted': templateColorHsl(colors.surface),
                    '--muted-foreground': templateColorHsl(colors.muted),
                    '--border': templateColorHsl(colors.border),
                    '--input': templateColorHsl(colors.border),
                    '--ring': templateColorHsl(colors.primary),
                    '--popover': templateColorHsl(colors.surface),
                    '--popover-foreground': templateColorHsl(colors.text),
                },
            },
        },
        content: walk(layout.content),
    };
}
