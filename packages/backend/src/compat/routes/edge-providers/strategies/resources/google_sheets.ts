/**
 * Google Sheets resource strategy.
 *
 * Pings the Apps Script Web App's `schema` action (POST {secret, action}) to
 * confirm the secret/URL work, then returns the single synthetic sheet resource
 * the AccountResourcePicker auto-selects. Apps Script Web Apps redirect, so this
 * opts into redirect following (every hop SSRF-re-validated). Ported from
 * provider_discovery.py :: _discover_google_sheets.
 */
import type {
    ProviderResourceStrategy,
    DiscoveryResult,
    DiscoveredResource,
} from '../types.js';
import type { CompatFetch } from '../../../../external-http.js';
import { guardedExternalFetch } from '../../../../external-http.js';

export function createGoogleSheetsResourceStrategy(externalFetch: CompatFetch): ProviderResourceStrategy {
    return {
        provider: 'google_sheets',
        async discover(credentials) {
            const webAppUrl = String(credentials.webAppUrl ?? '').trim();
            const spreadsheetId = String(credentials.spreadsheetId ?? '');
            const secret = String(credentials.webAppSecret ?? '');
            const spreadsheetName = String(credentials.spreadsheetName ?? 'Google Sheet');
            if (!webAppUrl) return { success: false, detail: 'Web App URL is required' };

            try {
                const resp = await guardedExternalFetch(externalFetch, webAppUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ secret, action: 'schema' }),
                }, { followRedirects: true });
                if (!resp.ok) return { success: false, detail: `Web App returned HTTP ${resp.status}` };

                let data: unknown;
                try {
                    data = await resp.json();
                } catch {
                    return { success: false, detail: 'Web App did not return valid JSON' };
                }

                // The Web App rejects a bad secret with an explicit error envelope.
                if (typeof data === 'object' && data !== null && (data as { ok?: unknown }).ok === false) {
                    const err = (data as { error?: unknown }).error;
                    return { success: false, detail: typeof err === 'string' ? err : 'Invalid shared secret' };
                }

                const tables = (data as { tables?: unknown })?.tables;
                const tableCount = Array.isArray(tables) ? tables.length : 0;
                const resource: DiscoveredResource = {
                    id: spreadsheetId || 'sheet',
                    name: `${spreadsheetName} — Google Sheet`,
                    type: 'google_sheet',
                    webAppUrl,
                    spreadsheetId,
                };
                return {
                    success: true,
                    detail: tableCount ? `Connected — ${tableCount} sheet(s)` : 'Connected to Google Sheet',
                    resources: [resource],
                };
            } catch (error) {
                return { success: false, detail: `Could not reach the Web App: ${(error as Error).message}` };
            }
        },
    };
}
