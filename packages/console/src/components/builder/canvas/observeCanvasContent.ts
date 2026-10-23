/** Hydrated lists can grow inside a fixed-size body without a body resize.
 * Observe content changes too; attribute stamps deliberately do not retrigger it. */
export function observeCanvasContent(doc: Document, schedule: () => void): () => void {
    const observer = new MutationObserver(schedule);
    if (doc.body) observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
    doc.addEventListener('load', schedule, true);
    return () => {
        observer.disconnect();
        doc.removeEventListener('load', schedule, true);
    };
}
