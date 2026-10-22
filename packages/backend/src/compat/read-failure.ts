/** Server-only fixed-code diagnostics. Never forward provider text, SQL, URLs or records. */
export function readFailureReason(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (/timeout|timed out|deadline|abort/i.test(message)) return 'timeout';
    if (/fetch failed|network|socket|ECONNRESET|ENOTFOUND|connection.*(?:closed|reset)/i.test(message)) return 'transport';
    if (/SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(message)) return 'state_busy';
    if (message === 'live_list_unavailable') return 'live_query';
    if (message === 'invalid_live_list_response') return 'invalid_live_result';
    if (message === 'locale_unavailable') return 'locale_integrity';
    if (message === 'reviewed_homepage_required') return 'reviewed_source_required';
    if (message === 'homepage_unavailable' || message === 'homepage_required') return 'source_unavailable';
    return 'unclassified';
}
export function reportReadFailure(stage: 'localized-page' | 'selected-schema' | 'single-table' | 'data-execute', error: unknown): void {
    console.warn('[frontbase] read_failure', { stage, reason: readFailureReason(error) });
}
