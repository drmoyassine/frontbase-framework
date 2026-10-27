# Frontbase Framework — Edge Agentic Architecture Gap Analysis

This document provides a comprehensive audit of **`frontbase-framework`** evaluated against the architectural requirements of an enterprise production-level Edge Agentic Framework.

**Launch definition**: AppSumo public launch + open-source `frontbase-framework` repository. Pre-launch items are blockers for that milestone; post-launch items are iterative enhancements.

---

## 🏛️ Enterprise Edge Agentic Architecture Pillars

An enterprise production-grade edge agentic framework requires eight core pillars:

1. **⚡ Edge-Native Runtime Engine**: Ultra-lightweight, zero-cold-start (<100–300 KB), using Web-standard APIs (`Web Crypto`, `fetch`, `Streams`, `AsyncIterable`) without heavy Node.js or C++ native binaries.
2. **🔄 Durable Execution & Resiliency**: Event-sourced step execution, pause/resume state persistence (e.g., Human-in-the-Loop), iteration limits, token budgets, and workflow checkpointing.
3. **🧠 Multi-Tier Persistent Memory**: Hierarchical memory pipeline (*Interactions → Episodic Memories → Semantic Intelligence → Consolidated Knowledge*) with context compaction and vector retrieval.
4. **🔌 Protocol Standard & Tooling (MCP)**: Full Model Context Protocol client/server integration, dynamic tool registries, and egress URL allowlists.
5. **🔒 Enterprise Security & Multi-Tenancy**: AES-256-GCM Web Crypto secret vaults, tenant isolation, PII scrubbing, and prompt injection defenses.
6. **📊 Observability & OpenTelemetry Tracing**: OpenTelemetry spans for every agent step, real-time per-tenant token cost telemetry, and immutable audit logs.
7. **🛡️ Schema Enforcement & Output Reliability**: Zod/JSON-Schema output enforcement with automated error-feedback retry loops for malformed model outputs.
8. **💰 Rate Limiting & Cost Controls**: Per-tenant token budgets, request rate limits, and cost circuit breakers to prevent runaway spend.

---

## 📊 Capability Matrix: Existing vs. Pre-Launch vs. Post-Launch

| Capability Pillar | 🟢 Currently Exists | 🟠 Pre-Launch (Blocker) | 🔵 Post-Launch (Iterative) |
| :--- | :--- | :--- | :--- |
| **Edge Runtime & LLM Drivers** | `@frontbase/edge-infra` with AI SDK `v6`. ⚠️ `ai` and `@ai-sdk/*` undeclared. | Declare missing deps. Upgrade to AI SDK `v7`. | Multi-modal streaming utilities (Generative UI, Audio/Voice, Vision). |
| **Tool Protocol (MCP)** | `@modelcontextprotocol/sdk` referenced. ⚠️ 4 known defects. | Fix all 4 defects (Program A). | Resource & Prompt templates over MCP. Dynamic tool registry per tenant. |
| **Agent Execution Loop** | Single-step executors (`ai.chat`, `mcp.call`). | Port full multi-turn agent loop (6 subsystems). | — |
| **Durable Execution** | Upstash QStash for background jobs. | — | Workflow checkpointing, HITL pause/resume, event-sourced step replay. |
| **Memory System** | — | MCP bridge to MasterAgent (Program A). | `@mastermemory/*` native TS port (Program C). Vector DB abstraction layer. |
| **Contract & Schema Tools** | `@frontbase/compiler` with contract CLI, Zod extractor. | — | Automated typegen for agent outputs. Schema auto-repair retry loops. |
| **Security & Vault** | `AES-256-GCM` Web Crypto vault, Hono auth middleware. | — | PII scrubbing, prompt injection guardrails, egress URL allowlists. |
| **Observability & Ops** | Basic step results logging. | — | OpenTelemetry tracing spans. Token usage & cost tracking per tenant. |
| **Rate Limiting & Cost Controls** | — | Basic per-tenant request rate limiting. | Token budget caps and cost circuit breakers. |

---

## 🟢 1. Currently Implemented (Code Exists)

> [!NOTE]
> Items listed here have working code in the repository but **not all are production-ready**. Known defects are annotated with ⚠️.

* **Edge Infrastructure Package (`@frontbase/edge-infra`)**:
  * Server-only execution model preventing API keys or heavy SDKs from bundling into browser assets.
  * Vercel AI SDK `v6` (`ai: ^6.0.0`) wrapper for model providers (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`).
  * ⚠️ `ai` and `@ai-sdk/*` are **not declared** in any `package.json` — every `aiChatExecutor` call throws `MODULE_NOT_FOUND` at runtime.
  * MCP Client executor (`mcpCallExecutor`) referencing `@modelcontextprotocol/sdk`.
  * ⚠️ MCP executor has **4 known defects**: undeclared dependency, wrong transport (SSE instead of Streamable HTTP), no auth headers, and zero test coverage.
* **Cryptographic Vault**:
  * Web Crypto API `AES-256-GCM` secret vault for decrypting API keys and credentials in edge isolates.
* **Compiler & Contract Pipeline (`@frontbase/compiler`)**:
  * CLI tools (`contract pin`, `contract emit`, `contract diff`) with `x-surface: library | console` endpoint classification.
  * Zod schema extractor and type generator.
  * Deterministic diagnostic output (`AgentFormatter`).
* **Durable Storage & Queues**:
  * Support for libSQL / SQLite, Supabase PostgREST, and Upstash QStash queue integration.

---

## 🟠 2. Pre-Launch (Must Ship Before AppSumo + Open-Source)

> [!IMPORTANT]
> **These are blockers.** Without them, the framework cannot be publicly released as a working agentic platform. Each item either fixes broken code or delivers the core agent experience users will evaluate on launch day.

### 2a. Dependency & Defect Fixes

* **Declare Missing AI SDK Dependencies**:
  * Add `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google` to `packages/edge-infra/package.json`. Without this, every AI executor call throws `MODULE_NOT_FOUND`.
* **MCP Bridge Defect Fixes (Program A)**:
  * Declare `@modelcontextprotocol/sdk` in `package.json`, fix transport to Streamable HTTP, add auth header injection (`X-API-Key` / `Authorization: Bearer`), and build test suite with in-process mock server.

### 2b. Vercel AI SDK Upgrade (v6 → v7)

* Upgrade dependency from `ai: ^6.0.0` to `ai: ^7.0.0` across edge infrastructure and driver provider packages.

### 2c. Multi-Turn Agent Loop Port

* Porting the production multi-turn tool-calling agent loop from the enterprise product repo (`Frontbase-/services/edge/src/engine/agent/`) into `frontbase-framework`. Replacing the current `/api/agent/chat` stub requires implementing six core subsystems:
  1. 🔐 *Authentication & Tenant Isolation*: Verifies incoming JWT Bearer tokens using Web Crypto (`FRONTBASE_JWT_SECRET`). Extracts and enforces `tenantSlug` matching to guarantee multi-tenant workspace data isolation.
  2. 👤 *Agent Profile & Identity Hydration*: Resolves the requested agent profile (e.g., `workspace-agent`, `support-agent`, or custom tenant profile). Hydrates the agent's identity, domain instructions, and permission scopes (e.g. access to pages, state DB, workflows).
  3. 🤖 *Dynamic Hardware & Model Provider Allocation*: Dynamically instantiates the target LLM driver based on client or tenant credentials (switching on-the-fly between OpenAI `gpt-4o`, Anthropic `claude-3-5-sonnet`, Google `gemini`, or Cloudflare Workers AI). Handles multi-modal payload conversion (converting OpenAI image formats into standard Vercel AI SDK vision objects).
  4. 🛠️ *Dynamic Tool & System Prompt Assembly*: Calls `buildAgentTools()` to gather all executable tools available to the agent (Database CRUD, Page state manipulators, API actions, and connected MCP tools). Compiles the final combined system prompt (`buildAgentSystemPrompt()`) containing identity rules and tool specs.
  5. 🔄 *Multi-Turn Autonomous Inference Loop*: Executes Vercel AI SDK's `streamText()` or `generateText()` with tool-calling enabled. When the LLM decides to call a tool (or multiple tools), the engine executes the tool on the edge, feeds the tool output back into the model, and repeats until the agent yields a final response.
  6. 💾 *Session History Persistence & Response Streaming*: Returns a low-latency SSE text stream (`result.toTextStreamResponse()`) to the browser, or structured JSON with step-by-step tool execution history (`steps`). Persists updated session turn history into cache/session storage (`agent:session:<profile_slug>`).

### 2d. Iteration Guardrails (`maxSteps`)

* Configurable `maxSteps` cap on the multi-turn agent loop per agent profile. Without this, a single bad prompt can trigger unbounded LLM ↔ tool recursion, burning unlimited tokens. **Safety-critical for a public launch.**

### 2e. Basic Error Handling

* Graceful error responses when an LLM provider is down or returns a non-retryable error (e.g. invalid API key, model not found).
* Timeout handling for tool calls mid-loop (prevent a hung MCP server from blocking the agent indefinitely).
* Graceful degradation when registered MCP servers are unreachable.

### 2f. Basic Rate Limiting

* Per-tenant request rate limiting on the `/api/agent/chat` endpoint to prevent abuse on launch day. Can be simple (e.g., fixed-window request count via Upstash Redis) — sophisticated token budgets come post-launch.

### 2g. MCP Bridge to MasterAgent

* Complete Program A so that the framework's agents can consume MasterAgent's memory and prompt tools over MCP at launch. This is the core integration that gives Frontbase agents persistent memory and managed prompts.

---

## 🔵 3. Post-Launch (Iterative Enhancement)

> [!NOTE]
> These items enhance the framework's capabilities after launch. They are valuable but not blockers for the initial AppSumo + open-source release.

### Tier 1 — High Priority (First Post-Launch Sprint)

* **Reasoning Effort / Thinking Budget Control**:
  * Admin-configurable reasoning effort per agent profile via the model factory, mapping a single normalized setting (`low` | `medium` | `high`) to provider-specific `providerOptions` (OpenAI `reasoningEffort`, Anthropic `thinking.budgetTokens`, Google `thinkingConfig.thinkingBudget`).
* **Dynamic Tenant Tool Scoping**:
  * Scoped tool assignment per agent profile and tenant slug via `agent_skills` and `mcp_servers` tables.
* **MCP Resource & Prompt Templates**:
  * Replace stubbed MCP `resources/list`, `prompts/list`, and `prompts/get` routes with real implementations connecting to MasterAgent's Prompt Manager and framework page/component data.
* **Token Usage & Cost Tracking**:
  * Per-tenant telemetry recording input/output token counts, model, cost estimate, and latency per agent turn.

### Tier 2 — Medium Priority (Subsequent Sprints)

* **Multi-Modal Streaming Utilities for Browser Components**:
  * Client-side browser hooks and UI primitives for real-time streaming:
    1. *Real-time Text & Token Streaming*: `useChat` / `useCompletion` hooks with auto-scrolling and typewriter state.
    2. *Generative UI / Streaming Component Trees*: `useObject` / `useGenerativeUI` for rendering live UI components from partial JSON streams.
    3. *Real-time Audio & Voice Streaming*: WebRTC / WebSocket PCM audio streaming hooks for low-latency voice agents.
    4. *Multi-Modal Input/Output Hooks*: Video/webcam frame capture, image compression, and progressive image generation rendering.
* **Structured Output Auto-Repair**:
  * Automatic retry loops when an LLM produces malformed tool parameters or fails Zod schema validation — feeding the validation error back into the model for self-correction.
* **Provider Fallback Strategy**:
  * Configurable failover chains (e.g. if OpenAI is down, fall back to Anthropic) with exponential backoff and provider health tracking.
* **Token Budget Caps & Cost Circuit Breakers**:
  * Hard per-tenant and per-request dollar/token ceilings that terminate agent loops before exceeding budget.

### Tier 3 — Long-Term (Strategic Roadmap)

* **Native MasterMemory npm Package (`@mastermemory/*`)**:
  * Porting the 4-tier experiential memory pipeline (*Interactions → Memories → Intelligence → Knowledge*) from MasterAgent's Python codebase into a native TypeScript package. Blocked on Tier 3 (Knowledge) producing production data.
* **Vector Database Abstraction Layer**:
  * Pluggable vector DB adapters for `pgvector`, `Cloudflare Vectorize`, `Upstash Vector`, and `LanceDB` inside `edge-infra`.
* **Safety & Guardrails**:
  * Native PII scrubbing, input sanitization, and prompt injection defense layers prior to dispatching prompts to LLMs.
* **Durable Execution & HITL**:
  * Workflow checkpointing, pause/resume for Human-in-the-Loop approval gates, and event-sourced step replay for deterministic recovery from mid-loop failures.
* **OpenTelemetry & Latency Tracing**:
  * Structured OpenTelemetry spans to record turn-by-turn latency, token consumption, and tool execution traces across the full agent lifecycle.
