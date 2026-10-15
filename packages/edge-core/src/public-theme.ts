/** Public-site preference only. Self-contained so the trusted SSR shell can initialize before paint. */
export function startPublicTheme():void {
    if(typeof window==='undefined'||typeof document==='undefined'||window.location.pathname.startsWith('/frontbase-admin'))return;
    const doc=document,root=doc.documentElement;
    if(root.dataset.fbThemeReady)return;
    root.dataset.fbThemeReady='true';
    const key='frontbase:public-theme',valid=(v:unknown):v is 'light'|'dark'|'system'=>v==='light'||v==='dark'||v==='system';
    let mode:'light'|'dark'|'system'='system';
    try{const saved=localStorage.getItem(key),legacy=localStorage.getItem('fb-theme');mode=valid(saved)?saved:valid(legacy)?legacy:'system';}catch{/* Opaque previews/storage denial still work for this page. */}
    const media=typeof window.matchMedia==='function'?window.matchMedia('(prefers-color-scheme: dark)'):null;
    const syncControls=()=>{
        doc.querySelectorAll<HTMLElement>('[data-fb-theme-choice]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.fbThemeChoice===mode)));
        doc.querySelectorAll<HTMLElement>('[data-fb-theme-picker] summary').forEach(summary=>{summary.setAttribute('aria-label',`Appearance: ${mode[0]!.toUpperCase()+mode.slice(1)}`);summary.setAttribute('title',`Appearance: ${mode}`);});
        doc.querySelectorAll<HTMLElement>('[data-fb-theme-icon]').forEach(icon=>{icon.hidden=icon.dataset.fbThemeIcon!==mode;});
    };
    const apply=()=>{const dark=mode==='dark'||mode==='system'&&media?.matches===true;root.classList.toggle('dark',dark);root.dataset.fbThemePreference=mode;root.dataset.fbTheme=dark?'dark':'light';root.style.colorScheme=dark?'dark':'light';syncControls();};
    doc.addEventListener('click',event=>{
        const button=event.target instanceof Element?event.target.closest<HTMLElement>('[data-fb-theme-choice]'):null;
        if(!button||!valid(button.dataset.fbThemeChoice))return;
        event.preventDefault();mode=button.dataset.fbThemeChoice;try{localStorage.setItem(key,mode);}catch{}
        apply();doc.querySelectorAll<HTMLDetailsElement>('[data-fb-theme-picker]').forEach(picker=>{picker.open=false;});
    });
    doc.addEventListener('keydown',event=>{if(event.key==='Escape')doc.querySelectorAll<HTMLDetailsElement>('[data-fb-theme-picker]').forEach(picker=>{picker.open=false;});});
    const changed=()=>{if(mode==='system')apply();};
    if(media?.addEventListener)media.addEventListener('change',changed);else media?.addListener?.(changed);
    window.addEventListener('storage',event=>{if(event.key!==key)return;mode=valid(event.newValue)?event.newValue:'system';apply();});
    const observer=new MutationObserver(()=>syncControls());observer.observe(doc,{childList:true,subtree:true});window.addEventListener('pagehide',()=>observer.disconnect());
    apply();
}
export const publicThemeScript=()=>`(${startPublicTheme.toString()})();`;
