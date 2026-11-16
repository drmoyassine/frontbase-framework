/** Parameterized chrome patterns: released label text carries `{token}` placeholders and
 *  optional per-plural-category variants (`base.one`, `base.zero`, …) selected with
 *  Intl.PluralRules. Deliberately NOT an ICU/MF2 parser — bounded substitution over reviewed
 *  patterns, with placeholder parity enforced by the revision validator. */

export type LocalePatternValues = Readonly<Record<string, string | number>>;

/** Substitute `{name}` tokens; an unknown name stays literal so a broken pattern can never
 *  silently render as if substitution had happened. Values are bounded strings/numbers. */
export function formatLocalePattern(pattern: string, values: LocalePatternValues): string {
    return pattern.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, name: string) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token);
}

const pluralRules = new Map<string, Intl.PluralRules | null>();
const localeShape = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/** Resolve a composed label for `count`: the exact `base.<category>` variant when the pattern
 *  registry carries one for the locale's plural rules, else the base pattern. An invalid or
 *  unsupported locale keeps the stable declared fallback (the base pattern). */
export function pluralPatternLabel(labels: Readonly<Record<string, string>>, base: string, locale: string | undefined, count: number): string {
    // No plural variants means locale work cannot change the output.
    if (!['zero','one','two','few','many','other'].some(key => Object.prototype.hasOwnProperty.call(labels, `${base}.${key}`))) return labels[base] ?? '';
    let category: string | undefined;
    try {
        if (locale && locale.length <= 35 && localeShape.test(locale)) {
            // CLDR cardinal integer rules for the two common site locales.
            // Avoid loading ICU plural data on a cold edge request. Fractions,
            // extended locales and all other languages retain the Intl path.
            // https://unicode.org/cldr/charts/48/supplemental/language_plural_rules.html
            const integer = Number.isSafeInteger(count) ? Math.abs(count) : undefined;
            if (integer !== undefined && locale === 'en') category = integer === 1 ? 'one' : 'other';
            else if (integer !== undefined && locale === 'ar') {
                const remainder = integer % 100;
                category = integer === 0 ? 'zero' : integer === 1 ? 'one' : integer === 2 ? 'two'
                    : remainder >= 3 && remainder <= 10 ? 'few' : remainder >= 11 && remainder <= 99 ? 'many' : 'other';
            } else {
                let rules = pluralRules.get(locale);
                if (rules === undefined) {
                    rules = Intl.PluralRules.supportedLocalesOf([locale]).length ? new Intl.PluralRules(locale) : null;
                    if (pluralRules.size < 64) pluralRules.set(locale, rules);
                }
                category = rules?.select(count);
            }
        }
    } catch { /* unsupported/invalid locale uses the base pattern */ }
    return (category && labels[`${base}.${category}`]) ?? labels[base] ?? '';
}
