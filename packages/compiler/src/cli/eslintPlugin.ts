/**
 * ESLint wrapping (CF-4, M3.1.5). Adapts the 3 custom Frontbase rules to an ESLint
 * flat-config plugin. `eslint` is an OPTIONAL peer dep (the rules already run
 * standalone via `frontbase lint`).
 *
 * Design (RULE 6 — one source of truth): the plugin does NOT reimplement the AST
 * visitors in ESLint's rule shape (that would duplicate the rule logic and drift).
 * It ships (a) a recommended flat-config fragment consumers register, and (b) a
 * `lint` delegate to `runLint` — the canonical implementation — so a consumer's
 * ESLint setup and `frontbase lint` produce identical diagnostics. A native-visitor
 * ESLint rewrite is a documented follow-up (mechanical, but needs the eslint dep).
 */
import { runLint } from './linter.js';

export interface FrontbaseEslintConfig {
    plugins: { frontbase: unknown };
    rules: Record<string, 'off' | 'warn' | 'error'>;
}

/** The rule codes + their ESLint severities (matching `frontbase lint`). */
export const RULE_SEVERITIES = {
    'no-browser-globals': 'error', // FB001
    'anchor-navigation': 'warn',   // FB002
    'describe-every-prop': 'warn', // FB003
} as const;

export const eslintPlugin = {
    meta: { name: 'eslint-plugin-frontbase', version: '0.1.0' },
    /** Recommended flat-config fragment — register in eslint.config.js. */
    config(): FrontbaseEslintConfig {
        return {
            plugins: { frontbase: eslintPlugin },
            rules: {
                'frontbase/no-browser-globals': RULE_SEVERITIES['no-browser-globals'],
                'frontbase/anchor-navigation': RULE_SEVERITIES['anchor-navigation'],
                'frontbase/describe-every-prop': RULE_SEVERITIES['describe-every-prop'],
            },
        };
    },
    /** The canonical linter — identical diagnostics to `frontbase lint` (RULE 6). */
    lint: runLint,
};
