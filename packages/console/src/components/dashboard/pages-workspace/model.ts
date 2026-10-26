export interface WorkspaceEntry {
  id: string; name: string; kind: 'page' | 'layout' | 'index' | 'collection-view';
  pageId?: string; role?: string; path?: string; paths?: string[]; serves?: number;
  publicationStatus: 'published' | 'changes-pending' | 'draft' | 'unknown';
  developmentOnly: boolean; source: 'saved' | 'derived';
  contentAction?: { datasourceId: string; table: string; keyColumn?:string; recordKey?:{column:string;value:string}; recordId?: string; contentRole?: 'page'|'article' };
}
export interface Organization {
  schemaVersion: 1; revision: number;
  folders: {id: string; name: string; parentId: string | null; order: number}[];
  placements: {entryId: string; folderId: string | null; order: number}[];
}
export const emptyOrganization = (): Organization => ({schemaVersion: 1, revision: 0, folders: [], placements: []});
export const kindLabel = {page: 'Page', layout: 'Reusable Template', index: 'Page', 'collection-view': 'Page'};
export const statusLabel = {published: 'Published', 'changes-pending': 'Changes pending', draft: 'Draft', unknown: 'Status unavailable'};
export function isOrganization(value: unknown): value is Organization {
  const o=value as Organization|null;
  const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200;
  const order=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=100000;
  if(!o||o.schemaVersion!==1||!Number.isInteger(o.revision)||o.revision<0||o.revision>2147483647||!Array.isArray(o.folders)||!Array.isArray(o.placements)||o.folders.length>200||o.placements.length>5000)return false;
  if(!o.folders.every(f=>f&&id(f.id)&&typeof f.name==='string'&&f.name.trim().length>0&&f.name.length<=100&&(f.parentId===null||id(f.parentId))&&order(f.order)))return false;
  const folders=new Map(o.folders.map(f=>[f.id,f]));if(folders.size!==o.folders.length)return false;
  for(const f of o.folders){const seen=new Set([f.id]);let parent=f.parentId;while(parent!==null){if(seen.has(parent)||!folders.has(parent)||seen.size>20)return false;seen.add(parent);parent=folders.get(parent)!.parentId;}}
  const entries=new Set<string>();
  for(const p of o.placements){if(!p||!id(p.entryId)||entries.has(p.entryId)||(p.folderId!==null&&!folders.has(p.folderId))||!order(p.order))return false;entries.add(p.entryId);}
  return true;
}
export function folderDescendants(organization: Organization, id: string): Set<string> {
  const result = new Set([id]); let changed = true;
  while (changed) { changed = false; for (const f of organization.folders) if (f.parentId && result.has(f.parentId) && !result.has(f.id)) {result.add(f.id); changed = true;} }
  return result;
}
export function moveEntries(organization: Organization, ids: string[], folderId: string | null, beforeId?: string): Organization {
  const moving = new Set(ids), target = organization.placements.filter(p => p.folderId === folderId && !moving.has(p.entryId)).sort((a,b) => a.order-b.order);
  const index = beforeId ? target.findIndex(p => p.entryId === beforeId) : -1;
  target.splice(index < 0 ? target.length : index, 0, ...ids.map(entryId => ({entryId, folderId, order: 0})));
  return {...organization, placements: [...organization.placements.filter(p => p.folderId !== folderId && !moving.has(p.entryId)), ...target.map((p, order) => ({...p, order}))]};
}
export function moveFolder(organization: Organization, id: string, parentId: string | null): Organization {
  if (parentId && folderDescendants(organization, id).has(parentId)) throw Error('A folder cannot move inside itself');
  const order = Math.max(-1, ...organization.folders.filter(f => f.parentId === parentId).map(f => f.order)) + 1;
  return {...organization, folders: organization.folders.map(f => f.id === id ? {...f, parentId, order} : f)};
}
export function removeFolder(organization: Organization, id: string): Organization {
  const parentId = organization.folders.find(f => f.id === id)?.parentId ?? null;
  const moved = moveEntries(organization, organization.placements.filter(p => p.folderId === id).map(p => p.entryId), parentId);
  return {...moved, folders: moved.folders.filter(f => f.id !== id).map(f => f.parentId === id ? {...f, parentId} : f)};
}
export function folderTrail(organization: Organization, id: string): string {
  const names: string[] = [], seen = new Set<string>(); let current: string | null = id;
  while (current && !seen.has(current)) {seen.add(current); const f = organization.folders.find(f => f.id === current); if (!f) break; names.unshift(f.name); current = f.parentId;}
  return names.join(' / ');
}
