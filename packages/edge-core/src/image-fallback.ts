/** Shared browser behavior for SSR, canvas and dynamically inserted records. */
export function startImageFallbacks():void {
    if(typeof document==='undefined')return;
    const doc=document as Document&{__fbImageFallbacks?:boolean};
    const fail=(image:HTMLImageElement)=>{
        if(!image.hasAttribute('data-fb-image-fallback'))return;
        const fallback=image.getAttribute('data-fb-image-fallback')||'';
        image.setAttribute('data-fb-image-fallback','');
        if(fallback&&fallback!==image.getAttribute('src')){image.src=fallback;return;}
        if(image.getAttribute('data-fb-image-hide')==='true'){image.hidden=true;image.style.display='none';}
    };
    const scan=()=>doc.querySelectorAll<HTMLImageElement>('img[data-fb-image-fallback]').forEach(image=>{if(image.complete&&!image.naturalWidth)fail(image);});
    if(!doc.__fbImageFallbacks){doc.__fbImageFallbacks=true;doc.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement)fail(event.target);},true);window.addEventListener('frontbase:blocks-inserted',scan);}
    scan();
}
export const imageFallbackScript=()=>`(${startImageFallbacks.toString()})();`;
