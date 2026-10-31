/** Shared lexical parameter scanner; no TCP-driver dependency in HTTP state. */
export function postgresPlaceholders(sql: string, format?: (index:number,original:string)=>string): string {
    let out = '';
    let parameter = 0;
    let i = 0;
    let state: 'code' | 'single' | 'double' | 'line-comment' | 'block-comment' | 'dollar' = 'code';
    let dollarTag = '';

    while (i < sql.length) {
        const char = sql[i]!;
        const next = sql[i + 1];

        if (state === 'single') {
            out += char;
            if (char === "'" && next === "'") { out += next; i += 2; continue; }
            if (char === "'") state = 'code';
            i += 1;
            continue;
        }
        if (state === 'double') {
            out += char;
            if (char === '"' && next === '"') { out += next; i += 2; continue; }
            if (char === '"') state = 'code';
            i += 1;
            continue;
        }
        if (state === 'line-comment') {
            out += char;
            if (char === '\n') state = 'code';
            i += 1;
            continue;
        }
        if (state === 'block-comment') {
            out += char;
            if (char === '*' && next === '/') { out += '/'; i += 2; state = 'code'; continue; }
            i += 1;
            continue;
        }
        if (state === 'dollar') {
            if (sql.startsWith(dollarTag, i)) {
                out += dollarTag;
                i += dollarTag.length;
                state = 'code';
            } else {
                out += char;
                i += 1;
            }
            continue;
        }

        if (char === "'") { out += char; state = 'single'; i += 1; continue; }
        if (char === '"') { out += char; state = 'double'; i += 1; continue; }
        if (char === '-' && next === '-') { out += '--'; state = 'line-comment'; i += 2; continue; }
        if (char === '/' && next === '*') { out += '/*'; state = 'block-comment'; i += 2; continue; }
        if (char === '$') {
            const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
            if (match) {
                dollarTag = match[0];
                out += dollarTag;
                i += dollarTag.length;
                state = 'dollar';
                continue;
            }
        }
        if(format&&char==='$'){const numbered=sql.slice(i).match(/^\$(\d+)/);if(numbered){out+=format(Number(numbered[1]),numbered[0]);i+=numbered[0].length;continue;}}
        if (char === '?') {
            parameter += 1;
            out += format ? format(parameter,'?') : '$'+parameter;
        } else {
            out += char;
        }
        i += 1;
    }
    return out;
}
