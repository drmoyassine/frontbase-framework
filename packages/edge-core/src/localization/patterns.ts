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

const localeShape = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/** Resolve a composed label for `count`: the exact `base.<category>` variant when the pattern
 *  registry carries one for the locale's plural rules, else the base pattern. An invalid or
 *  unsupported locale keeps the stable declared fallback (the base pattern). */
export function pluralPatternLabel(labels: Readonly<Record<string, string>>, base: string, locale: string | undefined, count: number): string {
    let category: string | undefined;
    try {
        if (locale && locale.length <= 35 && localeShape.test(locale) && Intl.PluralRules.supportedLocalesOf([locale]).length) category = new Intl.PluralRules(locale).select(count);
    } catch { /* unsupported/invalid locale uses the base pattern */ }
    return (category && labels[`${base}.${category}`]) ?? labels[base] ?? '';
}
