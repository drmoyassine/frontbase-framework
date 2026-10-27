/**
 * CTA Section Component
 * 
 * Call-to-action banner with title, subtitle, and button.
 */

import { escapeHtml } from '../lib/utils.js';
import type { StylesData } from '../lib/styles.js';
import { stylesDataToCSS } from '../lib/styles.js';

export interface CTAProps {
    title: string;
    subtitle?: string;
    ctaText: string;
    ctaLink: string;
    secondaryCtaText?: string;
    secondaryCtaLink?: string;
    background?: string;
    anchor?: string;
    hideOnMobile?: boolean;
    hideOnDesktop?: boolean;
}

export function renderCTA(
    id: string,
    props: CTAProps,
    stylesData?: StylesData
): string {
    const sectionClasses = [
        'fb-cta',
        'py-12',
        'sm:py-16',
        'lg:py-24',
        props.hideOnMobile ? 'hidden md:block' : '',
        props.hideOnDesktop ? 'md:hidden' : '',
    ].filter(Boolean).join(' ');

    const baseStyles: string[] = [];
    if (props.background) {
        baseStyles.push(`background: ${props.background}`);
    }

    const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : '';
    const combinedStyles = [...baseStyles, inlineStyles].filter(Boolean).join('; ');

    const secondaryCtaHtml = props.secondaryCtaText
        ? `<a href="${escapeHtml(props.secondaryCtaLink || '#')}" 
             class="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-input bg-background hover:bg-accent font-medium transition-colors">
             ${escapeHtml(props.secondaryCtaText)}
           </a>`
        : '';

    return `
        <section id="${props.anchor || id}" class="${sectionClasses}" style="${combinedStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="rounded-2xl bg-card border p-8 sm:p-12 lg:p-16 shadow-lg">
                    <div class="flex flex-col lg:flex-row items-center justify-between gap-8">
                        <div class="text-center lg:text-left max-w-2xl">
                            <h2 class="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4">${escapeHtml(props.title)}</h2>
                            ${props.subtitle ? `<p class="text-lg text-muted-foreground">${escapeHtml(props.subtitle)}</p>` : ''}
                        </div>
                        <div class="flex flex-wrap items-center gap-4">
                            <a href="${escapeHtml(props.ctaLink)}" 
                               class="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
                                ${escapeHtml(props.ctaText)}
                            </a>
                            ${secondaryCtaHtml}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `.trim();
}
