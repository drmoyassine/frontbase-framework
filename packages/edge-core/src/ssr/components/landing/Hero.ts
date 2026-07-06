/**
 * Hero Section Component
 * 
 * Landing page hero with headline, subtitle, and CTAs.
 * Uses DRY primitives from static.ts for Lego-style composition.
 */

import { escapeHtml } from '../lib/utils.js';
import type { StylesData } from '../lib/styles.js';
import { stylesDataToCSS } from '../lib/styles.js';
import { renderBadge, renderHeading, renderParagraph } from '../static.js';

export interface HeroBadgeConfig {
    text: string;
    icon?: string;
    iconSvg?: string;
    backgroundColor?: string;
    textColor?: string;
    iconColor?: string;
    variant?: string;
}


export interface ActionBinding {
    trigger: string;
    actionType: 'scrollToSection' | 'openPage' | 'openModal' | 'runWorkflow';
    config?: {
        sectionId?: string;
        pageUrl?: string;
        openInNewTab?: boolean;
        modalId?: string;
    };
}

export interface HeroProps {
    title: string;
    subtitle?: string;
    badge?: string | HeroBadgeConfig;
    ctaText?: string;
    ctaLink?: string;
    ctaActionBindings?: ActionBinding[]; // Support action bindings on primary CTA
    secondaryCtaText?: string;
    secondaryCtaLink?: string;
    secondaryCtaActionBindings?: ActionBinding[]; // Support action bindings on secondary CTA
    backgroundImage?: string;
    backgroundGradient?: string;
    alignment?: 'left' | 'center' | 'right';
    minHeight?: string;
    hideOnMobile?: boolean;
    hideOnDesktop?: boolean;
}

export function renderHero(
    id: string,
    props: HeroProps,
    stylesData?: StylesData
): string {
    const alignment = props.alignment || 'center';
    const minHeight = props.minHeight || '60vh';

    // Build classes
    const sectionClasses = [
        'fb-hero',
        'relative',
        'flex',
        'items-center',
        'overflow-hidden',
        props.hideOnMobile ? 'hidden md:flex' : '',
        props.hideOnDesktop ? 'md:hidden' : '',
    ].filter(Boolean).join(' ');

    const contentClasses = [
        'container',
        'mx-auto',
        'px-4',
        'sm:px-6',
        'lg:px-8',
        'py-12',
        'sm:py-16',
        'lg:py-24',
        alignment === 'center' ? 'text-center' : '',
        alignment === 'right' ? 'text-right' : '',
    ].filter(Boolean).join(' ');

    const ctaContainerClasses = [
        'flex',
        'gap-4',
        'mt-8',
        alignment === 'center' ? 'justify-center' : '',
        alignment === 'right' ? 'justify-end' : '',
    ].filter(Boolean).join(' ');

    // Build styles
    const baseStyles: string[] = [`min-height: ${minHeight}`];

    if (props.backgroundImage) {
        baseStyles.push(`background-image: url('${props.backgroundImage}')`);
        baseStyles.push('background-size: cover');
        baseStyles.push('background-position: center');
    }

    if (props.backgroundGradient) {
        baseStyles.push(`background: ${props.backgroundGradient}`);
    }

    const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : '';
    const combinedStyles = [...baseStyles, inlineStyles].filter(Boolean).join('; ');

    // Build Badge using DRY primitive
    let badgeHtml = '';
    if (props.badge) {
        const badgeConfig = typeof props.badge === 'string'
            ? { text: props.badge }
            : props.badge;

        badgeHtml = `<div class="mb-6" style="display:flex;${alignment === 'center' ? 'justify-content:center' : alignment === 'right' ? 'justify-content:flex-end' : ''}">${renderBadge(`${id}-badge`, {
            text: badgeConfig.text,
            icon: badgeConfig.icon,
            iconSvg: badgeConfig.iconSvg,
            backgroundColor: badgeConfig.backgroundColor,
            textColor: badgeConfig.textColor,
            iconColor: badgeConfig.iconColor,
            variant: badgeConfig.variant || 'secondary',
        })
            }</div>`;
    }

    // Build Title using DRY primitive
    const titleHtml = `<div class="mb-4 sm:mb-6">${renderHeading(`${id}-title`, {
        text: props.title,
        level: 1,
        align: alignment,
        className: 'text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight text-foreground',
    })}</div>`;

    // Build Subtitle using DRY primitive
    const subtitleHtml = props.subtitle
        ? `<div class="mb-6 sm:mb-8 ${alignment === 'center' ? 'max-w-2xl mx-auto' : 'max-w-2xl'}">${renderParagraph(`${id}-subtitle`, {
            text: props.subtitle,
            align: alignment,
            className: 'text-lg sm:text-xl text-muted-foreground',
        })}</div>`
        : '';

    // CTA buttons - support both href and actionBindings
    const renderCtaButton = (text: string | undefined, link: string | undefined, actionBindings: ActionBinding[] | undefined, isPrimary: boolean): string => {
        if (!text) return '';

        const baseClasses = isPrimary
            ? 'inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors'
            : 'inline-flex items-center justify-center px-6 py-3 rounded-lg border border-input bg-background hover:bg-accent hover:text-accent-foreground font-medium transition-colors';

        // Check for action bindings
        const onClickAction = actionBindings?.find(b => b.trigger === 'onClick');

        if (onClickAction?.actionType === 'scrollToSection' && onClickAction.config?.sectionId) {
            // Render as button with data-scroll-to
            return `<button data-scroll-to="${escapeHtml(onClickAction.config.sectionId)}" 
                     class="${baseClasses}">
                     ${escapeHtml(text)}
                   </button>`;
        }

        if (onClickAction?.actionType === 'openPage' && onClickAction.config?.pageUrl) {
            // Render as link with proper target
            const target = onClickAction.config.openInNewTab ? '_blank' : '_self';
            const rel = onClickAction.config.openInNewTab ? 'noopener noreferrer' : '';
            return `<a href="${escapeHtml(onClickAction.config.pageUrl)}" 
                     target="${target}" ${rel ? `rel="${rel}"` : ''}
                     class="${baseClasses}">
                     ${escapeHtml(text)}
                   </a>`;
        }

        // Fallback to ctaLink
        return `<a href="${escapeHtml(link || '#')}" 
                 class="${baseClasses}">
                 ${escapeHtml(text)}
               </a>`;
    };

    const primaryCtaHtml = renderCtaButton(props.ctaText, props.ctaLink, props.ctaActionBindings || (props as any).actionBindings, true);
    const secondaryCtaHtml = renderCtaButton(props.secondaryCtaText, props.secondaryCtaLink, props.secondaryCtaActionBindings, false);

    const ctaContainerHtml = (props.ctaText || props.secondaryCtaText)
        ? `<div class="${ctaContainerClasses}">${primaryCtaHtml}${secondaryCtaHtml}</div>`
        : '';

    return `
        <section id="${(props as any).anchor || id}" class="${sectionClasses}" style="${combinedStyles}">
            <div class="${contentClasses}">
                ${badgeHtml}
                ${titleHtml}
                ${subtitleHtml}
                ${ctaContainerHtml}
            </div>
        </section>
    `.trim();
}

