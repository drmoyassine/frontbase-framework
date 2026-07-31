/**
 * Interactive Component Renderers
 *
 * Renders components that need client-side interactivity (Button, Tabs, etc.)
 * These are rendered with hydration markers for React to take over.
 */

import { escapeHtml } from './lib/utils.js';
import { resolvePropsStyles } from './lib/attrs.js';

/**
 * Helper to build common attributes (id, class, style, data-*)
 */
function getCommonAttributes(
    id: string,
    baseClass: string,
    props: Record<string, unknown>,
    extraStyle: string,
    hydrateType: string,
    propsJson: string
): string {
    const { className, styleString: propStyleString } = resolvePropsStyles(baseClass, props);
    const finalStyle = [extraStyle, propStyleString].filter(Boolean).join(';');

    const showIf = props['data-show-if'] as string | undefined;
    const showIfAttr = showIf ? ` data-show-if="${escapeHtml(showIf)}"` : '';

    return `id="${id}" class="${className}" style="${finalStyle}" data-fb-hydrate="${hydrateType}" data-fb-props="${escapeHtml(propsJson)}"${showIfAttr}`;
}

/**
 * Render interactive components to HTML with hydration markers.
 */
export function renderInteractiveComponent(
    type: string,
    id: string,
    props: Record<string, unknown>,
    childrenHtml: string
): string {
    // Serialize props for client hydration
    const propsJson = JSON.stringify(props).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    switch (type) {
        case 'Button':
            return renderButton(id, props, propsJson);

        case 'Link':
            return renderLink(id, props, propsJson);

        case 'Tabs':
            return renderTabs(id, props, childrenHtml, propsJson);

        case 'Accordion':
            return renderAccordion(id, props, childrenHtml, propsJson);

        case 'Modal':
            return renderModal(id, props, childrenHtml, propsJson);

        case 'Dropdown':
            return renderDropdown(id, props, childrenHtml, propsJson);

        case 'Toggle':
        case 'Switch':
            return renderToggle(id, props, propsJson);

        case 'Checkbox':
            return renderCheckbox(id, props, propsJson);

        case 'Radio':
            return renderRadio(id, props, propsJson);

        case 'Tooltip':
            return renderTooltip(id, props, childrenHtml, propsJson);

        case 'AuthForm':
            return renderAuthForm(id, props, propsJson);

        default:
            // Fallback for unknown interactive components
            return `<div data-fb-id="${id}" data-fb-type="${type}" data-fb-hydrate="true" data-fb-props="${escapeHtml(propsJson)}">${childrenHtml}</div>`;
    }
}

// =============================================================================
// Individual Component Renderers
// =============================================================================

function renderButton(id: string, props: Record<string, unknown>, propsJson: string): string {
    const label = escapeHtml(String(props.label || props.text || props.children || 'Button'));
    const variant = props.variant as string || 'default';
    const size = props.size as string || 'md';
    const disabled = props.disabled as boolean || false;
    const fullWidth = props.fullWidth as boolean || false;
    const loading = props.loading as boolean || false;

    // Handle action bindings for onClick
    interface ActionBinding {
        trigger: string;
        actionType: 'scrollToSection' | 'openPage' | 'openModal' | 'runWorkflow' | 'setVariable';
        config?: {
            sectionId?: string;
            pageUrl?: string;
            openInNewTab?: boolean;
            modalId?: string;
            variableScope?: string;
            variableName?: string;
            variableValue?: string;
        };
        workflowId?: string | null;
        onSuccess?: {
            type: string;
            message?: string;
            url?: string;
            variableScope?: string;
            variableName?: string;
            resultPath?: string;
        };
    }
    const actionBindings = (props.actionBindings as ActionBinding[]) || [];
    const onClickAction = actionBindings.find(b => b.trigger === 'onClick');

    // Variant styles - matching shadcn/ui button variants
    // Uses CSS variables defined in the SSR HTML head
    const variantStyles: Record<string, string> = {
        default: 'background:hsl(var(--primary));color:hsl(var(--primary-foreground));border:none',
        primary: 'background:hsl(var(--primary));color:hsl(var(--primary-foreground));border:none',
        secondary: 'background:hsl(var(--secondary));color:hsl(var(--secondary-foreground));border:none',
        destructive: 'background:hsl(var(--destructive));color:hsl(var(--destructive-foreground));border:none',
        outline: 'background:transparent;color:hsl(var(--foreground));border:1px solid hsl(var(--border))',
        ghost: 'background:transparent;color:hsl(var(--foreground));border:none',
        link: 'background:transparent;color:hsl(var(--primary));border:none;text-decoration:underline',
    };

    // Size styles
    const sizeStyles: Record<string, string> = {
        xs: 'padding:0.25rem 0.5rem;font-size:0.75rem',
        sm: 'padding:0.375rem 0.75rem;font-size:0.875rem',
        md: 'padding:0.5rem 1rem;font-size:1rem',
        lg: 'padding:0.625rem 1.25rem;font-size:1.125rem',
        xl: 'padding:0.75rem 1.5rem;font-size:1.25rem',
    };

    // Externalized root geometry — defaults reproduce the prior baked literals byte-for-byte.
    const borderRadius = props.borderRadius as string || '0.375rem';
    const fontWeight = props.fontWeight as string || '500';
    const transition = props.transition as string || 'all 0.15s';

    const style = `${variantStyles[variant] || variantStyles.default};${sizeStyles[size] || sizeStyles.md};border-radius:${borderRadius};cursor:pointer;font-weight:${fontWeight};transition:${transition};${fullWidth ? 'width:100%' : 'width:fit-content'};${disabled ? 'opacity:0.5;cursor:not-allowed' : ''}`;

    // Build action-specific attributes
    let actionAttrs = '';

    if (onClickAction) {
        switch (onClickAction.actionType) {
            case 'scrollToSection':
                if (onClickAction.config?.sectionId) {
                    actionAttrs = `data-scroll-to="${escapeHtml(onClickAction.config.sectionId)}"`;
                }
                break;
            case 'openPage':
                if (onClickAction.config?.pageUrl) {
                    const url = escapeHtml(onClickAction.config.pageUrl);
                    const newTab = onClickAction.config.openInNewTab;
                    // Use data attributes for client-side handling
                    actionAttrs = `data-navigate-to="${url}"${newTab ? ' data-navigate-new-tab="true"' : ''}`;
                }
                break;
            case 'setVariable':
                if (onClickAction.config?.variableName) {
                    const scope = escapeHtml(onClickAction.config.variableScope || 'local');
                    const name = escapeHtml(onClickAction.config.variableName);
                    const val = escapeHtml(onClickAction.config.variableValue || '');
                    actionAttrs = `data-action-set-var-scope="${scope}" data-action-set-var-name="${name}" data-action-set-var-value="${val}"`;
                }
                break;
            case 'runWorkflow':
                if (onClickAction.workflowId) {
                    actionAttrs = `data-action-run-workflow="${escapeHtml(onClickAction.workflowId)}"`;
                    if (onClickAction.onSuccess) {
                        actionAttrs += ` data-action-onsuccess="${escapeHtml(onClickAction.onSuccess.type)}"`;
                        if (onClickAction.onSuccess.type === 'toast' && onClickAction.onSuccess.message) {
                            actionAttrs += ` data-action-onsuccess-toast-message="${escapeHtml(onClickAction.onSuccess.message)}"`;
                        } else if (onClickAction.onSuccess.type === 'redirect' && onClickAction.onSuccess.url) {
                            actionAttrs += ` data-action-onsuccess-redirect-url="${escapeHtml(onClickAction.onSuccess.url)}"`;
                        } else if (onClickAction.onSuccess.type === 'setVariable') {
                            actionAttrs += ` data-action-onsuccess-var-scope="${escapeHtml(onClickAction.onSuccess.variableScope || 'local')}"`;
                            actionAttrs += ` data-action-onsuccess-var-name="${escapeHtml(onClickAction.onSuccess.variableName || '')}"`;
                            actionAttrs += ` data-action-onsuccess-result-path="${escapeHtml(onClickAction.onSuccess.resultPath || '')}"`;
                        }
                    }
                }
                break;
        }
    }

    // Note: We use getCommonAttributes to handle className and extra styles
    const attrs = getCommonAttributes(id, `fb-button fb-button-${variant}`, props, style, 'button', propsJson);

    // Externalized loading indicator — defaults reproduce the prior baked literal byte-for-byte.
    const loadingIndicator = props.loadingIndicator as string || '⏳';
    const loadingGap = props.loadingGap as string || '0.5rem';

    return `<button ${attrs} ${actionAttrs} ${disabled ? 'disabled' : ''}>
        ${loading ? `<span class="fb-spinner" style="margin-right:${loadingGap}">${loadingIndicator}</span>` : ''}
        ${label}
    </button>`;
}

function renderLink(id: string, props: Record<string, unknown>, propsJson: string): string {
    const text = escapeHtml(String(props.text || props.label || props.children || 'Link'));
    const href = escapeHtml(String(props.href || props.to || '#'));
    const target = props.target as string || '_self';
    const color = props.color as string || '#3b82f6';
    const underline = props.underline !== false;

    const style = `color:${color};${underline ? 'text-decoration:underline' : 'text-decoration:none'};cursor:pointer`;
    const attrs = getCommonAttributes(id, 'fb-link', props, style, 'link', propsJson);

    return `<a ${attrs} href="${href}" target="${target}">${text}</a>`;
}

function renderTabs(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const tabs = props.tabs as Array<{ id: string; label: string; content?: string }> || [];
    const activeTab = props.activeTab as string || (tabs[0]?.id ?? '');
    const variant = props.variant as string || 'default';

    // Externalized child hexes — defaults reproduce the prior baked literals byte-for-byte.
    const activeColor = props.activeColor as string || '#3b82f6';
    const inactiveColor = props.inactiveColor as string || '#6b7280';
    const borderColor = props.borderColor as string || '#e5e7eb';

    // Render tab buttons
    const tabButtons = tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const activeStyle = isActive ? `border-bottom:2px solid ${activeColor};color:${activeColor}` : `border-bottom:2px solid transparent;color:${inactiveColor}`;
        return `<button class="fb-tab-button" data-tab-id="${tab.id}" style="padding:0.5rem 1rem;background:none;border:none;${activeStyle};cursor:pointer;font-weight:500">${escapeHtml(tab.label)}</button>`;
    }).join('');

    // Render tab panels
    const tabPanels = tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return `<div class="fb-tab-panel" data-tab-id="${tab.id}" style="${isActive ? '' : 'display:none'};padding:1rem 0">${tab.content ? escapeHtml(String(tab.content)) : ''}</div>`;
    }).join('');

    const attrs = getCommonAttributes(id, `fb-tabs fb-tabs-${variant}`, props, '', 'tabs', propsJson);

    return `<div ${attrs}>
        <div class="fb-tabs-list" style="display:flex;border-bottom:1px solid ${borderColor};margin-bottom:1rem">${tabButtons}</div>
        <div class="fb-tabs-content">${tabPanels}${childrenHtml}</div>
    </div>`;
}

function renderAccordion(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const items = props.items as Array<{ id: string; title: string; content?: string }> || [];
    const allowMultiple = props.allowMultiple as boolean || false;
    const openItems = (props.openItems as string[]) || [];

    // Externalized child hex — default reproduces the prior baked literal byte-for-byte.
    const borderColor = props.borderColor as string || '#e5e7eb';

    const accordionItems = items.map((item) => {
        const isOpen = openItems.includes(item.id);
        return `<div class="fb-accordion-item" data-accordion-id="${item.id}" style="border:1px solid ${borderColor};margin-bottom:-1px">
            <button class="fb-accordion-trigger" style="width:100%;padding:1rem;display:flex;justify-content:space-between;align-items:center;background:none;border:none;cursor:pointer;font-weight:500;text-align:left">
                ${escapeHtml(item.title)}
                <span style="transform:rotate(${isOpen ? '180deg' : '0deg'});transition:transform 0.2s">▼</span>
            </button>
            <div class="fb-accordion-content" style="${isOpen ? '' : 'display:none'};padding:1rem;border-top:1px solid ${borderColor}">${item.content ? escapeHtml(String(item.content)) : ''}</div>
        </div>`;
    }).join('');

    const attrs = getCommonAttributes(id, 'fb-accordion', props, '', 'accordion', propsJson);

    return `<div ${attrs} data-allow-multiple="${allowMultiple}">
        ${accordionItems}${childrenHtml}
    </div>`;
}

function renderModal(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const title = escapeHtml(String(props.title || ''));
    const isOpen = props.isOpen as boolean || false;
    const size = props.size as string || 'md';

    const sizeWidths: Record<string, string> = {
        sm: '400px',
        md: '500px',
        lg: '700px',
        xl: '900px',
        full: '95vw',
    };

    // Externalized child hexes — defaults reproduce the prior baked literals byte-for-byte.
    const scrimColor = props.scrimColor as string || 'rgba(0,0,0,0.5)';
    const contentBg = props.contentBg as string || '#fff';
    const borderColor = props.borderColor as string || '#e5e7eb';

    const style = `display:${isOpen ? 'flex' : 'none'};position:fixed;inset:0;background:${scrimColor};align-items:center;justify-content:center;z-index:1000`;
    const attrs = getCommonAttributes(id, 'fb-modal', props, style, 'modal', propsJson);

    return `<div ${attrs}>
        <div class="fb-modal-content" style="background:${contentBg};border-radius:0.5rem;width:${sizeWidths[size] || sizeWidths.md};max-height:90vh;overflow:auto">
            ${title ? `<div class="fb-modal-header" style="padding:1rem;border-bottom:1px solid ${borderColor};display:flex;justify-content:space-between;align-items:center">
                <h3 style="margin:0;font-size:1.125rem">${title}</h3>
                <button class="fb-modal-close" style="background:none;border:none;font-size:1.5rem;cursor:pointer;line-height:1">×</button>
            </div>` : ''}
            <div class="fb-modal-body" style="padding:1rem">${childrenHtml}</div>
        </div>
    </div>`;
}

function renderDropdown(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const label = escapeHtml(String(props.label || props.trigger || 'Menu'));
    const items = props.items as Array<{ id: string; label: string; icon?: string }> || [];

    const menuItems = items.map((item) => {
        return `<button class="fb-dropdown-item" data-item-id="${item.id}" style="width:100%;padding:0.5rem 1rem;text-align:left;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:0.5rem">
            ${item.icon ? `<span class="fb-dropdown-icon">${escapeHtml(item.icon)}</span>` : ''}
            ${escapeHtml(item.label)}
        </button>`;
    }).join('');

    const style = `position:relative;display:inline-block`;
    const attrs = getCommonAttributes(id, 'fb-dropdown', props, style, 'dropdown', propsJson);

    // Externalized child hexes — defaults reproduce the prior baked literals byte-for-byte.
    const triggerBg = props.triggerBg as string || '#f3f4f6';
    const triggerBorder = props.triggerBorder as string || '#d1d5db';
    const menuBg = props.menuBg as string || '#fff';
    const menuBorder = props.menuBorder as string || '#e5e7eb';

    return `<div ${attrs}>
        <button class="fb-dropdown-trigger" style="padding:0.5rem 1rem;background:${triggerBg};border:1px solid ${triggerBorder};border-radius:0.375rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem">
            ${label}
            <span>▼</span>
        </button>
        <div class="fb-dropdown-menu" style="display:none;position:absolute;top:100%;left:0;min-width:160px;background:${menuBg};border:1px solid ${menuBorder};border-radius:0.375rem;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:100">
            ${menuItems}${childrenHtml}
        </div>
    </div>`;
}

function renderToggle(id: string, props: Record<string, unknown>, propsJson: string): string {
    const checked = props.checked as boolean || props.value as boolean || false;
    const label = escapeHtml(String(props.label || ''));
    const disabled = props.disabled as boolean || false;

    const style = `display:inline-flex;align-items:center;gap:0.5rem;cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? '0.5' : '1'}`;
    const attrs = getCommonAttributes(id, 'fb-toggle', props, style, 'toggle', propsJson);

    // Externalized child hexes — defaults reproduce the prior baked literals byte-for-byte.
    const trackOn = props.trackOn as string || '#3b82f6';
    const trackOff = props.trackOff as string || '#d1d5db';

    return `<label ${attrs}>
        <span class="fb-toggle-track" style="position:relative;width:44px;height:24px;background:${checked ? trackOn : trackOff};border-radius:9999px;transition:background 0.2s">
            <span class="fb-toggle-thumb" style="position:absolute;top:2px;left:${checked ? '22px' : '2px'};width:20px;height:20px;background:#fff;border-radius:50%;transition:left 0.2s;box-shadow:0 1px 3px rgba(0,0,0,0.2)"></span>
        </span>
        ${label ? `<span>${label}</span>` : ''}
        <input type="checkbox" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} style="position:absolute;opacity:0;pointer-events:none" />
    </label>`;
}

function renderCheckbox(id: string, props: Record<string, unknown>, propsJson: string): string {
    const checked = props.checked as boolean || props.value as boolean || false;
    const label = escapeHtml(String(props.label || ''));
    const disabled = props.disabled as boolean || false;

    const style = `display:inline-flex;align-items:center;gap:0.5rem;cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? '0.5' : '1'}`;
    const attrs = getCommonAttributes(id, 'fb-checkbox', props, style, 'checkbox', propsJson);

    // Externalized child hexes — defaults reproduce the prior baked literals byte-for-byte.
    const boxOn = props.boxOn as string || '#3b82f6';
    const boxOff = props.boxOff as string || '#d1d5db';
    const checkColor = props.checkColor as string || '#fff';

    return `<label ${attrs}>
        <span class="fb-checkbox-box" style="width:18px;height:18px;border:2px solid ${checked ? boxOn : boxOff};border-radius:0.25rem;background:${checked ? boxOn : 'transparent'};display:flex;align-items:center;justify-content:center">
            ${checked ? `<span style="color:${checkColor};font-size:12px">✓</span>` : ''}
        </span>
        ${label ? `<span>${label}</span>` : ''}
        <input type="checkbox" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} style="position:absolute;opacity:0;pointer-events:none" />
    </label>`;
}

function renderRadio(id: string, props: Record<string, unknown>, propsJson: string): string {
    const checked = props.checked as boolean || props.selected as boolean || false;
    const label = escapeHtml(String(props.label || ''));
    const name = props.name as string || 'radio-group';
    const disabled = props.disabled as boolean || false;

    const style = `display:inline-flex;align-items:center;gap:0.5rem;cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? '0.5' : '1'}`;
    const attrs = getCommonAttributes(id, 'fb-radio', props, style, 'radio', propsJson);

    // Externalized child hexes — defaults reproduce the prior baked literals byte-for-byte.
    const circleOn = props.circleOn as string || '#3b82f6';
    const circleOff = props.circleOff as string || '#d1d5db';

    return `<label ${attrs}>
        <span class="fb-radio-circle" style="width:18px;height:18px;border:2px solid ${checked ? circleOn : circleOff};border-radius:50%;display:flex;align-items:center;justify-content:center">
            ${checked ? `<span style="width:10px;height:10px;background:${circleOn};border-radius:50%"></span>` : ''}
        </span>
        ${label ? `<span>${label}</span>` : ''}
        <input type="radio" name="${name}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} style="position:absolute;opacity:0;pointer-events:none" />
    </label>`;
}

function renderTooltip(id: string, props: Record<string, unknown>, childrenHtml: string, propsJson: string): string {
    const content = escapeHtml(String(props.content || props.text || ''));
    const position = props.position as string || 'top';

    const style = `position:relative;display:inline-block`;
    const attrs = getCommonAttributes(id, 'fb-tooltip', props, style, 'tooltip', propsJson);

    // Externalized child hexes — defaults reproduce the prior baked literals byte-for-byte.
    const tooltipBg = props.tooltipBg as string || '#1f2937';
    const tooltipColor = props.tooltipColor as string || '#fff';

    // Tooltip content is hidden by default, shown on hover via CSS/JS
    return `<span ${attrs}>
        ${childrenHtml}
        <span class="fb-tooltip-content" data-position="${position}" style="display:none;position:absolute;background:${tooltipBg};color:${tooltipColor};padding:0.25rem 0.5rem;border-radius:0.25rem;font-size:0.75rem;white-space:nowrap;z-index:100">${content}</span>
    </span>`;
}

function renderAuthForm(id: string, props: Record<string, unknown>, propsJson: string): string {
    const formType = props.type as string || 'both';
    const title = escapeHtml(String(props.title || (formType === 'signup' ? 'Create an Account' : 'Sign In')));
    const description = escapeHtml(String(props.description || ''));
    const primaryColor = props.primaryColor as string || '#18181b';
    const providers = (props.providers as string[]) || [];
    const showToggle = formType === 'both';
    const defaultIsLogin = formType !== 'signup';

    // Externalized palette/geometry — defaults reproduce the prior baked literals byte-for-byte.
    const containerMaxWidth = props.containerMaxWidth as string || '400px';
    const fieldBorder = props.fieldBorder as string || '#d4d4d8';
    const labelColor = props.labelColor as string || '#374151';
    const titleColor = props.titleColor as string || '#18181b';
    const descriptionColor = props.descriptionColor as string || '#71717a';
    const dividerColor = props.dividerColor as string || '#e4e4e7';
    const dividerTextColor = props.dividerTextColor as string || '#a1a1aa';
    const errorBg = props.errorBg as string || '#fef2f2';
    const errorBorder = props.errorBorder as string || '#fecaca';
    const errorText = props.errorText as string || '#dc2626';
    const toggleTextColor = props.toggleTextColor as string || '#71717a';

    const socialButtons = providers.map(p => {
        const name = p.charAt(0).toUpperCase() + p.slice(1);
        return `<button type="button" class="fb-social-btn" data-provider="${p}" style="width:100%;padding:0.5rem;background:#fff;border:1px solid ${fieldBorder};border-radius:0.375rem;font-size:0.8125rem;cursor:pointer">Continue with ${name}</button>`;
    }).join('');

    const attrs = getCommonAttributes(id, 'fb-auth-form', props, '', 'authform', propsJson);

    return `<div ${attrs}>
        <div style="max-width:${containerMaxWidth};margin:0 auto;padding:2rem">
            <h2 style="margin:0 0 0.25rem;font-size:1.5rem;font-weight:700;color:${titleColor};text-align:center">${title}</h2>
            ${description ? `<p style="margin:0 0 1.5rem;color:${descriptionColor};font-size:0.875rem;text-align:center">${description}</p>` : '<div style="margin-bottom:1.5rem"></div>'}
            ${providers.length > 0 ? `
                <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1rem">${socialButtons}</div>
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">
                    <div style="flex:1;height:1px;background:${dividerColor}"></div>
                    <span style="color:${dividerTextColor};font-size:0.75rem;text-transform:uppercase">or</span>
                    <div style="flex:1;height:1px;background:${dividerColor}"></div>
                </div>
            ` : ''}
            <div id="${id}-error" style="display:none;background:${errorBg};border:1px solid ${errorBorder};color:${errorText};padding:0.625rem;border-radius:0.375rem;font-size:0.8125rem;margin-bottom:0.75rem"></div>
            <form id="${id}-form" style="display:flex;flex-direction:column;gap:0.75rem">
                <div>
                    <label style="display:block;font-size:0.8125rem;font-weight:500;color:${labelColor};margin-bottom:0.25rem">Email</label>
                    <input type="email" required autocomplete="email" placeholder="you@example.com"
                        style="width:100%;padding:0.5rem 0.75rem;border:1px solid ${fieldBorder};border-radius:0.375rem;font-size:0.875rem;outline:none;box-sizing:border-box" />
                </div>
                <div>
                    <label style="display:block;font-size:0.8125rem;font-weight:500;color:${labelColor};margin-bottom:0.25rem">Password</label>
                    <input type="password" required autocomplete="${defaultIsLogin ? 'current-password' : 'new-password'}" placeholder="••••••••" minlength="6"
                        style="width:100%;padding:0.5rem 0.75rem;border:1px solid ${fieldBorder};border-radius:0.375rem;font-size:0.875rem;outline:none;box-sizing:border-box" />
                </div>
                <button type="submit"
                    style="width:100%;padding:0.625rem;background:${primaryColor};color:#fff;border:none;border-radius:0.375rem;font-size:0.875rem;font-weight:600;cursor:pointer">
                    ${defaultIsLogin ? 'Sign In' : 'Sign Up'}
                </button>
            </form>
            ${showToggle ? `
                <p style="text-align:center;margin-top:1rem;font-size:0.8125rem;color:${toggleTextColor}">
                    ${defaultIsLogin ? "Don't have an account?" : 'Already have an account?'}
                    <a href="#" style="color:${primaryColor};font-weight:500;text-decoration:none;margin-left:0.25rem" data-fb-toggle-auth>${defaultIsLogin ? 'Sign Up' : 'Sign In'}</a>
                </p>
            ` : ''}
        </div>
    </div>`;
}
