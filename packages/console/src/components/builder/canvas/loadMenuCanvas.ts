import {walkBlockTree} from '@frontbase/edge-core/block-versions';
import type {PageLayoutLike} from '@/lib/builder/iframeTypes';
import {menuPublicationRequest} from '@/components/dashboard/menus/api';
export async function loadMenuCanvas(layout:PageLayoutLike,pageId:string,path:string,signal:AbortSignal):Promise<PageLayoutLike>{
    // The existing final canvas projection also applies frontend copy revisions, even without a menu.
    if(signal.aborted)throw Error('Menu preview cancelled');
    const response=await menuPublicationRequest('/api/project/menus/canvas/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({layout,pageId,path}),signal});
    if(!response.ok||signal.aborted)throw Error('Shared menu preview unavailable');const result=await response.json();if(!result.layout||!Array.isArray(result.layout.content)||signal.aborted)throw Error('Shared menu preview unavailable');// This is the final authoring projection: copy overlays may mark public lists SSR-only.
    // Unseeded canvas bindings still need authenticated hydration to show their editable tree.
    walkBlockTree(result.layout.content,(node:any)=>{if(node.type==='Repeater'&&(node.binding||node.props?.binding)&&!Array.isArray(node.props?.initialRows))node.props={...node.props,localeReadOnly:false};});return result.layout;
}
