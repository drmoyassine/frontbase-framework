/** Marks only projected shared regions in the ephemeral canvas DOM. */
export function markSharedMenuPreview(doc: Document): void {
    doc.querySelectorAll<HTMLElement>('.fb-managed-region,.fb-managed-sidebar,header[id^="managed-menu-"],footer[id^="managed-menu-"]').forEach(el => {
        el.dataset.fbSharedMenu = 'true';
        el.title = 'Shared menu — edit in Menus';
    });
}
export function isSharedMenuPreview(target: Element | null): boolean {
    return !!target?.closest('[data-fb-shared-menu="true"]');
}
