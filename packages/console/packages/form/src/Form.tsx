import React, { useMemo, useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { FormProps, ColumnSchema, FormFieldOverride, FieldRenderProps } from './types';
import { useFormQuery, useFormSubmit } from './hooks/useFormQuery';
import { validateFormData } from './validation/validationManager';

// Local cn utility to avoid bringing in the whole lib
function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** Format column name to human-readable label */
function columnToLabel(name: string): string {
    return name
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/** Detect field input type from column metadata and overrides */
function detectFieldType(column: ColumnSchema, override: FormFieldOverride = {}): string {
    // Explicit override takes priority
    if (override.type) {
        switch (override.type) {
            case 'textarea': return 'textarea';
            case 'number': return 'number';
            case 'boolean':
            case 'checkbox': return 'checkbox';
            case 'date': return 'date';
            case 'datetime': return 'datetime-local';
            case 'email': return 'email';
            case 'phone': return 'tel';
            case 'select':
            case 'dropdown': return 'select';
            case 'multiselect': return 'multiselect';
            case 'image': return 'url';
        }
    }

    // Auto-detect from column metadata
    const name = column.name.toLowerCase();
    const sqlType = (typeof column.type === 'string' ? column.type : (column.type?.[0] || '')).toLowerCase();

    if (name.includes('email')) return 'email';
    if (name.includes('phone') || name.includes('mobile')) return 'tel';
    if (column.is_foreign && column.foreign_table) return 'select';
    if (sqlType.includes('bool') || sqlType === 'tinyint(1)') return 'checkbox';
    if (sqlType.includes('int') || sqlType === 'serial' || sqlType === 'bigserial') return 'number';
    if (sqlType.includes('decimal') || sqlType.includes('numeric') || sqlType.includes('float') || sqlType.includes('double')) return 'number';
    if (sqlType === 'date') return 'date';
    if (sqlType.includes('datetime') || sqlType.includes('timestamp')) return 'datetime-local';
    if (sqlType.includes('json') || sqlType.includes('jsonb')) return 'multiselect';

    const textareaNames = ['description', 'notes', 'content', 'body', 'bio', 'summary', 'comment', 'message'];
    if (textareaNames.some(n => name.includes(n))) return 'textarea';

    return 'text';
}


export function Form({
    mode = 'builder',
    binding,
    tableName: propTableName,
    recordId: propRecordId,
    dataSourceId: propDataSourceId,
    title,
    showCard = true,
    className,
    style,
    excludeColumns: propExcludeColumns,
    readOnlyColumns = [],
    fieldOverrides: propOverrides,
    fieldOrder: propFieldOrder,
    initialData,
    fieldWrapper,
    fieldRenderer,
    labelRenderer,
    onSubmit,
    onCancel,
    onConfigureBinding,
}: FormProps) {
    const tableName = binding.tableName || propTableName || '';
    const recordId = binding.recordId || propRecordId || '';
    const dataSourceId = propDataSourceId || binding.dataSourceId || binding.datasourceId || '';
    const fieldOverrides = propOverrides || binding.fieldOverrides || {};
    const fieldOrder = propFieldOrder || binding.fieldOrder || [];
    const excludeColumns = propExcludeColumns || binding.excludeColumns || [];
    const isEditMode = !!recordId;
    const readOnlySet = new Set(readOnlyColumns);

    // Cast style to break cross-package csstype version incompatibility
    // (Edge has its own node_modules/csstype which conflicts with root's)
    const safeStyle = style as React.CSSProperties | undefined;

    // Data fetching via TanStack query
    const {
        data: queryResult,
        isLoading: loading,
        error: queryError
    } = useFormQuery({
        mode,
        binding: {
            ...binding,
            dataSourceId,
            tableName,
            recordId,
        },
        recordId,
        initialData,
        enabled: !!tableName
    });

    // Submit mutation
    const submitMutation = useFormSubmit(
        { ...binding, tableName, dataSourceId },
        mode
    );

    // Form state
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [success, setSuccess] = useState(false);
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

    // Populate form data from fetched record (edit mode)
    const record = queryResult?.record;
    useEffect(() => {
        if (record && isEditMode) {
            setFormData(record);
        }
    }, [record, isEditMode]);

    // In Builder mode, the hook fetches the schema dynamically. In Edge mode, it falls back to binding.
    const rawColumns = queryResult?.columns?.length ? queryResult.columns : (binding.columns || []);

    // Derive visible, ordered columns
    const visibleColumns = useMemo(() => {
        let cols = [...rawColumns];

        // Sort by fieldOrder if configured
        if (fieldOrder.length > 0) {
            const colMap = new Map(cols.map(c => [c.name, c]));
            const sorted: ColumnSchema[] = [];
            const seen = new Set<string>();
            for (const name of fieldOrder) {
                if (colMap.has(name)) { sorted.push(colMap.get(name)!); seen.add(name); }
            }
            for (const c of cols) { if (!seen.has(c.name)) sorted.push(c); }
            cols = sorted;
        }

        // Filter out hidden, excluded, and PK fields
        const excludeSet = new Set(excludeColumns);
        cols = cols.filter(c =>
            !c.primary_key &&
            !fieldOverrides[c.name]?.hidden &&
            !excludeSet.has(c.name)
        );

        return cols;
    }, [rawColumns, fieldOrder, fieldOverrides, excludeColumns]);

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Sprint 2: validate required fields before submitting
        const { valid, errors } = validateFormData(formData, visibleColumns, fieldOverrides);
        if (!valid) {
            setValidationErrors(errors);
            return;
        }
        setValidationErrors({});

        try {
            await submitMutation.mutateAsync({ data: formData, recordId: isEditMode ? recordId : undefined });
            setSuccess(true);
            if (!isEditMode) setFormData({});
            setTimeout(() => setSuccess(false), 3000);
            onSubmit?.(formData);
        } catch (err) {
            // Error is captured by submitMutation.error
        }
    };

    const formTitle = title || (isEditMode ? `Edit ${tableName}` : `New ${tableName}`);

    // ─── Early states ──────────────────────────────────────────────────

    // Empty binding
    if (!tableName) {
        return (
            <div className={cn('rounded-md border p-8', className)} style={safeStyle}>
                <div className="text-center text-muted-foreground">
                    No table configured.
                    {onConfigureBinding && (
                        <button
                            onClick={onConfigureBinding}
                            className="ml-1 text-primary hover:underline"
                        >
                            Configure binding
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Query error
    if (queryError) {
        return (
            <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm p-6", className)} style={safeStyle}>
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    Failed to load form: {queryError instanceof Error ? queryError.message : 'Unknown error'}
                </div>
            </div>
        );
    }

    // No columns baked
    if (rawColumns.length === 0 && !loading) {
        return (
            <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm p-6", className)} style={safeStyle}>
                <p className="text-sm text-muted-foreground">
                    {tableName
                        ? `No schema available for "${tableName}". Try re-publishing or check the configuration.`
                        : 'Select a table to generate form.'
                    }
                </p>
            </div>
        );
    }

    // Loading
    if (loading && rawColumns.length === 0) {
        return (
            <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm p-6", className)} style={safeStyle}>
                {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
                <div className="space-y-4 animate-pulse">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="space-y-1.5">
                            <div className="h-3 bg-muted rounded w-20"></div>
                            <div className="h-10 bg-muted rounded"></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ─── Default field renderer ────────────────────────────────────────

    const defaultFieldRenderer = (props: FieldRenderProps) => {
        const { fieldType, value, onChange, required, disabled, column } = props;
        const inputId = `field-${column.name}`;
        const baseInputClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

        switch (fieldType) {
            case 'textarea':
                return (
                    <textarea
                        id={inputId}
                        value={value || ''}
                        onChange={e => onChange(e.target.value)}
                        required={required}
                        disabled={disabled}
                        rows={4}
                        className={baseInputClass + " min-h-[80px]"}
                    />
                );

            case 'checkbox':
                return (
                    <div className="flex items-center gap-2">
                        <input
                            id={inputId}
                            type="checkbox"
                            checked={!!value}
                            onChange={e => onChange(e.target.checked)}
                            disabled={disabled}
                            className="h-4 w-4 rounded border-gray-300"
                        />
                    </div>
                );

            case 'select':
                return (
                    <select
                        id={inputId}
                        value={value || ''}
                        onChange={e => onChange(e.target.value)}
                        required={required}
                        disabled={disabled}
                        className={baseInputClass}
                    >
                        <option value="">Select...</option>
                        {props.override.options?.map((opt: string, i: number) => (
                            <option key={i} value={opt}>{opt}</option>
                        ))}
                    </select>
                );

            case 'number':
                return (
                    <input
                        id={inputId}
                        type="number"
                        value={value ?? ''}
                        onChange={e => onChange(e.target.value ? Number(e.target.value) : '')}
                        required={required}
                        disabled={disabled}
                        className={baseInputClass}
                    />
                );

            default:
                return (
                    <input
                        id={inputId}
                        type={fieldType}
                        value={value || ''}
                        onChange={e => onChange(e.target.value)}
                        required={required}
                        disabled={disabled}
                        className={baseInputClass}
                    />
                );
        }
    };

    // ─── Form content ──────────────────────────────────────────────────

    const renderField = fieldRenderer || defaultFieldRenderer;

    const formContent = (
        <form onSubmit={handleSubmit} className="space-y-4">
            {visibleColumns.map(column => {
                const override = fieldOverrides[column.name] || {};
                const fieldType = detectFieldType(column, override);
                const label = override.label || columnToLabel(column.name);
                const isRequired = override.validation?.required !== undefined
                    ? override.validation.required
                    : (!column.nullable && !column.primary_key);
                const isReadOnly = readOnlySet.has(column.name);

                const fieldContent = (
                    <div className="space-y-1.5">
                        {labelRenderer
                            ? labelRenderer(column.name, label, isRequired)
                            : (
                                <label
                                    htmlFor={`field-${column.name}`}
                                    className="text-sm font-medium leading-none"
                                >
                                    {label}
                                    {isRequired && <span className="text-red-500 ml-0.5">*</span>}
                                </label>
                            )}

                        {renderField({
                            column,
                            fieldType,
                            label,
                            value: formData[column.name],
                            onChange: (val) => {
                                setFormData(prev => ({ ...prev, [column.name]: val }));
                                // Clear field error as the user edits
                                if (validationErrors[column.name]) {
                                    setValidationErrors(prev => {
                                        const next = { ...prev };
                                        delete next[column.name];
                                        return next;
                                    });
                                }
                            },
                            required: isRequired,
                            override,
                            disabled: isReadOnly,
                        })}

                        {validationErrors[column.name] && (
                            <p className="text-xs text-red-600" role="alert">
                                {validationErrors[column.name]}
                            </p>
                        )}
                    </div>
                );

                // IoC injection: wrap in builder toolings if provided
                if (fieldWrapper) {
                    return React.cloneElement(
                        fieldWrapper(column.name, fieldContent) as React.ReactElement,
                        { key: column.name }
                    );
                }

                return React.cloneElement(fieldContent, { key: column.name });
            })}

            {/* Status messages */}
            {submitMutation.error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                    {submitMutation.error instanceof Error ? submitMutation.error.message : 'Failed to save record'}
                </div>
            )}
            {success && (
                <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                    {isEditMode ? 'Record updated successfully!' : 'Record created successfully!'}
                </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={submitMutation.isPending}
                        className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    disabled={submitMutation.isPending}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    {submitMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {isEditMode ? 'Update' : 'Create'}
                </button>
            </div>
        </form>
    );

    // ─── Card wrapper ──────────────────────────────────────────────────

    if (showCard) {
        return (
            <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} style={safeStyle}>
                <div className="flex flex-col space-y-1.5 p-6 pb-4">
                    <h3 className="text-lg font-semibold leading-none tracking-tight">{formTitle}</h3>
                </div>
                <div className="p-6 pt-0">
                    {formContent}
                </div>
            </div>
        );
    }

    return <div className={cn(className)} style={safeStyle}>{formContent}</div>;
}

export default Form;
