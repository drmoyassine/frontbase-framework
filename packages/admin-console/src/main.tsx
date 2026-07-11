import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import './index.css';

// HashRouter (not BrowserRouter): the SPA is mounted at a worker sub-path
// (/console), so hash routing sidesteps basename + server SPA-fallback concerns
// entirely — the worker only ever serves /console, and #/dashboard etc. are
// client-only. Routes in the app are written as /dashboard, /pages, …
const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <HashRouter>
                <App />
            </HashRouter>
        </StrictMode>,
    );
}
