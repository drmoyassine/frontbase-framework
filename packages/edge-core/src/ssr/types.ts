/**
 * Shared SSR type definitions extracted from PageRenderer.
 * Pure type move — no logic.
 */

export interface PageComponent {
    id: string;
    type: string;
    props?: Record<string, unknown>;
    styles?: Record<string, any>;
    stylesData?: Record<string, any>; // Builder stores viewportOverrides here
    binding?: Record<string, any>;
    visibility?: { mobile: boolean; tablet: boolean; desktop: boolean; };
    visibilityCondition?: string;
    children?: PageComponent[];
}

export interface PageLayoutData {
    content: PageComponent[];
    root?: Record<string, unknown>;
}
