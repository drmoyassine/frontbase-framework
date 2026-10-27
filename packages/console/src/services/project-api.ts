import { projectGetProjectEndpoint, projectUpdateProjectEndpoint } from '@/client';
import { ProjectConfig as Project } from '@/types/builder';

// Project API
export const getProject = async (): Promise<Project> => {
  const { data } = await projectGetProjectEndpoint({ throwOnError: true });
  return data as unknown as Project;
};

export const updateProject = async (projectData: Partial<Project>): Promise<Project> => {
  const { data } = await projectUpdateProjectEndpoint({ body: projectData, throwOnError: true });
  return data as unknown as Project;
};
