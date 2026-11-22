import React from 'react';
import {directoryConfigurationDiagnostics,type DirectoryConfiguration} from '@frontbase/edge-core/directory/configuration';

/** Links point to existing owners; this panel never maintains a second settings copy. */
export function BindingReadiness({configuration,area,localData=false,identityRolesInUrls=['institution','program','article']}:{configuration:DirectoryConfiguration;area?:'data'|'site';localData?:boolean;identityRolesInUrls?:readonly string[]}) {
    const all=directoryConfigurationDiagnostics(configuration);
    // Show the next resolvable dependency, rather than flooding a new installation
    // with field errors before a datasource/table can even be selected.
    const issues=all.filter(issue=>!area||(area==='data'?issue.area==='data':issue.area!=='data')).filter(issue=>{
        if(issue.area!=='data'||issue.key==='datasourceId')return true;
        if(!configuration.datasourceId)return false;
        return !issue.collection||!!configuration.collections[issue.collection].table||issue.key.endsWith('.table');
    });
    if(!issues.length)return null;
    return <details className="rounded border p-3 text-sm"><summary className="cursor-pointer font-medium">Resolve before publication</summary>
        <ul className="mt-3 space-y-2">{issues.map(issue=>{
            const fragment='binding-'+issue.key.replace(/\./g,'-');
            const identity=identityRolesInUrls.includes(issue.collection??'')&&/\.fields\.(id|originalPath)$/.test(issue.key);
            const focusLocalField = issue.area === 'data' && localData && !identity;
            let href = '/frontbase-admin/pages';
            if (identity) href += '?recordSource='+issue.collection+'#'+fragment;
            else if (issue.area === 'general') href = '/frontbase-admin/settings?tab=general';
            else if (focusLocalField) href = '#'+fragment;

            return <li key={issue.key} className="break-words">
                <a href={href} className="underline" onClick={focusLocalField ? event => {
                    if (focusBindingSetting(fragment)) event.preventDefault();
                } : undefined}>{issue.message}</a>
                {issue.area === 'routes' && <span> In Pages, open Shared routes.</span>}
                {issue.area === 'data' && !identity && !localData && <span> In Pages, open Source field mappings.</span>}
            </li>;
        })}</ul>
        <p className="mt-3 text-xs text-muted-foreground">Existing publication filters and relationships remain enforced.</p>
    </details>;
}

export function focusBindingSetting(id:string):boolean {
    const target=document.getElementById(id);if(!target)return false;
    let parent:HTMLElement|null=target;
    while(parent){if(parent instanceof HTMLDetailsElement)parent.open=true;parent=parent.parentElement;}
    target.scrollIntoView?.({block:'center'});target.focus();return true;
}
