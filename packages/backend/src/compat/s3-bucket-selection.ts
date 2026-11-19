/** An empty selection keeps the provider's normal bucket discovery. */
export function s3BucketSelection(value: unknown): string[] {
    if (value === undefined || value === '') return [];
    if (typeof value !== 'string' || value.length > 2048) throw new Error('invalid_s3_bucket_selection');
    const names = [...new Set(value.split(',').map(name => name.trim()).filter(Boolean))];
    if (names.length > 32 || names.some(name => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(name))) {
        throw new Error('invalid_s3_bucket_selection');
    }
    return names;
}
