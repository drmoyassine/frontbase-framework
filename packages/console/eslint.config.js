import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // CF-22 P0/W2: raw axios is phased out in favor of the generated,
    // contract-typed client (src/client + lib/api-client). New code must not
    // import axios directly — this is now a hard ERROR. The only sanctioned
    // direct-axios users are runtimes that need transport config the shared
    // generated client can't provide:
    //   - src/services/api-service.ts  — the legacy product-wide instance
    //   - src/lib/api-client.ts        — the generated client's own runtime
    //   - src/modules/dbsync/api/{client,settings}.ts — the DBSync module's
    //     own instances (a distinct /api/sync baseURL + a Supabase-JWT request
    //     interceptor for cloud mode); @/client is single-baseURL, so these
    //     stay until a multi-baseURL client exists.
    // Services whose endpoints ARE in the contract must use @/client. Two
    // remain on api-service because their endpoints are NOT in the generated
    // contract yet: usersApi (/api/users) and rlsApi.updateMetadata
    // (PUT /api/database/rls/metadata/{t}/{p}) — they import api-service, not
    // axios, so they don't trip this rule; they migrate once the contract grows.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/client/**",
      "src/services/api-service.ts",
      "src/lib/api-client.ts",
      "src/modules/dbsync/api/client.ts",
      "src/modules/dbsync/api/settings.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "axios",
              message:
                "Use the generated API client (@/client, configured in @/lib/api-client) instead of raw axios.",
            },
          ],
        },
      ],
    },
  },
);
