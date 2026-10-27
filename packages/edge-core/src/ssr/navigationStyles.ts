/** Shared canvas and public section-navigation presentation. */
export const NAVIGATION_CSS = `
.fb-row[data-fb-scroll-nav="scroll"]{flex-direction:row!important;flex-wrap:nowrap!important}
[data-fb-scroll-nav="scroll"]{overscroll-behavior-x:contain;scrollbar-width:none}
[data-fb-scroll-nav="scroll"][data-scrollbar="hidden"]::-webkit-scrollbar{display:none}
[data-fb-scroll-nav="scroll"][data-scrollbar="visible"]{scrollbar-width:auto}
[data-fb-scroll-nav="wrap"]{flex-wrap:wrap!important;overflow-x:visible!important}
[data-fb-scroll-nav]>.fb-nav-scroll-button{position:sticky;inset-inline-start:0;align-self:center;flex:0 0 32px;width:32px;height:32px;padding:0;border:1px solid #cbd5e1;border-radius:50%;background:var(--background,#fff);background-color:Canvas;color:CanvasText;box-shadow:0 2px 6px #0002;z-index:5;cursor:pointer;line-height:1;display:none}
[data-fb-scroll-nav]>.fb-nav-scroll-button[data-scroll-step="next"]{inset-inline-start:auto;inset-inline-end:0;order:9999}
[data-fb-scroll-nav]>.fb-nav-scroll-button[data-scroll-step="previous"]{order:-9999}
[data-fb-scroll-nav][data-nav-overflow="true"][data-scroll-arrows="auto"]>.fb-nav-scroll-button{display:block}
[data-fb-scroll-nav]>.fb-nav-scroll-button:disabled{visibility:hidden;pointer-events:none}
[data-fb-scroll-nav]>.fb-nav-scroll-button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
[data-fb-scroll-nav="scroll"]{overflow-x:auto}
`;
