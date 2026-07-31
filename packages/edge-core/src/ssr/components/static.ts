/**
 * Static Component Renderers
 *
 * Pure HTML renderers for static components that don't need interactivity.
 * These components render identically on server and client.
 */

import { LUCIDE_ICONS } from '../iconMap.js';

/**
 * Resolve a lucide-react icon name (PascalCase, e.g. "Zap", "CheckCircle2") to a
 * full <svg> string using the bundled path data (generated from the exact
 * lucide-react version the builder ships). Returns '' for unknown names so callers
 * can fall through to emoji/URL/text handling. Centralised so every icon surface
 * (Icon, Badge, Button, …) resolves names consistently — true WYSIWYG with the
 * builder canvas, which renders the same names via lucide-react.
 */
function lucideSvg(name: string | undefined | null): string {
    if (!name) return '';
    const inner = LUCIDE_ICONS[name];
    if (!inner) return '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

/**
 * Escape HTML special characters for safe rendering.
 */
function escapeHtml(str: string | undefined): string {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Helper to build common attributes (id, class, style)
 */
function getCommonAttributes(id: string, baseClass: string, props: Record<string, unknown>, extraStyle: string = ''): string {
    // Merge base class with prop className (e.g. Tailwind classes)
    let className = [baseClass, props.className].filter(Boolean).join(' ');

    let propStyleString = '';

    const propStyle = props.style as any || {};

    // Handle NEW StylesData format: { activeProperties: [...], values: {...} } or just { values: {...} }
    if (propStyle && typeof propStyle === 'object' && ('values' in propStyle || 'activeProperties' in propStyle)) {
        if (propStyle.values) {
            const { values } = propStyle;
            const styleParts: string[] = [];

            // Apply ALL styles from values
            for (const [prop, value] of Object.entries(values)) {
                if (value === undefined || value === null || value === '' || prop === 'className') {
                    continue;
                }

                // Handle special 'size' object: { width, widthUnit, height, heightUnit }
                if (prop === 'size' && typeof value === 'object') {
                    const sizeObj = value as any;
                    if (sizeObj.width !== undefined && sizeObj.width !== 'auto') {
                        const widthUnit = sizeObj.widthUnit || 'px';
                        styleParts.push(`width:${sizeObj.width}${widthUnit}`);
                    }
                    if (sizeObj.height !== undefined && sizeObj.height !== 'auto') {
                        const heightUnit = sizeObj.heightUnit || 'px';
                        styleParts.push(`height:${sizeObj.height}${heightUnit}`);
                    }
                    continue;
                }

                // Handle padding/margin objects: { top, right, bottom, left }
                if ((prop === 'padding' || prop === 'margin') && typeof value === 'object') {
                    const boxObj = value as any;
                    if (boxObj.top !== undefined) styleParts.push(`${prop}-top:${boxObj.top}px`);
                    if (boxObj.right !== undefined) styleParts.push(`${prop}-right:${boxObj.right}px`);
                    if (boxObj.bottom !== undefined) styleParts.push(`${prop}-bottom:${boxObj.bottom}px`);
                    if (boxObj.left !== undefined) styleParts.push(`${prop}-left:${boxObj.left}px`);
                    continue;
                }

                // Handle horizontalAlign: converts to margin-left/right auto
                if (prop === 'horizontalAlign' && typeof value === 'string') {
                    if (value === 'center') {
                        styleParts.push('margin-left:auto');
                        styleParts.push('margin-right:auto');
                    } else if (value === 'right') {
                        styleParts.push('margin-left:auto');
                        styleParts.push('margin-right:0');
                    } else {
                        styleParts.push('margin-left:0');
                        styleParts.push('margin-right:auto');
                    }
                    continue;
                }

                // Skip any remaining object values (would become [object Object])
                if (typeof value === 'object') {
                    continue;
                }

                // Convert camelCase to kebab-case for CSS
                const cssKey = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
                styleParts.push(`${cssKey}:${value}`);
            }

            // Check for className in values
            if (values.className) {
                className = [className, values.className].filter(Boolean).join(' ');
            }

            propStyleString = styleParts.join(';');
        }
    }
    // Handle standard style object
    else {
        propStyleString = Object.entries(propStyle)
            .map(([k, v]) => {
                // Convert camelCase to kebab-case if needed, or just trust input
                const key = k.replace(/([A-Z])/g, '-$1').toLowerCase();
                return `${key}:${v}`;
            })
            .join(';');
    }

    const finalStyle = [extraStyle, propStyleString].filter(Boolean).join(';');

    // Include data-fb-props if actionBindings exist (for hover tooltips, etc.)
    const actionBindings = props.actionBindings as Array<unknown> | undefined;
    let propsAttr = actionBindings && actionBindings.length > 0
        ? ` data-fb-props="${escapeHtml(JSON.stringify({ actionBindings }))}"`
        : '';

    const showIf = props['data-show-if'] as string | undefined;
    if (showIf) {
        propsAttr += ` data-show-if="${escapeHtml(showIf)}"`;
    }

    return `id="${id}" class="${className}" style="${finalStyle}"${propsAttr}`;
}

/**
 * Render static components to HTML.
 */
export function renderStaticComponent(
    type: string,
    id: string,
    props: Record<string, unknown>,
    childrenHtml: string
): string {
    switch (type) {
        case 'Text':
            return renderText(id, props);

        case 'Heading':
            return renderHeading(id, props);

        case 'Paragraph':
            return renderParagraph(id, props);

        case 'Image':
            return renderImage(id, props);

        case 'Badge':
            return renderBadge(id, props);

        case 'Divider':
            return renderDivider(id, props);

        case 'Spacer':
            return renderSpacer(id, props);

        case 'Icon':
            return renderIcon(id, props);

        case 'Avatar':
            return renderAvatar(id, props);

        case 'Label':
            return renderLabel(id, props);

        case 'MarkdownContent':
            return renderMarkdown(id, props);

        case 'Embed':
            return renderEmbed(id, props);

        case 'Alert':
            return renderAlert(id, props);

        case 'Progress':
            return renderProgress(id, props);

        case 'Input':
            return renderInput(id, props);

        case 'Textarea':
            return renderTextarea(id, props);

        case 'Select':
            return renderSelect(id, props);

        case 'Breadcrumb':
            return renderBreadcrumb(id, props);

        default:
            // Fallback for unknown static components
            return `<div ${getCommonAttributes(id, 'fb-unknown', props)} data-fb-type="${type}">${childrenHtml}</div>`;
    }
}

// =============================================================================
// Individual Component Renderers
// =============================================================================

function renderText(id: string, props: Record<string, unknown>): string {
    const content = escapeHtml(String(props.content || props.text || props.value || ''));
    const size = props.size as string || 'base';
    const weight = props.weight as string || 'normal';
    const color = props.color as string || 'inherit';
    const align = props.align as string || 'inherit';  // Inherit from parent

    const style = `font-size:var(--fb-text-${size}, 1rem);font-weight:${weight};color:${color};text-align:${align}`;
    const attrs = getCommonAttributes(id, `fb-text fb-text-${size}`, props, style);

    return `<span ${attrs}>${content}</span>`;
}

function renderHeading(id: string, props: Record<string, unknown>): string {
    const content = escapeHtml(String(props.content || props.text || ''));
    // Handle both 'h4' string format and numeric 4 format
    const levelProp = String(props.level || '2').replace(/^h/i, '');
    const level = Math.min(Math.max(Number(levelProp) || 2, 1), 6);
    const align = props.align as string || 'inherit';  // Inherit from parent for centering
    const color = props.color as string || 'inherit';

    const style = `text-align:${align};color:${color}`;
    const tag = `h${level}`;
    const attrs = getCommonAttributes(id, `fb-heading fb-heading-${level}`, props, style);

    return `<${tag} ${attrs}>${content}</${tag}>`;
}

function renderParagraph(id: string, props: Record<string, unknown>): string {
    const content = escapeHtml(String(props.content || props.text || ''));
    const align = props.align as string || 'inherit';  // Inherit from parent
    const color = props.color as string || 'inherit';

    const style = `text-align:${align};color:${color}`;
    const attrs = getCommonAttributes(id, 'fb-paragraph', props, style);

    return `<p ${attrs}>${content}</p>`;
}

function renderImage(id: string, props: Record<string, unknown>): string {
    const src = props.src as string || props.url as string || '';
    const alt = escapeHtml(String(props.alt || ''));
    const width = props.width as string || 'auto';
    const height = props.height as string || 'auto';
    const objectFit = props.objectFit as string || 'cover';
    const borderRadius = props.borderRadius as string || '0';

    const style = `width:${width};height:${height};object-fit:${objectFit};border-radius:${borderRadius}`;
    const attrs = getCommonAttributes(id, 'fb-image', props, style);

    if (!src) {
        const placeholderBackground = props.placeholderBackground as string || '#e5e5e5';
        const placeholderColor = props.placeholderColor as string || '#999';
        return `<div ${attrs} class="fb-image-placeholder" style="${style};background:${placeholderBackground};display:flex;align-items:center;justify-content:center;">
            <span style="color:${placeholderColor}">No image</span>
        </div>`;
    }

    return `<img ${attrs} src="${escapeHtml(src)}" alt="${alt}" loading="lazy" />`;
}

function renderBadge(id: string, props: Record<string, unknown>): string {
    const content = escapeHtml(String(props.content || props.text || props.label || ''));
    const variant = props.variant as string || 'default';
    const size = props.size as string || 'sm';

    // Icon: prefer an explicit publish-time iconSvg, else resolve a lucide name.
    const iconName = (props.icon as string || props.name as string || '');
    const iconSvg = (props.iconSvg as string || '') || lucideSvg(iconName);
    const iconPosition = props.iconPosition as string || 'left';

    // Custom colors from Builder (take precedence over variant)
    const backgroundColor = props.backgroundColor as string || '';
    const textColor = props.textColor as string || '';
    const iconColor = props.iconColor as string || '';

    // Color mapping for variants (fallback if no custom colors)
    const variantStyles: Record<string, { bg: string; text: string }> = {
        default: { bg: '#18181b', text: '#fafafa' },  // Dark style matching Builder
        secondary: { bg: '#f4f4f5', text: '#18181b' },
        destructive: { bg: '#ef4444', text: '#fff' },
        outline: { bg: 'transparent', text: '#18181b' },
        primary: { bg: '#3b82f6', text: '#fff' },
        success: { bg: '#22c55e', text: '#fff' },
        warning: { bg: '#f59e0b', text: '#fff' },
        error: { bg: '#ef4444', text: '#fff' },
        info: { bg: '#0ea5e9', text: '#fff' },
    };

    const variantConfig = variantStyles[variant] || variantStyles.default;
    const bgColor = backgroundColor || variantConfig.bg;
    const txtColor = textColor || variantConfig.text;
    const icnColor = iconColor || txtColor;

    const sizeStyles: Record<string, string> = {
        xs: 'font-size:0.65rem;padding:0.1rem 0.5rem',
        sm: 'font-size:0.75rem;padding:0.25rem 0.625rem',
        md: 'font-size:0.875rem;padding:0.375rem 0.75rem',
        lg: 'font-size:1rem;padding:0.5rem 1rem',
    };

    const outlineStyles = variant === 'outline' ? `border:1px solid ${txtColor};` : '';

    // Externalized geometry — defaults reproduce the prior baked literals byte-for-byte.
    const borderRadius = props.borderRadius as string || '9999px';
    const gap = props.gap as string || '0.375rem';
    const fontWeight = props.fontWeight as string || '500';

    const style = `background:${bgColor};color:${txtColor};${sizeStyles[size] || sizeStyles.sm};border-radius:${borderRadius};display:inline-flex;align-items:center;gap:${gap};font-weight:${fontWeight};width:fit-content;${outlineStyles}`;

    // Build content with icon (apply icon color + size). The product builder sizes
    // badge icons with Tailwind `w-3 h-3` (0.75rem); match it so the resolved
    // lucide SVG (width/height 100%) renders compact, not stretched to the badge.
    const iconStyle = `display:inline-flex;width:0.75rem;height:0.75rem;color:${icnColor}`;
    const leftIcon = iconSvg && iconPosition === 'left' ? `<span class="fb-badge-icon" style="${iconStyle}">${iconSvg}</span>` : '';
    const rightIcon = iconSvg && iconPosition === 'right' ? `<span class="fb-badge-icon" style="${iconStyle}">${iconSvg}</span>` : '';

    // Route through getCommonAttributes so the stylesData surface (props.style.values)
    // is honored on the root span like every other static component. Byte-identical for
    // badges with no stylesData (empirically 0/14 corpus badges carry styles).
    const attrs = getCommonAttributes(id, `fb-badge fb-badge-${variant}`, props, style);

    return `<span ${attrs}>${leftIcon}${content}${rightIcon}</span>`;
}

function renderDivider(id: string, props: Record<string, unknown>): string {
    const orientation = props.orientation as string || 'horizontal';
    const color = props.color as string || '#e5e5e5';
    const thickness = props.thickness as string || '1px';
    const margin = props.margin as string || '1rem 0';

    if (orientation === 'vertical') {
        const style = `width:${thickness};background:${color};margin:${margin};height:100%`;
        const attrs = getCommonAttributes(id, 'fb-divider fb-divider-vertical', props, style);
        return `<div ${attrs}></div>`;
    }

    const style = `border:none;height:${thickness};background:${color};margin:${margin}`;
    const attrs = getCommonAttributes(id, 'fb-divider', props, style);
    return `<hr ${attrs} />`;
}

function renderSpacer(id: string, props: Record<string, unknown>): string {
    const height = props.height as string || props.size as string || '1rem';
    const width = props.width as string || 'auto';

    const style = `height:${height};width:${width}`;
    const attrs = getCommonAttributes(id, 'fb-spacer', props, style);

    return `<div ${attrs} aria-hidden="true"></div>`;
}

function renderIcon(id: string, props: Record<string, unknown>): string {
    const icon = (props.icon || props.name || '⭐') as string;
    const size = props.size as string || 'md';
    const color = props.color as string || 'currentColor';
    const iconSvg = props.iconSvg as string | undefined;

    // Size mapping
    const sizeStyles: Record<string, string> = {
        xs: 'width:1rem;height:1rem;font-size:1rem',
        sm: 'width:1.5rem;height:1.5rem;font-size:1.25rem',
        md: 'width:2rem;height:2rem;font-size:1.5rem',
        lg: 'width:2.5rem;height:2.5rem;font-size:2rem',
        xl: 'width:3rem;height:3rem;font-size:2.5rem',
    };

    const sizeStyle = sizeStyles[size] || sizeStyles.md;

    // Priority 1: Use pre-rendered SVG from publish pipeline (CDN fetch)
    if (iconSvg) {
        const style = `${sizeStyle};display:inline-flex;align-items:center;justify-content:center;color:${color}`;
        const attrs = getCommonAttributes(id, 'fb-icon', props, style);
        // Apply size to SVG - replace only standalone width/height, not stroke-width
        const sizedSvg = iconSvg
            .replace(/(\s)width="[^"]*"/g, `$1width="100%"`)
            .replace(/(\s)height="[^"]*"/g, `$1height="100%"`);
        return `<span ${attrs}>${sizedSvg}</span>`;
    }

    // Priority 1.5: Resolve a lucide-react icon name (e.g. "Zap", "CheckCircle2")
    // to its bundled SVG. The builder stores lucide PascalCase names in props.icon;
    // without this the name renders as literal text (the WYSIWYG gap). LUCIDE_ICONS
    // is generated from the exact lucide-react version the builder ships
    // (scripts/regen-icons.mjs) so published icons match the canvas byte-for-byte.
    const lucide = lucideSvg(icon);
    if (lucide) {
        const style = `${sizeStyle};display:inline-flex;align-items:center;justify-content:center;color:${color}`;
        const attrs = getCommonAttributes(id, 'fb-icon', props, style);
        return `<span ${attrs}>${lucide}</span>`;
    }

    // Priority 2: Check if it's an emoji (short string with no URL characters)
    const isEmoji = icon.length <= 4 && !/^[a-zA-Z0-9\/]/.test(icon);
    // Priority 3: Check if it's an image URL
    const isUrl = icon.startsWith('http') || icon.startsWith('/');

    if (isUrl) {
        const style = `${sizeStyle};object-fit:contain`;
        const attrs = getCommonAttributes(id, 'fb-icon', props, style);
        return `<img ${attrs} src="${escapeHtml(icon)}" alt="" />`;
    }

    // Render as emoji or text icon
    const style = `${sizeStyle};display:inline-flex;align-items:center;justify-content:center;${isEmoji ? '' : `color:${color}`}`;
    const attrs = getCommonAttributes(id, 'fb-icon', props, style);
    return `<span ${attrs}>${escapeHtml(icon)}</span>`;
}


function renderAvatar(id: string, props: Record<string, unknown>): string {
    const src = props.src as string || props.image as string;
    const name = props.name as string || props.alt as string || '';
    const size = props.size as string || '40px';
    const shape = props.shape as string || 'circle';

    // Externalized — defaults reproduce the prior baked literals byte-for-byte.
    const roundedRadius = props.roundedRadius as string || '8px';
    const initialsBg = props.initialsBg as string || '#6366f1';
    const initialsColor = props.initialsColor as string || '#fff';

    const borderRadius = shape === 'circle' ? '50%' : (shape === 'rounded' ? roundedRadius : '0');
    const baseStyle = `width:${size};height:${size};border-radius:${borderRadius};overflow:hidden;display:flex;align-items:center;justify-content:center`;

    // Note: getCommonAttributes will append to baseStyle if we passed it, but we might want to override or merge.
    // Here we pass baseStyle as extraStyle.

    if (src) {
        const attrs = getCommonAttributes(id, 'fb-avatar', props, baseStyle);
        return `<div ${attrs}>
            <img src="${escapeHtml(src)}" alt="${escapeHtml(name)}" style="width:100%;height:100%;object-fit:cover" />
        </div>`;
    }

    // Fallback to initials
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const style = `${baseStyle};background:${initialsBg};color:${initialsColor};font-weight:600;font-size:calc(${size} * 0.4)`;
    const attrs = getCommonAttributes(id, 'fb-avatar fb-avatar-initials', props, style);

    return `<div ${attrs}>
        ${escapeHtml(initials)}
    </div>`;
}

function renderLabel(id: string, props: Record<string, unknown>): string {
    const content = escapeHtml(String(props.content || props.text || ''));
    const htmlFor = props.for as string || props.htmlFor as string || '';
    const required = props.required as boolean;

    // Externalized — defaults reproduce the prior baked literal byte-for-byte.
    const asteriskColor = props.asteriskColor as string || '#ef4444';

    const style = `display:block;font-weight:500;margin-bottom:0.25rem`;
    const attrs = getCommonAttributes(id, 'fb-label', props, style);
    const forAttr = htmlFor ? `for="${htmlFor}"` : '';

    return `<label ${attrs} ${forAttr}>
        ${content}${required ? `<span style="color:${asteriskColor};margin-left:0.25rem">*</span>` : ''}
    </label>`;
}

function renderMarkdown(id: string, props: Record<string, unknown>): string {
    const content = String(props.content || props.markdown || '');
    const attrs = getCommonAttributes(id, 'fb-markdown', props);

    return `<div ${attrs} data-fb-hydrate="markdown">
        <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(content)}</pre>
    </div>`;
}

function renderEmbed(id: string, props: Record<string, unknown>): string {
    const embedType = props.embedType as string || 'iframe';
    const width = props.width as string || '100%';
    const height = props.height as string || '400px';
    const title = escapeHtml(String(props.title || 'Embedded content'));
    const loading = props.loading as string || 'lazy';

    // Externalized — defaults reproduce the prior baked literals byte-for-byte.
    const embedMinHeight = props.minHeight as string || '100px';
    const iframeRadius = props.iframeRadius as string || '8px';
    const iframePlaceholderBg = props.iframePlaceholderBg as string || '#f5f5f5';
    const iframePlaceholderBorder = props.iframePlaceholderBorder as string || '#ccc';
    const iframePlaceholderColor = props.iframePlaceholderColor as string || '#999';
    const scriptPlaceholderBg = props.scriptPlaceholderBg as string || '#fffbeb';
    const scriptPlaceholderBorder = props.scriptPlaceholderBorder as string || '#f59e0b';
    const scriptPlaceholderColor = props.scriptPlaceholderColor as string || '#92400e';

    const containerStyle = `width:${width};height:${height};min-height:${embedMinHeight}`;

    if (embedType === 'iframe') {
        const src = props.src as string || '';
        const sandbox = escapeHtml(String(props.sandbox || 'allow-scripts allow-same-origin allow-forms'));

        if (!src) {
            const attrs = getCommonAttributes(id, 'fb-embed fb-embed-placeholder', props, `${containerStyle};display:flex;align-items:center;justify-content:center;background:${iframePlaceholderBg};border:2px dashed ${iframePlaceholderBorder};border-radius:${iframeRadius}`);
            return `<div ${attrs}><span style="color:${iframePlaceholderColor}">Iframe URL not set</span></div>`;
        }

        const attrs = getCommonAttributes(id, 'fb-embed fb-embed-iframe', props, containerStyle);
        return `<div ${attrs}>
            <iframe
                src="${escapeHtml(src)}"
                title="${title}"
                width="100%"
                height="100%"
                style="border:none;border-radius:${iframeRadius}"
                loading="${loading}"
                sandbox="${sandbox}"
            ></iframe>
        </div>`;
    }

    // Script embed - render the raw HTML (user trusts this content)
    const html = props.html as string || '';
    if (!html) {
        const attrs = getCommonAttributes(id, 'fb-embed fb-embed-placeholder', props, `${containerStyle};display:flex;align-items:center;justify-content:center;background:${scriptPlaceholderBg};border:2px dashed ${scriptPlaceholderBorder};border-radius:${iframeRadius}`);
        return `<div ${attrs}><span style="color:${scriptPlaceholderColor}">Script embed code not set</span></div>`;
    }

    const attrs = getCommonAttributes(id, 'fb-embed fb-embed-script', props, containerStyle);
    // Render raw HTML - we trust user-provided embed codes
    return `<div ${attrs}>${html}</div>`;
}

// =============================================================================
// Form / feedback components (parity with the builder's React renderers).
// Rendered read-only in the builder preview, so the eSSR output mirrors that —
// interactivity arrives via the behaviors runtime, not inline JS. Styled with
// the HSL CSS variables so they track the theme (light/dark) like shadcn.
// =============================================================================

function renderAlert(id: string, props: Record<string, unknown>): string {
    const message = escapeHtml(String(props.message || props.content || props.text || 'This is an alert message.'));
    const variant = props.variant as string || 'default';
    const title = props.title as string;

    // shadcn Alert variants — left accent border + themed background/text.
    const variantStyles: Record<string, { border: string; bg: string; text: string; accent: string }> = {
        default: { border: 'hsl(var(--border))', bg: 'hsl(var(--background))', text: 'hsl(var(--foreground))', accent: 'hsl(var(--foreground))' },
        info: { border: '#0ea5e9', bg: 'hsl(199 89% 94%)', text: '#0c4a6e', accent: '#0ea5e9' },
        success: { border: '#22c55e', bg: 'hsl(138 76% 94%)', text: '#14532d', accent: '#22c55e' },
        warning: { border: '#f59e0b', bg: 'hsl(43 96% 93%)', text: '#78350f', accent: '#f59e0b' },
        destructive: { border: 'hsl(var(--destructive))', bg: 'hsl(var(--destructive) / 0.08)', text: 'hsl(var(--destructive))', accent: 'hsl(var(--destructive))' },
    };
    const v = variantStyles[variant] || variantStyles.default;
    // Externalized — defaults reproduce the prior baked literals byte-for-byte.
    const accentWidth = props.accentWidth as string || '4px';
    const padding = props.padding as string || '1rem';
    const gap = props.gap as string || '0.25rem';
    const titleStyle = props.titleStyle as string || '';
    const descriptionStyle = props.descriptionStyle as string || '';
    const style = `position:relative;width:100%;border-radius:var(--radius,0.5rem);border:1px solid ${v.border};border-left-width:${accentWidth};border-left-color:${v.accent};background:${v.bg};color:${v.text};padding:${padding};display:flex;flex-direction:column;gap:${gap}`;
    const attrs = getCommonAttributes(id, `fb-alert fb-alert-${variant}`, props, style);

    const titleHtml = title ? `<h5 style="font-weight:600;line-height:1.25;margin:0;${titleStyle}">${escapeHtml(String(title))}</h5>` : '';
    const bodyHtml = `<div class="fb-alert-description" style="text-align:left;opacity:0.9;${descriptionStyle}">${message}</div>`;

    return `<div ${attrs} role="alert">${titleHtml}${bodyHtml}</div>`;
}

function renderProgress(id: string, props: Record<string, unknown>): string {
    // Clamp 0–100 like shadcn's Progress (aria-valuenow).
    const raw = Number(props.value);
    const value = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 50;
    const color = props.color as string || 'hsl(var(--primary))';
    const trackColor = props.trackColor as string || 'hsl(var(--secondary))';

    // Externalized — defaults reproduce the prior baked literals byte-for-byte.
    const trackHeight = props.trackHeight as string || '0.75rem';
    const trackRadius = props.trackRadius as string || '9999px';
    const indicatorRadius = props.indicatorRadius as string || '9999px';
    const indicatorTransition = props.indicatorTransition as string || 'width 0.3s ease';

    const style = `position:relative;height:${trackHeight};width:100%;overflow:hidden;border-radius:${trackRadius};background:${trackColor}`;
    const attrs = getCommonAttributes(id, 'fb-progress', props, style);

    return `<div ${attrs} role="progressbar" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="100">
        <div class="fb-progress-indicator" style="height:100%;width:${value}%;background:${color};border-radius:${indicatorRadius};transition:${indicatorTransition}"></div>
    </div>`;
}

function renderInput(id: string, props: Record<string, unknown>): string {
    const placeholder = escapeHtml(String(props.placeholder || 'Enter text...'));
    const type = (props.type as string) || 'text';
    // Externalized — defaults reproduce the prior baked literals byte-for-byte.
    const fieldHeight = props.fieldHeight as string || '2.5rem';
    const fieldPadding = props.fieldPadding as string || '0 0.75rem';
    const fieldFontSize = props.fieldFontSize as string || '0.875rem';
    const style = `display:flex;width:100%;height:${fieldHeight};padding:${fieldPadding};border:1px solid hsl(var(--input));border-radius:var(--radius,0.5rem);font-size:${fieldFontSize};background:hsl(var(--background));color:hsl(var(--foreground))`;
    const attrs = getCommonAttributes(id, 'fb-input', props, style);
    // Mirrors the builder's read-only preview (no client-side value binding yet).
    return `<input ${attrs} type="${escapeHtml(type)}" placeholder="${placeholder}" readonly />`;
}

function renderTextarea(id: string, props: Record<string, unknown>): string {
    const placeholder = escapeHtml(String(props.placeholder || 'Enter text...'));
    const rows = Number(props.rows) || 3;
    // Externalized — defaults reproduce the prior baked literals byte-for-byte.
    const textareaMinHeight = props.textareaMinHeight as string || '5rem';
    const style = `display:flex;width:100%;min-height:${textareaMinHeight};padding:0.5rem 0.75rem;border:1px solid hsl(var(--input));border-radius:var(--radius,0.5rem);font-size:0.875rem;background:hsl(var(--background));color:hsl(var(--foreground));resize:vertical`;
    const attrs = getCommonAttributes(id, 'fb-textarea', props, style);
    return `<textarea ${attrs} rows="${rows}" placeholder="${placeholder}" readonly></textarea>`;
}

function renderSelect(id: string, props: Record<string, unknown>): string {
    const placeholder = escapeHtml(String(props.placeholder || 'Select an option'));
    const options = Array.isArray(props.options) ? props.options : ['Option 1', 'Option 2', 'Option 3'];
    // Externalized — defaults reproduce the prior baked literals byte-for-byte.
    const selectChevronSize = props.selectChevronSize as string || '1rem';
    // Trigger mirrors shadcn SelectTrigger (the builder's preview): border box,
    // placeholder text, chevron. Options are emitted as a closed list so a future
    // behaviors runtime can open them — same shape the builder renders.
    const triggerStyle = `display:flex;height:2.5rem;width:100%;align-items:center;justify-content:space-between;padding:0 0.75rem;border:1px solid hsl(var(--input));border-radius:var(--radius,0.5rem);font-size:0.875rem;background:hsl(var(--background));color:hsl(var(--muted-foreground))`;
    const attrs = getCommonAttributes(id, 'fb-select', props, triggerStyle);
    const chevron = `<svg class="fb-select-chevron" style="width:${selectChevronSize};height:${selectChevronSize};opacity:0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>`;
    const optionItems = options.map((opt) => `<li style="padding:0.5rem 0.75rem;cursor:pointer">${escapeHtml(String(opt))}</li>`).join('');
    return `<div ${attrs} role="combobox" aria-haspopup="listbox" aria-expanded="false">
        <span>${placeholder}</span>${chevron}
        <ul class="fb-select-options" style="display:none;list-style:none;margin:0;padding:0">${optionItems}</ul>
    </div>`;
}

function renderBreadcrumb(id: string, props: Record<string, unknown>): string {
    const items = Array.isArray(props.items)
        ? props.items
        : [{ label: 'Home', href: '/' }, { label: 'Page', href: '/page' }];
    // Externalized — defaults reproduce the prior baked literals byte-for-byte.
    const gap = props.gap as string || '0.5rem';
    const fontSize = props.fontSize as string || '0.875rem';
    const activeFontWeight = props.activeFontWeight as string || '500';
    const separatorOpacity = props.separatorOpacity as string || '0.5';
    const style = `display:flex;align-items:center;gap:${gap};font-size:${fontSize};color:hsl(var(--muted-foreground))`;
    const attrs = getCommonAttributes(id, 'fb-breadcrumb', props, style);

    const parts: string[] = [];
    items.forEach((item: any, index: number) => {
        const isLast = index === items.length - 1;
        const label = escapeHtml(String(item.label ?? ''));
        const href = item.href ? escapeHtml(String(item.href)) : '#';
        const linkStyle = isLast
            ? `font-weight:${activeFontWeight};color:hsl(var(--foreground))`
            : 'text-decoration:none;color:hsl(var(--muted-foreground))';
        parts.push(`<li><a href="${href}" style="${linkStyle}">${label}</a></li>`);
        if (!isLast) {
            parts.push(`<li class="fb-breadcrumb-separator" aria-hidden="true" style="opacity:${separatorOpacity}">/</li>`);
        }
    });

    return `<nav ${attrs} aria-label="breadcrumb"><ol style="display:flex;align-items:center;gap:${gap};list-style:none;margin:0;padding:0">${parts.join('')}</ol></nav>`;
}

// =============================================================================
// Exports for DRY cross-module composition
// =============================================================================
export {
    escapeHtml,
    getCommonAttributes,
    renderIcon,
    renderHeading,
    renderText,
    renderParagraph,
    renderImage,
    renderBadge,
};
