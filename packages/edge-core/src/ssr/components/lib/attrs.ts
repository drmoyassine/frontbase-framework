/**
 * Shared props→(className, styleString) resolution for SSR component renderers.
 *
 * The style-value work delegates entirely to the canonical `processStyleEntry`
 * (styleHelpers.ts), so the static / interactive / data renderer families
 * produce byte-identical style output. Each renderer keeps its own thin
 * attribute-string formatter (they differ in hydration / data-fb-props shape);
 * this helper collapses only the duplicated stylesData→CSS + className-merge
 * block that was copy-pasted across static.ts / interactive.ts / data.ts.
 */

import { processStyleEntry } from '../../styleHelpers.js';

export interface ResolvedPropsStyles {
    /** Merged className: baseClass + props.className + values.className. */
    className: string;
    /** Inline CSS produced from props.style (StylesData or plain object). */
    styleString: string;
}

/**
 * Resolve a component's `props.style` (either the new StylesData envelope
 * `{ activeProperties, values, stylingMode }` or a plain CSS-object) to a
 * `{ className, styleString }` pair. Joins declarations with `;` and emits
 * `${key}:${value}` (no spaces) — the canonical form.
 */
export function resolvePropsStyles(
    baseClass: string,
    props: Record<string, unknown>,
): ResolvedPropsStyles {
    let className = [baseClass, props.className].filter(Boolean).join(' ');
    const parts: string[] = [];

    const propStyle = (props.style as any) || {};

    if (
        propStyle &&
        typeof propStyle === 'object' &&
        ('values' in propStyle || 'activeProperties' in propStyle)
    ) {
        if (propStyle.values) {
            const { values } = propStyle;
            for (const [key, value] of Object.entries(values)) {
                if (value === undefined || value === null || value === '' || key === 'className') {
                    continue;
                }
                processStyleEntry(key, value as any, (cssKey, cssValue) => {
                    parts.push(`${cssKey}:${cssValue}`);
                });
            }
            if (values.className) {
                className = [className, values.className].filter(Boolean).join(' ');
            }
        }
    } else {
        // Plain style object — still route through processStyleEntry so size /
        // padding / margin / horizontalAlign expand and px-append identically.
        for (const [key, value] of Object.entries(propStyle)) {
            if (value === undefined || value === null || value === '' || key === 'className') {
                continue;
            }
            processStyleEntry(key, value as any, (cssKey, cssValue) => {
                parts.push(`${cssKey}:${cssValue}`);
            });
        }
    }

    return { className, styleString: parts.join(';') };
}
