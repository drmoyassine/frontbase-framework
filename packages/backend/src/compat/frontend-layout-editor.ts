/** Loaded with the authenticated frontend editor. The published document is a
 * local preview while the layout panel is open. Writes target the page draft. */
export const FRONTEND_LAYOUT_EDITOR = String.raw`
function installLayoutEditor({dock=bar,container=bar,closeControl=null}={}) {
 if(!inventory.layoutDraft)return ()=>false;
 const labels=arabic?{layout:'التخطيط',block:'العنصر',earlier:'نقل للأعلى',later:'نقل للأسفل',drag:'اسحب لنقل العنصر',less:'تضييق',more:'توسيع',save:'حفظ مسودة التخطيط',close:'إغلاق التخطيط',discard:'تجاهل التعديلات',pending:'تعديلات غير محفوظة',saved:'تم حفظ المسودة',conflict:'تغيّرت المسودة. أعد التحميل قبل الحفظ.',failed:'تعذر فتح المسودة أو حفظها.',scope:'مسودة التخطيط المشتركة',desktop:'سطح المكتب',tablet:'جهاز لوحي',mobile:'هاتف'}:{layout:'Layout',block:'Tile',earlier:'Move earlier',later:'Move later',drag:'Drag to move tile',less:'Narrower',more:'Wider',save:'Save layout draft',close:'Close layout',discard:'Discard layout changes',pending:'unsaved layout changes',saved:'Layout draft saved',conflict:'The layout draft changed. Reload before saving.',failed:'The layout draft could not be opened or saved.',scope:'Shared layout draft',desktop:'Desktop',tablet:'Tablet',mobile:'Mobile'};
 const formatLabels=arabic?{box:'محاذاة الصندوق',text:'محاذاة النص',left:'يسار',center:'وسط',right:'يمين',bold:'عريض',italic:'مائل',selection:'حدّد كلمات لتنسيقها',phrase:'النص المحدد',ambiguous:'حدّد عبارة فريدة أقصر.'}:{box:'Box alignment',text:'Text alignment',left:'Left',center:'Center',right:'Right',bold:'Bold',italic:'Italic',selection:'Select words to format',phrase:'Selected text',ambiguous:'Select a shorter, unique phrase.'};
 let draft, tiles=[], originalOrder=[], changes=[], selected, waiting=false, dragId=null, activeLayout=false, visible=true;
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
 const format=document.createElement('div');
 const alignment=document.createElement('select');
 const alignmentLabel=document.createElement('label');alignmentLabel.append(alignment);
 alignment.append(new Option('—',''),...['left','center','right'].map(value=>new Option(formatLabels[value],value)));
 alignment.onchange=()=>{if(alignment.value)setStyle(getSelected().text?'textAlign':'horizontalAlign',alignment.value);};
 const wordsInput=document.createElement('textarea');wordsInput.readOnly=true;wordsInput.rows=3;wordsInput.setAttribute('aria-label',formatLabels.selection);
 const preview=document.createElement('span');preview.setAttribute('aria-label',formatLabels.phrase);
 const bindings=document.createElement('a');bindings.textContent=arabic?'@ ربط البيانات في المنشئ':'@ Bind in Builder';
 const marks=['bold','italic'].map(mark=>{
  const control=document.createElement('button');control.type='button';control.textContent=formatLabels[mark];control.onclick=()=>toggleMark(mark);return control;
 });
 wordsInput.onselect=showMarks;
 format.append(alignmentLabel,wordsInput,...marks,preview,bindings);
 panel.append(scope,chooser,viewportLabel,toolbar,format,feedback);
 const open=document.createElement('button');open.type='button';open.textContent=labels.layout;open.onclick=load;container.append(open,panel);
 const nodes=new Map(), originalSizes=new Map();
 const viewport=()=>matchMedia('(max-width:640px)').matches?'mobile':matchMedia('(max-width:1024px)').matches?'tablet':'desktop';
 const getSelected=()=>tiles.find(tile=>tile.id===selected);
 const width=(tile,mode)=>mode==='desktop'?tile.widths.desktop:mode==='tablet'?tile.widths.tablet??tile.widths.desktop:tile.widths.mobile??tile.widths.tablet??tile.widths.desktop;
 const style=(tile,key)=>tile.formatting[viewport()]?.[key]??(viewport()==='mobile'?tile.formatting.tablet?.[key]:undefined)??tile.formatting.desktop?.[key];
 const formatProperties=['margin-left','margin-right','text-align','font-weight','font-style','display'];
 const restore=(node,prop,previous)=>previous[prop][0]?node.style.setProperty(prop,...previous[prop]):node.style.removeProperty(prop);
 function project(){
  const groups=new Map();
  for(const tile of visible?tiles:originalOrder){
   const node=nodes.get(tile.id);
   if(!node?.isConnected)continue;
   const size=visible?width(tile,viewport()):undefined,styles=originalSizes.get(tile.id);
   for(const prop of ['width','max-width']){
    if(size!==undefined)node.style.setProperty(prop,size+'%','important');
    else if(styles[prop][0])node.style.setProperty(prop,...styles[prop]);
    else node.style.removeProperty(prop);
   }
   for(const property of formatProperties)restore(node,property,styles);
   if(visible){
    const align=style(tile,'horizontalAlign'), textAlign=style(tile,'textAlign');
    if(align){node.style.setProperty('margin-left',align==='left'?'0':'auto','important');node.style.setProperty('margin-right',align==='right'?'0':'auto','important');}
    if(textAlign){node.style.setProperty('text-align',textAlign,'important');if(getComputedStyle(node).display==='inline')node.style.setProperty('display','block','important');}
    for(const [key,property] of [['fontWeight','font-weight'],['fontStyle','font-style']])if(style(tile,key))node.style.setProperty(property,style(tile,key),'important');
   }
   node.style.outline=visible&&tile.id===selected?'2px solid #3b82f6':styles.outline;
   if(tile.text)continue;
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
   chooser.replaceChildren(...tiles.filter(tile=>nodes.has(tile.id)).map(tile=>new Option(tile.label+(tile.text?(arabic?' · نص':' · Text'):''),tile.id)));
   chooser.value=selected??'';
  }
  const tile=getSelected();
  viewportLabel.textContent=tile?' '+labels[viewport()]+(tile.text?'':' · '+(width(tile,viewport())??100)+'%'):'';
  const index=tiles.findIndex(tile=>tile.id===selected);
  const siblings=tile&&!tile.text?tiles.filter(item=>!item.text&&item.parentId===tile.parentId&&nodes.get(item.id)?.parentElement===nodes.get(tile.id)?.parentElement):[];
  const position=siblings.findIndex(item=>item.id===selected);
  earlier.disabled=waiting||position<=0;later.disabled=waiting||position<0||position>=siblings.length-1;
  drag.disabled=waiting||siblings.length<2;
  less.disabled=waiting||!tile||tile.text||(width(tile,viewport())??100)<=25;
  more.disabled=waiting||!tile||tile.text||(width(tile,viewport())??100)>=100;
  range.disabled=waiting||!tile||tile.text;range.value=String(tile?width(tile,viewport())??100:100);
  range.setAttribute('aria-label',labels[viewport()]+' · '+(tile?.label??labels.block));
  saveDraft.disabled=waiting||!changes.length;
  discard.disabled=waiting||!changes.length;exit.disabled=waiting||!!changes.length;
  chooser.disabled=waiting||index<0;
  format.hidden=!tile;
  alignment.disabled=waiting;
  if(tile){
   const label=tile.text?formatLabels.text:formatLabels.box;
   alignmentLabel.replaceChildren(label+' ',alignment);
   alignment.value=style(tile,tile.text?'textAlign':'horizontalAlign')??'';
  }
  wordsInput.hidden=preview.hidden=bindings.hidden=!tile?.text;
  if(tile?.text)bindings.href='/frontbase-admin/builder/'+encodeURIComponent(draft.pageId)+'?element='+encodeURIComponent(tile.id);
  marks.forEach(control=>{control.hidden=!tile?.text;});
  if(wordsInput.dataset.element!==selected){wordsInput.dataset.element=selected??'';wordsInput.value=tile?.text?nodes.get(selected).textContent:'';wordsInput.setSelectionRange(0,0);}
  showMarks();
 }
 function selectedQuote(){
  const text=wordsInput.value,raw=text.slice(wordsInput.selectionStart,wordsInput.selectionEnd),phrase=raw.trim();
  if(!phrase||text.indexOf(phrase)===text.lastIndexOf(phrase))return {phrase};
  const start=wordsInput.selectionStart+raw.indexOf(phrase),end=start+phrase.length;
  const prefix=text.slice(Math.max(0,start-40),start),suffix=text.slice(end,end+40);
  return {phrase,...(prefix?{prefix}:{}),...(suffix?{suffix}:{})};
 }
 const sameMark=(item,quote,mark)=>item.phrase===quote.phrase&&item.prefix===quote.prefix&&item.suffix===quote.suffix&&item.mark===mark;
 function hasMark(tile,quote,mark){return tile?.emphasis.some(item=>sameMark(item,quote,mark));}
 function showMarks(){
  const tile=getSelected(),quote=selectedQuote();
  const bold=quote.phrase?hasMark(tile,quote,'bold'):tile&&style(tile,'fontWeight')==='700';
  const italic=quote.phrase?hasMark(tile,quote,'italic'):tile&&style(tile,'fontStyle')==='italic';
  marks.forEach((control,index)=>{control.disabled=waiting||!tile?.text;control.setAttribute('aria-pressed',String(!!(index?italic:bold)));});
  preview.textContent=quote.phrase;preview.style.fontWeight=bold?'700':'400';preview.style.fontStyle=italic?'italic':'normal';
 }
 function setStyle(property,value){
  const tile=getSelected(),mode=viewport();
  if(!tile||waiting||changes.length>=50)return;
  tile.formatting[mode][property]=value;stage({kind:'style',id:tile.id,viewport:mode,property,value});
 }
 function toggleMark(mark){
  const tile=getSelected(),quote=selectedQuote();
  if(!tile?.text||waiting||changes.length>=50)return;
  if(!quote.phrase){
   if(mark==='bold')setStyle('fontWeight',style(tile,'fontWeight')==='700'?'400':'700');
   else setStyle('fontStyle',style(tile,'fontStyle')==='italic'?'normal':'italic');
   return;
  }
  const context=(quote.prefix??'')+quote.phrase+(quote.suffix??'');
  if(quote.phrase.length>240||wordsInput.value.indexOf(context)!==wordsInput.value.lastIndexOf(context)){feedback.textContent=formatLabels.ambiguous;return;}
  const enabled=!hasMark(tile,quote,mark);
  tile.emphasis=tile.emphasis.filter(item=>!sameMark(item,quote,mark));
  if(enabled)tile.emphasis=[...tile.emphasis,{...quote,mark}].slice(-16);
  stage({kind:'emphasis',id:tile.id,...quote,mark,enabled});
 }
 function stage(operation){
  if(waiting||changes.length>=50)return;
  changes.push(operation);project();show();feedback.textContent=changes.length+' '+labels.pending;
 }
 function move(other,placement){
  const tile=getSelected(),node=nodes.get(selected);
  if(waiting||!tile||tile.text||!other||other.text||other.id===selected||tile.parentId!==other.parentId||node?.parentElement!==nodes.get(other.id)?.parentElement||changes.length>=50)return;
  tiles.splice(tiles.indexOf(tile),1);
  tiles.splice(tiles.indexOf(other)+(placement==='after'?1:0),0,tile);
  stage({kind:'move',id:tile.id,siblingId:other.id,placement});
 }
 function step(direction){
  const tile=getSelected();
  if(!tile)return;
  const siblings=tiles.filter(other=>!other.text&&other.parentId===tile.parentId&&nodes.get(other.id)?.parentElement===nodes.get(tile.id)?.parentElement);
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
    originalSizes.set(tile.id,Object.fromEntries(['width','max-width','outline',...formatProperties].map(prop=>[prop,prop==='outline'?node.style.outline:[node.style.getPropertyValue(prop),node.style.getPropertyPriority(prop)]])));
   }
   selected=tiles.find(tile=>nodes.has(tile.id))?.id;
   originalOrder=tiles.filter(tile=>nodes.has(tile.id)).sort((left,right)=>nodes.get(left.id).compareDocumentPosition(nodes.get(right.id))&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
   activeLayout=true;panel.hidden=false;open.hidden=true;if(closeControl)closeControl.hidden=true;
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
 const targetTile=(event,boxesOnly=false)=>[...tiles].reverse().find(tile=>(!boxesOnly||!tile.text)&&nodes.get(tile.id)?.contains(event.target));
 window.addEventListener('click',event=>{
  if(!activeLayout||!visible||dock.contains(event.target))return;
  event.preventDefault();event.stopImmediatePropagation();
  const tile=targetTile(event);if(tile&&!waiting){selected=tile.id;chooser.value=selected;project();show();}
 },true);
 window.addEventListener('dragover',event=>{if(dragId&&targetTile(event,true))event.preventDefault();});
 window.addEventListener('drop',event=>{
  if(!dragId)return;
  const target=targetTile(event,true);if(!target)return;
  event.preventDefault();selected=dragId;
  const bounds=nodes.get(target.id).getBoundingClientRect();
  const parent=getComputedStyle(nodes.get(target.id).parentElement);
  const horizontal=parent.display.includes('flex')&&parent.flexDirection.startsWith('row');
  const after=horizontal?(parent.direction==='rtl'?event.clientX<bounds.left+bounds.width/2:event.clientX>bounds.left+bounds.width/2):event.clientY>bounds.top+bounds.height/2;
  move(target,after?'after':'before');dragId=null;show(true);
 });
 window.addEventListener('resize',()=>{if(activeLayout){project();show();}});
 window.addEventListener('beforeunload',event=>{if(changes.length){event.preventDefault();event.returnValue='';}});
 const isActive=()=>activeLayout&&visible;
 isActive.setVisible=value=>{visible=value;dragId=null;if(activeLayout)project();};
 return isActive;
}
`;
