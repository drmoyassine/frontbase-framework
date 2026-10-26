/** Progressive horizontal navigation: native scroll/touch remains available without JS. */
export function startNavigationScroll():void {
    document.querySelectorAll<HTMLElement>('[data-fb-scroll-nav]').forEach(nav=>{
        if(nav.dataset.navReady)return;nav.dataset.navReady='1';
        const rtl=()=>getComputedStyle(nav).direction==='rtl';
        const button=(step:'previous'|'next')=>{const b=document.createElement('button');b.type='button';b.className='fb-nav-scroll-button';b.dataset.scrollStep=step;b.setAttribute('data-fb-editor-ignore','true');nav.append(b);return b;};
        const previous=button('previous'),next=button('next');
        const items=()=>Array.from(nav.children).filter((n):n is HTMLElement=>n instanceof HTMLElement&&!n.classList.contains('fb-nav-scroll-button')&&n.getClientRects().length>0);
        const update=()=>{
            nav.dataset.navOverflow='false';
            const horizontal=getComputedStyle(nav).flexDirection.startsWith('row');
            const overflow=nav.dataset.fbScrollNav!=='wrap'&&horizontal&&nav.scrollWidth>nav.clientWidth+2;
            nav.dataset.navOverflow=String(overflow);
            const isRtl=rtl(),arabic=(nav.closest('[lang]')?.getAttribute('lang')??document.documentElement.lang).startsWith('ar');
            if(previous.textContent!==(isRtl?'›':'‹'))previous.textContent=isRtl?'›':'‹';if(next.textContent!==(isRtl?'‹':'›'))next.textContent=isRtl?'‹':'›';
            previous.setAttribute('aria-label',arabic?'عرض الأقسام السابقة':'Show previous sections');next.setAttribute('aria-label',arabic?'عرض الأقسام التالية':'Show next sections');
            const max=Math.max(0,nav.scrollWidth-nav.clientWidth),position=Math.abs(nav.scrollLeft);
            previous.disabled=!overflow||position<=2;next.disabled=!overflow||position>=max-2;
        };
        const move=(step:number)=>nav.scrollBy({left:step*(rtl()?-1:1)*Math.max(120,nav.clientWidth*.65),behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
        previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
        nav.addEventListener('scroll',update,{passive:true});
        nav.addEventListener('focusin',event=>{const target=(event.target as Element)?.closest<HTMLElement>('a');if(target&&nav.contains(target))target.scrollIntoView({block:'nearest',inline:'nearest'});});
        nav.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||(event.target as Element)?.closest('input,textarea,select'))return;const links=items().flatMap(n=>n.matches('a,button')?[n]:Array.from(n.querySelectorAll<HTMLElement>('a,button')));const current=links.indexOf(document.activeElement as HTMLElement);if(current<0)return;event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?links.length-1:Math.max(0,Math.min(links.length-1,current+(event.key==='ArrowRight'?1:-1)*(rtl()?-1:1)));links[index]?.focus();});
        // Observe geometry locally; no per-node window scroll/resize listeners.
        const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):undefined;observer?.observe(nav);items().forEach(n=>observer?.observe(n));
        const mutation=new MutationObserver(()=>{if(!nav.isConnected){observer?.disconnect();mutation.disconnect();return;}update();});
        mutation.observe(nav,{childList:true,subtree:true});
        update();
    });
}
