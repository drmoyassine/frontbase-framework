import {it,expect} from 'vitest';
import {JSDOM} from 'jsdom';
import {renderSync,isSimpleInterpolation,resolvePath} from '../../../../edge-core/src/liquid-core/sync';
import {resolveProps} from '../../../../edge-core/src/ssr/resolve';
import {imageFallbackScript} from '../../../../edge-core/src/image-fallback';
import {renderStaticComponent} from '../../../../edge-core/src/ssr/components/static';
import {createRecordCard} from './recordCardTemplates';
import {templateRecordFields} from '../../../../edge-core/src/directory/live-list';
import {renderLayoutComponent} from '../../../../edge-core/src/ssr/layoutRenderer';
it('resolves legacy brackets, dot paths, flat and nested relationship fields equally',()=>{
 const context={record:{title:'Title','institutions.image':'/cover.jpg'}};
 for(const token of ['record.title','record["title"]'])expect(renderSync(`{{ ${token} }}`,context)).toBe('Title');
 for(const token of ['record.institutions.image','record["institutions.image"]'])expect(renderSync(`{{ ${token} }}`,context)).toBe('/cover.jpg');
 expect(resolvePath({record:{institutions:{image:'/nested.jpg'}}},'record.institutions.image')).toBe('/nested.jpg');
});
it('uses first nonempty value preserving false and zero and quoted delimiters',async()=>{
 for(const empty of [null,undefined,'','   ']){
  const props={src:'{{ record.program_image || record.institutions.image }}'};
  const context={record:{program_image:empty,'institutions.image':'/institution.jpg'}};
  expect(renderSync(props.src,context)).toBe('/institution.jpg');
  expect((await resolveProps(props,context as any)).src).toBe('/institution.jpg');
 }
 expect(renderSync('{{ record.zero || 42 }}',{record:{zero:0}})).toBe('0');
 expect(renderSync('{{ record.no || true }}',{record:{no:false}})).toBe('false');
 expect(renderSync('{{ record.missing || "a || b" }}',{})).toBe('a || b');
 expect(isSimpleInterpolation('{{ record.title | upcase }}')).toBe(false);
});
it('refuses executable, inherited and prototype paths and excessive chains',()=>{
 for(const expression of ['record.constructor','record["__proto__"]','record.title()','record.x + 2','record.x || alert(1)',Array(10).fill('record.x').join(' || ')])expect(isSimpleInterpolation(`{{ ${expression} }}`)).toBe(false);
 expect(resolvePath({record:Object.create({secret:'no'})},'record.secret')).toBeUndefined();
 expect(renderSync('{{ record.empty || record.title }}',{record:{title:'{{ user.secret }}'},user:{secret:'never-expand'}})).toBe('{{ user.secret }}');
});
it('retries once, hides exhausted images and handles inserted records without inline event handlers',()=>{
 const html=renderStaticComponent('Image','cover',{src:'/broken.jpg',fallbackSrc:'/fallback.jpg',fallbackOnError:true,hideWhenUnavailable:true},'');
 expect(html).not.toContain('onerror');
 const dom=new JSDOM(html,{url:'https://site.test',runScripts:'outside-only'}),win=dom.window;
 win.eval(imageFallbackScript());win.eval(imageFallbackScript());
 const img=win.document.querySelector('img')!;
 img.dispatchEvent(new win.Event('error'));expect(img.getAttribute('src')).toBe('/fallback.jpg');expect(img.hidden).toBe(false);
 img.dispatchEvent(new win.Event('error'));expect(img.hidden).toBe(true);
 win.document.body.innerHTML=html;win.document.querySelector('img')!.dispatchEvent(new win.Event('error'));
 expect(win.document.querySelector('img')!.getAttribute('src')).toBe('/fallback.jpg');dom.window.close();
});
it('keeps both cover dependencies and uses ordinary editable fields',()=>{
 const card=createRecordCard('image',{title:'title',image:'program_image',imageFallback:'institutions.institution_image'});
 expect(templateRecordFields([card] as any)).toEqual(expect.arrayContaining(['program_image','institutions.institution_image']));
 const cover=card.children![0];expect(cover.type).toBe('Image');expect(cover.visibilityCondition).toBeUndefined();expect(cover.props.fallbackOnError).toBe(true);
 expect(renderStaticComponent('Image','cover',{src:'',fallbackSrc:'/fallback.jpg'},'')).toContain('src="/fallback.jpg"');
 expect(renderStaticComponent('Image','cover',{hideWhenUnavailable:true},'')).toBe('');
});
it('retains an expression fallback for a nonempty image that later fails to load',async()=>{
 const props=await resolveProps({src:'{{ record.image || record.institutions.image }}',fallbackOnError:true},{record:{image:'/broken.jpg','institutions.image':'/working.jpg'}} as any);
 const html=renderStaticComponent('Image','cover',props,'');expect(html).toContain('src="/broken.jpg"');expect(html).toContain('data-fb-image-fallback="/working.jpg"');
});
it('formats related flat fields with existing Liquid filters without changing the record',async()=>{
 const record={'institutions.name':'Example University'};
 const props=await resolveProps({text:'{{ record.institutions.name | upcase }}'},{record} as any);
 expect(props.text).toBe('EXAMPLE UNIVERSITY');expect(record).toEqual({'institutions.name':'Example University'});
});
it('preserves card spacing when Row/Column props and custom styles are combined',()=>{
 for(const type of ['Row','Column']){
 const html=renderLayoutComponent(type,'layout',{gap:'12px'},{minWidth:'0',padding:'20px'},'');
 const dom=new JSDOM(html);expect((dom.window.document.querySelector('#layout') as HTMLElement).style.gap).toBe('12px');dom.window.close();
 }
});
