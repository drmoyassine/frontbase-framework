import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Setup is intentionally router-free. The URL fragment carries the one-time
// claim without sending it to the Worker; setup-claim.ts consumes it before the
// first render. There are no dashboard/login routes in this artifact.
const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}
