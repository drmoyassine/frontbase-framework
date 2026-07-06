/**
 * Landing Page Components
 * 
 * Re-exports all landing page section renderers.
 */

export { renderHero } from './Hero.js';
export type { HeroProps } from './Hero.js';

export { renderFeatures } from './Features.js';
export type { FeaturesProps, FeatureItem } from './Features.js';

export { renderPricing } from './Pricing.js';
export type { PricingProps, PricingPlan } from './Pricing.js';

export { renderCTA } from './CTA.js';
export type { CTAProps } from './CTA.js';

export { renderNavbar } from './Navbar.js';
export type { NavbarProps, NavLink } from './Navbar.js';

export { renderFAQ } from './FAQ.js';
export type { FAQProps, FAQItem } from './FAQ.js';

export { renderLogoCloud } from './LogoCloud.js';
export type { LogoCloudProps, LogoItem } from './LogoCloud.js';

export { renderFooter } from './Footer.js';
export type { FooterProps, FooterColumn, FooterLink, SocialLink } from './Footer.js';
