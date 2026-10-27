/**
 * Converts ColumnSchema[] from backend to JSON Schema format for JSON Forms.
 */

import type { ColumnSchema } from '../types/schema';

export interface JsonFormsSchema {
    schema: {
        type: 'object';
        properties: Record<string, any>;
        required: string[];
    };
    uiSchema: {
        type: 'VerticalLayout';
        elements: any[];
    };
}

/**
 * Detects the appropriate JSON Forms renderer type based on column metadata.
 */
function detectFieldType(column: ColumnSchema): {
    jsonType: string;
    format?: string;
    rendererHint?: string;
    options?: Record<string, any>;
} {
    const name = column.name.toLowerCase();
    const sqlType = (typeof column.type === 'string' ? column.type : column.type[0] || '').toLowerCase();

    // Email detection by column name
    if (name.includes('email')) {
        return { jsonType: 'string', format: 'email', rendererHint: 'email' };
    }

    // Phone detection by column name
    if (name.includes('phone') || name.includes('mobile') || name.includes('tel')) {
        return { jsonType: 'string', rendererHint: 'phone' };
    }

    // Foreign key - dropdown
    if (column.is_foreign && column.foreign_table) {
        return {
            jsonType: 'string',
            rendererHint: 'dropdown',
            options: {
                fkTable: column.foreign_table,
                fkColumn: column.foreign_column || 'id'
            }
        };
    }

    // JSON array - multiselect
    if (sqlType.includes('json') || sqlType.includes('jsonb')) {
        return { jsonType: 'array', rendererHint: 'multiselect' };
    }

    // Boolean types
    if (sqlType.includes('bool') || sqlType === 'tinyint(1)') {
        return { jsonType: 'boolean' };
    }

    // UUID type for ID fields
    if (sqlType.includes('uuid')) {
        return { jsonType: 'string', format: 'uuid' };
    }

    // Integer types (including ID fields)
    if (sqlType.includes('int') || sqlType === 'serial' || sqlType === 'bigserial') {
        return { jsonType: 'integer' };
    }

    // Numeric/decimal types
    if (sqlType.includes('decimal') || sqlType.includes('numeric') ||
        sqlType.includes('float') || sqlType.includes('double') || sqlType.includes('real')) {
        return { jsonType: 'number' };
    }

    // Date types
    if (sqlType === 'date') {
        return { jsonType: 'string', format: 'date' };
    }

    // Datetime/timestamp types
    if (sqlType.includes('datetime') || sqlType.includes('timestamp') || sqlType.includes('timestamptz')) {
        return { jsonType: 'string', format: 'date-time' };
    }

    // Textarea ONLY for specific column names (not all text types!)
    const textareaNames = ['description', 'notes', 'content', 'body', 'bio', 'summary', 'comment', 'message'];
    if (textareaNames.some(n => name.includes(n))) {
        return { jsonType: 'string', rendererHint: 'textarea' };
    }

    // Default: string (regular text input)
    return { jsonType: 'string' };
}

/**
 * Converts backend ColumnSchema array to JSON Forms compatible schema.
 */
export function schemaToJsonSchema(
    columns: ColumnSchema[],
    options?: {
        excludeColumns?: string[];
        readOnlyColumns?: string[];
        fieldOverrides?: Record<string, any>;
    }
): JsonFormsSchema {
    const excludeSet = new Set(options?.excludeColumns || []);
    const readOnlySet = new Set(options?.readOnlyColumns || []);
    const overrides = options?.fieldOverrides || {};

    const properties: Record<string, any> = {};
    const required: string[] = [];
    const uiElements: any[] = [];

    // Sort columns based on overrides order if present?
    // For now, let's respect the array order but filter hidden ones.
    // The FieldConfigurator handles ordering in the UI, but here we just generate schema.
    // If the user reordered fields in Configurator, FormPropertiesPanel should pass columns in that order?
    // No, FormPropertiesPanel passes `fieldOrder`.
    // We should probably rely on `fieldOrder` to sort `columns` before calling this?
    // Or we can just generate elements in the order of `columns` and let UI schema handle order?
    // JSON Forms VerticalLayout renders in order of `elements`.
    // So if we want layout order, we should respect `columns` array order assuming it's already sorted by caller,
    // OR we should have an `order` option here.
    // Let's assume caller sends sorted columns or we iterate `columns`.

    for (const column of columns) {
        const override = overrides[column.name] || {};

        // Skip excluded or hidden columns
        if (excludeSet.has(column.name) || override.hidden) continue;

        let { jsonType, format, rendererHint, options: fieldOptions } = detectFieldType(column);

        // Apply Type Override
        if (override.type) {
            // Reset auto-detected hints if override is present
            rendererHint = undefined;
            format = undefined;

            switch (override.type) {
                case 'text':
                case 'string': jsonType = 'string'; break;
                case 'textarea': jsonType = 'string'; rendererHint = 'textarea'; break;
                case 'number': jsonType = 'number'; break;
                case 'boolean':
                case 'checkbox': jsonType = 'boolean'; break;
                case 'date': jsonType = 'string'; format = 'date'; break;
                case 'datetime': jsonType = 'string'; format = 'date-time'; break;
                case 'email': jsonType = 'string'; format = 'email'; rendererHint = 'email'; break;
                case 'phone': jsonType = 'string'; rendererHint = 'phone'; break;
                case 'select':
                case 'dropdown': jsonType = 'string'; rendererHint = 'dropdown'; break;
                case 'multiselect': jsonType = 'array'; rendererHint = 'multiselect'; break;
                case 'image': jsonType = 'string'; rendererHint = 'image'; break;
            }
        }

        // Build JSON Schema property
        const prop: Record<string, any> = { type: jsonType };
        if (format) prop.format = format;

        // Handle array type for multiselect
        if (jsonType === 'array') {
            prop.items = { type: 'string' };
        }

        // Apply Validation Overrides
        if (override.validation) {
            const v = override.validation;
            if (v.min !== undefined) {
                if (jsonType === 'string') prop.minLength = v.min;
                if (jsonType === 'number' || jsonType === 'integer') prop.minimum = v.min;
            }
            if (v.max !== undefined) {
                if (jsonType === 'string') prop.maxLength = v.max;
                if (jsonType === 'number' || jsonType === 'integer') prop.maximum = v.max;
            }
            if (v.pattern) {
                prop.pattern = v.pattern;
                if (v.patternError) {
                    prop.errorMessage = { pattern: v.patternError };
                    // Note: errorMessage requires AJV errors, typically via UI schema or extended validation layout
                    // JSON Forms doesn't natively support `errorMessage` keyword without extra config, 
                    // but we can try passing it or handle it in UI schema validation hints if supported.
                    // For now, let's stick to standard JSON Schema.
                }
            }
        }

        properties[column.name] = prop;

        // Required logic
        const isRequired = override.validation?.required !== undefined
            ? override.validation.required
            : (!column.nullable && !column.primary_key);

        if (isRequired) {
            required.push(column.name);
        }

        // Build UI Schema element
        const uiElement: Record<string, any> = {
            type: 'Control',
            scope: `#/properties/${column.name}`,
        };

        // Label override
        if (override.label) {
            uiElement.label = override.label;
        }

        // Add options for special renderers
        if (rendererHint || fieldOptions || readOnlySet.has(column.name)) {
            uiElement.options = {
                ...(fieldOptions || {}),
                ...(rendererHint ? { rendererHint } : {}),
                ...(readOnlySet.has(column.name) ? { readonly: true } : {}),
                // FK display column from override
                ...(override.fkDisplayColumn ? { fkDisplayColumn: override.fkDisplayColumn } : {}),
            };
        }

        // Mark primary keys as readonly
        if (column.primary_key) {
            uiElement.options = { ...uiElement.options, readonly: true };
        }

        uiElements.push(uiElement);
    }

    return {
        schema: {
            type: 'object',
            properties,
            required,
        },
        uiSchema: {
            type: 'VerticalLayout',
            elements: uiElements,
        },
    };
}

/**
 * Utility to get display label from column name.
 */
export function columnToLabel(columnName: string): string {
    return columnName
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}
