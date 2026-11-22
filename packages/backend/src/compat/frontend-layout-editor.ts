/** Loaded with the authenticated frontend editor. The published document is a
 * local preview while the layout panel is open. Writes target the page draft. */
export const FRONTEND_LAYOUT_EDITOR = String.raw`
function installLayoutEditor() {
 if(!inventory.layoutDraft)return ()=>false;
 const labels=arabic?{layout:'التخطيط',block:'العنصر',earlier:'نقل للأعلى',later:'نقل للأسفل',drag:'اسحب لنقل العنصر',less:'تضييق',more:'توسيع',save:'حفظ مسودة التخطيط',close:'إغلاق التخطيط',discard:'تجاهل التعديلات',pending:'تعديلات غير محفوظة',saved:'تم حفظ المسودة',conflict:'تغيّرت المسودة. أعد التحميل قبل الحفظ.',failed:'تعذر فتح المسودة أو حفظها.',scope:'مسودة التخطيط المشتركة',desktop:'سطح المكتب',tablet:'جهاز لوحي',mobile:'هاتف'}:{layout:'Layout',block:'Tile',earlier:'Move earlier',later:'Move later',drag:'Drag to move tile',less:'Narrower',more:'Wider',save:'Save layout draft',close:'Close layout',discard:'Discard layout changes',pending:'unsaved layout changes',saved:'Layout draft saved',conflict:'The layout draft changed. Reload before saving.',failed:'The layout draft could not be opened or saved.',scope:'Shared layout draft',desktop:'Desktop',tablet:'Tablet',mobile:'Mobile'};
 let draft, tiles=[], changes=[], selected, waiting=false, dragId=null, activeLayout=false;
 const path=location.pathname+location.search;
 const panel=document.createElement('div');
 panel.hidden=true;panel.style.flexBasis='100%';
 const scope=document.createElement('strong');scope.textContent=labels.scope;
 const chooser=document.createElement('select');chooser.setAttribute('aria-label',labels.block);
 const feedback=document.createElement('div');feedback.setAttribute('role','status');
 const viewportLabel=document.createElement('span');
 const toolbar=document.createElement('div');toolbar.style.cssText='display:flex;gap:6px;flex-wrap:wrap;align-items:center';
 const add=(label,action)=>{const control=document.createElement('button');control.type='button';control.textContent=label;control.onclick=action;toolbar.append(control);return control;};
 const earlier=add(labels.earlier,()=>step(-1)),later=add(labels.later,()=>step(1)),drag=add(labels.drag,()=>{});
 drag.draggable=true;
 const less=add(labels.less,()=>size(-10)),more=add(labels.more,()=>size(10));
 const range=document.createElement('input');
 range.type='range';range.min='25';range.max='100';range.style.width='96px';
 range.onchange=()=>setWidth(Number(range.value));
 toolbar.insertBefore(range,more);
 const saveDraft=add(labels.save,save),discard=add(labels.discard,()=>{changes=[];location.reload();}),exit=add(labels.close,()=>location.reload());
 panel.append(scope,chooser,viewportLabel,toolbar,feedback);
 const open=button(labels.layout,load);
 bar.append(panel);
 const nodes=new Map(), originalSizes=new Map();
 const viewport=()=>matchMedia('(max-width:640px)').matches?'mobile':matchMedia('(max-width:1024px)').matches?'tablet':'desktop';
 const getSelected=()=>tiles.find(tile=>tile.id===selected);
 const width=(tile,mode)=>mode==='desktop'?tile.widths.desktop:mode==='tablet'?tile.widths.tablet??tile.widths.desktop:tile.widths.mobile??tile.widths.tablet??tile.widths.desktop;
 function project(){
  const groups=new Map();
  for(const tile of tiles){
   const node=nodes.get(tile.id);
   if(!node?.isConnected)continue;
   const size=width(tile,viewport()),styles=originalSizes.get(tile.id);
   for(const prop of ['width','max-width']){
    if(size!==undefined)node.style.setProperty(prop,size+'%','important');
    else if(styles[prop][0])node.style.setProperty(prop,...styles[prop]);
    else node.style.removeProperty(prop);
   }
   node.style.outline=tile.id===selected?'2px solid #3b82f6':styles.outline;
   if(!groups.has(node.parentElement))groups.set(node.parentElement,new Map());
   const peers=groups.get(node.parentElement);
   if(!peers.has(tile.parentId))peers.set(tile.parentId,[]);
   peers.get(tile.parentId).push(node);
  }
  for(const [parent,peers] of groups)for(const order of peers.values()){
   if(order.length<2)continue;
   const target=new Set(order);
   const actual=[...parent.children].filter(node=>target.has(node));
   if(actual.every((node,index)=>node===order[index]))continue;
   const slots=actual.map(node=>{const slot=document.createComment('layout tile');node.before(slot);return slot;});
   slots.forEach((slot,index)=>slot.replaceWith(order[index]));
  }
 }
 function show(refreshChoices=false){
  if(refreshChoices){
   chooser.replaceChildren(...tiles.filter(tile=>nodes.has(tile.id)).map(tile=>new Option(tile.label,tile.id)));
   chooser.value=selected??'';
  }
  const tile=getSelected();
  viewportLabel.textContent=tile?' '+labels[viewport()]+' · '+(width(tile,viewport())??100)+'%':'';
  const index=tiles.findIndex(tile=>tile.id===selected);
  const siblings=tile?tiles.filter(item=>item.parentId===tile.parentId&&nodes.get(item.id)?.parentElement===nodes.get(tile.id)?.parentElement):[];
  const position=siblings.findIndex(item=>item.id===selected);
  earlier.disabled=waiting||position<=0;later.disabled=waiting||position<0||position>=siblings.length-1;
  drag.disabled=waiting||siblings.length<2;
  less.disabled=waiting||!tile||(width(tile,viewport())??100)<=25;
  more.disabled=waiting||!tile||(width(tile,viewport())??100)>=100;
  range.disabled=waiting||!tile;range.value=String(tile?width(tile,viewport())??100:100);
  range.setAttribute('aria-label',labels[viewport()]+' · '+(tile?.label??labels.block));
  saveDraft.disabled=waiting||!changes.length;
  discard.disabled=waiting||!changes.length;exit.disabled=waiting||!!changes.length;
  chooser.disabled=waiting||index<0;
 }
 function stage(operation){
  if(waiting||changes.length>=50)return;
  changes.push(operation);project();show();feedback.textContent=changes.length+' '+labels.pending;
 }
 function move(other,placement){
  const tile=getSelected(),node=nodes.get(selected);
  if(waiting||!tile||!other||other.id===selected||tile.parentId!==other.parentId||node?.parentElement!==nodes.get(other.id)?.parentElement||changes.length>=50)return;
  tiles.splice(tiles.indexOf(tile),1);
  tiles.splice(tiles.indexOf(other)+(placement==='after'?1:0),0,tile);
  stage({kind:'move',id:tile.id,siblingId:other.id,placement});
 }
 function step(direction){
  const tile=getSelected();
  if(!tile)return;
  const siblings=tiles.filter(other=>other.parentId===tile.parentId&&nodes.get(other.id)?.parentElement===nodes.get(tile.id)?.parentElement);
  move(siblings[siblings.indexOf(tile)+direction],direction<0?'before':'after');
 }
 function size(delta){
  const tile=getSelected(),mode=viewport();
  if(tile)setWidth(Math.max(25,Math.min(100,(width(tile,mode)??100)+delta)));
 }
 function setWidth(value){
  const tile=getSelected(),mode=viewport();
  if(!tile||waiting||changes.length>=50)return;
  tile.widths[mode]=value;stage({kind:'resize',id:tile.id,viewport:mode,width:value});
 }
 async function load(){
  if(activeLayout||active||pending.size||busy)return;
  open.disabled=true;
  try{
   const result=await fetch('/api/frontend-edit/layout-draft/?path='+encodeURIComponent(path),{cache:'no-store'});
   if(!result.ok)throw Error();
   draft=await result.json();tiles=draft.tiles;
   for(const tile of tiles){
    const node=document.getElementById(tile.elementId);
    if(!node||document.querySelectorAll('#'+CSS.escape(tile.elementId)).length!==1)continue;
    nodes.set(tile.id,node);
    originalSizes.set(tile.id,Object.fromEntries(['width','max-width','outline'].map(prop=>[prop,prop==='outline'?node.style.outline:[node.style.getPropertyValue(prop),node.style.getPropertyPriority(prop)]])));
   }
   selected=tiles.find(tile=>nodes.has(tile.id))?.id;
   activeLayout=true;panel.hidden=false;open.hidden=true;close.hidden=true;status.hidden=true;
   project();show(true);
  }catch{error=labels.failed;update();}finally{open.disabled=false;}
 }
 async function save(){
  if(waiting||!changes.length)return;
  waiting=true;show();
  try{
   const result=await fetch('/api/frontend-edit/layout-draft/',{method:'PUT',headers:{'Content-Type':'application/json','X-Frontbase-Editor':'1'},body:JSON.stringify({path,pageId:draft.pageId,revision:draft.revision,operations:changes})});
   if(!result.ok){feedback.textContent=result.status===409?labels.conflict:labels.failed;return;}
   draft=await result.json();tiles=draft.tiles;changes=[];project();feedback.textContent=labels.saved;
  }catch{feedback.textContent=labels.failed;}finally{waiting=false;show(true);}
 }
 chooser.onchange=()=>{selected=chooser.value;project();show();};
 drag.addEventListener('dragstart',event=>{dragId=selected;event.dataTransfer.setData('text/plain',labels.drag);});
 drag.addEventListener('dragend',()=>{dragId=null;});
 const targetTile=event=>tiles.find(tile=>nodes.get(tile.id)===event.target.closest?.('[id]'))??[...tiles].reverse().find(tile=>nodes.get(tile.id)?.contains(event.target));
 window.addEventListener('click',event=>{
  if(!activeLayout||bar.contains(event.target))return;
  event.preventDefault();event.stopImmediatePropagation();
  const tile=targetTile(event);if(tile&&!waiting){selected=tile.id;chooser.value=selected;project();show();}
 },true);
 window.addEventListener('dragover',event=>{if(dragId&&targetTile(event))event.preventDefault();});
 window.addEventListener('drop',event=>{
  if(!dragId)return;
  const target=targetTile(event);if(!target)return;
  event.preventDefault();selected=dragId;
  const bounds=nodes.get(target.id).getBoundingClientRect();
  const parent=getComputedStyle(nodes.get(target.id).parentElement);
  const horizontal=parent.display.includes('flex')&&parent.flexDirection.startsWith('row');
  const after=horizontal?(parent.direction==='rtl'?event.clientX<bounds.left+bounds.width/2:event.clientX>bounds.left+bounds.width/2):event.clientY>bounds.top+bounds.height/2;
  move(target,after?'after':'before');dragId=null;show(true);
 });
 window.addEventListener('resize',()=>{if(activeLayout){project();show();}});
 window.addEventListener('beforeunload',event=>{if(changes.length){event.preventDefault();event.returnValue='';}});
 return ()=>activeLayout;
}
`;
