/**
 * Logic snippet schemas for the "Logic & Loops" picker group.
 *
 * Each snippet declares (a) plain-language help for a hover tooltip and (b) the
 * fields a mini-wizard collects, plus a `build()` that assembles valid LiquidJS
 * from those fields. This replaces the old "raw template + caret offset" model
 * so non-technical users never see empty `{%  %}` gaps — they fill a small form
 * and get complete, correct Liquid.
 */

export type SnippetFieldKind = 'condition' | 'variable' | 'text' | 'list' | 'content' | 'branches';

export interface SnippetField {
    key: string;
    label: string;
    kind: SnippetFieldKind;
    placeholder?: string;
    /** Default value (text/variable) or default item (list). */
    default?: string;
    /** Field may be left blank (e.g. the right-hand side of a truthiness check). */
    optional?: boolean;
    /** Short helper under the field. */
    hint?: string;
}

/** A condition field's value: variable/operator/value (rhs optional → truthiness). */
export interface ConditionValue {
    lhs: string;
    op: string;
    rhs: string;
}

/** One branch of an if/elsif chain: the test and the content shown on match. */
export interface BranchValue {
    cond: ConditionValue;
    body: string;
}

export type SnippetValues = Record<string, string | string[] | ConditionValue | BranchValue[]>;

export interface SnippetBuildResult {
    /** The complete Liquid string to insert. */
    text: string;
    /** Char offset within `text` to place the caret (usually the body). */
    caretOffset?: number;
}

export interface LogicSnippet {
    key: string;
    label: string;
    /** One-line plain-language tooltip (what it does). */
    tooltip: string;
    /** Concrete plain-language example (what it's for). */
    example: string;
    /** Right-aligned short tag in the list row. */
    description: string;
    fields: SnippetField[];
    build: (values: SnippetValues) => SnippetBuildResult;
    /**
     * Niche tag — rendered under an "Advanced" subsection in the picker (not
     * mixed with the everyday snippets). For break/continue/increment/etc.
     */
    advanced?: boolean;
    /**
     * Only meaningful inside a `{% for %}` loop (break/continue). Surfaces a
     * "use inside a loop" hint; not AST-enforced (a stray tag renders empty).
     */
    requiresLoop?: boolean;
}

// ── Operators offered in the condition builder (plain-language labels) ────────

export const CONDITION_OPERATORS: { value: string; label: string }[] = [
    { value: '==', label: 'is' },
    { value: '!=', label: 'is not' },
    { value: '>', label: 'greater than' },
    { value: '<', label: 'less than' },
    { value: '>=', label: 'at least' },
    { value: '<=', label: 'at most' },
    { value: 'contains', label: 'contains' },
];

// ── Operand normalization ────────────────────────────────────────────────────

/** Strip a `{{ … }}` wrapper to a bare Liquid expression (tags need bare exprs). */
export function toBareExpr(s: string): string {
    const t = (s ?? '').trim();
    const m = t.match(/^\{\{\s*([\s\S]*?)\s*\}\}$/);
    return (m ? m[1] : t).trim();
}

/**
 * Normalize the right-hand operand of a condition: bare a `{{ }}` variable,
 * leave numbers / booleans / nil / already-quoted strings as-is, and quote a
 * bare word as a string literal (so users don't have to know Liquid quoting).
 */
export function toOperandValue(s: string): string {
    const t = (s ?? '').trim();
    if (!t) return '';
    if (/^\{\{[\s\S]*\}\}$/.test(t)) return toBareExpr(t);
    if (/^-?\d+(\.\d+)?$/.test(t)) return t;               // number
    if (/^(true|false|nil|null|empty|blank)$/i.test(t)) return t.toLowerCase();
    if (/^['"][\s\S]*['"]$/.test(t)) return t;             // already quoted
    return `'${t.replace(/'/g, "\\'")}'`;                   // quote a bare string
}

/** Serialize a condition row into a Liquid boolean expression. */
export function serializeCondition(c: ConditionValue): string {
    const lhs = toBareExpr(c.lhs);
    if (!lhs) return '';
    const rhs = (c.rhs ?? '').trim();
    if (!c.op || !rhs) return lhs; // truthiness: {% if record.active %}
    return `${lhs} ${c.op} ${toOperandValue(rhs)}`;
}

function asCondition(v: SnippetValues, key: string): ConditionValue {
    const raw = v[key];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as ConditionValue;
    return { lhs: '', op: '==', rhs: '' };
}
function asBranches(v: SnippetValues, key: string): BranchValue[] {
    const raw = v[key];
    if (!Array.isArray(raw)) return [];
    return raw
        .map((b): BranchValue => {
            if (b && typeof b === 'object' && !Array.isArray(b) && 'cond' in b) return b as BranchValue;
            return { cond: { lhs: '', op: '==', rhs: '' }, body: '' };
        })
        .filter(b => !!b.cond.lhs.trim()); // drop branches with no test
}
function asText(v: SnippetValues, key: string, fallback = ''): string {
    const raw = v[key];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : fallback;
}
function asList(v: SnippetValues, key: string): string[] {
    const raw = v[key];
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === 'string' && !!x.trim());
}

// ── The snippets ─────────────────────────────────────────────────────────────

export const LOGIC_SNIPPETS: LogicSnippet[] = [
    {
        key: 'if',
        label: 'If',
        tooltip: 'Show content only when a test passes.',
        example: "e.g. show a 'VIP' badge only when the customer is premium.",
        description: 'Conditional',
        fields: [
            { key: 'cond', label: 'Show this when…', kind: 'condition' },
            { key: 'then', label: 'Then show…', kind: 'content', optional: true, placeholder: 'Content to show (leave blank to fill on canvas)' },
        ],
        build: (v) => {
            const cond = serializeCondition(asCondition(v, 'cond')) || 'condition';
            const then = asText(v, 'then');
            if (then) {
                return { text: `{% if ${cond} %}${then}{% endif %}` };
            }
            const prefix = `{% if ${cond} %}\n  `;
            return { text: `${prefix}\n{% endif %}`, caretOffset: prefix.length };
        },
    },
    {
        key: 'if_else',
        label: 'If / Else',
        tooltip: 'Show one thing when a test passes, another when it fails.',
        example: "e.g. show 'In stock' or 'Sold out' depending on quantity.",
        description: 'Conditional',
        fields: [
            { key: 'cond', label: 'Show the first block when…', kind: 'condition' },
            { key: 'then', label: 'Then show…', kind: 'content', optional: true, placeholder: "e.g. In stock" },
            { key: 'else', label: 'Otherwise show…', kind: 'content', optional: true, placeholder: "e.g. Sold out" },
        ],
        build: (v) => {
            const cond = serializeCondition(asCondition(v, 'cond')) || 'condition';
            const then = asText(v, 'then');
            const els = asText(v, 'else');
            if (then || els) {
                return { text: `{% if ${cond} %}${then}{% else %}${els}{% endif %}` };
            }
            const prefix = `{% if ${cond} %}\n  `;
            return { text: `${prefix}\n{% else %}\n  \n{% endif %}`, caretOffset: prefix.length };
        },
    },
    {
        key: 'if_elsif',
        label: 'If / Else if',
        tooltip: 'Pick the first matching block from several tests.',
        example: "e.g. show Gold / Silver / Bronze tiers, else Standard.",
        description: 'Multi-branch',
        fields: [
            { key: 'branches', label: 'Branches (first match wins)', kind: 'branches' },
            { key: 'else', label: 'If none match, show…', kind: 'content', optional: true, placeholder: "e.g. Standard" },
        ],
        build: (v) => {
            const branches = asBranches(v, 'branches');
            const els = asText(v, 'else');
            if (branches.length === 0) {
                const prefix = '{% if condition %}\n  ';
                return { text: `${prefix}\n{% endif %}`, caretOffset: prefix.length };
            }
            const allInline = els || branches.every(b => b.body.trim());
            const parts = branches.map((b, i) => {
                const tag = i === 0 ? 'if' : 'elsif';
                const c = serializeCondition(b.cond);
                return allInline ? `{% ${tag} ${c} %}${b.body}` : `{% ${tag} ${c} %}\n  ${b.body}`;
            });
            const elsePart = els ? (allInline ? `{% else %}${els}` : `{% else %}\n  ${els}`) : '';
            const closer = '{% endif %}';
            if (allInline) {
                return { text: `${parts.join('')}${elsePart}${closer}` };
            }
            // scaffold: caret into the first branch's body
            const text = `${parts.join('\n')}${elsePart ? '\n' + elsePart : ''}\n${closer}`;
            const firstCond = serializeCondition(branches[0].cond);
            const caretOffset = `{% if ${firstCond} %}\n  `.length;
            return { text, caretOffset };
        },
    },
    {
        key: 'unless',
        label: 'Unless',
        tooltip: 'Show content only when a test does NOT pass.',
        example: "e.g. show a 'Complete your profile' note unless the profile is done.",
        description: 'Negated conditional',
        fields: [
            { key: 'cond', label: 'Hide this when…', kind: 'condition' },
            { key: 'then', label: 'Show this otherwise…', kind: 'content', optional: true, placeholder: 'Content to show (leave blank to fill on canvas)' },
        ],
        build: (v) => {
            const cond = serializeCondition(asCondition(v, 'cond')) || 'condition';
            const then = asText(v, 'then');
            if (then) {
                return { text: `{% unless ${cond} %}${then}{% endunless %}` };
            }
            const prefix = `{% unless ${cond} %}\n  `;
            return { text: `${prefix}\n{% endunless %}`, caretOffset: prefix.length };
        },
    },
    {
        key: 'for',
        label: 'For loop',
        tooltip: 'Repeat content once for every item in a list.',
        example: "e.g. show a row for each order in the customer's order history.",
        description: 'Iterate a list',
        fields: [
            { key: 'list', label: 'List to repeat over', kind: 'variable', placeholder: 'e.g. record.orders' },
            { key: 'item', label: 'Name each item', kind: 'text', default: 'item', hint: 'Refer to it inside as {{ item.field }}' },
            { key: 'body', label: 'For each item, show…', kind: 'content', optional: true, placeholder: 'e.g. {{ item.name }} (leave blank to fill on canvas)' },
        ],
        build: (v) => {
            const list = toBareExpr(asText(v, 'list')) || 'items';
            const item = asText(v, 'item', 'item');
            const body = asText(v, 'body');
            if (body) {
                return { text: `{% for ${item} in ${list} %}${body}{% endfor %}` };
            }
            const prefix = `{% for ${item} in ${list} %}\n  `;
            return { text: `${prefix}\n{% endfor %}`, caretOffset: prefix.length };
        },
    },
    {
        key: 'case',
        label: 'Case / When',
        tooltip: 'Pick one of several blocks based on a value (a switch).',
        example: "e.g. show a different badge for plan = 'free', 'pro', or 'team'.",
        description: 'Switch',
        fields: [
            { key: 'subject', label: 'Value to check', kind: 'variable', placeholder: 'e.g. record.plan' },
            { key: 'whens', label: 'Cases to match', kind: 'list', default: '', hint: 'One block per value' },
        ],
        build: (v) => {
            const subject = toBareExpr(asText(v, 'subject')) || 'value';
            const whens = asList(v, 'whens');
            const branches = (whens.length ? whens : ['']).map(w => {
                const val = toOperandValue(w) || "''";
                return `{% when ${val} %}\n  `;
            });
            const head = `{% case ${subject} %}\n`;
            const body = branches.join('\n');
            return {
                text: `${head}${body}\n{% endcase %}`,
                // caret in the first when's body
                caretOffset: (head + `{% when ${toOperandValue(whens[0] || '') || "''"} %}\n  `).length,
            };
        },
    },
    {
        key: 'assign',
        label: 'Assign',
        tooltip: 'Save a value into a name you can reuse later on the page.',
        example: "e.g. assign fullName = record.first | append: record.last.",
        description: 'Set a variable',
        fields: [
            { key: 'name', label: 'Name', kind: 'text', placeholder: 'e.g. fullName' },
            { key: 'value', label: 'Value', kind: 'variable', placeholder: 'e.g. record.title' },
        ],
        build: (v) => {
            const name = asText(v, 'name', 'myVar');
            const value = toOperandValue(asText(v, 'value')) || "''";
            const text = `{% assign ${name} = ${value} %}`;
            return { text, caretOffset: text.length };
        },
    },
    {
        key: 'capture',
        label: 'Capture',
        tooltip: 'Save a block of content into a name you can reuse later.',
        example: "e.g. capture greeting, then show it twice with {{ greeting }}.",
        description: 'Set a variable',
        fields: [
            { key: 'name', label: 'Name', kind: 'text', placeholder: 'e.g. greeting' },
            { key: 'value', label: 'Content to save', kind: 'content', optional: true, placeholder: 'e.g. Welcome back! (leave blank to fill on canvas)' },
        ],
        build: (v) => {
            const name = asText(v, 'name', 'captured');
            const value = asText(v, 'value');
            if (value) {
                return { text: `{% capture ${name} %}${value}{% endcapture %}` };
            }
            const prefix = `{% capture ${name} %}\n  `;
            return { text: `${prefix}\n{% endcapture %}`, caretOffset: prefix.length };
        },
    },
    {
        key: 'cycle',
        label: 'Cycle',
        tooltip: 'Step through a fixed list of values, one per repeat of a loop.',
        example: 'e.g. alternate row colours red, blue, red, blue across list rows.',
        description: 'Alternate values',
        advanced: true,
        fields: [
            { key: 'values', label: 'Values to cycle', kind: 'list', hint: 'One value per line' },
        ],
        build: (v) => {
            const vals = asList(v, 'values').map(x => toOperandValue(x)).filter(Boolean);
            const list = vals.length ? vals.join(', ') : "'first', 'second'";
            const text = `{% cycle ${list} %}`;
            return { text, caretOffset: text.length };
        },
    },
    {
        key: 'increment',
        label: 'Increment',
        tooltip: 'Add 1 to a named counter (kept in its own namespace, not readable with {{ }}).',
        example: 'e.g. number items across the page with a shared counter.',
        description: 'Counter',
        advanced: true,
        fields: [
            { key: 'name', label: 'Counter name', kind: 'text', placeholder: 'e.g. counter' },
        ],
        build: (v) => {
            const name = asText(v, 'name', 'counter');
            const text = `{% increment ${name} %}`;
            return { text, caretOffset: text.length };
        },
    },
    {
        key: 'decrement',
        label: 'Decrement',
        tooltip: 'Subtract 1 from a named counter (kept in its own namespace, not readable with {{ }}).',
        example: 'e.g. count down remaining slots.',
        description: 'Counter',
        advanced: true,
        fields: [
            { key: 'name', label: 'Counter name', kind: 'text', placeholder: 'e.g. counter' },
        ],
        build: (v) => {
            const name = asText(v, 'name', 'counter');
            const text = `{% decrement ${name} %}`;
            return { text, caretOffset: text.length };
        },
    },
    {
        key: 'break',
        label: 'Break',
        tooltip: 'Stop a For loop early (use only inside a loop).',
        example: 'e.g. show only the first 3 items then stop.',
        description: 'Loop control',
        advanced: true,
        requiresLoop: true,
        fields: [],
        build: () => ({ text: '{% break %}' }),
    },
    {
        key: 'continue',
        label: 'Continue',
        tooltip: 'Skip to the next item in a For loop (use only inside a loop).',
        example: 'e.g. skip items that are hidden.',
        description: 'Loop control',
        advanced: true,
        requiresLoop: true,
        fields: [],
        build: () => ({ text: '{% continue %}' }),
    },
];

/** Whether a snippet's required fields are filled enough to insert. */
export function isSnippetValid(snippet: LogicSnippet, values: SnippetValues): boolean {
    return snippet.fields.every(f => {
        if (f.optional) return true;
        const raw = values[f.key];
        if (f.kind === 'condition') {
            const c = (raw as ConditionValue) || { lhs: '', op: '', rhs: '' };
            return !!c.lhs?.trim();
        }
        if (f.kind === 'branches') {
            return Array.isArray(raw) && raw.some((b: any) => b?.cond?.lhs?.trim());
        }
        if (f.kind === 'list') {
            return Array.isArray(raw) && raw.some(x => x && x.trim());
        }
        // text / variable / content — allow a default to satisfy required
        const s = typeof raw === 'string' ? raw : '';
        return !!(s.trim() || f.default?.trim());
    });
}

/** Initial wizard values for a snippet (seeds defaults). */
export function initialSnippetValues(snippet: LogicSnippet): SnippetValues {
    const values: SnippetValues = {};
    for (const f of snippet.fields) {
        if (f.kind === 'condition') values[f.key] = { lhs: '', op: '==', rhs: '' };
        else if (f.kind === 'branches') values[f.key] = [{ cond: { lhs: '', op: '==', rhs: '' }, body: '' }];
        else if (f.kind === 'list') values[f.key] = [''];
        else values[f.key] = f.default ?? '';
    }
    return values;
}
