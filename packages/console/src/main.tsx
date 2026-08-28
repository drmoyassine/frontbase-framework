import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./lib/api-client"; // configure the generated API client before any SDK call
import { initSuperTokens } from "./lib/supertokens";
import { initAnalytics } from "./lib/analytics";

// Initialize analytics + error reporting (cloud mode only, no-op in self-host).
// Must run before render so the Sentry/PostHog SDKs are ready to catch startup errors.
initAnalytics();

// Initialize SuperTokens session management unless Supabase is configured
if (import.meta.env.VITE_AUTH_PROVIDER !== 'supabase') {
  initSuperTokens();
}

createRoot(document.getElementById("root")!).render(<App />);
