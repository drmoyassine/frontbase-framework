import {FRONTEND_LAYOUT_EDITOR} from './frontend-layout-editor.js';

/** Public bootstrap contains no credentials, field inventory, owner or private source paths.
 * It remains inert until the host's ordinary session resolver confirms editing privilege. */
export const FRONTEND_EDITOR_SCRIPT=String.raw`(async()=>{
if(window.top!==window.self||document.querySelector('[data-frontbase-editor]'))return;
const capability=await fetch('/api/frontend-edit/capability/',{credentials:'same-origin',cache:'no-store'}).catch(()=>null);
if(!capability||!capability.ok||!(await capability.json()).enabled)return;
const arabic=document.documentElement.lang.startsWith('ar');
const words=arabic?{
 edit:'تحرير النص',done:'تم',revert:'تراجع عن هذا التعديل',cancelEdit:'إلغاء التحرير',save:'حفظ التغييرات',cancel:'إلغاء التغييرات',
 saving:'جارٍ الحفظ…',failed:'تعذر تأكيد الحفظ. تم الاحتفاظ بتعديلاتك. أعد تحميل الصفحة في علامة تبويب أخرى للمراجعة.',
 conflict:'تغيّر أحد الحقول قبل الحفظ. لم تُحفظ أي تعديلات. أعد تحميل الصفحة قبل دمج تغييراتك.',
 destination:'لم يُحفظ أي تعديل. احفظ نص الصفحة وحقول السجل بشكل منفصل، واحفظ سجلاً واحداً في كل مرة.',
 unsaved:'تعديلات غير محفوظة',open:'فتح محرر الموقع',minimize:'تصغير محرر الموقع',panel:'محرر الموقع',more:'المزيد',
 builder:'فتح في منشئ الصفحات',record:'تحرير السجل',history:'سجل إصدارات التخطيط',visitor:'عرض كزائر',undo:'التراجع عن آخر تعديل',
 page:'نص الصفحة',header:'الترويسة المشتركة',footer:'التذييل المشترك',shared:'قائمة مشتركة',recordScope:'بيانات السجل',
 recordTranslation:'ترجمة السجل',invalid:'أدخل نصًا يتراوح طوله بين حرف واحد و12000 حرف.',unavailable:'تعذر تحميل محرر الموقع.'
}:{
 edit:'Edit text',done:'Done',revert:'Revert this change',cancelEdit:'Cancel editing',save:'Save Changes',cancel:'Cancel Changes',
 saving:'Saving…',failed:'Save could not be confirmed. Your edits are retained. Reload in another tab to review.',
 conflict:'A field changed before the save. No edits were saved. Reload before merging your changes.',
 destination:'No edits were saved. Save page copy and record fields separately, and save one source record at a time.',
 unsaved:'unsaved changes',open:'Open site editor',minimize:'Minimize site editor',panel:'Site editor',more:'More',
 builder:'Open in Builder',record:'Edit record',history:'Layout version history',visitor:'View as visitor',undo:'Undo last edit',
 page:'Page copy',header:'Shared header',footer:'Shared footer',shared:'Shared menu',recordScope:'Record content',
 recordTranslation:'Record translation',invalid:'Text must contain 1–12000 characters.',unavailable:'The site editor could not load.'
};
const iconPaths={
 pencil:'m4 16-1 5 5-1L20 8l-4-4Z M14 6l4 4',minimize:'M5 12h14',more:'M4 12h1m6 0h1m6 0h1',
 save:'M4 3h13l3 3v15H4z M8 3v6h8V3 M8 21v-8h8v8',close:'m6 6 12 12M18 6 6 18',
 done:'m4 12 5 5L20 6',undo:'M4 10h9a6 6 0 0 1 0 12 M4 10l5-5m-5 5 5 5',
 eye:'M2 12q10-15 20 0-10 15-20 0z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 layout:'M3 4h18v16H3z M3 9h18 M10 9v11',history:'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v6l4 2',
 record:'M5 3h14v18H5z M8 8h8m-8 4h8m-8 4h5',up:'m5 14 7-7 7 7',down:'m5 10 7 7 7-7',
 drag:'M8 5h1m6 0h1m-8 7h1m6 0h1m-8 7h1m6 0h1',narrow:'M2 12h7l-3-3m3 3-3 3m16-3h-7l3-3m-3 3 3 3',
 wide:'M9 12H2l3-3m-3 3 3 3m10-3h7l-3-3m3 3-3 3',match:'M3 3v18m18-18v18M6 8h12M6 16h12',
 bold:'M7 4h6a4 4 0 0 1 0 8H7zm0 8h7a4 4 0 0 1 0 8H7z',italic:'M10 4h9m-5 0-5 16m-5 0h9',
 at:'M16 8v7q5 3 5-4a9 9 0 1 0-5 9 M16 11a4 4 0 1 0-1 4',add:'M12 4v16M4 12h16',
 trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15'
};
function tool(control,label,glyph){
 control.title=label;control.setAttribute('aria-label',label);control.classList.add('fb-tool');
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('aria-hidden','true');icon.setAttribute('viewBox','0 0 24 24');
 const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d',iconPaths[glyph]);icon.append(path);
 control.replaceChildren(icon);return control;
}
const style=document.createElement('style');
style.textContent=[
 '[data-fb-copy]{position:relative;cursor:text;border-radius:2px}',
 '[data-fb-copy]:is(:hover,:focus){outline:2px solid #3b82f6;outline-offset:3px}',
 '[data-fb-copy][contenteditable]{outline:2px solid #2563eb;background:#3b82f61a;white-space:pre-wrap;min-width:1em}',
 '[data-fb-copy][data-dirty]{box-shadow:0 2px #f59e0b}',
 '[data-frontbase-editor]{position:fixed;z-index:2147483646;inset-inline-end:max(12px,env(safe-area-inset-right),env(safe-area-inset-left));inset-block-start:max(12px,env(safe-area-inset-top),var(--fb-edit-top,0px));inline-size:max-content;max-inline-size:min(22rem,calc(100vw - 24px));box-sizing:border-box;padding:6px;background:#111827;color:#f8fafc;border:1px solid #64748b;border-radius:12px;box-shadow:0 4px 20px #0005;font:14px/1.4 system-ui;max-block-size:65dvh;overflow:auto}',
 '[data-frontbase-editor] .fb-edit-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px}',
 '[data-frontbase-editor] .fb-edit-section{display:grid;gap:6px;margin-block-start:6px;padding-block-start:6px;border-block-start:1px solid #475569}',
 '[data-frontbase-editor] :is(button,a,summary){box-sizing:border-box;min-block-size:36px;font:inherit;padding:6px 9px;border:1px solid #64748b;border-radius:6px;background:#1e293b;color:inherit;cursor:pointer}',
 '[data-frontbase-editor] a{text-decoration:none;display:block}',
 '[data-frontbase-editor] input{box-sizing:border-box;inline-size:100%;padding:6px;color:#111827;background:#fff;border:1px solid #94a3b8;border-radius:6px}',
 '[data-frontbase-editor] button:disabled{opacity:.55;cursor:default}',
 '[data-fb-layout-handle]{position:fixed;z-index:2147483645;width:44px;height:44px;border:1px solid #93c5fd;border-radius:8px;background:#1e3a8a;color:white;font:24px/1 system-ui;cursor:grab;touch-action:none;user-select:none}',
 '[data-fb-layout-drop-layer]{position:fixed;inset:0;z-index:2147483644;pointer-events:none}',
 '[data-fb-layout-drag-source]{opacity:.5!important}',
 '[data-fb-layout-drag-preview]{position:absolute;top:0;left:0;box-sizing:border-box;width:max-content;max-width:min(250px,52vw);padding:7px 10px;border:2px solid #64748b;border-radius:8px;background:#0f172a;color:#fff;box-shadow:0 6px 20px #0006;font:13px/1.3 system-ui}',
 '[data-fb-layout-drag-preview][data-valid-drop]{border-color:#60a5fa}',
 '[data-fb-layout-drag-preview]>span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;overflow-wrap:anywhere;margin-top:3px}',
 '[data-fb-layout-drop-zone]{position:absolute;border-radius:4px;background:#60a5fa;box-shadow:0 0 0 1px #1e40af}',
 '[data-fb-layout-drop-zone][data-active]{background:#1d4ed8;box-shadow:0 0 0 3px #93c5fd}',
 '[data-fb-layout-drop-zone][data-active]::after{content:attr(data-label);position:absolute;inset-inline-start:4px;inset-block-start:6px;padding:3px 6px;white-space:nowrap;border-radius:4px;background:#1e3a8a;color:white;font:12px/1.3 system-ui}',
 '[data-frontbase-editor][data-fb-layout-dragging]{opacity:.22;pointer-events:none}',
 '[data-frontbase-editor] [data-save]{background:#2563eb;color:#fff}',
 '[data-frontbase-editor] [data-pencil]{position:relative;align-self:flex-start;min-inline-size:40px;font-size:18px}',
 '[data-frontbase-editor] [data-pencil][data-dirty]::after{content:"";position:absolute;inset-block-start:4px;inset-inline-end:4px;inline-size:7px;block-size:7px;border-radius:50%;background:#fbbf24}',
 '[data-frontbase-editor] [role=status]{font-size:12px;color:#cbd5e1}',
 '[data-frontbase-edit-context]{position:fixed;z-index:2147483645;pointer-events:none;transform:translateY(-100%);max-inline-size:calc(100vw - 16px);padding:2px 7px;border-radius:4px;background:#1e3a8a;color:#fff;font:12px/1.1 system-ui}',
 '[data-frontbase-edit-context][hidden]{display:none}',
 '[data-frontbase-editor] [role=alert]{overflow-wrap:anywhere;color:#fecaca}',
 '[data-frontbase-editor] :is(button,a,summary,input):focus-visible{outline:2px solid #93c5fd;outline-offset:1px}',
 '[data-fb-tool-tip]{position:fixed;z-index:2147483647;pointer-events:none;border-radius:5px;padding:4px 8px;color:white;background:#0f172a;font:12px/1.4 system-ui;box-shadow:0 2px 6px #0004}',
 '[data-frontbase-editor] .fb-tool{display:inline-grid;place-items:center;width:38px;height:38px;padding:0;border:0;border-radius:8px;background:transparent;color:#e2e8f0;vertical-align:middle;list-style:none;font:600 19px/1 system-ui}[data-frontbase-editor] .fb-tool svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}[data-frontbase-editor] .fb-tool:hover,[data-frontbase-editor] .fb-tool:focus-visible{background:#334155}[data-frontbase-editor] .fb-tool[aria-pressed=true],[data-frontbase-editor] [data-save]:enabled{background:#1d4ed8;color:white}[data-frontbase-editor] summary::-webkit-details-marker{display:none}',
 '[data-frontbase-editor] select{max-inline-size:100%;border-radius:6px;padding:4px;background:#1e293b;color:inherit}[data-frontbase-editor] .fb-layout-panel{display:grid;gap:6px;padding:5px}[data-frontbase-editor] .fb-tool-group{display:flex;flex-wrap:wrap;align-items:center;gap:3px;border-block-start:1px solid #334155;padding-block-start:4px}[data-frontbase-editor] .fb-edit-section:has(>a){grid-auto-flow:column}[data-fb-inline-editor] .ProseMirror{outline:none;white-space:pre-wrap;overflow-wrap:anywhere;min-inline-size:1ch}[data-fb-inline-editor] .ProseMirror p{font:inherit;color:inherit;margin:0}[data-fb-record-input]{display:grid;gap:4px}[data-fb-record-input] textarea{box-sizing:border-box;width:100%;min-height:2.4em;font:inherit;color:inherit;background:transparent;resize:vertical}',
 '[data-frontbase-editor] [hidden]{display:none!important}[data-frontbase-editor] [hidden],[data-frontbase-editor] :is([role=alert],[role=status]):empty{display:none}',
 '@media(max-width:640px){[data-frontbase-editor]{inset-block-start:auto;inset-block-end:max(12px,env(safe-area-inset-bottom))}body:has(a[href="https://frontbase.dev?ref=badge"]) [data-frontbase-editor]{inset-block-end:max(56px,env(safe-area-inset-bottom))}[data-frontbase-editor] .fb-tool{width:44px;height:44px}}'
].join('');
document.head.append(style);
const controls=document.createElement('div');controls.dataset.frontbaseEditor='';controls.dir=arabic?'rtl':'ltr';
const toolbar=document.createElement('div');toolbar.className='fb-edit-row';controls.append(toolbar);
const toggle=document.createElement('button');toggle.type='button';toggle.dataset.pencil='';toggle.setAttribute('aria-controls','fb-editor-tools');toolbar.append(toggle);
const feedback=document.createElement('div');feedback.setAttribute('role','alert');controls.append(feedback);
document.body.append(controls);
const tip=document.createElement('span');tip.dataset.fbToolTip='';tip.hidden=true;tip.setAttribute('aria-hidden','true');document.body.append(tip);
function showTip(event){
 const button=event.target.closest?.('.fb-tool');
 if(!button||button.disabled||event.pointerType==='touch'){tip.hidden=true;return;}
 const bounds=button.getBoundingClientRect();
 tip.textContent=button.getAttribute('aria-label');tip.dir=controls.dir;tip.hidden=false;
 const rect=tip.getBoundingClientRect();
 tip.style.left=Math.max(6,Math.min(innerWidth-rect.width-6,bounds.left+(bounds.width-rect.width)/2))+'px';
 tip.style.top=(bounds.bottom+rect.height+10<innerHeight?bounds.bottom+6:bounds.top-rect.height-6)+'px';
}
for(const type of ['pointerover','focusin'])controls.addEventListener(type,showTip);
for(const type of ['pointerout','focusout','pointerdown','click'])controls.addEventListener(type,()=>{tip.hidden=true;});
// Keep the desktop controls below the site navigation and language switcher.
const header=document.querySelector('header,[role=banner]');
if(header&&header.getBoundingClientRect().top<48){
 const placeBelowHeader=()=>controls.style.setProperty('--fb-edit-top',Math.ceil(header.getBoundingClientRect().height)+12+'px');
 placeBelowHeader();
 if(typeof ResizeObserver==='function')new ResizeObserver(placeBelowHeader).observe(header);
}
const preference='frontbase:frontend-edit-dock';
let preferred=false,expanded=false,editor;
try{preferred=localStorage.getItem(preference)==='open';}catch{}
function pencil(dirty=false){
 const label=(expanded?words.minimize:words.open)+(!expanded&&dirty?' · '+words.unsaved:'');
 if(toggle.title!==label)tool(toggle,label,expanded?'minimize':'pencil');
 toggle.setAttribute('aria-expanded',String(expanded));toggle.toggleAttribute('data-dirty',dirty);
}
pencil();
async function setEditing(enabled){
 feedback.textContent='';
 toggle.disabled=true;
 try{
  if(enabled&&!editor)editor=await openEditor();
  if(!editor){feedback.textContent=words.unavailable;return;}
  expanded=enabled;
  editor.setExpanded(enabled);
  try{localStorage.setItem(preference,enabled?'open':'closed');}catch{}
 }catch{feedback.textContent=words.unavailable;}
 finally{toggle.disabled=false;}
}
toggle.addEventListener('click',()=>void setEditing(!expanded));
async function openEditor(){
function displayedRecords(){const groups=new Map();
for(const root of document.querySelectorAll('[data-fb-record-key]')){const list=root.closest('[data-component-id]');if(!list||!root.dataset.fbRecordKey)continue;const componentId=list.dataset.componentId,versionId=list.closest('[data-block-active]')?.dataset.blockActive||'default',key=JSON.stringify([componentId,versionId]);if(!groups.has(key))groups.set(key,{componentId,versionId,ids:[]});const ids=groups.get(key).ids;if(!ids.includes(root.dataset.fbRecordKey))ids.push(root.dataset.fbRecordKey);}
return [...groups.values()].map(group=>({...group,ids:group.ids.sort()})).sort((a,b)=>a.componentId.localeCompare(b.componentId));
}
let pagePath=location.pathname+location.search;
// Admit the already-rendered selection once; hydration races reconcile after bootstrap.
const initialSelection=displayedRecords();
const response=await fetch('/api/frontend-edit/inventory/?path='+encodeURIComponent(pagePath)+(initialSelection.length?'&selection='+encodeURIComponent(JSON.stringify(initialSelection)):''),{credentials:'same-origin',cache:'no-store'}).catch(()=>null);
if(!response||!response.ok)return;
let inventory=await response.json();
const tools=document.createElement('div');tools.id='fb-editor-tools';tools.hidden=true;tools.style.minInlineSize='0';tools.setAttribute('role','region');tools.setAttribute('aria-label',words.panel);
const row=document.createElement('div');row.className='fb-edit-row';tools.append(row);
const bar=document.createElement('div');bar.className='fb-edit-section';tools.append(bar);
const fieldActions=document.createElement('div');fieldActions.className='fb-edit-row';bar.append(fieldActions);
const context=document.createElement('span');context.dataset.frontbaseEditContext='';context.id='fb-edit-field-context';context.dir=controls.dir;context.hidden=true;context.setAttribute('role','status');document.body.append(context);
const actions=document.createElement('div');actions.className='fb-edit-row';row.append(actions);
const more=document.createElement('details'),summary=document.createElement('summary');tool(summary,words.more,'more');more.append(summary);
const shortcuts=document.createElement('div');shortcuts.className='fb-edit-section';more.append(shortcuts);
const moreRow=document.createElement('div');moreRow.className='fb-edit-row';moreRow.append(more);row.append(moreRow);
toolbar.append(tools);
function button(parent,label,fn){const b=document.createElement('button');b.type='button';tool(b,label,({[words.done]:'done',[words.cancelEdit]:'close',[words.revert]:'history',[words.undo]:'undo',[words.record]:'record',[words.visitor]:'eye',[words.save]:'save',[words.cancel]:'close'})[label]);b.onclick=fn;parent.append(b);return b;}
function shortcut(label,path){
 const link=document.createElement('a');link.href=path;tool(link,label,label===words.builder?'layout':'history');link.target='_blank';link.rel='noopener';
 shortcuts.append(link);return link;
}
if(typeof inventory.pageId==='string'&&inventory.pageId){
 const builder='/frontbase-admin/builder/'+encodeURIComponent(inventory.pageId);
 const builderRecord=inventory.layoutDraft?builder+'?'+new URLSearchParams({previewPath:location.pathname}):builder;
 shortcut(words.builder,builderRecord);shortcut(words.history,builder+'?panel=version-history');
}
const status=document.createElement('span');status.dataset.editStatus='';status.setAttribute('role','status');bar.append(status);
const pending=new Map(),bound=new Map(),editActions=new WeakMap(),recordActions=new WeakMap(),recordAttributes=new WeakMap(),recordNodes=new Set();
const undoStack=[];
let active=null,selectedField=null,selectedRecord=null,busy=false,error='';
const original=new Map(inventory.fields.map(f=>[f.id,f.sourceValue??f.text]));
const displayed=new WeakMap();
let recordSelection=initialSelection,selectionKey=JSON.stringify([pagePath,initialSelection]),refreshRequest;
async function refreshRecords(){
 if(!expanded||refreshRequest||busy||active||pending.size)return;
 const selected=displayedRecords(),nextPath=location.pathname+location.search,key=JSON.stringify([nextPath,selected]);
 if(!selected.length||key===selectionKey)return;
 selectionKey=key;
 const controller=new AbortController(),{signal}=controller;
 refreshRequest=controller;
 try{
  const response=await fetch('/api/frontend-edit/inventory/?path='+encodeURIComponent(nextPath)+'&selection='+encodeURIComponent(JSON.stringify(selected)),{credentials:'same-origin',cache:'no-store',signal});
  if(!response.ok)throw Error();
  const next=await response.json();
  if(signal.aborted||!expanded||active||pending.size){selectionKey='';return;}
  inventory=next;error='';recordSelection=selected;pagePath=nextPath;
  original.clear();for(const field of inventory.fields)original.set(field.id,field.sourceValue??field.text);
  for(const element of recordNodes){
   if(!element.isConnected){recordNodes.delete(element);continue;}
   recordActions.delete(element);restoreRecord(element);
  }
  bindRecords();update();
 }catch{
  if(signal.aborted){selectionKey='';return;}
  error=arabic?'تعذر التحقق من السجلات المعروضة. أعد تحميل الصفحة.':'Displayed records could not be verified. Reload the page.';
  update();
 }finally{
  refreshRequest=undefined;
  queueMicrotask(()=>void refreshRecords());
 }
}
function previewRecords(show=expanded){const records=new Map();for(const field of inventory.fields)if(field.recordKey){const key=JSON.stringify([field.recordScope,field.recordKey]);if(!records.has(key))records.set(key,{recordScope:field.recordScope,recordKey:field.recordKey,values:{}});if(show&&pending.has(field.id))records.get(key).values[field.fieldKey]=pending.get(field.id);}for(const detail of records.values())window.dispatchEvent(new CustomEvent('frontbase:record-draft',{detail}));}
const emphasizedCopy=new WeakMap();
function all(id,text){for(const span of bound.get(id)||[]){
 const value=text===original.get(id)?(displayed.get(span)??text):text;
 const emphasized=emphasizedCopy.get(span);
 if(emphasized&&value===emphasized.textContent){
  if(!span.firstElementChild?.hasAttribute('data-fb-inline-emphasis'))span.replaceChildren(emphasized.cloneNode(true));
 }else if(span.textContent!==value||span.firstElementChild)span.textContent=value;
}}
function scope(field){
 if(field.destination==='record-translation')return words.recordTranslation;
 if(field.recordKey)return words.recordScope;
 if(!field.blockId.startsWith('managed-menu-'))return words.page;
 const region=document.getElementById(field.blockId);
 if(region?.closest('footer,[role=contentinfo]'))return words.footer;
 if(region?.closest('header,[role=banner]'))return words.header;
 return words.shared;
}
function language(){
 const locale=inventory.locale||document.documentElement.lang;
 try{return new Intl.DisplayNames([locale],{type:'language'}).of(locale);}catch{return locale;}
}
function positionContext(){
 const target=expanded&&active?.element;
 if(!target?.isConnected){context.hidden=true;return;}
 const rect=target.getClientRects()[0]??target.getBoundingClientRect();
 if(rect.bottom<0||rect.top>innerHeight||rect.right<0||rect.left>innerWidth){context.hidden=true;return;}
 context.hidden=false;
 const width=context.offsetWidth;
 const start=controls.dir==='rtl'?rect.right-width:rect.left;
 context.style.left=Math.max(8,Math.min(start,innerWidth-width-8))+'px';
 context.style.top=Math.max(context.offsetHeight,rect.top-2)+'px';
}
function recordTarget(){
 if(selectedRecord?.isConnected&&recordActions.has(selectedRecord))return {element:selectedRecord,edit:recordActions.get(selectedRecord).edit};
 const selected=selectedField?.recordKey&&bound.get(selectedField.id)?.find(span=>span.isConnected);
 if(selected)return {element:selected,edit:editActions.get(selected)};
 const candidates=[];
 for(const field of inventory.fields){
  if(!field.recordKey)continue;
  const identity=JSON.stringify([field.recordScope,field.recordKey]);
  for(const span of bound.get(field.id)||[])if(span.isConnected)candidates.push({element:span,edit:editActions.get(span),identity});
 }
 for(const element of recordNodes){
  const action=recordActions.get(element);
  if(!element.isConnected||!action)continue;
  const field=action.fields[0];
  candidates.push({element,edit:action.edit,identity:JSON.stringify([field.recordScope,field.recordKey])});
 }
 // The main record heading identifies a detail page even when related records also appear.
 const headings=candidates.filter(({element})=>element.closest('h1'));
 const targets=headings.length?headings:candidates;
 return new Set(targets.map(({identity})=>identity)).size===1?targets[0]:null;
}
function update(){
 const count=pending.size,dirty=Boolean(count||active&&draftValues().some(({id,text})=>text!==(pending.get(id)??original.get(id))));
 pencil(dirty);toggle.disabled=busy;
 done.hidden=!active;cancelEdit.hidden=!active;revert.hidden=!active||!draftValues().some(({id})=>pending.has(id));
 save.hidden=cancel.hidden=!dirty;save.disabled=cancel.disabled=busy;undo.disabled=busy;undo.hidden=!undoStack.length;
 recordLink.hidden=!recordTarget();
 const message=error||(count?count+' '+words.unsaved:'');
 if(status.textContent!==message)status.textContent=message;
 const label=active&&selectedField?language()+' · '+scope(selectedField):'';
 if(context.textContent!==label)context.textContent=label;
 positionContext();
 bar.hidden=!message&&!active;
 for(const [id,spans]of bound)for(const span of spans)span.toggleAttribute('data-dirty',expanded&&pending.has(id));
 for(const element of recordNodes)element.toggleAttribute('data-dirty',expanded&&(recordActions.get(element)?.fields||[]).some(field=>pending.has(field.id)));
}
function bindableSpan(span,id,on){
 if(on){
  span.dataset.fbCopy=id;span.tabIndex=0;span.setAttribute('role','button');span.setAttribute('aria-label',words.edit+': '+inventory.fields.find(field=>field.id===id)?.label);span.title=words.edit;
 }else for(const attr of ['data-fb-copy','tabindex','role','aria-label','title'])span.removeAttribute(attr);
}
function restoreRecord(element){
 for(const [key,value]of recordAttributes.get(element)||[]){if(value===null)element.removeAttribute(key);else element.setAttribute(key,value);}
 element.removeAttribute('data-dirty');
}
function markRecord(element,fields){
 element.dataset.fbCopy='record';element.tabIndex=0;element.setAttribute('role','button');element.setAttribute('aria-label',words.edit+': '+fields.map(field=>field.fieldKey).join(', '));
}
function stop(){
 if(!active)return;
 if(active.form)active.form.replaceWith(...active.originalNodes);else{active.span.removeAttribute('contenteditable');active.span.removeAttribute('aria-describedby');active.span.setAttribute('role','button');}
 active=null;
}
function cancelCurrent(){if(!active)return;const id=active.id;stop();if(id)all(id,pending.get(id)??original.get(id));error='';update();}
function draftValues(){
 if(!active)return [];
 return active.fields?active.fields.map((field,index)=>({id:field.id,text:active.inputs[index].value})):[{id:active.id,text:active.span.textContent}];
}
function applyValues(values,remember){
 const before=[];
 for(const {id,text}of values){
  const previous=pending.get(id)??original.get(id);
  if(remember&&text!==previous)before.push({id,text:previous});
  if(text===original.get(id))pending.delete(id);else pending.set(id,text);
  all(id,text);
 }
 if(before.length)undoStack.push(before);
 previewRecords();error='';update();
}
const valid=text=>text.trim()&&text.length<=12000;
function stage(validate=true){
 if(!active)return true;
 const values=draftValues();
 if(validate&&values.some(({text})=>!valid(text))){error=words.invalid;update();return false;}
 stop();applyValues(values,true);return true;
}
const done=button(fieldActions,words.done,()=>stage()),cancelEdit=button(fieldActions,words.cancelEdit,cancelCurrent);
const revert=button(fieldActions,words.revert,()=>{if(!active)return;const values=draftValues().map(({id})=>({id,text:original.get(id)}));stop();applyValues(values,true);});
const undo=button(shortcuts,words.undo,undoLast);
function undoLast(){if(busy||!stage()||!undoStack.length)return;applyValues(undoStack.pop(),false);}
const recordLink=button(shortcuts,words.record,event=>{if(layoutActive())return;const target=recordTarget();if(!target)return;more.open=false;target.element.scrollIntoView?.({block:'nearest'});target.edit(event);});
button(shortcuts,words.visitor,()=>void setEditing(false));
const save=button(actions,words.save,async()=>{
 if(busy||!stage()||!pending.size)return;
 if([...pending.values()].some(text=>!valid(text))){error=words.invalid;update();return;}
 busy=true;error='';tool(save,words.saving,'more');update();
 try{
  const saved=await fetch('/api/frontend-edit/save/',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Frontbase-Editor':'1'},body:JSON.stringify({path:pagePath,token:inventory.token,selection:recordSelection.length?recordSelection:undefined,operationId:crypto.randomUUID(),entries:[...pending].map(([id,text])=>({id,text}))})});
  if(!saved.ok){
   const {code}=await saved.json().catch(()=>({}));
   error=code==='editor_atomic_conflict'||code==='copy_conflict'?words.conflict:code==='editor_atomic_destination_required'?words.destination:words.failed;
   return;
  }
  pending.clear();stop();location.reload();
 }catch{error=words.failed;}finally{busy=false;tool(save,words.save,'save');update();}
});save.dataset.save='';
const cancel=button(actions,words.cancel,()=>{stop();const values=[...pending.keys()].map(id=>({id,text:original.get(id)}));undoStack.length=0;applyValues(values,false);for(const [id]of bound)all(id,original.get(id));});
function setExpanded(on){
 layoutActive.setVisible?.(on);
 tools.hidden=!on;
 if(!on){
  // Keep the staged values in this document while restoring visitor text and link behavior.
  observer.disconnect();refreshRequest?.abort();stage(false);
  for(const [id,spans]of bound){all(id,original.get(id));for(const span of spans)bindableSpan(span,id,false);}
  for(const element of recordNodes)restoreRecord(element);
  more.open=false;toggle.focus();
 }else{
  for(const [id,spans]of bound){all(id,pending.get(id)??original.get(id));for(const span of spans)bindableSpan(span,id,true);}
  for(const element of recordNodes){const fields=recordActions.get(element)?.fields;if(fields)markRecord(element,fields);}
  bind();
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-fb-record-fields','data-fb-record-key']});
  void refreshRecords();
 }
 previewRecords();update();
}
function bindRecords(){for(const root of document.querySelectorAll('[data-fb-record-key]'))for(const element of root.querySelectorAll('[data-fb-record-fields]')){
let paths;try{paths=JSON.parse(element.dataset.fbRecordFields);}catch{continue;}
const fields=inventory.fields.filter(field=>field.recordKey===root.dataset.fbRecordKey&&field.recordScope===root.dataset.fbRecordScope&&paths.includes(field.fieldKey));const previous=recordActions.get(element)?.fields;if(previous?.length===fields.length&&fields.every((field,index)=>field.id===previous[index].id))continue;
if(!fields.length){if(previous){recordActions.delete(element);restoreRecord(element);}continue;}
const edit=event=>{if(!expanded||busy)return;event.preventDefault();event.stopImmediatePropagation();if(!stage())return;selectedField=fields[0];selectedRecord=element;const form=document.createElement('div');form.className='fb-edit-section';form.setAttribute('aria-describedby',context.id);const inputs=fields.map(field=>{const label=document.createElement('label');label.style.cssText='display:flex;flex-direction:column;gap:4px';label.textContent=field.fieldKey;const input=document.createElement('textarea');input.rows=Math.min(10,Math.max(1,Math.ceil((pending.get(field.id)??original.get(field.id)).length/70)));input.value=pending.get(field.id)??original.get(field.id);input.addEventListener('input',update);input.setAttribute('aria-label',field.fieldKey);input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelCurrent();}else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();stage();}});label.append(input);form.append(label);return input;});const originalNodes=[...element.childNodes];form.dataset.fbRecordInput='';element.replaceChildren(form);active={fields,inputs,form,element,originalNodes};inputs[0].focus();update();};
const first=!recordAttributes.has(element);if(first)recordAttributes.set(element,['data-fb-copy','tabindex','role','aria-label'].map(key=>[key,element.getAttribute(key)]));recordActions.set(element,{edit,fields});recordNodes.add(element);markRecord(element,fields);if(first)element.addEventListener('keydown',event=>{if(!event.target.closest?.('[data-fb-record-input]')&&(event.key==='Enter'||event.key===' '))recordActions.get(element)?.edit(event);});
}}
function bind(){bindRecords();for(const field of inventory.fields){if(field.blockId.startsWith('$')||['alt','ariaLabel','placeholder'].includes(field.path.at(-1)))continue;const root=document.getElementById(field.blockId);if(!root)continue;
if(field.versionId){const parent=root.closest('[data-block-versions]');if(parent&&parent.dataset.blockActive!==field.versionId)continue;}
const emphasis=root.querySelector(':scope > [data-fb-inline-emphasis], :scope > [data-fb-inline-copy] > [data-fb-inline-emphasis]');
const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;const matches=[];
if(emphasis&&emphasis.textContent.trim()===field.text.trim()&&!emphasis.closest('[data-fb-copy]'))matches.push(emphasis);
else while(node=walker.nextNode()){if(node.parentElement.closest('script,style,template,[data-fb-copy],[data-frontbase-editor],[data-fb-inline-emphasis],[data-fb-inline-variable],[contenteditable],textarea,select'))continue;if(node.textContent.trim()===field.text.trim())matches.push(node);}
// Responsive menu copies may share one field, but independent equal labels stay ambiguous.
if(matches.length!==1){const identities=new Set(inventory.fields.filter(other=>other.blockId===field.blockId&&other.text.trim()===field.text.trim()).map(other=>other.id));const hrefs=matches.map(node=>node.parentElement.closest('a')?.getAttribute('href'));if(!field.blockId.startsWith('managed-menu-')||!matches.length||identities.size!==1||hrefs.some(href=>!href||href!==hrefs[0]))continue;}
for(const match of matches){const span=document.createElement('span');bindableSpan(span,field.id,true);if(field.sourceValue!==undefined)displayed.set(span,match.textContent);match.replaceWith(span);
if(match.nodeType===Node.ELEMENT_NODE){span.append(match);emphasizedCopy.set(span,match.cloneNode(true));}else span.textContent=match.textContent;
const spans=bound.get(field.id)||[];spans.push(span);bound.set(field.id,spans);
const edit=event=>{if(!expanded||busy)return;event.preventDefault();event.stopImmediatePropagation();if(active?.span===span){span.focus();return;}if(!stage())return;selectedField=field;selectedRecord=null;active={id:field.id,span,element:span};if(field.sourceValue!==undefined)span.textContent=pending.get(field.id)??field.sourceValue;span.setAttribute('aria-describedby',context.id);span.setAttribute('contenteditable','plaintext-only');span.setAttribute('role','textbox');span.focus();update();};
editActions.set(span,edit);span.addEventListener('click',edit);span.addEventListener('keydown',event=>{if(active?.span===span){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelCurrent();}else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();stage();}}else if(event.key==='Enter'||event.key===' '){edit(event);}});
span.addEventListener('input',update);
span.addEventListener('paste',event=>{if(active?.span!==span)return;event.preventDefault();const value=event.clipboardData.getData('text/plain');document.execCommand('insertText',false,value);});
}}}
${FRONTEND_LAYOUT_EDITOR}
const layoutActive=installLayoutEditor({dock:controls,container:tools});
// Stop navigation and configured click workflows before their document/element handlers.
window.addEventListener('click',event=>{if(!expanded||layoutActive()||event.target.closest?.('[data-fb-record-input]'))return;const span=event.target.closest?.('[data-fb-copy]');if(span&&(editActions.has(span)||recordActions.has(span))){if(busy){event.preventDefault();event.stopImmediatePropagation();return;}if(recordActions.has(span))recordActions.get(span).edit(event);else editActions.get(span)(event);}},{capture:true});
const observer=new MutationObserver(records=>{
 if(!expanded||typeof document==='undefined'||!document?.body||records.every(record=>controls.contains(record.target)||context.contains(record.target)))return;
 bind();update();void refreshRecords();
});
window.addEventListener('scroll',positionContext,{capture:true,passive:true});
window.addEventListener('resize',positionContext,{passive:true});
window.addEventListener('keydown',event=>{
 if(!expanded||busy||event.defaultPrevented)return;
 if(event.key==='Escape'&&!active){event.preventDefault();void setEditing(false);}
 if((event.metaKey||event.ctrlKey)&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='z'&&undoStack.length&&!event.target.closest?.('input,textarea,[contenteditable]')){event.preventDefault();undoLast();}
});
window.addEventListener('beforeunload',event=>{if(pending.size||draftValues().some(({id,text})=>text!==(pending.get(id)??original.get(id)))){event.preventDefault();event.returnValue='';}});
return {setExpanded};
}
if(preferred)await setEditing(true);
})().catch(()=>{});`;

/** Host opt-in, public page HTML only. APIs/admin, preview frames and non-HTML stay untouched. */
export async function withFrontendEditor(response:Response,request:Request):Promise<Response>{
    if(request.method!=='GET'||response.status!==200||!response.headers.get('content-type')?.includes('text/html')||/^\/(?:api|frontbase-admin|frontbase-setup|builder)(?:\/|$)/.test(new URL(request.url).pathname))return response;
    const html=await response.text(),headers=new Headers(response.headers);headers.delete('content-length');headers.delete('etag');headers.set('Cache-Control','no-store');
    return new Response(html.replace('</body>','<script src="/api/frontend-edit/script.js" defer></script></body>'),{status:response.status,headers});
}
