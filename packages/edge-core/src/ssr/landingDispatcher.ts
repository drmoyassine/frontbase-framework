/**
 * Landing-page section dispatcher.
 * Pure code move from PageRenderer; no logic change.
 */

import * as landing from './components/landing/index.js';

export function renderLandingComponent(
    type: string,
    id: string,
    props: Record<string, unknown>,
    stylesData?: Record<string, any>
): string {
    switch (type) {
        case 'Hero':
            return landing.renderHero(id, props as any, stylesData as any);
        case 'Features':
        case 'FeatureSection':
            return landing.renderFeatures(id, props as any, stylesData as any);
        case 'Pricing':
            return landing.renderPricing(id, props as any, stylesData as any);
        case 'CTA':
            return landing.renderCTA(id, props as any, stylesData as any);
        case 'Navbar':
            return landing.renderNavbar(id, props as any, stylesData as any);
        case 'FAQ':
            return landing.renderFAQ(id, props as any, stylesData as any);
        case 'LogoCloud':
            return landing.renderLogoCloud(id, props as any, stylesData as any);
        case 'Footer':
            return landing.renderFooter(id, props as any, stylesData as any);
        default:
            return `<div data-fb-component="${type}" data-fb-id="${id}" class="fb-landing-unknown"></div>`;
    }
}
