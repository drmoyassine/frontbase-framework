/**
 * Page Export/Import Schema
 * 
 * Defines the envelope format for exported page JSON files.
 * Version field enables future format migrations.
 */

export interface PageExportEnvelope {
    version: number;
    exportedAt: string;
    page: {
        name: string;
        slug: string;
        title?: string;
        description?: string;
        keywords?: string;
        isHomepage: boolean;
        containerStyles?: any;
        layoutData?: {
            content: any[];
            root: Record<string, any>;
        };
    };
}

/**
 * Validates a parsed JSON object is a valid PageExportEnvelope.
 * Returns null if valid, or an error message string.
 */
export function validatePageExport(data: unknown): string | null {
    if (!data || typeof data !== 'object') {
        return 'Invalid file: not a valid JSON object';
    }

    const obj = data as Record<string, any>;

    if (typeof obj.version !== 'number') {
        return 'Invalid file: missing version field';
    }

    if (obj.version !== 1) {
        return `Unsupported export version: ${obj.version}. This app supports version 1.`;
    }

    if (!obj.page || typeof obj.page !== 'object') {
        return 'Invalid file: missing page data';
    }

    const page = obj.page;

    if (!page.name || typeof page.name !== 'string') {
        return 'Invalid file: page must have a name';
    }

    if (!page.slug || typeof page.slug !== 'string') {
        return 'Invalid file: page must have a slug';
    }

    return null;
}
