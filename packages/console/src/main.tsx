import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./lib/api-client"; // configure the generated API client before any SDK call
import { initAnalytics } from "./lib/analytics";

// Initialize analytics + error reporting (cloud mode only, no-op in self-host).
// Must run before render so the Sentry/PostHog SDKs are ready to catch startup errors.
initAnalytics();

// Frontbase Cloud uses the worker's frontbase_session contract by default.
// SuperTokensAuth initializes the SDK itself only when explicitly selected.

createRoot(document.getElementById("root")!).render(<App />);
