/**
 * Get cell value from a row
 * 
 * Handles both flat RPC results and nested PostgREST results.
 * 
 * @example
 * // Direct key: getCellValue({ name: 'John' }, 'name') → 'John'
 * // Dot notation: getCellValue({ countries: { flag: '🇫🇷' } }, 'countries.flag') → '🇫🇷'
 * // Flat alias: getCellValue({ 'countries.flag': '🇫🇷' }, 'countries.flag') → '🇫🇷'
 */
export function getCellValue(row: Record<string, any>, col: string): any {
    if (!row) return undefined;

    // 1. Direct key match (flat result like RPC with aliased columns)
    if (col in row) {
        return row[col];
    }

    // 2. Nested object (PostgREST embedded result like row.countries.country)
    if (col.includes('.')) {
        const parts = col.split('.');
        let value: any = row;

        for (const part of parts) {
            if (value == null) return undefined;
            value = value[part];
        }

        if (value !== undefined) return value;

        // 3. Last part only (RPC returns SELECT countries.country as just "country" in result)
        const lastPart = parts[parts.length - 1];
        if (lastPart in row) {
            return row[lastPart];
        }
    }

    return undefined;
}
