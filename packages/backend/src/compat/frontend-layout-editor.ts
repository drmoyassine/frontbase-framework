/** Loaded with the authenticated frontend editor. The published document is a
 * local preview while the layout panel is open. Writes target the page draft. */
export const FRONTEND_LAYOUT_EDITOR = String.raw`
function installLayoutEditor({dock=bar,container=bar,closeControl=null}={}) {
 if(!inventory.layoutDraft)return ()=>false;
 const labels=arabic?{layout:'التخطيط',block:'العنصر',earlier:'نقل للأعلى',later:'نقل للأسفل',drag:'اسحب لنقل العنصر',less:'تضييق',more:'توسيع',save:'حفظ مسودة التخطيط',close:'إغلاق التخطيط',discard:'تجاهل التعديلات',pending:'تعديلات غير محفوظة',saved:'تم حفظ المسودة',conflict:'تغيّرت المسودة. أعد التحميل قبل الحفظ.',failed:'تعذر فتح المسودة أو حفظها.',scope:'مسودة التخطيط المشتركة',desktop:'سطح المكتب',tablet:'جهاز لوحي',mobile:'هاتف'}:{layout:'Layout',block:'Tile',earlier:'Move earlier',later:'Move later',drag:'Drag to move tile',less:'Narrower',more:'Wider',save:'Save layout draft',close:'Close layout',discard:'Discard layout changes',pending:'unsaved layout changes',saved:'Layout draft saved',conflict:'The layout draft changed. Reload before saving.',failed:'The layout draft could not be opened or saved.',scope:'Shared layout draft',desktop:'Desktop',tablet:'Tablet',mobile:'Mobile'};
 const formatLabels=arabic?{box:'محاذاة الصندوق',text:'محاذاة النص',left:'يسار',center:'وسط',right:'يمين',bold:'عريض',italic:'مائل',selection:'حدّد كلمات لتنسيقها',phrase:'النص المحدد',ambiguous:'حدّد عبارة فريدة أقصر.'}:{box:'Box alignment',text:'Text alignment',left:'Left',center:'Center',right:'Right',bold:'Bold',italic:'Italic',selection:'Select words to format',phrase:'Selected text',ambiguous:'Select a shorter, unique phrase.'};
 let draft, tiles=[], originalOrder=[], changes=[], selected, waiting=false, gesture, activeLayout=false, visible=true;
 let richEditor, richTile, richModule, editorRequest=0, registryRequest;
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
 drag.style.touchAction='none';
 const canvasHandle=document.createElement('button');
 canvasHandle.type='button';canvasHandle.textContent='⠿';canvasHandle.title=labels.drag;
 canvasHandle.setAttribute('aria-label',arabic?'سحب العنصر من الصفحة':'Drag selected tile on page');
 canvasHandle.dataset.fbLayoutHandle='';canvasHandle.hidden=true;
 const dropLayer=document.createElement('div');dropLayer.dataset.fbLayoutDropLayer='';dropLayer.setAttribute('aria-hidden','true');
 document.body.append(canvasHandle,dropLayer);
 const less=add(labels.less,()=>size(-10)),more=add(labels.more,()=>size(10));
 const range=document.createElement('input');
 range.type='number';range.min='1';range.max='100';range.step='0.1';range.style.width='76px';
 range.onchange=()=>setWidth(Number(range.value));
 toolbar.insertBefore(range,more);
 const saveDraft=add(labels.save,save),discard=add(labels.discard,()=>{changes=[];location.reload();}),exit=add(labels.close,()=>location.reload());
 const restoreDraft=add(arabic?'استعادة المسودة السابقة':'Restore previous draft',()=>writeDraft({restoreVersionId:draft.restoreVersionId}));
 const reference=document.createElement('select');reference.setAttribute('aria-label',arabic?'الصندوق المرجعي':'Reference box');
 const matchBox=add(arabic?'مطابقة الصندوق':'Match width and alignment',matchReference);
 toolbar.insertBefore(reference,matchBox);
 const format=document.createElement('div');
 const alignment=document.createElement('select');
 const alignmentLabel=document.createElement('label');alignmentLabel.append(alignment);
 alignment.append(new Option('—',''),...['left','center','right'].map(value=>new Option(formatLabels[value],value)));
 alignment.onchange=()=>{if(alignment.value)setStyle(getSelected().text?'textAlign':'horizontalAlign',alignment.value);};
 const wordsInput=document.createElement('div');
 const preview=document.createElement('span');preview.setAttribute('aria-label',formatLabels.phrase);
 const bindings=document.createElement('button');bindings.type='button';bindings.textContent=arabic?'@ إدراج متغير':'@ Insert variable';bindings.onclick=()=>void openVariables();
 const variableMenu=document.createElement('div');variableMenu.hidden=true;
 const search=document.createElement('input');search.type='search';search.setAttribute('aria-label',arabic?'بحث المتغيرات':'Search variables');
 const choices=document.createElement('select');choices.setAttribute('aria-label',arabic?'متغير Liquid':'Liquid variable');
 const placement=document.createElement('select');placement.setAttribute('aria-label',arabic?'موضع المتغير':'Variable placement');
 placement.append(new Option(arabic?'بعد النص':'After text','after'),new Option(arabic?'قبل النص':'Before text','before'));
 const variableSummary=document.createElement('span');
 const insertVariable=document.createElement('button');insertVariable.type='button';insertVariable.textContent=arabic?'إدراج':'Insert';
 insertVariable.disabled=true;
 const clearVariable=document.createElement('button');clearVariable.type='button';clearVariable.textContent=arabic?'إزالة المتغير':'Remove variable';
 variableMenu.append(search,choices,placement,insertVariable,clearVariable,variableSummary);
 const marks=['bold','italic'].map(mark=>{
  const control=document.createElement('button');control.type='button';control.textContent=formatLabels[mark];control.onclick=()=>toggleMark(mark);return control;
 });
 format.append(alignmentLabel,wordsInput,...marks,preview,bindings,variableMenu);
 panel.append(scope,chooser,viewportLabel,toolbar,format,feedback);
 const open=document.createElement('button');open.type='button';open.textContent=labels.layout;open.onclick=load;container.append(open,panel);
 const nodes=new Map(), originalSizes=new Map();
 const viewport=()=>matchMedia('(max-width:640px)').matches?'mobile':matchMedia('(max-width:1024px)').matches?'tablet':'desktop';
 const getSelected=()=>tiles.find(tile=>tile.id===selected);
 const width=(tile,mode)=>mode==='desktop'?tile.widths.desktop:mode==='tablet'?tile.widths.tablet??tile.widths.desktop:tile.widths.mobile??tile.widths.tablet??tile.widths.desktop;
 const style=(tile,key)=>tile.formatting[viewport()]?.[key]??(viewport()==='mobile'?tile.formatting.tablet?.[key]:undefined)??tile.formatting.desktop?.[key];
 const formatProperties=['margin-left','margin-right','margin-inline-start','margin-inline-end','text-align','font-weight','font-style','display','box-sizing'];
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
    if(align==='start'){
     node.style.setProperty('margin-inline-start',style(tile,'marginInlineStart')??'0','important');
     node.style.setProperty('margin-inline-end','auto','important');
    }else if(align){
     node.style.setProperty('margin-left',align==='left'?(style(tile,'marginLeft')??'0'):'auto','important');
     node.style.setProperty('margin-right',align==='right'?'0':'auto','important');
    }
    if(style(tile,'boxSizing'))node.style.setProperty('box-sizing',style(tile,'boxSizing'),'important');
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
  const siblings=siblingsOf(tile);
  const position=siblings.findIndex(item=>item.id===selected);
  earlier.disabled=waiting||position<=0;later.disabled=waiting||position<0||position>=siblings.length-1;
  drag.disabled=waiting||siblings.length<2;
  less.disabled=waiting||!tile||tile.text||(width(tile,viewport())??100)<=25;
  more.disabled=waiting||!tile||tile.text||(width(tile,viewport())??100)>=100;
  range.disabled=waiting||!tile||tile.text;range.value=String(tile?width(tile,viewport())??100:100);
  range.setAttribute('aria-label',labels[viewport()]+' · '+(tile?.label??labels.block));
  saveDraft.disabled=waiting||!changes.length;
  restoreDraft.hidden=!draft?.restoreVersionId;restoreDraft.disabled=waiting||!!changes.length;
  discard.disabled=waiting||!changes.length;exit.disabled=waiting||!!changes.length;
  chooser.disabled=waiting||index<0;
  format.hidden=!tile;
  alignment.disabled=waiting;
  if(tile){
   const label=tile.text?formatLabels.text:formatLabels.box;
   alignmentLabel.replaceChildren(label+' ',alignment);
   alignment.value=style(tile,tile.text?'textAlign':'horizontalAlign')??'';
  }
  const oldReference=reference.value;
  reference.hidden=matchBox.hidden=!tile||tile.text;
  if(tile&&!tile.text){
   reference.replaceChildren(new Option('—',''),...tiles.filter(item=>!item.text&&item.id!==selected&&nodes.has(item.id)).map(item=>new Option(item.label,item.id)));
   reference.value=[...reference.options].some(option=>option.value===oldReference)?oldReference:'';
  }
  preview.hidden=wordsInput.hidden=bindings.hidden=!tile?.text;
  marks.forEach(control=>{control.hidden=!tile?.text;});
  if(richTile!==selected)void openText(tile);
  if(!variableMenu.hidden)showVariable();
  showMarks();
  positionHandle();
 }
 async function openText(tile){
  richEditor?.destroy();richEditor=null;richTile=selected;
  const token=++editorRequest;
  if(!tile?.text)return;
  try{
   richModule??=import('/static/react/frontend-rich-text.js').catch(error=>{richModule=null;throw error;});
   const {createRichEditor}=await richModule;
   if(token!==editorRequest)return;
   const node=nodes.get(tile.id),editable=!!draft.source&&tile.editableText!==undefined;
   richEditor=createRichEditor(wordsInput,{label:formatLabels.selection,editable,
    text:editable?tile.editableText:(node.querySelector(':scope > [data-fb-inline-copy]')??node).textContent??'',
    onMention:()=>void openVariables(),onSelection:showMarks,onMark:toggleMark,emphasis:tile.emphasis,
    onText:value=>{
     if(!editable||waiting)return;
     const previous=changes.findIndex(change=>change.kind==='text'&&change.id===tile.id);
     if(previous>=0)changes.splice(previous,1);
     if(changes.length>=50)return;
     tile.editableText=value;stage({kind:'text',id:tile.id,value});
    }});
   showMarks();
  }catch{if(token===editorRequest)feedback.textContent=labels.failed;}
 }
 async function openVariables(){
  const tile=getSelected();
  if(!tile?.text||waiting)return;
  variableMenu.hidden=false;search.focus();showVariable();
  registryRequest??=fetch('/api/variables/registry/?page_id='+encodeURIComponent(draft.pageId),{cache:'no-store'})
   .then(result=>{if(!result.ok)throw Error();return result.json();})
   .catch(error=>{registryRequest=null;throw error;});
  try{
   const {variables}=await registryRequest;
   if(variableMenu.hidden||selected!==tile.id)return;
   const filter=()=>{
    const query=search.value.toLowerCase();
    const contextual=(tile.recordFields??[]).map(field=>({path:'record.'+field,description:field}));
    choices.replaceChildren(...[...variables.filter(item=>/^(page|system)\.[a-zA-Z_][\w.]{0,100}$/.test(item.path)),...contextual].filter(item=>
     (item.path+' '+(item.description??'')).toLowerCase().includes(query)).map(item=>new Option(item.path,item.path)));
    insertVariable.disabled=!choices.value;
   };
   search.oninput=filter;filter();
  }catch{if(selected===tile.id&&!variableMenu.hidden)feedback.textContent=labels.failed;}
 }
 function showVariable(){variableSummary.textContent=getSelected()?.variables?.[placement.value]??'';clearVariable.disabled=!variableSummary.textContent;}
 function setVariable(path){
  const tile=getSelected(),position=placement.value;
  if(!tile?.text||waiting||changes.length>=50)return;
  tile.variables[position]=path?'{{ '+path+' }}':'';
  stage({kind:'variable',id:tile.id,position,path});
 }
 placement.onchange=showVariable;
 insertVariable.onclick=()=>{if(choices.value)setVariable(choices.value);};
 clearVariable.onclick=()=>setVariable(null);
 search.onkeydown=event=>{if(event.key==='Enter'&&choices.value){event.preventDefault();setVariable(choices.value);}else if(event.key==='Escape'){event.stopPropagation();variableMenu.hidden=true;bindings.focus();}};
 function selectedQuote(){
  const selection=richEditor?.selection(),text=selection?.text??'',raw=selection?.raw??'',phrase=raw.trim();
  if(!phrase||text.indexOf(phrase)===text.lastIndexOf(phrase))return {phrase};
  const start=selection.from+raw.indexOf(phrase),end=start+phrase.length;
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
  tile.formatting[mode][property]=value;
  if(property==='horizontalAlign'){
   delete tile.formatting[mode].marginLeft;
   delete tile.formatting[mode].marginInlineStart;
  }
  stage({kind:'style',id:tile.id,viewport:mode,property,value});
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
  const text=richEditor.selection().text;
  if(quote.phrase.length>240||text.indexOf(context)!==text.lastIndexOf(context)){feedback.textContent=formatLabels.ambiguous;return;}
  const enabled=!hasMark(tile,quote,mark);
  tile.emphasis=tile.emphasis.filter(item=>!sameMark(item,quote,mark));
  if(enabled)tile.emphasis=[...tile.emphasis,{...quote,mark}].slice(-16);
  richEditor.mark(mark,enabled);
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
 function siblingsOf(tile){
  const parent=tile&&nodes.get(tile.id)?.parentElement;
  return parent&&!tile.text?tiles.filter(peer=>!peer.text&&peer.parentId===tile.parentId&&nodes.get(peer.id)?.parentElement===parent&&nodes.get(peer.id).getClientRects().length):[];
 }
 function step(direction){
  const tile=getSelected();
  if(!tile)return;
  const siblings=siblingsOf(tile);
  move(siblings[siblings.indexOf(tile)+direction],direction<0?'before':'after');
 }
 function size(delta){
  const tile=getSelected(),mode=viewport();
  if(tile)setWidth(Math.max(25,Math.min(100,(width(tile,mode)??100)+delta)));
 }
 function setWidth(value){
  const tile=getSelected(),mode=viewport();
  if(!tile||waiting||changes.length>=50||!Number.isFinite(value)||value<1||value>100)return;
  tile.widths[mode]=value;stage({kind:'resize',id:tile.id,viewport:mode,width:value});
 }
 function matchReference(){
  const tile=getSelected(),node=nodes.get(selected),parent=node?.parentElement,ref=nodes.get(reference.value);
  if(!tile||tile.text||!parent||!ref||node.contains(ref)||ref.contains(node)||waiting||changes.length>=50)return;
  const bounds=parent.getBoundingClientRect(),css=getComputedStyle(parent),target=ref.getBoundingClientRect();
  const left=parseFloat(css.paddingLeft)||0,right=parseFloat(css.paddingRight)||0;
  const available=parent.clientWidth-left-right;
  const startInset=css.direction==='rtl'
   ?bounds.right-(parseFloat(css.borderRightWidth)||0)-right-target.right
   :target.left-bounds.left-(parseFloat(css.borderLeftWidth)||0)-left;
  const round=value=>Math.round(value*1000)/1000;
  const width=round(target.width/available*100),offset=round(Math.max(0,startInset)/available*100);
  if(!available||width<1||startInset<-1||width+offset>100.001){feedback.textContent=arabic?'الصندوق المرجعي لا يلائم الحاوية.':'The reference box does not fit inside this parent.';return;}
  const mode=viewport();tile.widths[mode]=width;
  Object.assign(tile.formatting[mode],{horizontalAlign:'start',marginInlineStart:offset+'%',boxSizing:'border-box'});
  stage({kind:'match',id:tile.id,viewport:mode,width,offset});
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
  await writeDraft({operations:changes,checkpoint:true});
 }
 async function writeDraft(patch){
  if(waiting)return;
  waiting=true;show();
  try{
   const result=await fetch('/api/frontend-edit/layout-draft/',{method:'PUT',headers:{'Content-Type':'application/json','X-Frontbase-Editor':'1'},body:JSON.stringify({path,pageId:draft.pageId,revision:draft.revision,...patch})});
   if(!result.ok){feedback.textContent=result.status===409?labels.conflict:labels.failed;return;}
   draft=await result.json();tiles=draft.tiles;changes=[];
   if(patch.restoreVersionId)richTile=null;
   project();feedback.textContent=patch.restoreVersionId?(arabic?'تمت استعادة المسودة':'Original draft restored'):labels.saved;
  }catch{feedback.textContent=labels.failed;}finally{waiting=false;show(true);}
 }
 function select(id){
  if(selected!==id){variableMenu.hidden=true;search.value='';search.oninput=null;choices.replaceChildren();insertVariable.disabled=true;}
  selected=id;chooser.value=id;project();show();
 }
 function positionHandle(){
  if(gesture)return;
  const rect=nodes.get(selected)?.getBoundingClientRect();
  canvasHandle.hidden=!activeLayout||!visible||drag.disabled||!rect||rect.bottom<48||rect.top>innerHeight-48;
  if(canvasHandle.hidden)return;
  canvasHandle.style.top=Math.max(4,rect.top+4)+'px';
  canvasHandle.style.left=Math.max(4,Math.min(innerWidth-48,arabic?rect.right-48:rect.left+4))+'px';
 }
 function drawDropZones(){
  const {x,y,zones,horizontal,reversed}=gesture;
  gesture.target=null;
  for(const {tile,markers} of zones){
   const {left,top,right,bottom,width,height}=nodes.get(tile.id).getBoundingClientRect();
   const offscreen=bottom<0||top>innerHeight||right<0||left>innerWidth;
   const hit=x>=left&&x<=right&&y>=top&&y<=bottom;
   const leading=horizontal?x<left+width/2:y<top+height/2;
   for(const marker of markers){
    marker.hidden=offscreen;
    if(offscreen)continue;
    const before=marker.dataset.fbLayoutDropZone==='before';
    const atStart=before!==reversed;
    const hovered=hit&&leading===atStart;
    marker.toggleAttribute('data-active',hovered);
    marker.style.cssText=horizontal?'left:'+(atStart?left:right-5)+'px;top:'+top+'px;width:5px;height:'+height+'px':
      'left:'+left+'px;top:'+(atStart?top:bottom-5)+'px;width:'+width+'px;height:5px';
    if(hovered)gesture.target={tile,placement:before?'before':'after'};
   }
  }
 }
 function updateGesture(){
  if(!gesture)return;
  const edge=56;
  const dy=gesture.y<edge?-14:gesture.y>innerHeight-edge?14:0;
  if(dy)window.scrollBy({top:dy,behavior:'instant'});
  if(dy||gesture.dirty){drawDropZones();gesture.dirty=false;}
  gesture.frame=requestAnimationFrame(updateGesture);
 }
 function startDrag(event){
  if(!event.isPrimary||event.button!==0||drag.disabled||gesture||!activeLayout||!visible||changes.length>=50)return;
  const peers=siblingsOf(getSelected()).filter(tile=>tile.id!==selected);
  if(!peers.length)return;
  event.preventDefault();
  const handle=event.currentTarget;
  const style=getComputedStyle(nodes.get(selected).parentElement);
  const horizontal=style.display.includes('flex')&&style.flexDirection.startsWith('row');
  const reversed=horizontal?(style.direction==='rtl')!==style.flexDirection.endsWith('reverse'):style.flexDirection==='column-reverse'&&style.display.includes('flex');
  const zones=peers.map(tile=>({tile,markers:['before','after'].map(placement=>{
   const marker=document.createElement('span');marker.dataset.fbLayoutDropZone=placement;
   marker.dataset.label=placement==='before'?(arabic?'إفلات قبل':'Drop before'):(arabic?'إفلات بعد':'Drop after');
   dropLayer.append(marker);return marker;
  })}));
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,handle,zones,horizontal,reversed,frame:0,target:null,dirty:true};
  handle.setPointerCapture(event.pointerId);
  dock.toggleAttribute('data-fb-layout-dragging',true);
  updateGesture();
 }
 function finishDrag(commit){
  if(!gesture)return;
  const {target,id,handle,frame}=gesture;
  gesture=null;
  cancelAnimationFrame(frame);
  if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);
  dock.removeAttribute('data-fb-layout-dragging');dropLayer.replaceChildren();
  if(commit&&target)move(target.tile,target.placement);
  show(true);
 }
 for(const handle of [drag,canvasHandle]){
  handle.addEventListener('pointerdown',startDrag);
  handle.addEventListener('lostpointercapture',()=>finishDrag(false));
 }
 window.addEventListener('pointermove',event=>{if(gesture?.id===event.pointerId){gesture.x=event.clientX;gesture.y=event.clientY;gesture.dirty=true;}},true);
 window.addEventListener('pointerup',event=>{
  if(gesture?.id!==event.pointerId)return;
  gesture.x=event.clientX;gesture.y=event.clientY;drawDropZones();finishDrag(true);
 },true);
 window.addEventListener('pointercancel',event=>{if(gesture?.id===event.pointerId)finishDrag(false);},true);
 window.addEventListener('keydown',event=>{if(gesture&&event.key==='Escape'){event.preventDefault();finishDrag(false);}},true);
 window.addEventListener('scroll',()=>{if(gesture)gesture.dirty=true;else positionHandle();},{passive:true,capture:true});
 chooser.onchange=()=>select(chooser.value);
 const targetTile=event=>[...tiles].reverse().find(tile=>nodes.get(tile.id)?.contains(event.target));
 window.addEventListener('click',event=>{
  if(!activeLayout||!visible||dock.contains(event.target)||event.target===canvasHandle)return;
  event.preventDefault();event.stopImmediatePropagation();
  const tile=targetTile(event);if(tile&&!waiting)select(tile.id);
 },true);
 window.addEventListener('resize',()=>{if(activeLayout){project();show();}});
 window.addEventListener('beforeunload',event=>{if(changes.length){event.preventDefault();event.returnValue='';}});
 const isActive=()=>activeLayout&&visible;
 isActive.setVisible=value=>{visible=value;if(!value)finishDrag(false);if(activeLayout)project();positionHandle();};
 return isActive;
}
`;
