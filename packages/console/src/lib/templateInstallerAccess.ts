/** UI visibility only. The template API independently authorizes every operation.
 * auth-compat serializes master_admin as master for console consumers. */
export function canShowTemplateInstaller(role: string | undefined): boolean {
  return ['owner', 'admin', 'tenant_admin', 'master_admin', 'master_admin_root', 'master'].includes(role ?? '');
}
