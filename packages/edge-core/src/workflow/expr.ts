/**
 * Expression Engine (shared by node-executors + loop node)
 *
 * Extracted to avoid a circular import between node-executors.ts and nodes/LoopNode.ts.
 * A small, safe-ish expression evaluator supporting path access, literals,
 * comparison/boolean operators, and negation. No eval() of arbitrary code.
 */

export function normalizeExpression(expr: string): string {
    return expr
        .replace(/\[['"]([^'"]+)['"]\]/g, '.$1')
        .replace(/\[(\d+)\]/g, '.$1');
}

export function getPath(obj: any, path: string): any {
    const parts = path.trim().split('.');
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        current = current[part];
    }
    return current;
}

export function safeEval(expression: string, data: Record<string, any>): any {
    expression = normalizeExpression(expression.trim());

    if (expression === 'true') return true;
    if (expression === 'false') return false;
    if (expression === 'null') return null;
    if (expression === 'undefined') return undefined;

    if (/^\d+(\.\d+)?$/.test(expression)) {
        return Number(expression);
    }

    const stringMatch = expression.match(/^['"](.*)['"]$/);
    if (stringMatch) {
        return stringMatch[1];
    }

    if (expression.startsWith('!')) {
        return !safeEval(expression.substring(1), data);
    }

    if (expression.includes('||')) {
        const parts = expression.split('||');
        for (const part of parts) {
            const val = safeEval(part, data);
            if (val) return val;
        }
        return safeEval(parts[parts.length - 1], data);
    }

    if (expression.includes('&&')) {
        const parts = expression.split('&&');
        let val: any = true;
        for (const part of parts) {
            val = safeEval(part, data);
            if (!val) return val;
        }
        return val;
    }

    const operators = ['===', '!==', '==', '!=', '>=', '<=', '>', '<'];
    for (const op of operators) {
        if (expression.includes(op)) {
            const parts = expression.split(op).map((p) => p.trim());
            if (parts.length === 2) {
                const left = safeEval(parts[0], data);
                const right = safeEval(parts[1], data);
                switch (op) {
                    case '===':
                    case '==':
                        return left === right;
                    case '!==':
                    case '!=':
                        return left !== right;
                    case '>=':
                        return left >= right;
                    case '<=':
                        return left <= right;
                    case '>':
                        return left > right;
                    case '<':
                        return left < right;
                }
            }
        }
    }

    if (expression === 'data') return data;
    if (expression.startsWith('data.')) {
        return getPath({ data }, expression);
    }

    return getPath(data, expression);
}
