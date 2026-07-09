/**
 * Workflow Logger
 *
 * Scoped logger that respects per-workflow `log_level` setting.
 * Levels: 'none' (silent), 'errors' (errors only), 'all' (everything).
 *
 * Usage:
 *   const log = createWorkflowLogger(settings.log_level || 'all');
 *   log.info('Node completed', { nodeId });
 *   log.error('Node failed', error);
 */

export type LogLevel = 'none' | 'errors' | 'all';

export interface WorkflowLogger {
    info: (msg: string, ...args: any[]) => void;
    error: (msg: string, ...args: any[]) => void;
    warn: (msg: string, ...args: any[]) => void;
}

/**
 * Create a scoped logger for a workflow execution.
 *
 * @param level - Logging level from workflow settings
 * @param prefix - Optional prefix (default: '[Workflow]')
 * @returns WorkflowLogger instance
 */
export function createWorkflowLogger(
    level: LogLevel = 'all',
    prefix: string = '[Workflow]'
): WorkflowLogger {
    return {
        info: (msg: string, ...args: any[]) => {
            if (level === 'all') console.log(prefix, msg, ...args);
        },
        error: (msg: string, ...args: any[]) => {
            if (level !== 'none') console.error(prefix, msg, ...args);
        },
        warn: (msg: string, ...args: any[]) => {
            if (level !== 'none') console.warn(prefix, msg, ...args);
        },
    };
}
