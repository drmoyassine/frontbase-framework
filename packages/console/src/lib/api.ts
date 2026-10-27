// API service layer for backend communication
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Project API
export const projectAPI = {
  // Get project settings
  getProject: async (): Promise<APIResponse> => {
    try {
      const response = await fetch('/api/project/', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch project');
      const data = await response.json();
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Update project settings (including users config)
  updateProject: async (projectData: any): Promise<APIResponse> => {
    try {
      const response = await fetch('/api/project/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(projectData)
      });
      if (!response.ok) throw new Error('Failed to update project');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
};

export const pageAPI = {
  // Get all pages
  getAllPages: async (includeDeleted = false): Promise<APIResponse> => {
    try {
      const url = includeDeleted ? '/api/pages/?includeDeleted=true' : '/api/pages/';
      const response = await fetch(url, {
        credentials: 'include' // Include session cookies
      });
      if (!response.ok) throw new Error('Failed to fetch pages');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Get single page
  getPage: async (id: string): Promise<APIResponse> => {
    try {
      const response = await fetch(`/api/pages/${id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch page');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Create new page
  createPage: async (pageData: any): Promise<APIResponse> => {
    try {
      const response = await fetch('/api/pages/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(pageData)
      });
      if (!response.ok) throw new Error('Failed to create page');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Update page
  updatePage: async (id: string, pageData: any): Promise<APIResponse> => {
    try {
      const response = await fetch(`/api/pages/${id}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(pageData)
      });
      if (!response.ok) throw new Error('Failed to update page');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Update page layout data only
  updatePageLayout: async (id: string, layoutData: any): Promise<APIResponse> => {
    try {
      const response = await fetch(`/api/pages/${id}/layout/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ layoutData })
      });
      if (!response.ok) throw new Error('Failed to update page layout');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Delete page (soft delete)
  deletePage: async (id: string): Promise<APIResponse> => {
    try {
      const response = await fetch(`/api/pages/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to delete page');
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Restore deleted page
  restorePage: async (id: string): Promise<APIResponse> => {
    try {
      const response = await fetch(`/api/pages/${id}/restore`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to restore page');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Permanently delete page
  permanentDeletePage: async (id: string): Promise<APIResponse> => {
    try {
      const response = await fetch(`/api/pages/${id}/permanent/`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to permanently delete page');
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
};

export const variableAPI = {
  // Get all variables
  getAllVariables: async (): Promise<APIResponse> => {
    try {
      const response = await fetch('/api/variables/', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch variables');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Get single variable
  getVariable: async (id: string): Promise<APIResponse> => {
    try {
      const response = await fetch(`/api/variables/${id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch variable');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Create new variable
  createVariable: async (variableData: any): Promise<APIResponse> => {
    try {
      const response = await fetch('/api/variables/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(variableData)
      });
      if (!response.ok) throw new Error('Failed to create variable');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Update variable
  updateVariable: async (id: string, variableData: any): Promise<APIResponse> => {
    try {
      const response = await fetch(`/api/variables/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(variableData)
      });
      if (!response.ok) throw new Error('Failed to update variable');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Delete variable
  deleteVariable: async (id: string): Promise<APIResponse> => {
    try {
      const response = await fetch(`/api/variables/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to delete variable');
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
};

export const themeAPI = {
  // Get themes for a component type
  getThemes: async (componentType?: string): Promise<APIResponse> => {
    try {
      const url = componentType ? `/api/themes/?component_type=${componentType}` : '/api/themes/';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch themes');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },

  // Save a custom theme
  createTheme: async (themeData: { name: string; component_type: string; styles_data: any; is_system?: boolean }): Promise<APIResponse> => {
    try {
      const response = await fetch('/api/themes/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(themeData)
      });
      if (!response.ok) throw new Error('Failed to create theme');
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
};
