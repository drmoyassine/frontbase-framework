/**
 * FAQ Section Component
 * 
 * Frequently asked questions with accordion.
 */

import { escapeHtml } from '../lib/utils.js';
import type { StylesData } from '../lib/styles.js';
import { stylesDataToCSS } from '../lib/styles.js';

export interface FAQItem {
    question: string;
    answer: string;
}

export interface FAQProps {
    title?: string;
    subtitle?: string;
    items: FAQItem[];
    anchor?: string;
    hideOnMobile?: boolean;
    hideOnDesktop?: boolean;
}

export function renderFAQ(
    id: string,
    props: FAQProps,
    stylesData?: StylesData
): string {
    const sectionClasses = [
        'fb-faq',
        'py-12',
        'sm:py-16',
        'lg:py-24',
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

    // Build accordion items
    const itemsHtml = (props.items || []).map((item, index) => `
        <div class="border-b" data-fb-accordion-item>
            <button type="button" 
                    class="flex items-center justify-between w-full py-4 text-left font-medium hover:text-primary transition-colors"
                    data-fb-accordion-trigger>
                <span class="text-lg">${escapeHtml(item.question)}</span>
                <svg class="w-5 h-5 shrink-0 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-fb-accordion-icon>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </button>
            <div class="pb-4 hidden" data-fb-accordion-content>
                <p class="text-muted-foreground">${escapeHtml(item.answer)}</p>
            </div>
        </div>
    `).join('');

    return `
        <section id="${props.anchor || id}" class="${sectionClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                ${headerHtml}
                <div class="max-w-3xl mx-auto" data-fb-accordion>
                    ${itemsHtml}
                </div>
            </div>
        </section>
    `.trim();
}
