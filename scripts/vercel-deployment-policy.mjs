import { randomBytes } from 'node:crypto';
import { deploymentEnvironment } from './deploy-environment.mjs';

/** Explicit deployment intent avoids accidental initialization or session rotation. */
export function prepareVercelEnvironment(input, { firstInstall = false, redeploy = false, rotateSession = false, setupLink = false, now = Date.now(), random = () => randomBytes(32).toString('base64url') } = {}) {
    if (firstInstall === redeploy) throw new Error('choose_first_install_or_redeploy');
    const env = deploymentEnvironment(input);
    const admin = env.ADMIN_EMAIL !== undefined || env.ADMIN_PASSWORD !== undefined;
    if ((env.ADMIN_EMAIL !== undefined) !== (env.ADMIN_PASSWORD !== undefined)) throw new Error('admin_pair_required');
    if (redeploy) {
        if (admin || env.SETUP_TOKEN || env.SETUP_EXPIRES_AT || env.ADMIN_ROLE) throw new Error('initialization_values_on_redeploy');
        if (env.SESSION_SECRET && !rotateSession) throw new Error('session_rotation_requires_explicit_flag');
        if(setupLink){env.SETUP_TOKEN=random();env.SETUP_EXPIRES_AT=new Date(now+30*60_000).toISOString();}
        return env; // Absent secrets stay absent: host values are preserved, never fetched.
    }
    env.SESSION_SECRET ??= random();
    if (admin) {
        if (env.SETUP_TOKEN || env.SETUP_EXPIRES_AT) throw new Error('admin_and_setup_are_exclusive');
    } else {
        env.SETUP_TOKEN ??= random();
        env.SETUP_EXPIRES_AT = new Date(now + 30 * 60_000).toISOString();
    }
    return env;
}

/** Compare live public metadata with the link before any environment mutation. */
export function assertVercelTarget({ scope, project, link, remote }) {
    if (!/^team_[a-zA-Z0-9]+$/.test(scope ?? '') || !project || !/^[a-z0-9][a-z0-9-]*$/.test(project)) throw new Error('explicit_team_id_and_project_required');
    if (!link || link.orgId !== scope || !link.projectId || !remote || remote.id !== link.projectId || remote.name !== project || (remote.accountId && remote.accountId !== scope)) throw new Error('vercel_target_mismatch');
    return { projectId: link.projectId, orgId: link.orgId };
}

/** Verify before the first write; stop on failure without deletion or value logging. */
export function updateVercelEnvironment(run, target, input, environment='production') {
    if(!['preview','production'].includes(environment))throw Error('invalid_vercel_environment');
    assertVercelTarget(target);
    const env = deploymentEnvironment(input);
    for (const [name, value] of Object.entries(env)) {
        const result = run(['env', 'add', name, '--environment', environment, '--project', target.project, '--force', '--sensitive', '--yes'], { stdin: value });
        if (result.code !== 0) throw new Error('vercel_environment_update_failed');
    }
    return Object.keys(env);
}

/** CLI agent-mode JSON and plain output must never append JSON punctuation to URLs. */
export function vercelDeploymentUrl(stdout) {
 const urls=String(stdout).split(/\r?\n/).map(line=>line.match(/https:\/\/[a-z0-9-]+\.vercel\.app(?=[\s"',}\]]|$)/i)?.[0]).filter(Boolean);
 if(!urls.length)throw Error('vercel_deployment_url_unknown');
 return new URL(urls.at(-1)).origin;
}

export function assertVercelIntegration(resource,{resourceRef,projectId,environment}) {
 if(resource?.id!==resourceRef||resource.product!=='Turso'||!Array.isArray(resource.projects)||!resource.projects.some(p=>p.id===projectId&&Array.isArray(p.environments)&&p.environments.includes(environment)))throw Error('selected_integration_environment_mismatch');
}
