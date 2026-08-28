/**
 * Permission resource catalogue for the Workspace Agent — UI mirror of the
 * backend `PERMISSION_RESOURCES` in app/services/agent_permissions.py.
 *
 * Grouped for rendering. Each resource lists the actions the master admin can
 * toggle. Deny-by-default: a tool runs only if its required (resource, action)
 * is granted.
 */

export interface PermissionResource {
    resource: string;       // e.g. "pages.all"
    actions: string[];      // e.g. ["read", "write", "delete"]
    label?: string;
}

export interface PermissionGroup {
    label: string;
    resources: PermissionResource[];
}

export const PERMISSION_CATALOG: PermissionGroup[] = [
    {
        label: 'Content',
        resources: [
            { resource: 'pages.all', actions: ['read', 'write', 'delete'] },
            { resource: 'styles.all', actions: ['read', 'write'] },
            { resource: 'seo.all', actions: ['read', 'write'] },
        ],
    },
    {
        label: 'Data',
        resources: [
            { resource: 'datasources.all', actions: ['read', 'write', 'delete'] },
        ],
    },
    {
        label: 'Automation',
        resources: [
            { resource: 'workflows.all', actions: ['read', 'trigger', 'write'] },
        ],
    },
    {
        label: 'Infrastructure',
        resources: [
            { resource: 'edges.all', actions: ['read', 'write'] },
            { resource: 'engine.all', actions: ['read'] },
            { resource: 'providers.all', actions: ['read', 'write'] },
        ],
    },
    {
        label: 'Integrations',
        resources: [
            { resource: 'mcp_servers.all', actions: ['read', 'write'] },
            { resource: 'skills.all', actions: ['read'] },
            { resource: 'api.all', actions: ['execute'], label: 'Internal API (all tags)' },
        ],
    },
];
