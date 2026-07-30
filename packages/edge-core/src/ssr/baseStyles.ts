/**
 * Base CSS Styles for Edge SSR Pages
 *
 * Fallback CSS used when the Tailwind CSS bundle (cssBundle) is not available
 * on legacy pages. Includes CSS variables, resets, and component base styles.
 *
 * Extracted from pages.ts generateHtmlDocument() for maintainability.
 *
 * CF-22 WYSIWYG: the landing eSSR components (Navbar, Pricing, Footer, Hero, …)
 * emit Tailwind class names, but the community/worker render path (shell.ts)
 * has no Tailwind runtime — it ships only this stylesheet. Without the utility
 * rules, responsive behaviour breaks (e.g. desktop + mobile navbars render at
 * once). UTILITIES_CSS is a static build of exactly those classes, compiled
 * from the component sources (scripts/regen-utilities.mjs); it is prepended so
 * the landing markup resolves with no runtime Tailwind.
 */
import { UTILITIES_CSS } from './utilitiesCss.js';

export const FALLBACK_CSS = `${UTILITIES_CSS}

/* FALLBACK CSS - Used when cssBundle is not available (legacy pages) */
:root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
}
.dark {
    --background: 224 71% 4%;
    --foreground: 213 31% 91%;
    --muted: 223 47% 11%;
    --muted-foreground: 215 20% 65%;
    --popover: 224 71% 4%;
    --popover-foreground: 213 31% 91%;
    --card: 224 71% 4%;
    --card-foreground: 213 31% 91%;
    --border: 216 34% 17%;
    --input: 216 34% 17%;
    --primary: 210 40% 98%;
    --primary-foreground: 222 47% 11%;
    --secondary: 222 47% 11%;
    --secondary-foreground: 210 40% 98%;
    --accent: 216 34% 17%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 63% 31%;
    --destructive-foreground: 210 40% 98%;
    --ring: 216 34% 17%;
}
*, *::before, *::after { box-sizing: border-box; }
html { background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; background-color: hsl(var(--background)); color: hsl(var(--foreground)); }
.fb-page { min-height: 100vh; width: 100%; overflow-x: hidden; display: flex; flex-direction: column; }
.fb-button { display: inline-flex; align-items: center; justify-content: center; }
.fb-heading { margin: 0; }
.fb-heading-1 { font-size: 2.25rem; font-weight: 700; }
.fb-heading-2 { font-size: 1.875rem; font-weight: 600; }
.fb-heading-3 { font-size: 1.5rem; font-weight: 600; }
.fb-loading { opacity: 0.7; pointer-events: none; }
.fb-skeleton { background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: skeleton 1.5s infinite; }
@keyframes skeleton { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes marquee-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
.logo-marquee-container { overflow: hidden; width: 100%; mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); }
.logo-marquee-track { display: flex; width: max-content; animation: marquee-scroll var(--marquee-speed, 20s) linear infinite; }
.logo-marquee-pause-on-hover:hover .logo-marquee-track { animation-play-state: paused; }
.logo-marquee-item { flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.logo-marquee-mobile-only .logo-marquee-track { animation: none; flex-wrap: wrap; justify-content: center; gap: 2rem; width: 100%; }
.logo-marquee-mobile-only .logo-marquee-container { mask-image: none; -webkit-mask-image: none; }
/* Hide duplicate logos on desktop (duplicates are for seamless marquee on mobile) */
.logo-marquee-mobile-only .logo-marquee-item.logo-duplicate { display: none; }
@media (max-width: 640px) {
    .logo-marquee-mobile-only .logo-marquee-track { animation: marquee-scroll var(--marquee-speed, 20s) linear infinite; flex-wrap: nowrap; justify-content: flex-start; gap: 0; width: max-content; }
    .logo-marquee-mobile-only .logo-marquee-container { mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent); }
    /* Show all logos (including duplicates) on mobile for seamless marquee */
    .logo-marquee-mobile-only .logo-marquee-item.logo-duplicate { display: flex; }
}
/* Dark mode: invert raster images in Navbar and LogoCloud */
.dark .fb-navbar img:not(.no-invert),
.dark .fb-logo-cloud img:not(.no-invert) { filter: invert(1) brightness(1.1); }
/* DataTable fallback */
.fb-datatable { border-radius: var(--radius, 0.5rem); border: 1px solid hsl(var(--border)); background-color: hsl(var(--background)); overflow: hidden; }
.fb-datatable-header { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.5rem; }
.fb-datatable-title { font-size: 1.25rem; font-weight: 600; line-height: 1; margin: 0; }
.fb-datatable-search { position: relative; max-width: 24rem; }
.fb-datatable-search input { width: 100%; height: 2.5rem; padding: 0 0.75rem 0 2.25rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius, 0.5rem); font-size: 0.875rem; background: transparent; color: hsl(var(--foreground)); }
.fb-datatable-search svg { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); width: 1rem; height: 1rem; color: hsl(var(--muted-foreground)); }
.fb-datatable-content { padding: 0 1.5rem 1.5rem; }
.fb-datatable-scroll { overflow-x: auto; border: 1px solid hsl(var(--border)); border-radius: var(--radius, 0.5rem); }
.fb-table { width: 100%; font-size: 0.875rem; border-collapse: collapse; }
.fb-table-header { border-bottom: 1px solid hsl(var(--border)); }
.fb-table-header th { height: 3rem; padding: 0 1rem; text-align: left; font-weight: 500; color: hsl(var(--muted-foreground)); white-space: nowrap; }
.fb-table-body tr { border-bottom: 1px solid hsl(var(--border)); transition: background-color 0.15s; }
.fb-table-body tr:last-child { border-bottom: 0; }
.fb-table-body tr:hover { background-color: hsl(var(--muted) / 0.5); }
.fb-table-body td { padding: 1rem; vertical-align: middle; }
.fb-datatable-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 1rem 1.5rem; font-size: 0.875rem; color: hsl(var(--muted-foreground)); }
.fb-datatable-pagination .fb-pagination-btns { display: flex; align-items: center; gap: 0.5rem; }
.fb-datatable-pagination button { display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.75rem; height: 2.25rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius, 0.5rem); background: transparent; font-size: 0.875rem; cursor: pointer; color: hsl(var(--foreground)); }
.fb-datatable-pagination button:disabled { opacity: 0.5; pointer-events: none; }
/* Form fallback */
.fb-form { border-radius: var(--radius, 0.5rem); border: 1px solid hsl(var(--border)); background-color: hsl(var(--background)); }
.fb-form-header { padding: 1.5rem; }
.fb-form-title { font-size: 1.125rem; font-weight: 600; line-height: 1; margin: 0; }
.fb-form-content { padding: 0 1.5rem 1.5rem; }
.fb-form-field { margin-bottom: 1.25rem; }
.fb-form-label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.375rem; color: hsl(var(--foreground)); }
.fb-input { display: flex; width: 100%; height: 2.5rem; padding: 0 0.75rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius, 0.5rem); font-size: 0.875rem; background: transparent; color: hsl(var(--foreground)); }
.fb-textarea { display: flex; width: 100%; min-height: 5rem; padding: 0.5rem 0.75rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius, 0.5rem); font-size: 0.875rem; background: transparent; color: hsl(var(--foreground)); resize: vertical; }
.fb-form-actions { display: flex; gap: 0.75rem; padding: 0 1.5rem 1.5rem; }
`;
