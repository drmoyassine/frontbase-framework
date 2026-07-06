/**
 * Features Section Component
 * 
 * Grid of feature cards with icons, titles, and descriptions.
 * Uses Card component for DRY Lego-style composition.
 */

import { escapeHtml } from '../lib/utils.js';
import type { StylesData } from '../lib/styles.js';
import { stylesDataToCSS } from '../lib/styles.js';
import { renderDataComponent } from '../data.js';

export interface FeatureItem {
    id?: string;
    icon: string;
    iconSvg?: string;  // Pre-rendered SVG from publish pipeline (CDN fetch)
    title: string;
    description: string;
    link?: string;
    cardBackground?: string;
}

export interface FeaturesProps {
    title?: string;
    subtitle?: string;
    features?: FeatureItem[];
    columns?: 2 | 3 | 4 | number;
    headerAlignment?: 'left' | 'center' | 'right';
    iconAlignment?: 'left' | 'center' | 'right';
    textAlignment?: 'left' | 'center' | 'right';
    iconSize?: 'sm' | 'md' | 'lg';
    iconColor?: string;
    textColor?: string;
    cardBackground?: string;
    sectionBackground?: string;
    hideOnMobile?: boolean;
    hideOnDesktop?: boolean;
    /** Custom anchor slug for the section (e.g., "features" for #features URL) */
    anchor?: string;
}

export function renderFeatures(
    id: string,
    props: FeaturesProps,
    stylesData?: StylesData
): string {
    const columns = props.columns || 3;
    const headerAlignment = props.headerAlignment || 'center';
    const iconAlignment = props.iconAlignment || 'center';
    const textAlignment = props.textAlignment || 'center';
    const iconSize = props.iconSize || 'md';
    const iconColor = props.iconColor || 'hsl(var(--primary))';
    const cardBackground = props.cardBackground || 'hsl(var(--card))';
    const sectionBackground = props.sectionBackground || 'hsl(var(--background))';

    // Build classes
    const sectionClasses = [
        'fb-features',
        'py-16',
        'px-6',
        'md:px-12',
        props.hideOnMobile ? 'hidden md:block' : '',
        props.hideOnDesktop ? 'md:hidden' : '',
    ].filter(Boolean).join(' ');

    const gridClasses = [
        'grid',
        'grid-cols-1',
        'gap-6',
        'md:gap-8',
        columns === 2 ? 'md:grid-cols-2' : '',
        columns === 3 ? 'md:grid-cols-2 lg:grid-cols-3' : '',
        columns >= 4 ? 'md:grid-cols-2 lg:grid-cols-4' : '',
    ].filter(Boolean).join(' ');

    const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : '';

    // Build header
    const headerHtml = (props.title || props.subtitle) ? `
        <div class="mb-12" style="text-align: ${headerAlignment};">
            ${props.title ? `<h2 class="text-3xl md:text-4xl font-bold mb-3">${escapeHtml(props.title)}</h2>` : ''}
            ${props.subtitle ? `<p class="text-lg text-muted-foreground">${escapeHtml(props.subtitle)}</p>` : ''}
        </div>
    ` : '';

    // Build feature cards using DRY Card component
    const featuresHtml = (props.features || []).map((feature, index) => {
        const featureId = feature.id || `${id}-feature-${index}`;

        // Prepare props for Card component
        const cardProps = {
            title: feature.title,
            description: feature.description,
            icon: feature.icon,
            iconSvg: feature.iconSvg,
            iconSize: iconSize,
            iconColor: iconColor,
            iconAlignment: iconAlignment,
            textAlignment: textAlignment,
            // Card styling - use feature-specific or section default
            style: {
                values: {
                    backgroundColor: feature.cardBackground || cardBackground,
                    padding: '1.5rem',
                    borderRadius: '0.75rem',
                }
            }
        };

        // Wrap in link if provided
        if (feature.link) {
            return `
                <a href="${escapeHtml(feature.link)}" class="block transition-all duration-300 hover:shadow-lg">
                    ${renderDataComponent('Card', featureId, cardProps, '')}
                </a>
            `;
        }

        return renderDataComponent('Card', featureId, cardProps, '');
    }).join('');

    return `
        <section id="${props.anchor || id}" class="${sectionClasses}" style="background-color: ${sectionBackground}; ${inlineStyles}">
            <div class="fb-container">
                ${headerHtml}
                <div class="${gridClasses}">
                    ${featuresHtml}
                </div>
            </div>
        </section>
    `.trim();
}

