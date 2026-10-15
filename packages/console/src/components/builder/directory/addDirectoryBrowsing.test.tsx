import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { addDirectoryBrowsing } from './addDirectoryBrowsing';
import { DirectoryBindingProperties } from './DirectoryBindingProperties';

afterEach(cleanup);
it('inserts controls before queries, preserves owner nodes and avoids duplicates', () => {
    const page: any = { layoutData: { root: { custom: 'keep', siteConfiguration: { version: 1, role: 'directory' } }, content: [
        { id: 'owner', type: 'Heading', props: { text: 'My directory' } },
        { id: 'cards', type: 'Repeater', props: { directoryQuery: { version: 1, queryId: 'directory.institution.list', params: {} } } },
    ] } };
    const result = addDirectoryBrowsing(page);
    expect(result.root).toEqual(page.layoutData.root);
    expect(result.content[0]).toBe(page.layoutData.content[0]);
    expect(result.content[2]).toBe(page.layoutData.content[1]);
    expect(result.content[1].props.directoryBrowsing).toEqual({ version: 1, tabs: true, search: true, pagination: true });
    expect(result.content[1].props.directoryBrowsingState).toBeUndefined();
    expect(addDirectoryBrowsing({ ...page, layoutData: result })).toBe(result);
    expect(() => addDirectoryBrowsing({ ...page, layoutData: { ...page.layoutData, root: { siteConfiguration: { version: 1, role: 'institution' } } } })).toThrow('index page');
});
it('configures independent display options through existing component properties', () => {
    const node: any = { id: 'browse', type: 'Container', props: { directoryBrowsing: { version: 1, tabs: true, search: true, pagination: true } } };
    const update = vi.fn(); render(<DirectoryBindingProperties node={node} update={update} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Title search (q)' }));
    expect(update).toHaveBeenCalledWith('directoryBrowsing', { version: 1, tabs: true, search: false, pagination: true });
});

it('configures visitor controls, bounded page size and default ordering on the Repeater',()=>{
 const node:any={id:'cards',type:'Repeater',props:{directoryQuery:{version:1,queryId:'directory.institution.list',params:{}}}};
 const update=vi.fn();render(<DirectoryBindingProperties node={node} update={update}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:'Record count'}));expect(update).toHaveBeenCalledWith('directoryControls',{version:1,tabs:false,search:false,pagination:false,recordCount:true});
 fireEvent.change(screen.getByLabelText('Repeater order'),{target:{value:'title-desc'}});expect(update).toHaveBeenCalledWith('directoryQuery',{...node.props.directoryQuery,params:{sort:'title-desc'}});
 fireEvent.change(screen.getByLabelText('Repeater records per page'),{target:{value:'6'}});expect(update).toHaveBeenCalledWith('directoryQuery',{...node.props.directoryQuery,params:{limit:6}});
});
