import { FilterConfig } from '@/hooks/data/useSimpleData';

export interface FilterInputProps {
    filter: FilterConfig;
    tableName: string;
    dataSourceId?: string;  // For external datasources (MySQL, etc.)
    onValueChange: (value: any) => void;
}
