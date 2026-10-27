import { tenantsListInvites, tenantsCreateInvite, tenantsRevokeInvite } from '@/client';

export interface TenantInvite {
    id: string;
    email: string;
    role: string;
    status: string;
    created_at: string;
    expires_at: string;
}

export const tenantTeamApi = {
    listInvites: async (): Promise<{ invites: TenantInvite[] }> => {
        const { data } = await tenantsListInvites({ throwOnError: true });
        return data as unknown as { invites: TenantInvite[] };
    },
    createInvite: async (
        email: string,
        role: 'admin' | 'editor' | 'viewer',
        projectIds?: string[],
    ): Promise<{ success: boolean; invite: TenantInvite; link: string }> => {
        const { data } = await tenantsCreateInvite({
            body: { email, role, project_ids: projectIds ?? null },
            throwOnError: true,
        });
        return data as unknown as { success: boolean; invite: TenantInvite; link: string };
    },
    revokeInvite: async (inviteId: string): Promise<{ success: boolean }> => {
        const { data } = await tenantsRevokeInvite({
            path: { invite_id: inviteId },
            throwOnError: true,
        });
        return data as unknown as { success: boolean };
    },
};
