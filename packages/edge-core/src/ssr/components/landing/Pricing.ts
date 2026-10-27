/**
 * Pricing Section Component
 * 
 * Pricing cards with plans, features, and CTAs.
 */

import { escapeHtml } from '../lib/utils.js';
import type { StylesData } from '../lib/styles.js';
import { stylesDataToCSS } from '../lib/styles.js';

export interface PricingPlan {
    name: string;
    price: string;
    period?: string;
    description?: string;
    features: string[];
    ctaText: string;
    ctaLink: string;
    highlighted?: boolean;
    badge?: string;
}

export interface PricingProps {
    title?: string;
    subtitle?: string;
    plans: PricingPlan[];
    showToggle?: boolean;
    anchor?: string;
    hideOnMobile?: boolean;
    hideOnDesktop?: boolean;
}

export function renderPricing(
    id: string,
    props: PricingProps,
    stylesData?: StylesData
): string {
    const sectionClasses = [
        'fb-pricing',
        'py-12',
        'sm:py-16',
        'lg:py-24',
        'bg-muted/50',
        props.hideOnMobile ? 'hidden md:block' : '',
        props.hideOnDesktop ? 'md:hidden' : '',
    ].filter(Boolean).join(' ');

    const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : '';

    // Build header
    const headerHtml = (props.title || props.subtitle) ? `
        <div class="text-center mb-12 sm:mb-16">
            ${props.title ? `<h2 class="text-2xl sm:text-3xl lg:text-4xl font-semibold mb-4">${escapeHtml(props.title)}</h2>` : ''}
            ${props.subtitle ? `<p class="text-lg sm:text-xl text-muted-foreground">${escapeHtml(props.subtitle)}</p>` : ''}
        </div>
    ` : '';

    // Build pricing cards
    const plansHtml = (props.plans || []).map(plan => {
        const cardClasses = [
            'flex',
            'flex-col',
            'p-6',
            'sm:p-8',
            'rounded-xl',
            'border',
            'bg-card',
            plan.highlighted ? 'border-primary shadow-lg ring-1 ring-primary' : '',
        ].filter(Boolean).join(' ');

        const badgeHtml = plan.badge
            ? `<span class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs font-semibold rounded-full bg-primary text-primary-foreground">${escapeHtml(plan.badge)}</span>`
            : '';

        const featuresHtml = plan.features.map(feature => `
            <li class="flex items-center gap-2">
                <svg class="w-5 h-5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span>${escapeHtml(feature)}</span>
            </li>
        `).join('');

        return `
            <div class="${cardClasses} relative">
                ${badgeHtml}
                <div class="mb-6">
                    <h3 class="text-xl font-semibold mb-2">${escapeHtml(plan.name)}</h3>
                    ${plan.description ? `<p class="text-muted-foreground text-sm">${escapeHtml(plan.description)}</p>` : ''}
                </div>
                <div class="mb-6">
                    <span class="text-4xl sm:text-5xl font-bold">${escapeHtml(plan.price)}</span>
                    ${plan.period ? `<span class="text-muted-foreground ml-1">${escapeHtml(plan.period)}</span>` : ''}
                </div>
                <ul class="space-y-3 mb-8 flex-1">
                    ${featuresHtml}
                </ul>
                <a href="${escapeHtml(plan.ctaLink)}" 
                   class="inline-flex items-center justify-center w-full px-6 py-3 rounded-lg ${plan.highlighted ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-input bg-background hover:bg-accent'} font-medium transition-colors">
                    ${escapeHtml(plan.ctaText)}
                </a>
            </div>
        `;
    }).join('');

    const gridCols = props.plans?.length === 2 ? 'lg:grid-cols-2' :
        props.plans?.length === 3 ? 'lg:grid-cols-3' :
            'lg:grid-cols-4';

    return `
        <section id="${props.anchor || id}" class="${sectionClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                ${headerHtml}
                <div class="grid grid-cols-1 gap-6 sm:gap-8 sm:grid-cols-2 ${gridCols} max-w-6xl mx-auto">
                    ${plansHtml}
                </div>
            </div>
        </section>
    `.trim();
}
