// Single Source of Truth for Port Configuration
// This file ensures all components use the same port numbers
//
// IMPORTANT: In production, all API calls MUST use relative URLs (empty string)
// to avoid mixed content (http:// on an https:// page). The reverse proxy
// handles routing to the correct backend service.

const isProd = import.meta.env.PROD;

export const PORT_CONFIG = {
  express: {
    port: 3001,
    baseUrl: isProd ? '' : `http://localhost:3001`,
    description: "Express.js backend for Frontbase"
  },
  fastapi: {
    port: 8000,
    baseUrl: isProd ? '' : '',  // Always relative — Vite proxy in dev, reverse proxy in prod
    description: "FastAPI backend for DB-Synchronizer"
  },
  frontend: {
    port: 5173,
    baseUrl: isProd ? window.location.origin : `http://localhost:5173`,
    description: "Vite development server for Frontbase frontend"
  }
};

// Helper functions for consistent port usage
export const getExpressBaseUrl = () => PORT_CONFIG.express.baseUrl;
export const getFastApiBaseUrl = () => PORT_CONFIG.fastapi.baseUrl;
export const getFrontendBaseUrl = () => PORT_CONFIG.frontend.baseUrl;

// For debugging - log current configuration (only when explicitly enabled)
export const logPortConfig = () => {
  if (localStorage.getItem('enablePortDebug') === 'true') {
    console.log("[PortConfig] Port Configuration (Single Source of Truth):");
    console.log(`   Express.js Backend: ${PORT_CONFIG.express.port}`);
    console.log(`   FastAPI Backend: ${PORT_CONFIG.fastapi.port}`);
    console.log(`   Frontend Dev Server: ${PORT_CONFIG.frontend.port}`);
  }
};

// Export default for convenience
export default PORT_CONFIG;