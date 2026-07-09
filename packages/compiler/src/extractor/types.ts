/**
 * Manifest model — what the extractor emits for the builder property panels and
 * agent diagnostics. Mirrors technical-specification.md ComponentManifest shape.
 */
export type ZodKind = 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object' | 'unknown';

export interface PropertyField {
    name: string;
    kind: ZodKind;
    required: boolean;
    description?: string;
    default?: unknown;
    enum?: (string | number)[];
    min?: number;
    max?: number;
    /** String-format hint derived from .email()/.url()/.uuid() (string + format). */
    format?: 'email' | 'url' | 'uuid' | 'date';
    nullable?: boolean;
    /** nested object properties */
    properties?: PropertyField[];
    /** array element */
    element?: PropertyField;
}

export interface ComponentManifest {
    name: string;
    file: string;
    category: string;
    properties: PropertyField[];
}

/** A Zod construct the extractor does not (yet) support — surfaces as a diagnostic. */
export interface ExtractionDiagnostic {
    code: string;
    message: string;
    /** Property path, e.g. "items.config" or "config.type". */
    path: string;
    suggestion?: string;
}
