import {expect,it} from 'vitest';
import {emptyDirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';
import {linkSharedConfiguration} from './linkSharedConfiguration';
it('links configuration without changing existing header text or links',()=>{
 const configuration=emptyDirectoryConfiguration();configuration.site.destination='Legacy';
 const page:any={layoutData:{root:{directoryConfiguration:configuration,custom:'keep'},content:[{id:'header',type:'Text',props:{text:'Legacy',siteBindings:{text:'site.destination'}}}]}};
 const result=linkSharedConfiguration(page,configuration,{version:1,role:'directory'});
 expect(result.content).toEqual(page.layoutData.content);expect(result.root.custom).toBe('keep');expect(result.root.directoryConfiguration).toBeUndefined();
});
