import React from 'react';
import { Type, Hash, Calendar, ToggleLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ColumnInfo } from '@/hooks/data/useBindingColumns';

export const ColumnTypeIcon: React.FC<{ type: string }> = ({ type }) => {
    const t = (type || '').toLowerCase();
    const cls = 'h-3.5 w-3.5 text-muted-foreground shrink-0';
    if (/(int|numeric|decimal|float|double|real|money|serial)/.test(t)) return <Hash className={cls} />;
    if (/(date|time)/.test(t)) return <Calendar className={cls} />;
    if (/(bool)/.test(t)) return <ToggleLeft className={cls} />;
    return <Type className={cls} />;
};

export const ColumnSelect: React.FC<{
    value: string;
    columns: ColumnInfo[];
    placeholder: string;
    allowNone?: boolean;
    className?: string;
    onChange: (value: string) => void;
}> = ({ value, columns, placeholder, allowNone, className, onChange }) => {
    const NONE = '__none__';
    return (
        <Select
            value={value || (allowNone ? NONE : '')}
            onValueChange={(v) => onChange(v === NONE ? '' : v)}
        >
            <SelectTrigger className={className}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {allowNone && (
                    <SelectItem value={NONE}>
                        <span className="text-muted-foreground">{placeholder}</span>
                    </SelectItem>
                )}
                {columns.map((col) => (
                    <SelectItem key={col.name} value={col.name}>
                        <span className="flex items-center gap-2">
                            <ColumnTypeIcon type={col.type} />
                            {col.name}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};
