/**
 * Page-level form validation helper — Sprint 2
 *
 * Scans a page's layout components for form bindings and reports
 * configuration problems (e.g. a form with no table bound). Pure and
 * unit-testable; used by the builder's pre-save / pre-publish checks.
 */

export interface ValidationError {
    field: string;
    message: string;
}

export interface PageLike {
    id?: string;
    slug?: string;
    name?: string;
    title?: string;
    layoutData?: {
        content?: Array<{
            type?: string;
            props?: Record<string, unknown> & { binding?: Record<string, unknown> };
        }>;
        [key: string]: unknown;
    };
}

/**
 * Validate that every form component on the page has a usable binding.
 */
export function validatePageForms(page: PageLike): ValidationError[] {
    const errors: ValidationError[] = [];
    const components = page.layoutData?.content || [];

    let formIndex = 0;
    for (const component of components) {
        if (component.type !== 'form') continue;

        const binding = component.props?.binding;
        const fieldName = `form[${formIndex}]`;
        formIndex++;

        if (!binding) {
            errors.push({
                field: fieldName,
                message: 'Form component has no data binding configured',
            });
            continue;
        }

        const tableName = binding.tableName as string | undefined;
        if (!tableName || String(tableName).trim() === '') {
            errors.push({
                field: `${fieldName}.tableName`,
                message: 'Form component is missing a table binding',
            });
        }

        const overrides = binding.fieldOverrides as Record<string, { validation?: { required?: boolean } }> | undefined;
        if (overrides) {
            // Detect contradictory configuration: PK-less checks are handled at runtime;
            // here we only flag obviously broken required-without-table cases.
            for (const [colName, ov] of Object.entries(overrides)) {
                if (ov?.validation?.required && !tableName) {
                    errors.push({
                        field: `${fieldName}.${colName}`,
                        message: `Field "${colName}" is marked required but the form has no table`,
                    });
                }
            }
        }
    }

    return errors;
}

/**
 * Validation for saving a page. Currently checks form bindings.
 */
export function validatePageForSave(page: PageLike): { valid: boolean; errors: ValidationError[] } {
    const errors = validatePageForms(page);
    return { valid: errors.length === 0, errors };
}

/**
 * Validation for publishing a page. Includes save checks plus
 * page-level metadata that publication requires.
 */
export function validatePageForPublish(page: PageLike): { valid: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = [...validatePageForms(page)];

    if (!page.slug || String(page.slug).trim() === '') {
        errors.push({ field: 'slug', message: 'Page slug is required for publishing' });
    }
    if (!page.name || String(page.name).trim() === '') {
        errors.push({ field: 'name', message: 'Page name is required for publishing' });
    }

    return { valid: errors.length === 0, errors };
}
