/**
 * Navbar Component
 * 
 * Navigation bar with configurable logo, menu items, and CTA buttons.
 * Uses DRY primitives from static.ts for Lego-style composition.
 */

import { escapeHtml } from '../lib/utils.js';
import type { StylesData } from '../lib/styles.js';
import { stylesDataToCSS } from '../lib/styles.js';
import { renderImage, renderText } from '../static.js';
import { renderAdaptiveImage, isSvgUrl } from '../../lib/svg-adapter.js';

export interface NavMenuItem {
    id: string;
    label: string;
    navType: 'scroll' | 'link';
    target: string;
    subItems?: NavMenuItem[];
}

export interface NavLink {
    text: string;
    href: string;
}

export interface NavbarProps {
    // New structured format
    logo?: {
        type?: 'text' | 'image';
        text?: string;
        imageUrl?: string;
        link?: string;
        useProjectLogo?: boolean;
        showIcon?: boolean; // Show icon alongside brand name text
    };
    menuItems?: NavMenuItem[];
    primaryButton?: {
        enabled?: boolean;
        text?: string;
        navType?: 'scroll' | 'link';
        target?: string;
        variant?: string;
    };
    secondaryButton?: {
        enabled?: boolean;
        text?: string;
        navType?: 'scroll' | 'link';
        target?: string;
        variant?: string;
    };
    // Legacy format (backward compatible)
    logoText?: string;
    links?: NavLink[];
    ctaText?: string;
    ctaLink?: string;
    sticky?: boolean;
    hideOnMobile?: boolean;
    hideOnDesktop?: boolean;
    // Dark mode toggle
    showDarkModeToggle?: boolean;
    // Global scale factor (0.8 - 1.5)
    scale?: number;
    // Externalized scale bases (defaults reproduce the prior baked literals).
    logoHeightBase?: string;
    iconSizeBase?: string;
    logoFontSizeBase?: string;
    logoFontWeight?: string;
    menuFontSizeBase?: string;
    navPaddingBase?: string;
    navGapBase?: string;
    menuGapBase?: string;
    buttonGapBase?: string;
}

// Helper to render CTA-style links (DRY for both primary and secondary buttons)
function renderCtaLink(
    id: string,
    text: string,
    target: string,
    navType: 'scroll' | 'link',
    variant: 'primary' | 'secondary'
): string {
    const scrollAttr = navType === 'scroll' ? `data-scroll-to="${escapeHtml(target)}"` : '';
    const variantClasses = variant === 'primary'
        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
        : 'border border-border hover:bg-accent';

    return `<a id="${id}" href="${escapeHtml(target)}" ${scrollAttr}
       class="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${variantClasses}">
        ${escapeHtml(text)}
    </a>`;
}

export function renderNavbar(
    id: string,
    props: NavbarProps,
    stylesData?: StylesData
): string {
    // Determine if using new or legacy format
    const useNewFormat = !!props.logo || !!props.menuItems;

    const headerClasses = [
        'fb-navbar',
        'bg-background',
        'border-b',
        props.sticky ? 'sticky top-0 z-50' : '',
        props.hideOnMobile ? 'hidden md:block' : '',
        props.hideOnDesktop ? 'md:hidden' : '',
    ].filter(Boolean).join(' ');

    const inlineStyles = stylesData ? stylesDataToCSS(stylesData) : '';

    if (useNewFormat) {
        return renderNewFormat(id, props, headerClasses, inlineStyles);
    } else {
        return renderLegacyFormat(id, props, headerClasses, inlineStyles);
    }
}

function renderNewFormat(
    id: string,
    props: NavbarProps,
    headerClasses: string,
    inlineStyles: string
): string {
    const logo = props.logo || { type: 'text', text: 'YourBrand', link: '/' };
    const menuItems = props.menuItems || [];
    const primaryButton = props.primaryButton;
    const secondaryButton = props.secondaryButton;

    // Global scale factor (default 1)
    const scale = props.scale || 1;

    // Logo HTML using DRY primitives with scale applied
    const logoLink = logo.link || '/';
    let logoHtml: string;

    // Externalized scale bases — defaults reproduce the prior baked literals byte-for-byte.
    // Operand order (base * scale) is preserved so parseFloat(base)*scale === base*scale.
    const logoHeightBase = props.logoHeightBase as string || '2rem';
    const iconSizeBase = props.iconSizeBase as string || '1.5rem';
    const logoFontSizeBase = props.logoFontSizeBase as string || '1.25rem';
    const logoFontWeight = props.logoFontWeight as string || '700';

    // Apply scale to sizes
    const logoHeight = `${parseFloat(logoHeightBase) * scale}rem`;
    const iconSize = `${parseFloat(iconSizeBase) * scale}rem`;
    const logoFontSize = `${parseFloat(logoFontSizeBase) * scale}rem`;

    if (logo.type === 'image' && logo.imageUrl) {
        // Use renderImage primitive with scaled size
        logoHtml = renderImage(`${id}-logo-img`, {
            src: logo.imageUrl,
            alt: 'Logo',
            height: logoHeight,
            width: 'auto',
            objectFit: 'contain',
        });
    } else if (logo.showIcon && logo.imageUrl) {
        // Icon + text combo using primitives with scaled sizes
        const iconImg = renderImage(`${id}-logo-icon`, {
            src: logo.imageUrl,
            alt: 'Logo',
            height: iconSize,
            width: iconSize,
            objectFit: 'contain',
        });
        const brandText = `<span id="${id}-logo-text" style="font-size: ${logoFontSize}; font-weight: ${logoFontWeight};">${escapeHtml(logo.text || 'YourBrand')}</span>`;
        logoHtml = `${iconImg}${brandText}`;
    } else {
        // Text-only logo with scaled font size
        logoHtml = `<span id="${id}-logo-text" style="font-size: ${logoFontSize}; font-weight: ${logoFontWeight};">${escapeHtml(logo.text || 'YourBrand')}</span>`;
    }

    // Menu items HTML with scroll support (apply scale to font size)
    const menuFontSizeBase = props.menuFontSizeBase as string || '0.875rem';
    const menuFontSize = `${parseFloat(menuFontSizeBase) * scale}rem`; // 14px base
    const menuItemsHtml = menuItems.map(item => {
        const href = item.navType === 'scroll' ? item.target : item.target;
        const scrollAttr = item.navType === 'scroll' ? `data-scroll-to="${escapeHtml(item.target)}"` : '';
        return `
            <a href="${escapeHtml(href)}" ${scrollAttr} 
               class="font-medium text-muted-foreground hover:text-foreground transition-colors"
               style="font-size: ${menuFontSize};">
                ${escapeHtml(item.label)}
            </a>
        `;
    }).join('');

    // Mobile menu items
    const mobileMenuItemsHtml = menuItems.map(item => {
        const href = item.navType === 'scroll' ? item.target : item.target;
        const scrollAttr = item.navType === 'scroll' ? `data-scroll-to="${escapeHtml(item.target)}"` : '';
        return `
            <a href="${escapeHtml(href)}" ${scrollAttr}
               class="block py-2 text-muted-foreground hover:text-foreground transition-colors">
                ${escapeHtml(item.label)}
            </a>
        `;
    }).join('');

    // CTA Buttons HTML
    let buttonsHtml = '';

    // Dark Mode Toggle (if enabled)
    const darkModeToggleHtml = props.showDarkModeToggle ? `
        <button 
            type="button" 
            class="p-2 rounded-lg hover:bg-accent transition-colors" 
            data-fb-theme-toggle
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
        >
            <!-- Sun icon (shown in dark mode) -->
            <svg class="w-5 h-5 hidden dark:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>
            </svg>
            <!-- Moon icon (shown in light mode) -->
            <svg class="w-5 h-5 block dark:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
            </svg>
        </button>
    ` : '';

    if (secondaryButton?.enabled) {
        buttonsHtml += renderCtaLink(
            `${id}-secondary-btn`,
            secondaryButton.text || 'Learn More',
            secondaryButton.target || '#',
            secondaryButton.navType || 'link',
            'secondary'
        );
    }

    if (primaryButton?.enabled !== false) {
        buttonsHtml += renderCtaLink(
            `${id}-primary-btn`,
            primaryButton?.text || 'Get Started',
            primaryButton?.target || '#',
            primaryButton?.navType || 'link',
            'primary'
        );
    }

    // Computed scaled gap values — bases externalized, operand order preserved.
    const navPaddingBase = props.navPaddingBase as string || '1rem';
    const navGapBase = props.navGapBase as string || '2rem';
    const menuGapBase = props.menuGapBase as string || '1.5rem';
    const buttonGapBase = props.buttonGapBase as string || '0.75rem';
    const navPadding = `${parseFloat(navPaddingBase) * scale}rem`; // py-4 = 1rem
    const navGap = `${parseFloat(navGapBase) * scale}rem`; // gap-8 = 2rem
    const menuGap = `${parseFloat(menuGapBase) * scale}rem`; // gap-6 = 1.5rem
    const buttonGap = `${parseFloat(buttonGapBase) * scale}rem`; // gap-3 = 0.75rem

    return `
        <header id="${id}" class="${headerClasses}" style="${inlineStyles}">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex items-center justify-between" style="padding: ${navPadding} 0;">
                    <!-- Logo -->
                    <a href="${escapeHtml(logoLink)}" class="flex items-center gap-2">
                        ${logoHtml}
                    </a>
                    
                    <!-- Desktop Navigation + CTA Buttons grouped together -->
                    <div class="hidden md:flex items-center" style="gap: ${navGap};">
                        <nav class="flex items-center" style="gap: ${menuGap};">
                            ${menuItemsHtml}
                        </nav>
                        <div class="flex items-center" style="gap: ${buttonGap};">
                            ${darkModeToggleHtml}
                            ${buttonsHtml}
                        </div>
                    </div>

                    <!-- Mobile: Dark Mode Toggle + Menu Button -->
                    <div class="md:hidden flex items-center gap-2">
                        ${darkModeToggleHtml}
                        <button type="button" class="p-2 rounded-lg hover:bg-accent" data-fb-mobile-menu-toggle>
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Mobile Menu (hidden by default) -->
                <div class="md:hidden hidden pb-4" data-fb-mobile-menu>
                    <nav class="flex flex-col gap-1">
                        ${mobileMenuItemsHtml}
                    </nav>
                    <div class="flex flex-col gap-2 mt-4 pt-4 border-t">
                        ${buttonsHtml}
                    </div>
                </div>
            </div>
        </header>
        ${props.showDarkModeToggle ? `
        <script>
            (function() {
                // Initialize theme from localStorage or system preference
                var savedTheme = localStorage.getItem('fb-theme');
                if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                }
                
                // Attach click handlers to all theme toggle buttons
                var toggles = document.querySelectorAll('[data-fb-theme-toggle]');
                for (var i = 0; i < toggles.length; i++) {
                    toggles[i].addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        var isDark = document.documentElement.classList.toggle('dark');
                        localStorage.setItem('fb-theme', isDark ? 'dark' : 'light');
                    });
                }
            })();
        </script>
        ` : ''
        }
    `.trim();
}

function renderLegacyFormat(
    id: string,
    props: NavbarProps,
    headerClasses: string,
    inlineStyles: string
): string {
    // Logo using DRY primitive
    const logoHtml = renderText(`${id} -logo`, {
        text: props.logoText || 'Logo',
        size: 'xl',
        weight: 'bold',
    });

    // Desktop links
    const desktopLinksHtml = (props.links || []).map(link => `
        < a href = "${escapeHtml(link.href)}" class="text-muted-foreground hover:text-foreground transition-colors" >
            ${escapeHtml(link.text)}
    </a>
        `).join('');

    // Mobile menu links
    const mobileLinksHtml = (props.links || []).map(link => `
        < a href = "${escapeHtml(link.href)}" class="block py-2 text-muted-foreground hover:text-foreground transition-colors" >
            ${escapeHtml(link.text)}
    </a>
        `).join('');

    // CTA button using DRY helper
    const ctaHtml = props.ctaText
        ? renderCtaLink(`${id} -cta`, props.ctaText, props.ctaLink || '#', 'link', 'primary')
        : '';

    return `
        < header id = "${id}" class="${headerClasses}" style = "${inlineStyles}" >
            <div class="container mx-auto px-4 sm:px-6 lg:px-8" >
                <div class="flex items-center justify-between py-4" >
                    <!--Logo -->
                        <a href="/" class="flex items-center" >
                            ${logoHtml}
    </a>

        < !--Desktop Navigation-- >
            <nav class="hidden md:flex items-center gap-8" >
                ${desktopLinksHtml}
    </nav>

        < !--CTA + Mobile Menu-- >
            <div class="flex items-center gap-4" >
                ${ctaHtml}

    <!--Mobile Menu Button-- >
        <button type="button" class="md:hidden p-2 rounded-lg hover:bg-accent" data - fb - mobile - menu - toggle >
            <svg class="w-6 h-6" fill = "none" stroke = "currentColor" viewBox = "0 0 24 24" >
                <path stroke - linecap="round" stroke - linejoin="round" stroke - width="2" d = "M4 6h16M4 12h16M4 18h16" > </path>
                    </svg>
                    </button>
                    </div>
                    </div>

                    < !--Mobile Menu(hidden by default )-- >
                        <div class="md:hidden hidden pb-4" data - fb - mobile - menu >
                            <nav class="flex flex-col gap-1" >
                                ${mobileLinksHtml}
    </nav>
        </div>
        </div>
        </header>
            `.trim();
}
