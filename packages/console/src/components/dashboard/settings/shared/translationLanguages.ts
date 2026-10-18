import { localeSchema } from '@frontbase/edge-core/localization';
import type { TranslationChoice } from './TranslationPicker';

type Names = { of(code: string): string | undefined };
// Native Intl provides CLDR names without shipping another locale-data/runtime library.
const DisplayNames = (Intl as unknown as { DisplayNames: new (locales: string[], options: { type: string }) => Names }).DisplayNames;
const english = new DisplayNames(['en'], { type: 'language' });
const languageCodes = new Set<string>();
for(let first=97;first<=122;first++) for(let second=97;second<=122;second++) {
    const code=String.fromCharCode(first,second), name=english.of(code), parsed=localeSchema.safeParse(code);
    if(name && name!==code && parsed.success) languageCodes.add(parsed.data);
}
for(const code of ['en-US','en-GB','ar-SA','pt-BR','pt-PT','es-419','fr-CA','zh-Hans','zh-Hant','zh-CN','zh-TW','sr-Latn']) languageCodes.add(code);
export function translationLanguages(saved: string[] = []): TranslationChoice[] {
    return [...new Set([...languageCodes,...saved])].map(value=>{
        const name=english.of(value) ?? value;
        let native=name; try { native=new DisplayNames([value],{type:'language'}).of(value) ?? name; } catch { /* Saved tags retain a readable fallback. */ }
        return { value, label: `${name} (${value})`, keywords:[native] };
    }).sort((a,b)=>a.label.localeCompare(b.label));
}
