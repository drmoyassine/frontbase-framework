/**
 * Google Sheets provider module — credential enrichment + datasource resolution.
 *
 * Ports the product's connect-time storage (sheets_connect.py:191-306) and the
 * adapter resolution (google_sheets_adapter.__init__, lines 71-96) into the
 * framework worker.
 *
 * Connect flow (Phase 2 — Connected Account): the Google Sheets add-on callback
 *   (sheets_connect.py:191-306) supplies every field directly — `webAppSecret`
 *   is stored encrypted and `webAppUrl` / `spreadsheetId` / `spreadsheetName`
 *   land in provider_metadata. There is NO OAuth/API enrichment round-trip at
 *   connect time; credentials arrive complete from the SPA/add-on, so
 *   `enrichGoogleSheets` is a best-effort passthrough (it must still honor the
 *   ProviderEnricher contract: never throw, return the input unchanged on any
 *   error so connect always succeeds with the bare payload).
 *
 * Resolution (datasource → runner): the sync flow stores these fields on the
 *   datasource config and the Apps Script adapter reads them verbatim. No DbRunner
 *   transform is required — `resolveGoogleSheets` normalizes snake_case / legacy
 *   aliases (`web_app_url`, `spreadsheet_id`, `secret`, `web_app_secret_encrypted`)
 *   onto the canonical camelCase shape the adapter expects
 *   (`webAppUrl` + `webAppSecret` + `spreadsheetId`) and carries the inline
 *   `webAppSecretEncrypted` fallback through untouched (decryption happens
 *   upstream, just like the product's `decrypt_field` path).
 */
import type { DatasourceResolver, ProviderEnricher } from './types.js';

/**
 * Resolve a stored Google Sheets config into the adapter's runner shape.
 * PURE — no I/O. Field aliases mirror google_sheets_adapter.__init__:
 *   webAppUrl    ← webAppUrl | web_app_url
 *   webAppSecret ← webAppSecret | secret
 *   spreadsheetId ← spreadsheetId | spreadsheet_id
 * The encrypted inline fallback (`webAppSecretEncrypted`) is preserved so the
 * upstream decrypt path (product: `decrypt_field`) can still resolve a secret
 * when no plaintext is stored.
 */
export const resolveGoogleSheets: DatasourceResolver = (config) => {
    const webAppUrl = String(config.webAppUrl ?? config.web_app_url ?? '').trim();
    const webAppSecret = String(config.webAppSecret ?? config.secret ?? '');
    const spreadsheetId = String(config.spreadsheetId ?? config.spreadsheet_id ?? '');

    const resolved: Record<string, unknown> = { webAppUrl, webAppSecret, spreadsheetId };

    // Carry the encrypted inline fallback through verbatim (decrypted upstream).
    const encrypted = config.webAppSecretEncrypted ?? config.web_app_secret_encrypted;
    if (encrypted) resolved.webAppSecretEncrypted = String(encrypted);

    // spreadsheetName is optional display metadata; carry it when present.
    const spreadsheetName = config.spreadsheetName ?? config.spreadsheet_name;
    if (spreadsheetName) resolved.spreadsheetName = String(spreadsheetName);

    return resolved;
};

/**
 * Connect-time enrichment. The Sheets add-on callback supplies every field
 * directly (sheets_connect.py:191-306), so there is nothing to fetch — this is
 * a passthrough. It still honors the ProviderEnricher contract: defensive
 * try/catch so any unexpected failure returns the input unchanged (connect must
 * never break on enrichment). `externalFetch` is accepted to match the seam but
 * intentionally unused; keeping the signature stable lets future enrichment
 * (e.g. a Sheets API call) land without touching the registry.
 */
export const enrichGoogleSheets: ProviderEnricher = async (config, _externalFetch) => {
    try {
        return { ...config };
    } catch {
        // best-effort — swallow; return input unchanged
        return config;
    }
};
