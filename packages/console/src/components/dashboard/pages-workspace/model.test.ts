import {describe,it,expect} from 'vitest';
import {emptyOrganization,isOrganization,moveEntries,moveFolder,removeFolder,folderTrail} from './model';
describe('page organization',()=>{
  const organization=()=>({...emptyOrganization(),folders:[{id:'a',name:'Information',parentId:null,order:0},{id:'b',name:'Policies',parentId:'a',order:0}],placements:[{entryId:'contact',folderId:null,order:0},{entryId:'privacy',folderId:'b',order:0}]});
  it('moves multiple entries with stable order without touching public paths',()=>{
    const original=organization(),next=moveEntries(original,['contact'],'b','privacy');
    expect(next.placements.filter(p=>p.folderId==='b').map(p=>p.entryId)).toEqual(['contact','privacy']);
    expect(original.placements[0].folderId).toBeNull(); expect(next).not.toHaveProperty('routes');
  });
  it('rejects parent cycles and preserves descendant identity when moving folders',()=>{
    expect(()=>moveFolder(organization(),'a','b')).toThrow();
    expect(moveFolder(organization(),'b',null).folders.find(f=>f.id==='b')?.parentId).toBeNull();
    expect(folderTrail(organization(),'b')).toBe('Information / Policies');
  });
  it('removing a folder reparents documents rather than deleting them',()=>{
    const next=removeFolder(organization(),'b');
    expect(next.placements.find(p=>p.entryId==='privacy')?.folderId).toBe('a');
    expect(next.placements).toHaveLength(2); expect(next.folders).toHaveLength(1);
  });
  it('rejects corrupt response graphs and revision values',()=>{
    expect(isOrganization(organization())).toBe(true);
    expect(isOrganization({...organization(),revision:-1})).toBe(false);
    expect(isOrganization({...organization(),folders:[{id:'a',name:'A',parentId:'b',order:0},{id:'b',name:'B',parentId:'a',order:0}]})).toBe(false);
    expect(isOrganization({...organization(),placements:[{entryId:'page',folderId:'foreign',order:0}]})).toBe(false);
  });
});
