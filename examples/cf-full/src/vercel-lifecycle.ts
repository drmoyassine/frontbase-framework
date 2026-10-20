/** Host lifecycle only: does not replace durable delivery, leases or accounting. */
export function vercelDispatcher(waitUntil: (work: Promise<unknown>) => void,
    report: () => void = () => console.error('[frontbase] background_task_failed')) {
    return (work: () => Promise<unknown>): void => {
        // Register before executing, including work that throws synchronously.
        const task = Promise.resolve().then(work).catch(() => report());
        waitUntil(task);
    };
}
