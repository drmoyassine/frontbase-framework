/**
 * Logo Cloud Component
 * 
 * Supports uniform or individual scaling of logos.
 * Now supports 'scale' property per logo.
 */
import { escapeHtml } from '../lib/utils.js';
import type { StylesData } from '../lib/styles.js';
import { stylesDataToCSS } from '../lib/styles.js';

export interface LogoItem {
    id?: string;
    type: 'image' | 'text';
    value: string;
    url?: string;
    name?: string;
    scale?: number;
}

export interface LogoCloudProps {
    title?: string;
    subtitle?: string;
    logos?: LogoItem[];
    displayMode?: 'static' | 'marquee' | 'marqueeOnMobile';
    logoSize?: 'sm' | 'md' | 'lg' | number;
    speed?: number;
    pauseOnHover?: boolean;
    grayscale?: boolean;
    anchor?: string;
}

const SIZE_MAP: Record<string, { height: string; fontSize: string }> = {
    sm: { height: '24px', fontSize: '14px' },
    md: { height: '32px', fontSize: '18px' },
    lg: { height: '48px', fontSize: '24px' },
};

export function renderLogoCloud(
    id: string,
    props: LogoCloudProps,
    stylesData?: StylesData
): string {
    const logos = props.logos || [];
    const displayMode = props.displayMode || 'static';
    const speed = props.speed || 20;
    const pauseOnHover = props.pauseOnHover !== false;
    const grayscale = props.grayscale !== false;

    // Size Logic
    const logoSize = props.logoSize || 'md';
    const mappedSize = typeof logoSize === 'string' ? SIZE_MAP[logoSize] : undefined;
    const baseHeight = mappedSize ? mappedSize.height : `${logoSize}px`;
    const baseFontSize = mappedSize ? mappedSize.fontSize : `${Math.max(14, Number(logoSize) * 0.5)}px`;
    const basePx = parseInt(baseHeight, 10) || 32;
    const baseFontSizePx = parseInt(baseFontSize, 10) || 18;

    // Build section classes
    const sectionClasses = ['fb-logo-cloud', 'py-12', 'px-6'].join(' ');

    // Build inline styles from stylesData
    const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : '';

    const headerHtml = props.title ? `
        <p class="text-center text-muted-foreground text-sm mb-8">
            ${escapeHtml(props.title)}
        </p>
    ` : '';

    const renderItem = (logo: LogoItem, idx: number) => {
        const scale = logo.scale || 1;
        const currentHeight = `${basePx * scale}px`;
        const currentFontSize = `${baseFontSizePx * scale}px`;

        let content = '';
        if (logo.type === 'image') {
            const grayscaleClass = grayscale ? 'grayscale hover:grayscale-0 opacity-60 hover:opacity-100' : '';
            const altText = escapeHtml(logo.name || logo.value || `Logo ${idx + 1}`);
            content = `<img 
                src="${escapeHtml(logo.value)}" 
                alt="${altText}" 
                class="object-contain transition-all duration-300 ${grayscaleClass}"
                style="height: ${currentHeight}; width: auto;"
            />`;
        } else {
            const grayscaleClass = grayscale ? 'opacity-60 hover:opacity-100' : '';
            content = `<span 
                class="font-semibold whitespace-nowrap transition-all duration-300 ${grayscaleClass}"
                style="font-size: ${currentFontSize};"
            >
                ${escapeHtml(logo.value)}
            </span>`;
        }

        if (logo.url) {
            return `<a 
                href="${escapeHtml(logo.url)}" 
                target="_blank" 
                rel="noopener noreferrer"
                class="flex items-center justify-center hover:scale-105 transition-transform"
            >
                ${content}
            </a>`;
        }

        return `<div class="flex items-center justify-center">
            ${content}
        </div>`;
    };

    const logosHtml = logos.map((logo, idx) => renderItem(logo, idx)).join('');

    // Static Grid
    if (displayMode === 'static') {
        return `
            <section id="${props.anchor || id}" class="${sectionClasses}" style="${inlineStyles}">
                ${headerHtml}
                <div class="flex flex-wrap justify-center items-center gap-8 md:gap-12 text-center">
                    ${logosHtml}
                </div>
            </section>
        `.trim();
    }

    // Marquee Mode (also used for marqueeOnMobile)
    // First set: original logos, second set: duplicates (for seamless scrolling)
    const originalLogosHtml = logos.map((logo, idx) => `
        <div class="logo-marquee-item px-6 md:px-8">
            ${renderItem(logo, idx)}
        </div>
    `).join('');

    const duplicateLogosHtml = logos.map((logo, idx) => `
        <div class="logo-marquee-item logo-duplicate px-6 md:px-8">
            ${renderItem(logo, idx)}
        </div>
    `).join('');

    const duplicatedLogosHtml = originalLogosHtml + duplicateLogosHtml;

    const pauseClass = pauseOnHover ? 'logo-marquee-pause-on-hover' : '';
    const mobileOnlyClass = displayMode === 'marqueeOnMobile' ? 'logo-marquee-mobile-only' : '';

    return `
        <section id="${props.anchor || id}" class="${sectionClasses} overflow-hidden ${mobileOnlyClass}" style="${inlineStyles}">
            ${headerHtml}
            <div class="logo-marquee-container ${pauseClass}">
                <div 
                    class="logo-marquee-track" 
                    style="--marquee-speed: ${speed}s; --logo-count: ${logos.length};"
                >
                    ${duplicatedLogosHtml}
                </div>
            </div>
        </section>
    `.trim();
}
