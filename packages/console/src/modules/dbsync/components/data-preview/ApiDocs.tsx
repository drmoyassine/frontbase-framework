import React from 'react';
import { ExternalLink, AlertTriangle, Code2 } from 'lucide-react';

interface ApiDocsProps {
    currentViewId?: string;
}

export const ApiDocs = ({ currentViewId }: ApiDocsProps) => {
    // Always use same-origin — reverse proxy handles routing to backend
    const API_URL = window.location.origin;
    // Construct the docs URL pointing to the sync service swagger
    // Sync service is mounted at /api/sync, so docs are at /api/sync/docs/views
    const DOCS_URL = API_URL.endsWith('/api')
        ? API_URL + '/sync/docs/views'
        : API_URL + '/api/sync/docs/views';
    const SWAGGER_ANCHOR = currentViewId
        ? `#/Views/create_view_record_api_views__view_id__records_post`
        : `#/Views`;

    const fullDocsUrl = `${DOCS_URL}${currentViewId ? `?id=${currentViewId}` : ''}${SWAGGER_ANCHOR}`;
    const recordsEndpoint = `/api/views/${currentViewId || '{view_id}'}/records`;

    // Check if we're on a public site trying to access local resources
    const isPublicToLocal = !window.location.origin.includes('localhost') &&
        (API_URL.includes('localhost') || API_URL.includes('127.0.0.1'));

    if (isPublicToLocal) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
                <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-2">
                    API Documentation Unavailable
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6">
                    The API documentation cannot be embedded because it would require connecting to a local server from this public page.
                </p>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 w-full max-w-lg">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Endpoint</div>
                    <code className="text-sm text-primary-600 font-mono break-all">{recordsEndpoint}</code>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="p-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Code2 size={14} className="text-gray-400" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">REST API Documentation</span>
                </div>
                <div className="flex items-center gap-3">
                    <code className="text-[10px] text-primary-600 font-mono italic">{recordsEndpoint}</code>
                    <a
                        href={fullDocsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-primary-600 transition-colors"
                    >
                        <ExternalLink size={10} />
                        Open in new tab
                    </a>
                </div>
            </div>
            <iframe
                src={fullDocsUrl}
                className="flex-1 w-full border-none"
                title="API Documentation"
            />
        </div>
    );
};
