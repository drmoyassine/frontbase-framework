/**
 * Tailwind config used ONLY to compile the static utility stylesheet that the
 * edge-SSR landing components (Navbar, Pricing, Footer, Hero, …) emit as class
 * names. The community/worker path has no Tailwind runtime, so these classes
 * must exist in the page CSS. regen-utilities.mjs runs the Tailwind CLI over
 * the eSSR sources and embeds the result as a string constant (utilitiesCss.ts)
 * — see FALLBACK_CSS in src/ssr/baseStyles.ts.
 *
 * The palette mirrors the product / admin-console design system: every color
 * resolves to the HSL CSS variables defined in FALLBACK_CSS (:root / .dark),
 * with the <alpha-value> placeholder so opacity modifiers (bg-muted/50,
 * hover:bg-primary/90) compile correctly. Preflight is OFF because FALLBACK_CSS
 * already supplies the reset — we want utilities only.
 */
module.exports = {
    content: ['src/ssr/**/*.ts'],
    darkMode: ['class'],
    theme: {
        extend: {
            colors: {
                border: 'hsl(var(--border) / <alpha-value>)',
                input: 'hsl(var(--input) / <alpha-value>)',
                ring: 'hsl(var(--ring) / <alpha-value>)',
                background: 'hsl(var(--background) / <alpha-value>)',
                foreground: 'hsl(var(--foreground) / <alpha-value>)',
                primary: {
                    DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
                    foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
                    foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
                    foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
                    foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
                    foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
                    foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
                },
                card: {
                    DEFAULT: 'hsl(var(--card) / <alpha-value>)',
                    foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
                },
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)',
            },
        },
    },
    corePlugins: { preflight: false },
};
