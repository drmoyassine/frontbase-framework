import { api } from './client'

// Note: Sync configs, conflicts, and jobs have been deprecated in favor of Workflow Automation
// This file保留保留 minimal operations endpoint compatibility if needed

export const syncApi = {
    // Legacy operations endpoint - may be used by existing workflows
    getStatus: (jobId: string) => api.get(`/operations/${jobId}/status`),
}
