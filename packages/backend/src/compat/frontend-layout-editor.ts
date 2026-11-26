/** Loaded with the authenticated frontend editor. The published document is a
 * local preview while the layout panel is open. Writes target the page draft. */
export const FRONTEND_LAYOUT_EDITOR = String.raw`
function installLayoutEditor({dock,container,boxChip,onSelection,recordTile,beforeMove,editInlineValue}) {
 if(!inventory.layoutDraft)return ()=>false;
 const labels=arabic?{layout:'التخطيط',block:'العنصر',earlier:'نقل للأعلى',later:'نقل للأسفل',drag:'اسحب لنقل العنصر',less:'تضييق',more:'توسيع',save:'حفظ مسودة التخطيط',close:'إغلاق التخطيط',discard:'تجاهل التعديلات',pending:'تعديلات غير محفوظة',saved:'تم حفظ المسودة',conflict:'تغيّرت المسودة. أعد التحميل قبل الحفظ.',failed:'تعذر فتح المسودة أو حفظها.',scope:'مسودة التخطيط المشتركة',desktop:'سطح المكتب',tablet:'جهاز لوحي',mobile:'هاتف'}:{layout:'Layout',block:'Tile',earlier:'Move earlier',later:'Move later',drag:'Drag to move tile',less:'Narrower',more:'Wider',save:'Save layout draft',close:'Close layout',discard:'Discard layout changes',pending:'unsaved layout changes',saved:'Layout draft saved',conflict:'The layout draft changed. Reload before saving.',failed:'The layout draft could not be opened or saved.',scope:'Shared layout draft',desktop:'Desktop',tablet:'Tablet',mobile:'Mobile'};
 const moveLabels=arabic?{undo:'تراجع عن النقل',cancelled:'تم إلغاء النقل',same:'لم يتغير الموضع',moved:(name,index,total)=>'تم نقل '+name+' إلى الموضع '+index+' من '+total}:{undo:'Undo move',cancelled:'Move cancelled',same:'Position unchanged',moved:(name,index,total)=>'Moved '+name+' to position '+index+' of '+total+'.'};
 const formatLabels=arabic?{box:'محاذاة الصندوق',text:'محاذاة النص',left:'يسار',center:'وسط',right:'يمين',bold:'عريض',italic:'مائل',selection:'حدّد كلمات لتنسيقها',phrase:'النص المحدد',ambiguous:'حدّد عبارة فريدة أقصر.'}:{box:'Box alignment',text:'Text alignment',left:'Left',center:'Center',right:'Right',bold:'Bold',italic:'Italic',selection:'Select words to format',phrase:'Selected text',ambiguous:'Select a shorter, unique phrase.'};
 let draft, tiles=[], originalOrder=[], changes=[], moves=[], selected, waiting=false, gesture, openingDrag, activeLayout=false, visible=true, compact=false;
 let richEditor, richTile, richModule, editorRequest=0, legacyPicker, pickerRequest=0, composing, composerCleanup;
 const path=location.pathname+location.search;
 const panel=document.createElement('div');
 panel.hidden=true;panel.style.flexBasis='100%';
 const scope=document.createElement('strong');scope.textContent=labels.scope;
 const chooser=document.createElement('select');chooser.setAttribute('aria-label',labels.block);
 const feedback=document.createElement('div');feedback.setAttribute('role','status');
 const viewportLabel=document.createElement('span');
 const toolbar=document.createElement('div');toolbar.style.cssText='display:flex;gap:6px;flex-wrap:wrap;align-items:center';
 const add=(label,action)=>{const control=document.createElement('button');control.type='button';control.textContent=label;control.onclick=action;toolbar.append(control);return control;};
 const earlier=add(labels.earlier,()=>step(-1)),later=add(labels.later,()=>step(1));
 let canDrag=false;
 const undoMove=add(moveLabels.undo,undoLastMove);
 const canvasHandle=document.createElement('button');
 canvasHandle.type='button';canvasHandle.textContent='⠿';canvasHandle.title=labels.drag;
 canvasHandle.setAttribute('aria-label',arabic?'سحب العنصر من الصفحة':'Drag selected tile on page');
 canvasHandle.onclick=()=>{
  if(!activeLayout)void openRecordTile(recordTile()).then(()=>{if(!canvasHandle.disabled&&!canvasHandle.hidden)canvasHandle.focus();});
  else canvasHandle.focus();
 };
 canvasHandle.dataset.fbLayoutHandle='';canvasHandle.hidden=true;
 const dropLayer=document.createElement('div');dropLayer.dataset.fbLayoutDropLayer='';dropLayer.setAttribute('aria-hidden','true');
 const boxMenuButton=document.createElement('button');boxMenuButton.type='button';boxMenuButton.textContent='···';
 boxMenuButton.dataset.fbElementActions='';boxMenuButton.setAttribute('aria-label',arabic?'خيارات العنصر':'Element actions');
 boxMenuButton.setAttribute('aria-controls','fb-element-menu');boxMenuButton.setAttribute('aria-expanded','false');
 onPickerPress(boxMenuButton,async()=>{
  if(!activeLayout){await openRecordTile(recordTile());if(!activeLayout)return;}
  if(elementMenu.hidden)openElementMenu();else closeElementMenu(true);
 });
 boxChip.append(canvasHandle,boxMenuButton);document.body.append(dropLayer);
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
 const composeControls=document.createElement('div');composeControls.className='fb-edit-row';
 const composeButton=add(arabic?'تحرير النص والارتباطات':'Edit text and bindings',()=>{closeElementMenu(false);void compose();});
 const closeComposer=add(arabic?'إنهاء تحرير النص':'Done editing label',()=>endComposition());
 const preview=document.createElement('span');preview.setAttribute('aria-label',formatLabels.phrase);
 const bindings=document.createElement('button');bindings.type='button';bindings.textContent=arabic?'@ إدراج متغير':'@ Insert variable';
 const variableMenu=document.createElement('div');variableMenu.hidden=true;
 const variableHost=document.createElement('div');
 const placement=document.createElement('select');placement.setAttribute('aria-label',arabic?'موضع المتغير':'Variable placement');
 placement.append(new Option(arabic?'بعد النص':'After text','after'),new Option(arabic?'قبل النص':'Before text','before'));
 const variableSummary=document.createElement('span');
 const clearVariable=document.createElement('button');clearVariable.type='button';clearVariable.textContent=arabic?'إزالة المتغير':'Remove variable';
 variableMenu.append(placement,clearVariable,variableSummary,variableHost);
 const marks=['bold','italic'].map(mark=>{
  const control=document.createElement('button');control.type='button';control.textContent=formatLabels[mark];control.onclick=()=>toggleMark(mark);return control;
 });
 format.append(alignmentLabel,wordsInput,...marks,preview,bindings,variableMenu,composeControls);
 const elementMenu=document.createElement('div');elementMenu.id='fb-element-menu';elementMenu.dataset.fbElementMenu='';elementMenu.dir=dock.dir;
 elementMenu.hidden=true;elementMenu.setAttribute('role','region');elementMenu.setAttribute('aria-label',arabic?'خيارات العنصر':'Element actions');
 const openBuilder=document.createElement('a');openBuilder.textContent=words.builder;openBuilder.target='_blank';openBuilder.rel='noopener';
 elementMenu.append(toolbar,format,openBuilder);document.body.append(elementMenu);
 const draftTools=document.createElement('div');draftTools.className='fb-edit-row';draftTools.append(undoMove,saveDraft,discard,exit,restoreDraft,closeComposer,composeControls);
 panel.append(scope,chooser,viewportLabel,draftTools,feedback);
 const open=document.createElement('button');open.type='button';open.textContent=labels.layout;
 open.dataset.fbLayoutOpen='';
 open.onclick=()=>{if(activeLayout){compact=false;show();}else void load();};
 container.append(open,panel);
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
   node.style.outline=visible&&tile.id===selected&&!compact?'2px solid #94a3b8':styles.outline;
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
   const focus=document.activeElement;
   slots.forEach((slot,index)=>{
    if(typeof parent.moveBefore==='function'){parent.moveBefore(order[index],slot);slot.remove();}
    else slot.replaceWith(order[index]);
   });
   if(focus?.isConnected&&document.activeElement!==focus)focus.focus({preventScroll:true});
  }
 }
 function show(refreshChoices=false){
  open.hidden=activeLayout&&(!compact||!!composing);
  panel.hidden=!activeLayout||compact&&!changes.length&&!feedback.textContent;
  scope.hidden=chooser.hidden=viewportLabel.hidden=undoMove.hidden=exit.hidden=compact;
  saveDraft.hidden=discard.hidden=compact&&!changes.length;
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
  canDrag=!waiting&&siblings.length>1;
  less.disabled=waiting||!tile||tile.text||(width(tile,viewport())??100)<=25;
  more.disabled=waiting||!tile||tile.text||(width(tile,viewport())??100)>=100;
  range.disabled=waiting||!tile||tile.text;range.value=String(tile?width(tile,viewport())??100:100);
  range.setAttribute('aria-label',labels[viewport()]+' · '+(tile?.label??labels.block));
  saveDraft.disabled=waiting||!changes.length;
  undoMove.disabled=waiting||changes.at(-1)?.kind!=='move';
  restoreDraft.hidden=compact||!draft?.restoreVersionId;restoreDraft.disabled=waiting||!!changes.length;
  discard.disabled=waiting||!changes.length;exit.disabled=waiting||!!changes.length;
  chooser.disabled=waiting||index<0;
  format.hidden=!tile;
  alignment.disabled=waiting;
  if(tile){
   openBuilder.href='/frontbase-admin/builder/'+encodeURIComponent(draft.pageId)+'?'+new URLSearchParams({element:tile.id,previewPath:location.pathname});
   const label=tile.text?formatLabels.text:formatLabels.box;
   alignmentLabel.replaceChildren(label+' ',alignment);
   alignment.value=style(tile,tile.text?'textAlign':'horizontalAlign')??'';
  }
  composeButton.hidden=!tile?.composition||!!composing;composeButton.disabled=waiting;
  closeComposer.hidden=!composing||compact;composeControls.hidden=!composing||compact;
  const oldReference=reference.value;
  reference.hidden=matchBox.hidden=!tile||tile.text;
  if(tile&&!tile.text){
   reference.replaceChildren(new Option('—',''),...tiles.filter(item=>!item.text&&item.id!==selected&&nodes.has(item.id)).map(item=>new Option(item.label,item.id)));
   reference.value=[...reference.options].some(option=>option.value===oldReference)?oldReference:'';
  }
  preview.hidden=wordsInput.hidden=bindings.hidden=!tile?.text||!!composing;
  marks.forEach(control=>{control.hidden=!tile?.text||!!composing;});
  if(!composing&&!elementMenu.hidden&&richTile!==selected)void openText(tile);
  if(!variableMenu.hidden)showVariable();
  showMarks();
  publishSelection();
 }
 async function compose(caret){
  const tile=getSelected(),target=nodes.get(selected);
  if(!tile?.composition||!target||waiting)return false;
  if(composing)return composing===selected;
  const requested=selected;
  try{
   richModule??=import('/static/react/frontend-rich-text.js').catch(error=>{richModule=null;throw error;});
   const {mountInlineComposer,openVariablePicker}=await richModule;
   if(selected!==requested||!visible||composing)return false;
   const originalParts=tile.composition;
   let parts=originalParts;
   if(caret?.picker&&caret.text!==caret.original){
    if(!draft.source||parts.length!==1||parts[0].text!==caret.original||parts[0].emphasis?.length)return false;
    parts=[{...parts[0],text:caret.text}];
   }
   const fragment=document.createDocumentFragment(), values={...draft.compositionValues,
    ...(tile.detailRole===draft.detailRole&&draft.detailValues)};
   const sample=inventory.fields.find(field=>field.blockId===tile.id&&field.recordKey);
   if(sample)for(const field of inventory.fields){
    if(field.recordScope===sample.recordScope&&field.recordKey===sample.recordKey&&field.fieldKey)values['record.'+field.fieldKey]=field.text;
   }
   const slots=target.querySelectorAll(':scope > [data-fb-label-part]');
   parts.forEach((part,index)=>{if(part.variable&&slots[index])values[part.variable]=slots[index].textContent;});
   if(parts.length===1&&parts[0].variable&&!slots.length)values[parts[0].variable]=target.textContent;
   fragment.append(...target.childNodes);
   const editor=document.createElement('span');
   target.append(editor);closeVariables();composing=tile.id;
   if(caret?.picker){compact=true;feedback.textContent='';project();}
   editor.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();});
   editor.addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();});
   const changeLabel=next=>{
    if(waiting)return;
    const prior=changes.findIndex(change=>change.kind==='compose'&&change.id===tile.id);
    const original=prior<0?originalParts:changes[prior].original;
    if(prior>=0)changes.splice(prior,1);
    if(JSON.stringify(next)!==JSON.stringify(original)&&changes.length<50)changes.push({kind:'compose',id:tile.id,parts:next,original});
    tile.composition=next;feedback.textContent=changes.length?changes.length+' '+labels.pending:'';show();
   };
   composerCleanup=mountInlineComposer({editor,controls:composeControls,parts,values,arabic,preserveTranslationSlots:slots.length>0,
    openVariablePicker:request=>openVariablePicker(request,draft.pageId,tile.recordFields??[],tile.inlineQueries??[]),
    editValue:(index,variable)=>{
     if(changes.length){feedback.textContent=arabic?'احفظ مسودة التخطيط أو تجاهلها قبل تحرير قيمة السجل.':'Save or discard the layout draft before editing the record value.';return false;}
     return editInlineValue(tile.id,index,variable,endComposition);
    },onChange:changeLabel});
   const cleanup=composerCleanup;
   composerCleanup=()=>{cleanup();target.replaceChildren(fragment);};
   if(parts!==originalParts)changeLabel(parts);else show();
   editor.focus();
   if(caret?.picker){
    const length=editor.textContent.length, scale=length/Math.max(1,caret.text.length);
    const point=offset=>{
     const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
     let node, remaining=Math.round(offset*scale);
     while(node=walker.nextNode()){
      if(remaining<=node.length){
       const chip=node.parentElement.closest('[data-fb-binding-chip]');
       return chip?[chip.parentNode,[...chip.parentNode.childNodes].indexOf(chip)+Number(remaining>0)]:[node,remaining];
      }
      remaining-=node.length;
     }
     return [editor,editor.childNodes.length];
    };
    const range=document.createRange();range.setStart(...point(caret.start));range.setEnd(...point(caret.end));
    const selection=document.getSelection();selection?.removeAllRanges();selection?.addRange(range);
    cleanup.openPicker();
   }else if(caret){
    const chips=[...editor.querySelectorAll('[data-fb-binding-chip]')];
    const indexed=editor.childNodes[caret.index];
    const chip=indexed?.hasAttribute?.('data-fb-binding-chip')?indexed:chips.find(item=>item.dataset.fbBindingChip===caret.variable)??(chips.length===1?chips[0]:null);
    const range=document.createRange();range.selectNodeContents(editor);range.collapse(caret.before);
    if(chip){if(caret.before)range.setStartBefore(chip);else range.setStartAfter(chip);range.collapse(true);}
    const selection=document.getSelection();selection?.removeAllRanges();selection?.addRange(range);
    if(caret.select&&chip)cleanup.selectBinding(chips.indexOf(chip));
   }
   return true;
  }catch{feedback.textContent=labels.failed;show();return false;}
 }
 function endComposition(){
  if(!composing)return;
  composerCleanup?.();composerCleanup=undefined;composing=undefined;show();
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
  if(!tile?.text||waiting||elementMenu.hidden)return;
  closeVariables();
  const request=++pickerRequest;
  variableMenu.hidden=false;showVariable();
  try{
   richModule??=import('/static/react/frontend-rich-text.js').catch(error=>{richModule=null;throw error;});
   const {openVariablePicker}=await richModule;
   if(request!==pickerRequest)return;
   legacyPicker=openVariablePicker({host:variableHost,arabic,outsideBoundary:elementMenu,
    onSelect:setVariable,
    onClose:()=>{legacyPicker?.();legacyPicker=null;showVariable();}
   },draft.pageId,(tile.recordFields??[]).filter(field=>!field.startsWith('columns.')));
  }catch{if(request===pickerRequest)feedback.textContent=labels.failed;}
 }
 function closeVariables(){pickerRequest++;legacyPicker?.();legacyPicker=null;variableMenu.hidden=true;}
 function showVariable(){variableSummary.textContent=getSelected()?.variables?.[placement.value]??'';clearVariable.disabled=!variableSummary.textContent;}
 function setVariable(path){
  const tile=getSelected(),position=placement.value;
  if(!tile?.text||waiting||changes.length>=50)return;
  const template=path?'{{ '+path+' }}':'';
  if(tile.variables[position]===template)return;
  tile.variables[position]=template;
  stage({kind:'variable',id:tile.id,position,path});
 }
 // A mobile browser can suppress the compatibility click if the dock reflows
 // between touchdown and release while the rich editor is mounting.
 function onPickerPress(control,action){
  let press;
  control.style.touchAction='manipulation';
  control.onpointerdown=event=>{press=event.pointerType==='touch'?{id:event.pointerId,x:event.clientX,y:event.clientY,handled:false}:null;};
  control.onpointercancel=()=>{press=null;};
  control.onpointerup=event=>{
   if(press?.id!==event.pointerId||Math.hypot(event.clientX-press.x,event.clientY-press.y)>10)return;
   press.handled=true;action();
  };
  control.onclick=event=>{
   if(press?.handled&&(event.pointerType==='touch'||event.sourceCapabilities?.firesTouchEvents)){press=null;return;}
   action();
  };
 }
 placement.onchange=showVariable;
 onPickerPress(bindings,()=>void openVariables());
 onPickerPress(clearVariable,()=>setVariable(null));
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
 function moveIndex(tile,other,placement){
  if(!Number.isInteger(tile.siblingIndex)||!Number.isInteger(other.siblingIndex))return undefined;
  const boundary=other.siblingIndex+(placement==='after'?1:0);
  return boundary-(tile.siblingIndex<boundary?1:0);
 }
 function move(other,placement){
  const tile=getSelected(),node=nodes.get(selected);
  if(waiting||!tile||!other||other.id===selected||tile.parentId!==other.parentId||node?.parentElement!==nodes.get(other.id)?.parentElement||changes.length>=50)return;
  const index=moveIndex(tile,other,placement),previous=tile.siblingIndex;
  if(index!==undefined&&index===previous){feedback.textContent=moveLabels.same;return;}
  moves.push({order:tiles.slice(),positions:tiles.map(item=>item.siblingIndex)});
  if(index!==undefined){
   for(const peer of tiles)if(peer!==tile&&peer.parentId===tile.parentId){
    if(index<previous&&peer.siblingIndex>=index&&peer.siblingIndex<previous)peer.siblingIndex++;
    if(index>previous&&peer.siblingIndex>previous&&peer.siblingIndex<=index)peer.siblingIndex--;
   }
   tile.siblingIndex=index;
  }
  tiles.splice(tiles.indexOf(tile),1);
  tiles.splice(tiles.indexOf(other)+(placement==='after'?1:0),0,tile);
  stage({kind:'move',id:tile.id,siblingId:other.id,placement});
  const siblings=siblingsOf(tile);
  feedback.textContent=moveLabels.moved(tile.label,siblings.indexOf(tile)+1,siblings.length)+' '+changes.length+' '+labels.pending;
 }
 function undoLastMove(){
  if(waiting||changes.at(-1)?.kind!=='move')return;
  const previous=moves.pop();
  if(!previous)return;
  changes.pop();tiles=previous.order;
  tiles.forEach((tile,index)=>{tile.siblingIndex=previous.positions[index];});
  project();show(true);feedback.textContent=moveLabels.undo+' · '+changes.length+' '+labels.pending;
  if(undoMove.disabled)chooser.focus();
 }
 function siblingsOf(tile){
  const parent=tile&&nodes.get(tile.id)?.parentElement;
  return parent?tiles.filter(peer=>peer.parentId===tile.parentId&&nodes.get(peer.id)?.parentElement===parent&&nodes.get(peer.id).getClientRects().length):[];
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
  const borderLeft=parseFloat(css.borderLeftWidth)||0,borderRight=parseFloat(css.borderRightWidth)||0;
  const boxWidth=bounds.width-borderLeft-borderRight;
  const available=(parent.clientWidth<boxWidth-1?parent.clientWidth:boxWidth)-left-right;
  const startInset=css.direction==='rtl'
   ?bounds.right-borderRight-right-target.right
   :target.left-bounds.left-borderLeft-left;
  const round=value=>Math.round(value*1000)/1000;
  const width=round(Math.min(100,target.width/available*100));
  if(available<=0||width<1||startInset<-1||target.width+Math.max(startInset,0)>available+1){feedback.textContent=arabic?'الصندوق المرجعي لا يلائم الحاوية.':'The reference box does not fit inside this parent.';return;}
  const offset=round(Math.min(100-width,Math.max(0,startInset)/available*100));
  const mode=viewport();tile.widths[mode]=width;
  Object.assign(tile.formatting[mode],{horizontalAlign:'start',marginInlineStart:offset+'%',boxSizing:'border-box'});
  stage({kind:'match',id:tile.id,viewport:mode,width,offset});
 }
 async function load(requestedId,caret,editComposition=true){
  if(activeLayout||active||pending.size||busy||open.disabled)return false;
  open.disabled=true;
  try{
   const result=await fetch('/api/frontend-edit/layout-draft/?path='+encodeURIComponent(path),{cache:'no-store'});
   if(!result.ok)throw Error();
   const nextDraft=await result.json();
   if(!visible||active||pending.size||busy)return false;
   draft=nextDraft;tiles=draft.tiles;
   for(const tile of tiles){
    const node=document.getElementById(tile.elementId);
    if(!node||document.querySelectorAll('#'+CSS.escape(tile.elementId)).length!==1)continue;
    nodes.set(tile.id,node);
    originalSizes.set(tile.id,Object.fromEntries(['width','max-width','outline',...formatProperties].map(prop=>[prop,prop==='outline'?node.style.outline:[node.style.getPropertyValue(prop),node.style.getPropertyPriority(prop)]])));
   }
   selected=requestedId&&nodes.has(requestedId)?requestedId:tiles.find(tile=>nodes.has(tile.id))?.id;
   originalOrder=tiles.filter(tile=>nodes.has(tile.id)).sort((left,right)=>nodes.get(left.id).compareDocumentPosition(nodes.get(right.id))&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
   if(caret?.picker&&(!nodes.has(requestedId)||!tiles.find(tile=>tile.id===requestedId)?.composition)){nodes.clear();originalSizes.clear();return false;}
   activeLayout=true;compact=!!caret?.picker;
   project();show(true);
   if(requestedId&&editComposition){
    if(selected===requestedId&&getSelected()?.composition){
     const opened=await compose(caret);
     if(!opened&&caret?.picker){activeLayout=false;compact=false;nodes.clear();originalSizes.clear();show();}
     return opened;
    }
    else feedback.textContent=arabic?'يمكن تحرير ارتباط هذا العنصر في المحرر الكامل.':'Open this element in Builder to edit its binding.';
   }
   return true;
  }catch{error=labels.failed;update();return false;}finally{open.disabled=false;}
 }
 async function save(){
  if(waiting||!changes.length)return;
  await writeDraft({operations:changes.map(({original,...change})=>change),checkpoint:true});
 }
 async function writeDraft(patch){
  if(waiting)return;
  waiting=true;show();
  try{
   const result=await fetch('/api/frontend-edit/layout-draft/',{method:'PUT',headers:{'Content-Type':'application/json','X-Frontbase-Editor':'1'},body:JSON.stringify({path,pageId:draft.pageId,revision:draft.revision,...patch})});
   if(!result.ok){feedback.textContent=result.status===409?labels.conflict:labels.failed;return;}
   endComposition();draft=await result.json();tiles=draft.tiles;changes=[];moves=[];
   if(patch.restoreVersionId)richTile=null;
   project();feedback.textContent=patch.restoreVersionId?(arabic?'تمت استعادة المسودة':'Original draft restored'):labels.saved;
  }catch{feedback.textContent=labels.failed;}finally{waiting=false;show(true);}
 }
 function select(id){
  if(selected!==id)closeElementMenu(false);
  if(selected!==id)endComposition();
  selected=id;chooser.value=id;project();show();
 }
 function updateHandle(){
  const tile=getSelected();
  canvasHandle.hidden=!visible||(activeLayout?!nodes.has(selected):!recordTile());
  canvasHandle.disabled=activeLayout&&(!canDrag||!!active);
  const label=(arabic?'سحب العنصر من الصفحة':'Drag selected tile on page')+(tile?': '+tile.label:'');
  canvasHandle.setAttribute('aria-label',label);
 }
 function publishSelection(){
  const tile=getSelected();
  updateHandle();
  onSelection(activeLayout&&visible&&tile?{tile,element:nodes.get(tile.id),composing:!!composing,compact:compact&&!!composing}:null);
  positionElementMenu();
 }
 function positionElementMenu(){
  if(elementMenu.hidden)return;
  if(boxChip.hidden){closeElementMenu(false);return;}
  const rect=boxChip.getBoundingClientRect();
  const width=elementMenu.offsetWidth,height=elementMenu.offsetHeight;
  elementMenu.style.left=Math.max(8,Math.min(arabic?rect.right-width:rect.left,innerWidth-width-8))+'px';
  elementMenu.style.top=Math.max(8,Math.min(rect.bottom+5+height<innerHeight?rect.bottom+5:rect.top-height-5,innerHeight-height-8))+'px';
 }
 function closeElementMenu(focus){
  if(elementMenu.hidden)return;
  closeVariables();
  elementMenu.hidden=true;boxMenuButton.setAttribute('aria-expanded','false');
  if(focus&&!boxChip.hidden)boxMenuButton.focus();
 }
 function openElementMenu(){
  document.dispatchEvent(new CustomEvent('frontbase:context-open',{detail:elementMenu}));
  elementMenu.hidden=false;boxMenuButton.setAttribute('aria-expanded','true');
  show();positionElementMenu();
  elementMenu.querySelector('button:not(:disabled):not([hidden])')?.focus();
 }
 const dismissElementMenu=event=>{if(event.key==='Escape'&&!elementMenu.hidden){event.preventDefault();event.stopPropagation();closeElementMenu(true);}};
 elementMenu.addEventListener('keydown',dismissElementMenu);boxMenuButton.addEventListener('keydown',dismissElementMenu);
 document.addEventListener('pointerdown',event=>{if(!boxChip.contains(event.target)&&!elementMenu.contains(event.target))closeElementMenu(false);});
 document.addEventListener('frontbase:context-open',event=>{if(event.detail!==elementMenu)closeElementMenu(false);});
 async function openRecordTile(id){
  if(!id||!beforeMove())return;
  await load(id,undefined,false);
  if(activeLayout&&selected!==id)feedback.textContent=arabic?'لا يمكن نقل هذا العنصر هنا.':'This element cannot be moved here.';
 }
 function drawDropZones(){
  const {x,y,zones,horizontal,reversed,preview,previewWidth,previewHeight}=gesture;
  gesture.target=null;
  let distance=Infinity;
  for(const {tile,markers} of zones){
   const {left,top,right,bottom,width,height}=nodes.get(tile.id).getBoundingClientRect();
   const offscreen=bottom<0||top>innerHeight||right<0||left>innerWidth;
   const dx=Math.max(left-x,0,x-right),dy=Math.max(top-y,0,y-bottom);
   const gap=Math.hypot(dx,dy);
   const leading=horizontal?x<left+width/2:y<top+height/2;
   for(const marker of markers){
    marker.hidden=offscreen;
    if(offscreen)continue;
    const before=marker.dataset.fbLayoutDropZone==='before';
    const atStart=before!==reversed;
    marker.removeAttribute('data-active');
    marker.style.cssText=horizontal?'left:'+(atStart?left:right-5)+'px;top:'+top+'px;width:5px;height:'+height+'px':
      'left:'+left+'px;top:'+(atStart?top:bottom-5)+'px;width:'+width+'px;height:5px';
    const selection=getSelected();
    const sameSlot=moveIndex(selection,tile,before?'before':'after')===selection.siblingIndex&&Number.isInteger(selection.siblingIndex);
    if(sameSlot)marker.hidden=true;
    if(!sameSlot&&gap<=8&&gap<distance&&leading===atStart){distance=gap;gesture.target={tile,placement:before?'before':'after',marker};}
   }
  }
  gesture.target?.marker.setAttribute('data-active','');
  const left=Math.max(0,x+12+previewWidth<=innerWidth?x+12:x-12-previewWidth);
  const top=Math.max(0,y+12+previewHeight<=innerHeight?y+12:y-12-previewHeight);
  preview.style.transform='translate3d('+left+'px,'+top+'px,0)';
  preview.toggleAttribute('data-valid-drop',!!gesture.target);
 }
 function createDragPreview(tile,node){
  const preview=document.createElement('div');
  preview.dataset.fbLayoutDragPreview='';
  preview.dir=getComputedStyle(node).direction;
  const label=document.createElement('strong');label.textContent=tile.label;
  preview.append(label);
  const excerpt=node.textContent?.trim().replace(/\s+/g,' ').slice(0,160);
  if(excerpt&&excerpt!==tile.label){
   const copy=document.createElement('span');copy.textContent=excerpt;
   if(tile.text){const style=getComputedStyle(node);copy.style.fontFamily=style.fontFamily;copy.style.fontWeight=style.fontWeight;copy.style.fontStyle=style.fontStyle;}
   preview.append(copy);
  }
  return preview;
 }
 function scrollArea(node){
  for(let parent=node.parentElement;parent;parent=parent.parentElement){
   const style=getComputedStyle(parent);
   if(/auto|scroll/.test(style.overflowY)&&parent.scrollHeight>parent.clientHeight||
      /auto|scroll/.test(style.overflowX)&&parent.scrollWidth>parent.clientWidth)return parent;
  }
  return document.scrollingElement??document.documentElement;
 }
 function updateGesture(now=performance.now()){
  if(!gesture)return;
  const {scroller,x,y,lastFrame}=gesture;
  const viewport=scroller===(document.scrollingElement??document.documentElement);
  const bounds=viewport?{top:0,left:0,right:innerWidth,bottom:innerHeight}:scroller.getBoundingClientRect();
  const seconds=Math.min((now-lastFrame)/1000,.033);
  gesture.lastFrame=now;
  const speed=(point,start,end)=>{
   const edge=Math.min(56,(end-start)/3);
   if(edge<=0)return 0;
   return Math.max(-1,Math.min(1,(Math.max(0,point-end+edge)-Math.max(0,start+edge-point))/edge))*840*seconds;
  };
  const beforeX=scroller.scrollLeft,beforeY=scroller.scrollTop;
  if(scroller.scrollWidth>scroller.clientWidth)scroller.scrollLeft+=speed(x,bounds.left,bounds.right);
  if(scroller.scrollHeight>scroller.clientHeight)scroller.scrollTop+=speed(y,bounds.top,bounds.bottom);
  if(gesture.dirty||scroller.scrollLeft!==beforeX||scroller.scrollTop!==beforeY){drawDropZones();gesture.dirty=false;}
  gesture.frame=requestAnimationFrame(updateGesture);
 }
 function beginDrag(handle,id,x,y){
  if(!canDrag||active||gesture||!activeLayout||!visible||changes.length>=50)return;
  const tile=getSelected(),source=nodes.get(selected);
  const peers=siblingsOf(tile).filter(peer=>peer.id!==selected);
  if(!source||!peers.length)return;
  try{handle.setPointerCapture(id);}catch{return;}
  const style=getComputedStyle(source.parentElement);
  const horizontal=style.display.includes('flex')&&style.flexDirection.startsWith('row')||
   style.display.includes('grid')&&style.gridTemplateColumns.trim().split(/\s+/).length>1;
  const reversed=horizontal?(style.direction==='rtl')!==style.flexDirection.endsWith('reverse'):style.flexDirection==='column-reverse'&&style.display.includes('flex');
  const zones=peers.map(tile=>({tile,markers:['before','after'].map(placement=>{
   const marker=document.createElement('span');marker.dataset.fbLayoutDropZone=placement;
   marker.dataset.label=placement==='before'?(arabic?'إفلات قبل':'Drop before'):(arabic?'إفلات بعد':'Drop after');
   dropLayer.append(marker);return marker;
  })}));
  const preview=createDragPreview(tile,source);
  dropLayer.append(preview);
  gesture={id,x,y,handle,zones,horizontal,reversed,preview,
   previewWidth:preview.offsetWidth,previewHeight:preview.offsetHeight,source,scroller:scrollArea(source),lastFrame:performance.now(),frame:0,target:null,dirty:true};
  source.toggleAttribute('data-fb-layout-drag-source',true);
  dock.toggleAttribute('data-fb-layout-dragging',true);
  updateGesture();
 }
 function startDrag(event){
  if(!event.isPrimary||event.button!==0||gesture||openingDrag||!visible)return;
  if(activeLayout){
   closeElementMenu(false);event.preventDefault();beginDrag(event.currentTarget,event.pointerId,event.clientX,event.clientY);return;
  }
  const tileId=recordTile();if(!tileId)return;
  openingDrag={id:event.pointerId,tileId,x:event.clientX,y:event.clientY,started:false};
 }
 function finishDrag(commit){
  if(!gesture)return;
  const {target,id,handle,frame,source}=gesture;
  gesture=null;
  cancelAnimationFrame(frame);
  if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);
  source.removeAttribute('data-fb-layout-drag-source');
  dock.removeAttribute('data-fb-layout-dragging');dropLayer.replaceChildren();
  if(commit&&target)move(target.tile,target.placement);
  else feedback.textContent=moveLabels.cancelled;
  show(true);
 }
 for(const handle of [canvasHandle]){
  handle.addEventListener('pointerdown',startDrag);
  handle.addEventListener('lostpointercapture',()=>finishDrag(false));
 }
 window.addEventListener('pointermove',event=>{
  if(gesture?.id===event.pointerId){gesture.x=event.clientX;gesture.y=event.clientY;gesture.dirty=true;return;}
  const opening=openingDrag;
  if(opening?.id!==event.pointerId)return;
  if(!opening.started&&Math.hypot(event.clientX-opening.x,event.clientY-opening.y)<6)return;
  opening.x=event.clientX;opening.y=event.clientY;
  if(opening.started)return;
  opening.started=true;
  void openRecordTile(opening.tileId).then(()=>{
   if(openingDrag===opening&&selected===opening.tileId)beginDrag(canvasHandle,opening.id,opening.x,opening.y);
  });
 },true);
 window.addEventListener('pointerup',event=>{
  if(openingDrag?.id===event.pointerId)openingDrag=null;
  if(gesture?.id!==event.pointerId)return;
  gesture.x=event.clientX;gesture.y=event.clientY;drawDropZones();finishDrag(true);
 },true);
 window.addEventListener('pointercancel',event=>{if(openingDrag?.id===event.pointerId)openingDrag=null;if(gesture?.id===event.pointerId)finishDrag(false);},true);
 window.addEventListener('keydown',event=>{
  if(gesture&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finishDrag(false);return;}
  if(!activeLayout||!visible||active||event.target!==canvasHandle||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
  const tile=getSelected(),parent=nodes.get(tile?.id)?.parentElement;
  if(!parent)return;
  const style=getComputedStyle(parent);
  const horizontal=style.display.includes('flex')&&style.flexDirection.startsWith('row');
  if(horizontal!==['ArrowLeft','ArrowRight'].includes(event.key))return;
  const reversed=horizontal?(style.direction==='rtl')!==style.flexDirection.endsWith('reverse'):style.flexDirection==='column-reverse';
  event.preventDefault();step((['ArrowDown','ArrowRight'].includes(event.key)!==reversed)?1:-1);
  if(event.target.disabled||event.target.hidden)chooser.focus();
  else nodes.get(selected)?.scrollIntoView({block:'nearest',inline:'nearest'});
 },true);
 window.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.key!=='Escape'||!composing||!event.target.closest?.('[data-fb-inline-composer]'))return;
  event.preventDefault();endComposition();(compact?open:boxMenuButton).focus();
 });
 const cancelDrag=()=>{openingDrag=null;finishDrag(false);};
 window.addEventListener('blur',cancelDrag);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelDrag();});
 window.addEventListener('scroll',()=>{if(gesture)gesture.dirty=true;else positionElementMenu();},{passive:true,capture:true});
 chooser.onchange=()=>select(chooser.value);
 const targetTile=event=>[...tiles].reverse().find(tile=>nodes.get(tile.id)?.contains(event.target));
 window.addEventListener('click',event=>{
  if(!isActive()||dock.contains(event.target)||boxChip.contains(event.target)||elementMenu.contains(event.target)||event.target.closest?.('[data-frontbase-edit-chip],[data-fb-inline-composer],[data-frontbase-field-actions],[data-fb-composer-context]'))return;
  event.preventDefault();event.stopImmediatePropagation();
  const tile=targetTile(event);if(tile&&!waiting)select(tile.id);
 },true);
 window.addEventListener('resize',()=>{if(activeLayout){project();show();}});
 window.addEventListener('beforeunload',event=>{if(changes.length){event.preventDefault();event.returnValue='';}});
 const isActive=()=>activeLayout&&visible&&(!compact||!!composing||!!changes.length);
 isActive.setVisible=value=>{visible=value;if(!value){cancelDrag();closeElementMenu(false);endComposition();}if(activeLayout)project();publishSelection();};
 isActive.updateHandle=updateHandle;
 isActive.editBinding=(id,caret)=>activeLayout?(nodes.has(id)?(select(id),compose(caret)):undefined):load(id,caret);
 return isActive;
}
`;
