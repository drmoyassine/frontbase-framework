/**
 * Zod schema extractor — the seed of @frontbase/compiler's schema extraction.
 *
 * Ported from the Phase 0 spike (docs/frontbase-framework/spike/src/extractor.ts
 * in the product repo), proven there at 14/14 assertions + a 5-case Zod round-trip.
 * M1.2 extends the seed with: .nullable(), format hints (.email/.url/.uuid), deeper
 * nesting, and structured diagnostics for unsupported constructs (z.union/.record/etc).
 *
 * Built on the TypeScript compiler API (native TSX). Targets zod 3.25 — where
 * `.describe()` is a chainable method (v4 changed it to metadata; do NOT bump zod).
 */
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import type { ComponentManifest, ExtractionDiagnostic, PropertyField, ZodKind } from './types.js';

// ---- TS AST helpers ----
function findSchemaInitializer(sf: ts.SourceFile): ts.ObjectLiteralExpression | null {
    let result: ts.ObjectLiteralExpression | null = null;
    function visit(node: ts.Node) {
        if (result) return;
        if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
            for (const decl of node.declarationList.declarations) {
                if (decl.name.getText(sf) === 'Schema') {
                    result = extractZObjectArg(decl.initializer);
                    return;
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sf);
    return result;
}

/** Match `z.object({...})` and return the object literal argument. */
function extractZObjectArg(expr: ts.Expression | undefined): ts.ObjectLiteralExpression | null {
    if (!expr || !ts.isCallExpression(expr)) return null;
    const callee = expr.expression;
    if (ts.isPropertyAccessExpression(callee) && callee.getText() === 'z.object') {
        const arg = expr.arguments[0];
        return arg && ts.isObjectLiteralExpression(arg) ? arg : null;
    }
    return null;
}

/** Walk a method-call chain back to its root `z.X(...)` callee, collecting modifiers. */
interface ZodChain {
    rootCallee: string; // e.g. "z.string", "z.enum", "z.array", "z.object"
    rootArgs: readonly ts.Expression[];
    modifiers: Array<{ name: string; args: readonly ts.Expression[] }>;
}

function parseZodChain(node: ts.Expression): ZodChain | null {
    const modifiers: Array<{ name: string; args: readonly ts.Expression[] }> = [];
    let current: ts.Expression = node;
    while (ts.isCallExpression(current)) {
        const callee = current.expression;
        if (ts.isPropertyAccessExpression(callee)) {
            // Root z.X — its object is a bare identifier (e.g. `z`)
            if (ts.isIdentifier(callee.expression)) {
                return { rootCallee: callee.getText(), rootArgs: current.arguments, modifiers };
            }
            // Otherwise it's a chained modifier: .describe / .default / .optional / ...
            modifiers.push({ name: callee.name.text, args: current.arguments });
            current = callee.expression;
        } else if (ts.isIdentifier(callee)) {
            return { rootCallee: callee.text, rootArgs: current.arguments, modifiers };
        } else {
            return null;
        }
    }
    return null;
}

function literalValue(node: ts.Expression | undefined): unknown {
    if (!node) return undefined;
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(literalValue);
    if (ts.isObjectLiteralExpression(node)) {
        const obj: Record<string, unknown> = {};
        for (const prop of node.properties) {
            if (ts.isPropertyAssignment(prop)) obj[prop.name.getText()] = literalValue(prop.initializer);
        }
        return obj;
    }
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    return undefined;
}

/** Modifiers that imply a string-format hint (zod 3: z.string().email() etc.). */
const FORMAT_MODIFIERS: Record<string, PropertyField['format']> = {
    email: 'email',
    url: 'url',
    uuid: 'uuid',
    date: 'date',
};

function kindFromRootCallee(callee: string): ZodKind {
    switch (callee) {
        case 'z.string': return 'string';
        case 'z.number': return 'number';
        case 'z.boolean': return 'boolean';
        case 'z.enum': return 'enum';
        case 'z.array': return 'array';
        case 'z.object': return 'object';
        default: return 'unknown';
    }
}

/** Root callees the extractor deliberately does NOT support → a diagnostic. */
const UNSUPPORTED_ROOTS = new Set(['z.union', 'z.discriminatedUnion', 'z.literal', 'z.record', 'z.tuple', 'z.lazy', 'z.any', 'z.unknown', 'z.intersection']);

function parseProperty(name: string, value: ts.Expression, sf: ts.SourceFile, path: string, diagnostics: ExtractionDiagnostic[]): PropertyField {
    const chain = parseZodChain(value);
    const field: PropertyField = { name, kind: 'unknown', required: true };

    if (!chain) return field;

    // Unsupported construct → record a diagnostic, leave the field as `unknown`.
    if (UNSUPPORTED_ROOTS.has(chain.rootCallee)) {
        diagnostics.push({
            code: 'UNSUPPORTED_ZOD',
            path,
            message: `\`${chain.rootCallee}(...)\` is not supported by the Frontbase compiler`,
            suggestion: 'Use z.enum for a fixed value set, z.object for structured data, or z.array(z.object(...)) for lists.',
        });
        return field;
    }

    field.kind = kindFromRootCallee(chain.rootCallee);

    // enum values
    if (field.kind === 'enum') {
        const arr = chain.rootArgs[0];
        if (arr && ts.isArrayLiteralExpression(arr)) {
            field.enum = arr.elements.map((e) => literalValue(e) as string | number);
        }
    }
    // array element (recurse)
    if (field.kind === 'array' && chain.rootArgs[0]) {
        field.element = parseProperty('[]', chain.rootArgs[0], sf, `${path}[]`, diagnostics);
    }
    // nested object (recurse — handles ≥2 deep naturally)
    if (field.kind === 'object') {
        const obj = chain.rootArgs[0];
        if (obj && ts.isObjectLiteralExpression(obj)) {
            field.properties = obj.properties
                .filter(ts.isPropertyAssignment)
                .map((p) => parseProperty(p.name.getText(sf), p.initializer!, sf, `${path}.${p.name.getText(sf)}`, diagnostics));
        }
    }

    // modifiers (right-to-left in source; order doesn't matter for extraction)
    for (const mod of chain.modifiers) {
        switch (mod.name) {
            case 'optional': field.required = false; break;
            case 'nullable': field.nullable = true; break;
            case 'describe': field.description = literalValue(mod.args[0]) as string; break;
            case 'default':
                field.required = false; // has a default → not required at authoring time
                field.default = literalValue(mod.args[0]);
                break;
            case 'min': field.min = literalValue(mod.args[0]) as number; break;
            case 'max': field.max = literalValue(mod.args[0]) as number; break;
            default:
                // format hints: z.string().email()/.url()/.uuid()/.date()
                if (field.kind === 'string' && FORMAT_MODIFIERS[mod.name] && !field.format) {
                    field.format = FORMAT_MODIFIERS[mod.name];
                }
                break;
        }
    }
    return field;
}

// ---- Public API ----
export interface ExtractionResult {
    manifest: ComponentManifest;
    diagnostics: ExtractionDiagnostic[];
}

export function extractFromFile(filePath: string): ExtractionResult {
    const source = readFileSync(filePath, 'utf8');
    return extractFromSource(source, filePath);
}

export function extractFromSource(source: string, file: string): ExtractionResult {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const obj = findSchemaInitializer(sf);
    if (!obj) {
        throw new Error(`No \`export const Schema = z.object({...})\` found in ${file}`);
    }

    const diagnostics: ExtractionDiagnostic[] = [];
    const properties: PropertyField[] = obj.properties
        .filter(ts.isPropertyAssignment)
        .map((p) => parseProperty(p.name.getText(sf), p.initializer, sf, p.name.getText(sf), diagnostics));

    const name = deriveComponentName(file);
    return { manifest: { name, file, category: 'landing', properties }, diagnostics };
}

function deriveComponentName(file: string): string {
    return file.replace(/[\\/]/g, '/').split('/').pop()!.replace(/\.tsx$/, '');
}
