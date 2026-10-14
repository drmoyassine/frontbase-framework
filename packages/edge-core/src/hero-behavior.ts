/** Local slideshow only: no network, storage, application data or arbitrary code. */
export function startHeroSlides():void {
    document.querySelectorAll<HTMLDetailsElement>('[data-fb-template-menu]').forEach(menu=>{
        if(menu.dataset.menuReady)return;menu.dataset.menuReady='1';const wide=window.matchMedia?.('(min-width: 768px)');
        const update=()=>{menu.open=wide?wide.matches:window.innerWidth>=768;};update();wide?.addEventListener?.('change',update);
        menu.addEventListener('keydown',event=>{if(event.key==='Escape'&&!wide?.matches){menu.open=false;menu.querySelector('summary')?.focus();}});
    });
    document.querySelectorAll<HTMLElement>('[data-fb-hero]').forEach(hero=>{
        if(hero.dataset.heroReady)return;hero.dataset.heroReady='1';
        const slides=[...hero.querySelectorAll<HTMLElement>('[data-hero-slide]')];if(slides.length<2)return;
        let current=0,paused=false,hover=false,focused=false;
        const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const pause=hero.querySelector<HTMLButtonElement>('[data-hero-pause]');
        const show=(next:number)=>{current=(next+slides.length)%slides.length;slides.forEach((slide,i)=>{slide.hidden=i!==current;});const status=hero.querySelector('[data-hero-status]');if(status)status.textContent=`${current+1} / ${slides.length}`;};
        hero.querySelector('[data-hero-prev]')?.addEventListener('click',()=>show(current-1));
        hero.querySelector('[data-hero-next]')?.addEventListener('click',()=>show(current+1));
        hero.addEventListener('keydown',event=>{if(!(event.target as Element)?.closest('button'))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();show(current+(event.key==='ArrowLeft'?-1:1));}});
        pause?.addEventListener('click',()=>{paused=!paused;pause.setAttribute('aria-pressed',String(paused));pause.textContent=paused?'Resume slideshow':'Pause slideshow';});
        hero.addEventListener('mouseenter',()=>{hover=true;});hero.addEventListener('mouseleave',()=>{hover=false;});
        hero.addEventListener('focusin',()=>{focused=true;});hero.addEventListener('focusout',event=>{focused=!!event.relatedTarget&&hero.contains(event.relatedTarget as Node);});
        const interval=Number(hero.dataset.heroInterval);if(interval>=5&&interval<=30){
            const timer=window.setInterval(()=>{if(!hero.isConnected){window.clearInterval(timer);return;}if(!paused&&!hover&&!focused&&!reduced?.matches&&!document.hidden)show(current+1);},interval*1000);
        }
    });
}
