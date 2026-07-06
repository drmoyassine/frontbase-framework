/**
 * Footer Component
 * 
 * Page footer with links, social icons, and copyright.
 */

import { escapeHtml } from '../lib/utils.js';
import type { StylesData } from '../lib/styles.js';
import { stylesDataToCSS } from '../lib/styles.js';

export interface FooterLink {
    text: string;
    href: string;
}

export interface FooterColumn {
    title: string;
    links: FooterLink[];
}

export interface SocialLink {
    icon: 'facebook' | 'twitter' | 'instagram' | 'linkedin' | 'youtube' | 'github' | 'discord' | 'tiktok' | 'reddit' | 'threads' | 'twitch' | 'pinterest' | 'snapchat';
    href: string;
}

export interface FooterProps {
    logo?: string;
    logoText?: string;
    description?: string;
    columns?: FooterColumn[];
    socials?: SocialLink[];
    copyright?: string;
    hideOnMobile?: boolean;
    hideOnDesktop?: boolean;
    mobileColumns?: 1 | 2 | 3;
}

const socialIcons: Record<string, string> = {
    facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    twitter: '<path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>',
    instagram: '<rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>',
    linkedin: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>',
    youtube: '<path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>',
    github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
    discord: '<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>',
    tiktok: '<path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/>',
    reddit: '<circle cx="12" cy="12" r="10"/><path d="M14.5 17c-1.38 0-2.49-.89-3-2h6c-.51 1.11-1.62 2-3 2z"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><path d="M12 2a10 10 0 0 1 10 10"/><circle cx="18" cy="5" r="2"/>',
    threads: '<path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z"/><path d="M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0z"/>',
    twitch: '<path d="M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7"/>',
    pinterest: '<circle cx="12" cy="12" r="10"/><path d="M8.56 14.64a4 4 0 0 0 6.88 0"/><line x1="12" y1="2" x2="12" y2="9"/>',
    snapchat: '<path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17l3-2 3 2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"/>',
};

export function renderFooter(
    id: string,
    props: FooterProps,
    stylesData?: StylesData
): string {
    const footerClasses = [
        'fb-footer',
        'border-t',
        'w-full', 'max-w-full', 'overflow-x-hidden',
        props.hideOnMobile ? 'hidden md:block' : '',
        props.hideOnDesktop ? 'md:hidden' : '',
    ].filter(Boolean).join(' ');

    const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : '';

    // Logo
    const logoHtml = props.logo
        ? `<img src="${escapeHtml(props.logo)}" alt="${escapeHtml(props.logoText || 'Logo')}" class="h-8" />`
        : (props.logoText ? `<span class="text-xl font-bold">${escapeHtml(props.logoText)}</span>` : '');

    // Description
    const descriptionHtml = props.description
        ? `<p class="text-muted-foreground mt-4 max-w-xs">${escapeHtml(props.description)}</p>`
        : '';

    // Social links
    const socialsHtml = (props.socials || []).map(social => `
        <a href="${escapeHtml(social.href)}" class="text-muted-foreground hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                ${socialIcons[social.icon] || ''}
            </svg>
        </a>
    `).join('');

    // Columns
    const columnsHtml = (props.columns || []).map(column => `
        <div>
            <h4 class="font-semibold mb-4">${escapeHtml(column.title)}</h4>
            <ul class="space-y-2">
                ${column.links.map(link => `
                    <li><a href="${escapeHtml(link.href)}" class="text-muted-foreground hover:text-foreground transition-colors">${escapeHtml(link.text)}</a></li>
                `).join('')}
            </ul>
        </div>
    `).join('');

    // Copyright
    const year = new Date().getFullYear();
    const copyrightText = props.copyright || `© ${year} All rights reserved.`;

    // SAFELIST PATTERN: Explicit class mapping to prevent Tailwind CSS purging
    // Dynamic classes like `grid-cols-${var}` are invisible to Tailwind's build
    const mobileColsClass: Record<number, string> = {
        1: 'grid-cols-1',
        2: 'grid-cols-2',
        3: 'grid-cols-3',
    };
    const gridColsClass = mobileColsClass[props.mobileColumns || 1] || 'grid-cols-1';

    return `
        <footer id="${id}" class="${footerClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
                <div class="flex flex-col gap-8 md:flex-row md:flex-wrap md:justify-between">
                    <!-- Brand -->
                    <div class="flex-shrink-0 max-w-sm">
                        <a href="/" class="inline-flex items-center">${logoHtml}</a>
                        ${descriptionHtml}
                        ${socialsHtml ? `<div class="flex gap-4 mt-6">${socialsHtml}</div>` : ''}
                    </div>
                    
                    <!-- Link Columns -->
                    <div class="grid ${gridColsClass} gap-6 sm:grid-cols-2 md:grid-cols-3 lg:flex lg:gap-12">
                        ${columnsHtml}
                    </div>
                </div>
                
                <!-- Copyright -->
                <div class="border-t mt-12 pt-8 text-center text-muted-foreground text-sm">
                    ${escapeHtml(copyrightText)}
                </div>
            </div>
        </footer>
    `.trim();
}
