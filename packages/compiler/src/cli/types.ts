/**
 * Shared CLI result model — every command produces a `CommandResult`, and
 * AgentFormatter serializes it to the agent JSON shape (technical-spec §Agent
 * Integration). Both human and --json output flow through this.
 */
export type Severity = 'error' | 'warning';

export interface Issue {
    file: string;
    line: number;
    column?: number;
    code: string;
    message: string;
    severity: Severity;
    fixable: boolean;
    fix?: string;
    /** Property/node path within the file, when applicable (e.g. "items.config"). */
    path?: string;
    /** Machine-applicable quick-fix (M3.1.1). Present only when `fixable`. */
    edit?: { type: 'insert' | 'replace' | 'delete'; oldString?: string; newString?: string; atEnd?: boolean };
}

export interface CommandResult {
    /** Command that produced this result, e.g. 'check' | 'lint' | 'init'. */
    command: string;
    success: boolean;
    summary: {
        total: number;
        passed: number;
        failed: number;
        warnings: number;
    };
    issues: Issue[];
    recommendations: string[];
    /** Command-specific structured payload (e.g. created project path). */
    details?: Record<string, unknown>;
}
