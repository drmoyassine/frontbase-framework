/** Fixed diagnostics only: provider bodies, tokens and arbitrary error text must
 * never enter public build logs. Refusal is not permission to replay setup. */
const messages=new Map([
 ['native_build_api_token_required','Use a persistent Cloudflare API token for native setup. Select a build token with Account Settings Read and Workers Scripts Edit. Add resource permissions for the bindings selected at Apply. Wrangler login access tokens are not copied into the app.'],
 ['native_build_permission_required: Account Settings: Read','The build token needs Account Settings Read for this account. Select an authorized build token and retry the build.'],
 ['native_build_permission_required: Workers Scripts: Edit and Read','The build token needs Workers Scripts Edit and Read for this account. Select an authorized build token and retry the build.'],
 ['native_setup_database_rejected','Cloudflare refused the setup database. Check D1 Edit permission and the account database limit. Inspect the installation before retrying.'],
 ['Unsupported existing binding; use the managed deployment flow','This Worker has a binding type unsupported by native upgrades. Use the managed deployment flow; the existing Worker and its resources were not replaced.'],
 ['Invalid retained R2 identity','The existing R2 bucket binding has an invalid name or jurisdiction. Inspect that binding; no resource replacement was attempted.'],
 ['Invalid retained Queue identity','The existing Queue binding has an invalid name or delivery delay. Inspect that binding; no resource replacement was attempted.'],
 ['Existing Worker is not an unchanged native installer','This Worker has an existing or in-progress installation. Native deployment cannot replace it with an empty installer. Inspect its setup status; do not reset its claim to retry.'],
 ['native_receiver_upgrade_refused','The existing installation could not safely retain its OAuth receiver configuration. Inspect the installation; no provider grant or setup claim was replayed.'],
]);
export function nativeDeployErrorMessage(error){return messages.get(typeof error?.message==='string'?error.message:'')??'Native deployment refused. Inspect the build account, token permissions and existing Worker state. Setup may have partially completed; no automatic resource retry was attempted.';}
