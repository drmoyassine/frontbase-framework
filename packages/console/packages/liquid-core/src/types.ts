/**
 * Structural interface describing the subset of the LiquidJS engine this package
 * touches. Using a structural type (rather than the concrete `Liquid` class)
 * decouples the shared core from *which physical copy* of liquidjs a consumer
 * has installed. This repo has two liquidjs copies (root + services/edge), whose
 * class types are otherwise structurally incompatible; both satisfy this
 * interface, so the same functions work in the builder (root copy) and the edge
 * worker (edge copy) without a type conflict.
 */
export interface LiquidEngine {
    parse(src: string, filepath?: string): unknown[];
    render(
        tpl: unknown[],
        scope?: object,
        renderOptions?: Record<string, unknown>,
    ): Promise<unknown>;
    registerFilter(name: string, fn: (...args: any[]) => unknown): unknown;
    registerFilter(name: string, fn: unknown): unknown;
}
