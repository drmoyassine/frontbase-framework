import {expect,it} from 'vitest';
import {canShowTemplateInstaller} from './templateInstallerAccess';
it('recognizes the compatibility administrator role without exposing the installer to ordinary users',()=>{
 for(const role of ['master','master_admin','master_admin_root','owner','admin','tenant_admin']) expect(canShowTemplateInstaller(role)).toBe(true);
 for(const role of [undefined,'','user','viewer','editor']) expect(canShowTemplateInstaller(role)).toBe(false);
});
