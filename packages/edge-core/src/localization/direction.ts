/** Locales whose primary script is right-to-left. One canonical rule for every direction
 *  stamping site — public serves, release previews and the console translation preview all
 *  import this helper, so a locale can never preview RTL and serve LTR (or the reverse). */
const RTL_LANGUAGES = new Set(['ar', 'fa', 'he', 'ur', 'ps', 'sd', 'ug', 'yi']);

/** Resolve the document direction for a locale tag. Matches the language subtag only
 *  (case-insensitive, `-`-bounded): `ar-EG` is rtl, `arab` and `en` are ltr. Invalid or
 *  empty input resolves ltr — direction stamping never throws on a hostile tag. */
export function localeDirection(locale: string): 'ltr' | 'rtl' {
    const language = locale.trim().split('-')[0]!.toLowerCase();
    return RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr';
}
