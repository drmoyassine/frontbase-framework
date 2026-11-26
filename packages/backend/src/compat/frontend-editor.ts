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
const style=document.createElement('style');
style.textContent=[
 '[data-fb-copy]{position:relative;cursor:text;border-radius:2px}',
 '[data-fb-copy]:is(:hover,:focus){outline:2px solid #3b82f6;outline-offset:3px}',
 '[data-fb-copy][contenteditable]{outline:2px solid #2563eb;background:#3b82f61a;white-space:pre-wrap;min-width:1em}',
 '[data-fb-static-copy]:is(:hover,:focus-visible,[contenteditable]){outline-color:#94a3b8}',
 '[data-fb-static-copy][contenteditable]{background:transparent}',
 '[data-frontbase-edit-chip][data-fb-static-copy]{background:#334155;border-color:#94a3b8}',
 '[data-frontbase-editor][data-fb-typing-label] [data-fb-layout-open]{display:none}',
 '[data-fb-copy][data-dirty]{box-shadow:0 2px #f59e0b}',
 '[data-frontbase-editor]{position:fixed;z-index:2147483646;inset-inline-end:max(12px,env(safe-area-inset-right),env(safe-area-inset-left));inset-block-start:max(12px,env(safe-area-inset-top),var(--fb-edit-top,0px));inline-size:max-content;max-inline-size:min(22rem,calc(100vw - 24px));box-sizing:border-box;padding:6px;background:#111827;color:#f8fafc;border:1px solid #64748b;border-radius:12px;box-shadow:0 4px 20px #0005;font:14px/1.4 system-ui;max-block-size:65dvh;overflow:auto}',
 ':is([data-frontbase-editor],[data-fb-element-menu]) .fb-edit-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px}',
 '[data-frontbase-editor] .fb-edit-section{display:grid;gap:6px;margin-block-start:6px;padding-block-start:6px;border-block-start:1px solid #475569}',
 ':is([data-frontbase-editor],[data-fb-element-menu]) :is(button,a,summary){box-sizing:border-box;min-block-size:36px;font:inherit;padding:6px 9px;border:1px solid #64748b;border-radius:6px;background:#1e293b;color:inherit;cursor:pointer}',
 '[data-frontbase-editor] a{text-decoration:none;display:block}',
 ':is([data-frontbase-editor],[data-fb-element-menu]) input{box-sizing:border-box;inline-size:100%;padding:6px;color:#111827;background:#fff;border:1px solid #94a3b8;border-radius:6px}',
 ':is([data-frontbase-editor],[data-fb-element-menu]) button:disabled{opacity:.55;cursor:default}',
 '[data-fb-layout-handle]{flex:none;min-inline-size:24px;min-block-size:24px;padding:0;border:0;border-inline-end:1px solid #93c5fd80;border-radius:0;background:transparent;color:inherit;font:16px/1 system-ui;cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none}',
 '[data-fb-layout-handle]:disabled{opacity:.55;cursor:default}',
 '[data-fb-layout-handle]:not(:disabled):is(:hover,:focus-visible),button[data-frontbase-edit-context]:is(:hover,:focus-visible){background:#ffffff24}',
 '[data-fb-layout-drop-layer]{position:fixed;inset:0;z-index:2147483644;pointer-events:none}',
 '[data-fb-layout-drag-source]{opacity:.5!important}',
 '[data-fb-layout-drag-preview]{position:absolute;top:0;left:0;box-sizing:border-box;width:max-content;max-width:min(250px,52vw);padding:7px 10px;border:2px solid #64748b;border-radius:8px;background:#0f172a;color:#fff;box-shadow:0 6px 20px #0006;font:13px/1.3 system-ui}',
 '[data-fb-layout-drag-preview][data-valid-drop]{border-color:#60a5fa}',
 '[data-fb-layout-drag-preview]>span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;overflow-wrap:anywhere;margin-top:3px}',
 '[data-fb-layout-drop-zone]{position:absolute;border-radius:4px;background:#60a5fa;box-shadow:0 0 0 1px #1e40af}',
 '[data-fb-layout-drop-zone][data-active]{background:#1d4ed8;box-shadow:0 0 0 3px #93c5fd}',
 '[data-fb-layout-drop-zone][data-active]::after{content:attr(data-label);position:absolute;inset-inline-start:4px;inset-block-start:6px;padding:3px 6px;white-space:nowrap;border-radius:4px;background:#1e3a8a;color:white;font:12px/1.3 system-ui}',
 '[data-frontbase-editor][data-fb-layout-dragging]{opacity:.22;pointer-events:none}',
 '@media(forced-colors:active){[data-fb-layout-drop-zone][data-active]{background:Highlight;outline:2px solid Highlight}[data-fb-layout-handle]:focus-visible{outline:2px solid Highlight;outline-offset:2px}}',
 '[data-frontbase-editor] [data-save]{background:#2563eb;color:#fff}',
 '[data-frontbase-editor] [data-pencil]{position:relative;align-self:flex-start;min-inline-size:40px;font-size:18px}',
 '[data-frontbase-editor] [data-pencil][data-dirty]::after{content:"";position:absolute;inset-block-start:4px;inset-inline-end:4px;inline-size:7px;block-size:7px;border-radius:50%;background:#fbbf24}',
 '[data-frontbase-editor] [role=status]{font-size:12px;color:#cbd5e1}',
 ':is([data-frontbase-edit-chip],[data-fb-box-chip]){position:fixed;z-index:2147483645;display:flex;transform:translateY(-100%);max-inline-size:calc(100vw - 16px);border:1px solid #93c5fd;border-radius:5px;background:#1e3a8a;color:#fff;font:12px/1.2 system-ui}',
 '[data-fb-box-chip]{background:#334155;border-color:#94a3b8}',
 '[data-fb-element-actions]{padding:0;min-inline-size:24px;min-block-size:24px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}',
 ':is([data-fb-element-actions],[data-fb-binding-entry]):is(:hover,:focus-visible){background:#ffffff24}',
 '[data-fb-binding-entry]{padding:0;min-inline-size:24px;min-block-size:24px;background:transparent;color:inherit;border:0;border-inline-end:1px solid #93c5fd80;cursor:pointer}',
 ':is([data-frontbase-edit-chip],[data-fb-box-chip],[data-fb-layout-handle],[data-fb-binding-entry],[data-fb-element-menu])[hidden]{display:none}',
 '[data-fb-element-menu]{position:fixed;z-index:2147483646;box-sizing:border-box;inline-size:max-content;max-inline-size:min(22rem,calc(100vw - 16px));max-block-size:60dvh;overflow:auto;padding:8px;background:#111827;color:#f8fafc;border:1px solid #64748b;border-radius:8px;box-shadow:0 4px 20px #0005;font:14px/1.4 system-ui}',
 '[data-fb-element-menu] select{max-inline-size:100%;color:#111827;background:white}',
 '[data-frontbase-edit-context]{min-inline-size:0;min-block-size:24px;padding:2px 7px;border:0;border-radius:inherit;background:transparent;color:inherit;font:inherit;overflow-wrap:anywhere}',
 'button[data-frontbase-edit-context]{text-align:start;cursor:pointer}',
 '@media(any-pointer:coarse){:is([data-fb-layout-handle],[data-frontbase-edit-context],[data-fb-element-actions],[data-fb-binding-entry]){min-block-size:44px;min-inline-size:44px}}',
 '[data-frontbase-field-actions]{z-index:2147483647;position:fixed;inset:auto;margin:0;max-inline-size:calc(100vw - 16px);padding:6px;color:#f8fafc;background:#0f172a;border:1px solid #64748b;border-radius:8px}',
 '[data-frontbase-field-actions] :is(button,a){display:block;padding:6px 10px;min-block-size:28px;color:inherit;background:transparent;border:0;text-align:start;cursor:pointer}',
 '[data-frontbase-field-actions] :is(button,a):focus-visible{outline:2px solid #93c5fd;outline-offset:-2px}',
 '[data-fb-inline-composer]{outline:2px solid #94a3b8;outline-offset:4px;white-space:pre-wrap;min-inline-size:1ch}',
 '[data-fb-inline-composer]:is(:empty,:has(> br:only-child)){display:inline-block;min-inline-size:6ch;min-block-size:1em;vertical-align:text-bottom}',
 '[data-fb-binding-chip]{background:#dbeafe;color:#1e3a8a;border:1px solid #3b82f6;border-radius:5px;box-decoration-break:clone;padding-inline:3px;cursor:pointer}',
 '[data-fb-binding-chip][data-selected]{outline:2px solid #2563eb;outline-offset:1px}',
 '[data-fb-composer-context] :is(button,input,select){font:inherit;border:1px solid #94a3b8;border-radius:4px;padding:3px 6px;background:#fff;color:#0f172a;max-inline-size:100%}',
 '[data-fb-composer-context] button{cursor:pointer}',
 '[data-fb-composer-context] button[aria-pressed=true]{background:#dbeafe;box-shadow:inset 0 0 0 1px #2563eb}',
 '[data-fb-binding-actions] button:not([hidden]){display:block;margin-block:2px}',
 '[data-frontbase-editor] [role=alert]{overflow-wrap:anywhere;color:#fecaca}',
 '[data-frontbase-editor] :is(button,a,summary,input):focus-visible{outline:2px solid #93c5fd;outline-offset:1px}',
 '[data-frontbase-editor] [hidden],[data-frontbase-editor] :is([role=alert],[role=status]):empty{display:none}',
 '@media(max-width:640px){[data-frontbase-editor]{inset-block-start:auto;inset-block-end:max(12px,env(safe-area-inset-bottom))}body:has(a[href="https://frontbase.dev?ref=badge"]) [data-frontbase-editor]{inset-block-end:max(56px,env(safe-area-inset-bottom))}[data-frontbase-editor] :is(button,summary){min-block-size:44px}}'
].join('');
document.head.append(style);
const controls=document.createElement('div');controls.dataset.frontbaseEditor='';controls.dir=arabic?'rtl':'ltr';
const toolbar=document.createElement('div');toolbar.className='fb-edit-row';controls.append(toolbar);
const toggle=document.createElement('button');toggle.type='button';toggle.dataset.pencil='';toggle.setAttribute('aria-controls','fb-editor-tools');toolbar.append(toggle);
const feedback=document.createElement('div');feedback.setAttribute('role','alert');controls.append(feedback);
document.body.append(controls);
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
 toggle.textContent=expanded?'−':'✎';toggle.title=label;toggle.setAttribute('aria-label',label);
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
const hasLayout=!!inventory.layoutDraft;
const chip=document.createElement('div');chip.dataset.frontbaseEditChip='';chip.dir=controls.dir;chip.hidden=true;
const boxChip=document.createElement('div');boxChip.dataset.fbBoxChip='';boxChip.dir=controls.dir;boxChip.hidden=true;
const context=document.createElement(hasLayout?'button':'span');context.dataset.frontbaseEditContext='';context.id='fb-edit-field-context';context.dir=controls.dir;context.hidden=true;
if(hasLayout){context.type='button';context.setAttribute('aria-expanded','false');context.setAttribute('aria-controls','fb-field-actions');context.setAttribute('aria-haspopup','menu');}
else context.setAttribute('role','status');
const fieldMenu=document.createElement('div');fieldMenu.id='fb-field-actions';fieldMenu.dataset.frontbaseFieldActions='';fieldMenu.dir=controls.dir;
const nativePopover=typeof fieldMenu.showPopover==='function';if(nativePopover)fieldMenu.setAttribute('popover','auto');else fieldMenu.hidden=true;
chip.append(context);document.body.append(chip,boxChip,fieldMenu);
const actions=document.createElement('div');actions.className='fb-edit-row';row.append(actions);
const more=document.createElement('details'),summary=document.createElement('summary');summary.textContent=words.more;more.append(summary);
const shortcuts=document.createElement('div');shortcuts.className='fb-edit-section';more.append(shortcuts);
const moreRow=document.createElement('div');moreRow.className='fb-edit-row';moreRow.append(more);row.append(moreRow);
toolbar.append(tools);
function button(parent,label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=fn;parent.append(b);return b;}
function shortcut(label,path){
 const link=document.createElement('a');link.href=path;link.textContent=label;link.target='_blank';link.rel='noopener';
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
let layoutSelection;
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
 const align=(control,target,end=false)=>{
  const rect=expanded&&target?.isConnected&&(end?target.getBoundingClientRect():target.getClientRects()[0]??target.getBoundingClientRect());
  control.hidden=!rect||rect.bottom<0||rect.top>innerHeight||rect.right<0||rect.left>innerWidth;
  if(control.hidden)return;
  const width=control.offsetWidth;
  const start=(controls.dir==='rtl')!==end?rect.right-width:rect.left;
  let left=Math.max(8,Math.min(start,innerWidth-width-8));
  const blue=chip.getBoundingClientRect();
  const overlap=end&&!chip.hidden&&blue.left<left+width+5&&blue.right>left-5;
  const height=control.offsetHeight;
  let top=Math.max(height+4,Math.min(end&&overlap?rect.bottom+height+4:rect.top-2,innerHeight-4));
  const dock=controls.getBoundingClientRect();
  if(dock.width&&left<dock.right+4&&left+width>dock.left-4&&top>dock.top&&top-height<dock.bottom){
   const beside=controls.dir==='rtl'?dock.right+5:dock.left-width-5;
   const besideBlue=end&&!chip.hidden&&blue.left<beside+width+5&&blue.right>beside-5&&blue.bottom>top-height&&blue.top<top;
   if(beside>=8&&beside+width<=innerWidth-8&&!besideBlue)left=beside;
   else top=Math.min(innerHeight-4,dock.bottom+height+5);
  }
  control.style.left=left+'px';
  control.style.top=top+'px';
 };
 align(chip,active?.direct?null:active?.element);
 align(boxChip,active?.direct||layoutSelection?.compact?null:layoutSelection?.element??(recordTile()&&document.getElementById(recordTile())),!!active||!!layoutSelection?.composing);
 if(chip.hidden)closeFieldMenu(false);
 if(context.getAttribute('aria-expanded')==='true')positionFieldMenu();
}
function positionFieldMenu(){
 const trigger=chip.getBoundingClientRect(),menu=fieldMenu.getBoundingClientRect();
 const start=controls.dir==='rtl'?trigger.right-menu.width:trigger.left;
 fieldMenu.style.left=Math.max(8,Math.min(innerWidth-menu.width-8,start))+'px';
 fieldMenu.style.top=Math.max(8,Math.min(innerHeight-menu.height-8,trigger.bottom+5))+'px';
}
function closeFieldMenu(restore){
 if(context.getAttribute('aria-expanded')!=='true')return;
 context.setAttribute('aria-expanded','false');
 if(nativePopover)fieldMenu.hidePopover();else fieldMenu.hidden=true;
 if(restore&&!chip.hidden)context.focus();
}
let bindingEntry;
function updateContext(){
 const field=active&&selectedField;
 const label=field&&(hasLayout&&field.label||scope(field));
 const text=label?language()+' · '+label+(hasLayout?' ▾':''):'';
 if(context.textContent!==text)context.textContent=text;
 chip.toggleAttribute('data-fb-static-copy',!!field&&!field.recordKey);
 context.hidden=!label;
 if(bindingEntry)bindingEntry.hidden=!field?.recordKey||!recordTile()||!!active?.fields;
 positionContext();
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
 const direct=!!active?.direct||!!layoutSelection?.compact;
 controls.toggleAttribute('data-fb-typing-label',direct);
 moreRow.hidden=direct;
 pencil(dirty);toggle.disabled=busy;
 done.hidden=cancelEdit.hidden=!active||direct;revert.hidden=!active||direct||!draftValues().some(({id})=>pending.has(id));
 save.hidden=cancel.hidden=!dirty;save.disabled=cancel.disabled=busy;undo.disabled=busy;undo.hidden=!undoStack.length;
 recordLink.hidden=!recordTarget();
 const message=error||(count?count+' '+words.unsaved:'');
 if(status.textContent!==message)status.textContent=message;
 bar.hidden=!message&&(!active||direct);
 layoutActive.updateHandle?.();updateContext();
 for(const [id,spans]of bound)for(const span of spans)span.toggleAttribute('data-dirty',expanded&&pending.has(id));
 for(const element of recordNodes)element.toggleAttribute('data-dirty',expanded&&(recordActions.get(element)?.fields||[]).some(field=>pending.has(field.id)));
}
function bindableSpan(span,id,on){
 if(on){
  const field=inventory.fields.find(field=>field.id===id);
  span.dataset.fbCopy=id;span.toggleAttribute('data-fb-static-copy',!!field&&!field.recordKey);
  span.tabIndex=0;span.setAttribute('role','button');span.setAttribute('aria-label',words.edit+': '+field?.label);span.title=words.edit;
 }else for(const attr of ['data-fb-copy','data-fb-static-copy','tabindex','role','aria-label','title'])span.removeAttribute(attr);
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
 if(active.form)active.form.remove();else{active.span.removeAttribute('contenteditable');active.span.removeAttribute('aria-describedby');active.span.setAttribute('role','button');}
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
function leaveRecordAtEdge(event,span,field){
 if(!hasLayout||!field.recordKey||busy||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||
    !['ArrowLeft','ArrowRight'].includes(event.key))return;
 const selection=document.getSelection();
 if(!selection?.isCollapsed||!span.contains(selection.anchorNode))return;
 const before=event.key===(getComputedStyle(span).direction==='rtl'?'ArrowRight':'ArrowLeft');
 const edge=document.createRange();edge.selectNodeContents(span);
 if(before)edge.setEnd(selection.anchorNode,selection.anchorOffset);
 else edge.setStart(selection.anchorNode,selection.anchorOffset);
 if(edge.toString().length)return;
 event.preventDefault();
 if(event.repeat)return;
 if(pending.size||span.textContent!==original.get(field.id)){
  error=arabic?'احفظ أو تجاهل تعديلات السجل قبل تحرير الارتباط.':'Save or discard record changes before editing the binding.';update();return;
 }
 const index=field.path.at(-2)==='inlineValues'?Number(field.path.at(-1)):undefined;
 const opening=arabic?'جارٍ فتح نص التخطيط…':'Opening layout text…';
 stop();error=opening;update();
 void Promise.resolve(layoutActive.editBinding?.(field.blockId,{before,index,variable:'record.'+field.fieldKey})).finally(()=>{
  if(error===opening){error='';update();}
 });
}
function directLabel(field){
 return hasLayout&&!field.recordKey&&!field.blockId.startsWith('managed-menu-')&&(!field.versionId||field.versionId==='default')&&
  field.path.length===2&&field.path[0]==='props'&&['text','content','label','value'].includes(field.path[1]);
}
function placeLabelCaret(span,event){
 if(event.detail!==1||event.type!=='click'||event.shiftKey)return;
 const position=document.caretPositionFromPoint?.(event.clientX,event.clientY);
 const range=position?document.createRange():document.caretRangeFromPoint?.(event.clientX,event.clientY);
 if(position){range.setStart(position.offsetNode,position.offset);range.collapse(true);}
 if(range&&span.contains(range.startContainer)){
  const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range);
 }
}
function openLabelPicker(event,span,field){
 if(!active?.direct||active.span!==span||event.isComposing||!event.cancelable)return;
 event.preventDefault();event.stopPropagation();
 if(pending.size){error=arabic?'احفظ تعديلات النص المعلّقة أولاً.':'Save or discard pending copy changes first.';update();return;}
 const selection=document.getSelection(),text=span.textContent;
 const offset=(node,index)=>{
  if(!span.contains(node))return text.length;
  const range=document.createRange();range.selectNodeContents(span);range.setEnd(node,index);return range.toString().length;
 };
 const range=selection?.rangeCount?selection.getRangeAt(0):null;
 const caret={picker:true,text,original:original.get(field.id),start:offset(range?.startContainer,range?.startOffset),end:offset(range?.endContainer,range?.endOffset)};
 const current=active;
 stop();error='';update();
 void Promise.resolve(layoutActive.editBinding?.(field.blockId,caret)).then(opened=>{
  if(opened||!expanded||active||!span.isConnected)return;
  active=current;span.setAttribute('contenteditable','plaintext-only');span.setAttribute('role','textbox');span.focus();
  error=arabic?'تعذر إضافة ارتباط إلى هذا النص.':'This text could not accept a binding here.';update();
 });
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
 busy=true;error='';save.textContent=words.saving;update();
 try{
  const saved=await fetch('/api/frontend-edit/save/',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Frontbase-Editor':'1'},body:JSON.stringify({path:pagePath,token:inventory.token,selection:recordSelection.length?recordSelection:undefined,operationId:crypto.randomUUID(),entries:[...pending].map(([id,text])=>({id,text}))})});
  if(!saved.ok){
   const {code}=await saved.json().catch(()=>({}));
   error=code==='editor_atomic_conflict'||code==='copy_conflict'?words.conflict:code==='editor_atomic_destination_required'?words.destination:words.failed;
   return;
  }
  pending.clear();stop();location.reload();
 }catch{error=words.failed;}finally{busy=false;save.textContent=words.save;update();}
});save.dataset.save='';
const cancel=button(actions,words.cancel,()=>{stop();const values=[...pending.keys()].map(id=>({id,text:original.get(id)}));undoStack.length=0;applyValues(values,false);for(const [id]of bound)all(id,original.get(id));});
if(hasLayout){
 bindingEntry=button(chip,arabic?'تحديد الارتباط لنقله':'Select binding to move',()=>openFieldBinding(true));
 bindingEntry.dataset.fbBindingEntry='';bindingEntry.setAttribute('aria-label',bindingEntry.textContent);bindingEntry.title=bindingEntry.textContent;bindingEntry.textContent='⠿';
 chip.prepend(bindingEntry);
 const nativeFocusGroup='focusGroup' in HTMLElement.prototype;
 fieldMenu.setAttribute('focusgroup','menu nomemory');
 fieldMenu.setAttribute('aria-labelledby',context.id);
 if(!nativeFocusGroup)fieldMenu.setAttribute('role','menu');
 const localSave=button(fieldMenu,words.save,()=>{closeFieldMenu(false);save.click();});
 const localDiscard=button(fieldMenu,words.cancelEdit,()=>{closeFieldMenu(false);cancelCurrent();});
 const editBinding=button(fieldMenu,arabic?'تحرير الارتباط':'Edit binding',()=>openFieldBinding(false));
 const builderLink=document.createElement('a');builderLink.textContent=words.builder;builderLink.target='_blank';builderLink.rel='noopener';fieldMenu.append(builderLink);
 if(!nativeFocusGroup)for(const item of fieldMenu.querySelectorAll('button,a'))item.setAttribute('role','menuitem');
 context.onclick=()=>{
  const id=active&&selectedField?.blockId;if(!id)return;
  if(context.getAttribute('aria-expanded')==='true'){closeFieldMenu(true);return;}
  const record=active&&selectedField?.destination;
  localSave.textContent=record==='record-translation'?(arabic?'حفظ الترجمة العربية':'Save Arabic translation'):(arabic?'حفظ السجل':'Save record');
  const sameRecord=id=>inventory.fields.some(field=>field.id===id&&field.recordKey===selectedField.recordKey&&field.recordScope===selectedField.recordScope&&field.destination===record);
  localSave.hidden=save.hidden||!(record==='record'||record==='record-translation')||[...pending.keys()].some(id=>!sameRecord(id));
  localDiscard.hidden=!draftValues().some(({id,text})=>text!==(pending.get(id)??original.get(id)));
  editBinding.hidden=active.fields?.length>1;
  builderLink.href='/frontbase-admin/builder/'+encodeURIComponent(inventory.pageId)+'?'+new URLSearchParams({element:id,previewPath:location.pathname});
  document.dispatchEvent(new CustomEvent('frontbase:context-open',{detail:fieldMenu}));
  context.setAttribute('aria-expanded','true');
  if(nativePopover){try{fieldMenu.showPopover({source:context});}catch{fieldMenu.showPopover();}}else fieldMenu.hidden=false;
  positionFieldMenu();fieldMenu.querySelector(':is(button,a):not([hidden])')?.focus();
 };
 fieldMenu.addEventListener('toggle',event=>{if(event.newState==='closed')context.setAttribute('aria-expanded','false');});
 fieldMenu.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeFieldMenu(true);return;}
  if(nativeFocusGroup||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const items=[...fieldMenu.querySelectorAll(':is(button,a):not([hidden])')];
  if(!items.length)return;
  event.preventDefault();const current=items.indexOf(document.activeElement);
  const next=event.key==='Home'?0:event.key==='End'?items.length-1:(current+items.length+(event.key==='ArrowDown'?1:-1))%items.length;
  items[next].focus();
 });
 fieldMenu.addEventListener('focusout',event=>{
  if(event.relatedTarget&&!fieldMenu.contains(event.relatedTarget)&&event.relatedTarget!==context)closeFieldMenu(false);
 });
 document.addEventListener('pointerdown',event=>{if(!fieldMenu.contains(event.target)&&!chip.contains(event.target))closeFieldMenu(false);});
}
document.addEventListener('frontbase:context-open',event=>{
 if(event.detail!==fieldMenu)closeFieldMenu(false);
 if(event.detail!==more)more.open=false;
});
more.addEventListener('toggle',()=>{if(more.open)document.dispatchEvent(new CustomEvent('frontbase:context-open',{detail:more}));});
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
const edit=event=>{if(!expanded||busy)return;event.preventDefault();event.stopImmediatePropagation();if(!stage())return;selectedField=fields[0];selectedRecord=element;const form=document.createElement('div');form.className='fb-edit-section';form.setAttribute('aria-describedby',context.id);const inputs=fields.map(field=>{const label=document.createElement('label');label.style.cssText='display:flex;flex-direction:column;gap:4px';label.textContent=field.fieldKey;const input=document.createElement('input');input.type='text';input.value=pending.get(field.id)??original.get(field.id);input.addEventListener('input',update);input.setAttribute('aria-label',field.fieldKey);input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelCurrent();}else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();stage();}});label.append(input);form.append(label);return input;});bar.prepend(form);active={fields,inputs,form,element};inputs[0].focus();update();};
const first=!recordAttributes.has(element);if(first)recordAttributes.set(element,['data-fb-copy','tabindex','role','aria-label'].map(key=>[key,element.getAttribute(key)]));recordActions.set(element,{edit,fields});recordNodes.add(element);markRecord(element,fields);if(first)element.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')recordActions.get(element)?.edit(event);});
}}
function bind(){bindRecords();for(const field of inventory.fields){if(field.blockId.startsWith('$')||['alt','ariaLabel','placeholder'].includes(field.path.at(-1)))continue;const root=document.getElementById(field.blockId);if(!root)continue;
if(field.versionId){const parent=root.closest('[data-block-versions]');if(parent&&parent.dataset.blockActive!==field.versionId)continue;}
const slot=field.path.at(-2)==='inlineValues'?field.path.at(-1):field.path.at(-3)==='inlineTemplate'?field.path.at(-2):null;
const target=slot!==null&&/^\d{1,2}$/.test(slot)?root.querySelector('[data-fb-label-part="'+slot+'"]'):null;
if(slot!==null&&!target)continue;
const emphasis=root.querySelector(':scope > [data-fb-inline-emphasis], :scope > [data-fb-inline-copy] > [data-fb-inline-emphasis]');
const walker=document.createTreeWalker(target||root,NodeFilter.SHOW_TEXT);let node;const matches=[];
if(emphasis&&emphasis.textContent.trim()===field.text.trim()&&!emphasis.closest('[data-fb-copy]'))matches.push(emphasis);
else while(node=walker.nextNode()){if(node.parentElement.closest('script,style,template,[data-fb-copy],[data-frontbase-editor],[data-fb-inline-emphasis],[data-fb-inline-variable],[contenteditable],textarea,select'))continue;if(node.textContent.trim()===field.text.trim())matches.push(node);}
// Responsive menu copies may share one field, but independent equal labels stay ambiguous.
if(matches.length!==1){const identities=new Set(inventory.fields.filter(other=>other.blockId===field.blockId&&other.text.trim()===field.text.trim()).map(other=>other.id));const hrefs=matches.map(node=>node.parentElement.closest('a')?.getAttribute('href'));if(!field.blockId.startsWith('managed-menu-')||!matches.length||identities.size!==1||hrefs.some(href=>!href||href!==hrefs[0]))continue;}
for(const match of matches){const span=document.createElement('span');bindableSpan(span,field.id,true);if(field.sourceValue!==undefined)displayed.set(span,match.textContent);match.replaceWith(span);
if(match.nodeType===Node.ELEMENT_NODE){span.append(match);emphasizedCopy.set(span,match.cloneNode(true));}else span.textContent=match.textContent;
const spans=bound.get(field.id)||[];spans.push(span);bound.set(field.id,spans);
const edit=event=>{if(!expanded||busy)return;event.preventDefault();event.stopImmediatePropagation();if(active?.span===span){span.focus();if(active.direct)placeLabelCaret(span,event);return;}if(!stage())return;selectedField=field;selectedRecord=null;active={id:field.id,span,element:span,direct:directLabel(field)};if(field.sourceValue!==undefined)span.textContent=pending.get(field.id)??field.sourceValue;if(!active.direct)span.setAttribute('aria-describedby',context.id);span.setAttribute('contenteditable','plaintext-only');span.setAttribute('role','textbox');span.focus();if(active.direct)placeLabelCaret(span,event);update();};
editActions.set(span,edit);span.addEventListener('click',edit);span.addEventListener('keydown',event=>{if(active?.span===span){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancelCurrent();}else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();stage();}else if(event.key==='@'&&active.direct){openLabelPicker(event,span,field);}else leaveRecordAtEdge(event,span,field);}else if(event.key==='Enter'||event.key===' '){edit(event);}});
span.addEventListener('beforeinput',event=>{if(event.inputType==='insertText'&&event.data==='@')openLabelPicker(event,span,field);});
span.addEventListener('input',update);
span.addEventListener('paste',event=>{if(active?.span!==span)return;event.preventDefault();const value=event.clipboardData.getData('text/plain');document.execCommand('insertText',false,value);});
}}}
${FRONTEND_LAYOUT_EDITOR}
function recordTile(){return hasLayout&&active&&selectedField?.blockId&&!selectedField.blockId.startsWith('managed-menu-')?selectedField.blockId:null;}
function openFieldBinding(select){
 const field=selectedField,id=recordTile();if(!id)return;
 closeFieldMenu(false);
 if(pending.size||draftValues().some(({id,text})=>text!==original.get(id))){
  error=arabic?'احفظ أو تجاهل تعديلات السجل قبل تحرير الارتباط.':'Save or discard record changes before editing the binding.';update();return;
 }
 cancelCurrent();
 const index=field.path.at(-2)==='inlineValues'?Number(field.path.at(-1)):0;
 void layoutActive.editBinding?.(id,select?{index,select,before:true,variable:'record.'+field.fieldKey}:undefined);
}
const layoutActive=installLayoutEditor({dock:controls,container:tools,boxChip,onSelection:next=>{
 if(next?.tile.id!==layoutSelection?.tile.id)closeFieldMenu(false);
 layoutSelection=next;controls.toggleAttribute('data-fb-typing-label',!!active?.direct||!!next?.compact);
 moreRow.hidden=!!active?.direct||!!next?.compact;updateContext();
},recordTile,editInlineValue:(tileId,index,variable,exit)=>{
 const field=inventory.fields.find(item=>item.blockId===tileId&&item.recordKey&&'record.'+item.fieldKey===variable&&
  (item.path.at(-2)!=='inlineValues'||Number(item.path.at(-1))===index));
 const span=field&&bound.get(field.id)?.find(node=>node.closest('[id]')?.id===tileId);
 const edit=span&&editActions.get(span);if(!edit)return false;
 exit();edit(new MouseEvent('click'));return true;
},
beforeMove:()=>{
 if(!active||busy)return false;
 if(pending.size||draftValues().some(({id,text})=>text!==original.get(id))){
  error=arabic?'احفظ أو تجاهل تعديلات السجل قبل نقل العنصر.':'Save or discard record changes before moving this element.';update();return false;
 }
 closeFieldMenu(false);cancelCurrent();return true;
}});
// Stop navigation and configured click workflows before their document/element handlers.
window.addEventListener('click',event=>{if(!expanded||layoutActive())return;const span=event.target.closest?.('[data-fb-copy]');if(span&&(editActions.has(span)||recordActions.has(span))){if(busy){event.preventDefault();event.stopImmediatePropagation();return;}if(recordActions.has(span))recordActions.get(span).edit(event);else editActions.get(span)(event);}},{capture:true});
const observer=new MutationObserver(records=>{
 if(!expanded||typeof document==='undefined'||!document?.body||records.every(record=>controls.contains(record.target)||chip.contains(record.target)||boxChip.contains(record.target)||fieldMenu.contains(record.target)||record.target.closest?.('[data-fb-inline-composer],[data-fb-element-menu],[data-fb-composer-context]')))return;
 bind();update();void refreshRecords();
});
window.addEventListener('scroll',positionContext,{capture:true,passive:true});
window.addEventListener('resize',positionContext,{passive:true});
if(typeof ResizeObserver==='function')new ResizeObserver(positionContext).observe(controls);
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
