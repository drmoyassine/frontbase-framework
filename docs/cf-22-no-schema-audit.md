# CF-22 — `NO_SCHEMA 85` operation audit

Closed 2026-07-28. This ledger records the disposition of every operation that the
old component-`$ref`-only conformance probe classified as `NO_SCHEMA`.

| Resolution | Operations |
|---|---:|
| Named JSON response model | 52 |
| Legitimate inline JSON validated by generated operation schema | 16 |
| Text / streaming response | 4 |
| Explicit bodyless response | 11 |
| Existing named schema reached through operation validator | 2 |
| **Total** | **85** |

The generated operation-level validators are now the probe entry point. This
validates inline arrays/unions directly and avoids converting OpenAPI component
names into TypeScript export names (the source of the two privacy-schema misses).

## Named JSON (52)

| Operation | Contract / validation |
|---|---|
| `GET /api/actions/execution-stats` | `ActionsGetExecutionStatsResponse` |
| `GET /api/actions/execution/{execution_id}` | `ActionsGetExecutionResultResponse` |
| `GET /api/actions/executions` | `ActionsListAllExecutionsResponse` |
| `GET /api/actions/executions/detail/{execution_id}` | `ActionsGetExecutionDetailResponse` |
| `GET /api/actions/executions/{draft_id}/production/{engine_id}` | `ActionsGetProductionExecutionsResponse` |
| `POST /api/agent-skills` | `AgentIntegrationsCreateSkillResponse` |
| `PUT /api/agent-skills/{skill_id}` | `AgentIntegrationsUpdateSkillResponse` |
| `GET /api/agent/credits` | `AgentAgentCreditsResponse` |
| `POST /api/cloudflare/connect` | `CloudflareDeployConnectCloudflareResponse` |
| `POST /api/cloudflare/inspect/content` | `CloudflareInspectorInspectWorkerContentResponse` |
| `POST /api/edge-api-keys` | `EdgeApiKeysCreateApiKeyResponse` |
| `PUT /api/edge-api-keys/{key_id}` | `EdgeApiKeysUpdateApiKeyResponse` |
| `POST /api/edge-databases/create-schema` | `EdgeDatabasesCreateSchemaResponse` |
| `POST /api/edge-databases/discover-schemas` | `EdgeDatabasesDiscoverSchemasResponse` |
| `POST /api/edge-databases/reset-role-password` | `EdgeDatabasesResetRolePasswordResponse` |
| `GET /api/edge-engines/bundle-hashes/` | `EdgeEnginesGetBundleHashesResponse` |
| `POST /api/edge-engines/deploy` | `EdgeEnginesDeployEngineResponse` |
| `POST /api/edge-engines/{engine_id}/agent-profiles` | `EdgeAgentProfilesCreateProfileResponse` |
| `PUT /api/edge-engines/{engine_id}/agent-profiles/{profile_id}` | `EdgeAgentProfilesUpdateProfileResponse` |
| `GET /api/edge-engines/{engine_id}/health-check` | `EngineInspectorHealthCheckResponse` |
| `GET /api/edge-engines/{engine_id}/inspect/domains` | `EngineInspectorInspectEngineDomainsResponse` |
| `POST /api/edge-engines/{engine_id}/inspect/domains` | `EngineInspectorAddEngineDomainResponse` |
| `DELETE /api/edge-engines/{engine_id}/inspect/domains/{domain_id}` | `EngineInspectorDeleteEngineDomainResponse` |
| `POST /api/edge-engines/{engine_id}/inspect/domains/{domain_id}/verify` | `EngineInspectorVerifyEngineDomainResponse` |
| `GET /api/edge-engines/{engine_id}/inspect/secrets` | `EngineInspectorInspectEngineSecretsResponse` |
| `GET /api/edge-engines/{engine_id}/inspect/settings` | `EngineInspectorInspectEngineSettingsResponse` |
| `GET /api/edge-engines/{engine_id}/inspect/source` | `EngineInspectorInspectEngineSourceResponse` |
| `POST /api/edge-engines/{engine_id}/reconfigure` | `EdgeEnginesReconfigureEngineResponse` |
| `POST /api/edge-engines/{engine_id}/redeploy` | `EdgeEnginesRedeployEngineResponse` |
| `POST /api/edge-engines/{engine_id}/rollback-rotation` | `EdgeEnginesRollbackRotationResponse` |
| `POST /api/edge-engines/{engine_id}/rotate-secrets-key` | `EdgeEnginesRotateSecretsKeyResponse` |
| `GET /api/edge-engines/{engine_id}/rotation-status` | `EdgeEnginesRotationStatusResponse` |
| `POST /api/edge-engines/{engine_id}/sync-manifest` | `EdgeEnginesSyncManifestResponse` |
| `POST /api/edge-gpu/` | `EdgeGpuCreateGpuModelResponse` |
| `DELETE /api/edge-gpu/{model_id}` | `EdgeGpuDeleteGpuModelResponse` |
| `PUT /api/edge-gpu/{model_id}` | `EdgeGpuUpdateGpuModelResponse` |
| `POST /api/edge-gpu/{model_id}/test` | `EdgeGpuTestGpuModelResponse` |
| `GET /api/edge-providers/accounts/{account_id}/tables` | `EdgeProvidersListAccountTablesResponse` |
| `POST /api/edge-providers/create-resource-by-account/{account_id}` | `EdgeProvidersCreateResourceByAccountResponse` |
| `POST /api/edge-providers/discover` | `EdgeProvidersDiscoverResourcesEndpointResponse` |
| `POST /api/edge-providers/discover-by-account/{account_id}` | `EdgeProvidersDiscoverByAccountResponse` |
| `POST /api/edge-providers/retest/{provider_id}` | `EdgeProvidersRetestProviderResponse` |
| `POST /api/edge-providers/test-connection` | `EdgeProvidersTestConnectionResponse` |
| `POST /api/edge-providers/workspace-agent-token` | `EdgeProvidersSetWorkspaceAgentTokenResponse` |
| `GET /api/edge-providers/{provider_id}/credentials` | `EdgeProvidersGetCredentialsResponse` |
| `POST /api/edge-vectors/test-connection` | `EdgeVectorsTestConnectionInlineResponse` |
| `POST /api/edge-vectors/{vector_id}/test` | `EdgeVectorsTestEdgeVectorConnectionResponse` |
| `POST /api/mcp-servers` | `AgentIntegrationsCreateMcpServerResponse` |
| `GET /api/mcp-servers/{server_id}` | `AgentIntegrationsGetMcpServerResponse` |
| `PUT /api/mcp-servers/{server_id}` | `AgentIntegrationsUpdateMcpServerResponse` |
| `POST /api/project/assets/upload/` | `ProjectUploadBrandingAssetResponse` |
| `GET /api/storage/buckets` | `StorageListBucketsResponse` |

## Inline JSON (16)

| Operation | Contract / validation |
|---|---|
| `GET /api/actions/executions/{draft_id}` | union |
| `GET /api/auth/security/audit-logs` | array of `AuditLogEntry` |
| `GET /api/auth/security/blocklist` | array of `BlocklistEntry` |
| `GET /api/edge-caches/` | array of `EdgeCacheResponse` |
| `GET /api/edge-databases/` | array of `EdgeDatabaseResponse` |
| `GET /api/edge-engines/` | array of `EdgeEngineResponse` |
| `GET /api/edge-engines/active/by-scope/{scope}` | inline array |
| `GET /api/edge-gpu/` | inline array |
| `GET /api/edge-providers/` | array of `EdgeProviderAccountResponse` |
| `GET /api/edge-queues/` | array of `EdgeQueueResponse` |
| `GET /api/edge-vectors/` | array of `EdgeVectorResponse` |
| `GET /api/storage/netlify-sites` | inline array |
| `GET /api/storage/providers/` | inline array |
| `GET /api/storage/vercel-projects` | inline array |
| `GET /api/themes/` | array of `ComponentThemeOut` |
| `GET /api/variables/` | array of `VariableResponse` |

## Text (4)

| Operation | Contract / validation |
|---|---|
| `GET /api/actions/executions/export` | `text/csv` |
| `POST /api/agent/chat` | `text/event-stream` |
| `POST /api/agent/chat/{profile_slug}` | `text/event-stream` |
| `POST /api/agent/mcp/{profile_slug}/tools/call` | `text/event-stream` |

## Bodyless (11)

| Operation | Contract / validation |
|---|---|
| `DELETE /api/actions/drafts/{draft_id}` | 204, zero-byte body |
| `DELETE /api/agent-profiles/{profile_id}/skills/{install_id}` | 204, zero-byte body |
| `DELETE /api/agent-skills/{skill_id}` | 204, zero-byte body |
| `OPTIONS /api/auth/login` | 200, zero-byte body |
| `OPTIONS /api/auth/signup` | 200, zero-byte body |
| `DELETE /api/edge-api-keys/{key_id}` | 204, zero-byte body |
| `DELETE /api/edge-engines/{engine_id}` | 204, zero-byte body |
| `DELETE /api/edge-engines/{engine_id}/agent-profiles/{profile_id}` | 204, zero-byte body |
| `DELETE /api/edge-providers/{provider_id}` | 204, zero-byte body |
| `DELETE /api/mcp-servers/{server_id}` | 204, zero-byte body |
| `DELETE /api/themes/{theme_id}` | 204, zero-byte body |

## Existing named schema via operation validator (2)

| Operation | Resolution |
|---|---|
| `GET /api/settings/privacy/` | Operation validator avoids the hyphenated `PrivacySettings-Output` component-export mismatch. |
| `PUT /api/settings/privacy/` | Operation validator avoids the hyphenated `PrivacySettings-Output` component-export mismatch. |
