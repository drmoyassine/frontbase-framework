/**
 * AI Test Dialog Schema Data — per-modality parameter definitions.
 * 
 * Extracted from AITestDialog.tsx for single-responsibility compliance.
 * Contains all OpenAI-compatible parameter schemas, modality configs,
 * context length hints, and model card URL logic.
 */

// =============================================================================
// Schema Reference Data — per modality
// =============================================================================

export interface SchemaParam {
    name: string;
    type: string;
    required: boolean;
    defaultVal: string;       // Display string in table
    defaultRaw: any;          // Actual JS value injected into cURL body
    description: string;
}

export const CHAT_COMPLETIONS_PARAMS: SchemaParam[] = [
    { name: 'model', type: 'string', required: true, defaultVal: '—', defaultRaw: null, description: 'Model slug (e.g. gpt-oss-120b)' },
    { name: 'messages', type: 'array', required: true, defaultVal: '—', defaultRaw: null, description: 'Array of {role, content} objects. Roles: system, user, assistant, tool' },
    { name: 'max_tokens', type: 'integer', required: false, defaultVal: '256', defaultRaw: 256, description: 'Maximum tokens to generate' },
    { name: 'temperature', type: 'number', required: false, defaultVal: '0.6', defaultRaw: 0.6, description: 'Sampling temperature (0–5). Higher = more creative' },
    { name: 'top_p', type: 'number', required: false, defaultVal: '—', defaultRaw: 0.9, description: 'Nucleus sampling cutoff (0.001–1)' },
    { name: 'top_k', type: 'integer', required: false, defaultVal: '—', defaultRaw: 40, description: 'Top-k sampling limit (1–50)' },
    { name: 'seed', type: 'integer', required: false, defaultVal: '—', defaultRaw: 42, description: 'Random seed for reproducible output (1–9999999999)' },
    { name: 'stop', type: 'string[]', required: false, defaultVal: 'null', defaultRaw: null, description: 'Stop sequences — generation stops when encountered' },
    { name: 'stream', type: 'boolean', required: false, defaultVal: 'false', defaultRaw: false, description: 'Stream response via SSE (if model supports it)' },
    { name: 'frequency_penalty', type: 'number', required: false, defaultVal: '0', defaultRaw: 0, description: 'Penalize repeated tokens (−2 to 2)' },
    { name: 'presence_penalty', type: 'number', required: false, defaultVal: '0', defaultRaw: 0, description: 'Penalize tokens already present (−2 to 2)' },
    { name: 'repetition_penalty', type: 'number', required: false, defaultVal: '—', defaultRaw: 1.1, description: 'Repetition penalty (0–2). CF-specific alternative to freq/pres' },
    { name: 'tools', type: 'array', required: false, defaultVal: 'null', defaultRaw: null, description: 'Function calling tools (model-dependent)' },
    { name: 'response_format', type: 'object', required: false, defaultVal: 'null', defaultRaw: null, description: 'JSON mode: {type: "json_object"} or {type: "json_schema", json_schema: ...}' },
    { name: 'raw', type: 'boolean', required: false, defaultVal: 'false', defaultRaw: false, description: 'Skip chat template — send raw prompt to model' },
    { name: 'lora', type: 'string', required: false, defaultVal: 'null', defaultRaw: null, description: 'LoRA adapter name for fine-tuned inference' },
];

export const EMBEDDINGS_PARAMS: SchemaParam[] = [
    { name: 'model', type: 'string', required: true, defaultVal: '—', defaultRaw: null, description: 'Model slug' },
    { name: 'input', type: 'string | string[]', required: true, defaultVal: '—', defaultRaw: null, description: 'Text to embed (single string or array)' },
];

export const IMAGE_GEN_PARAMS: SchemaParam[] = [
    { name: 'model', type: 'string', required: true, defaultVal: '—', defaultRaw: null, description: 'Model slug' },
    { name: 'prompt', type: 'string', required: true, defaultVal: '—', defaultRaw: null, description: 'Text description of the desired image' },
    { name: 'size', type: 'string', required: false, defaultVal: '1024x1024', defaultRaw: '1024x1024', description: 'Image size as WxH (e.g. 512x512, 1024x1024)' },
    { name: 'n', type: 'number', required: false, defaultVal: '1', defaultRaw: 1, description: 'Number of images to generate' },
    { name: 'response_format', type: 'string', required: false, defaultVal: 'b64_json', defaultRaw: 'b64_json', description: '"b64_json" or "url"' },
];

export const AUDIO_TRANSCRIPTION_PARAMS: SchemaParam[] = [
    { name: 'file', type: 'file / base64', required: true, defaultVal: '—', defaultRaw: null, description: 'Audio file (multipart) or base64-encoded audio (JSON)' },
    { name: 'model', type: 'string', required: true, defaultVal: '—', defaultRaw: null, description: 'Model slug' },
];

export const AUDIO_SPEECH_PARAMS: SchemaParam[] = [
    { name: 'model', type: 'string', required: true, defaultVal: '—', defaultRaw: null, description: 'Model slug' },
    { name: 'input', type: 'string', required: true, defaultVal: '—', defaultRaw: null, description: 'Text to synthesize into speech' },
    { name: 'voice', type: 'string', required: false, defaultVal: 'alloy', defaultRaw: 'alloy', description: 'Voice preset (alloy, echo, fable, onyx, nova, shimmer)' },
    { name: 'speed', type: 'number', required: false, defaultVal: '1.0', defaultRaw: 1.0, description: 'Playback speed (0.25 to 4.0)' },
    { name: 'response_format', type: 'string', required: false, defaultVal: 'mp3', defaultRaw: 'mp3', description: 'Audio format: mp3, opus, aac, flac, wav, pcm' },
];

export const RESPONSES_PARAMS: SchemaParam[] = [
    { name: 'model', type: 'string', required: true, defaultVal: '—', defaultRaw: null, description: 'Model slug (e.g. gpt-oss-120b)' },
    { name: 'input', type: 'string | array', required: true, defaultVal: '—', defaultRaw: null, description: 'Text prompt or structured input array' },
    { name: 'instructions', type: 'string', required: false, defaultVal: 'null', defaultRaw: null, description: 'System-level instructions for the model' },
    { name: 'reasoning.effort', type: 'string', required: false, defaultVal: 'medium', defaultRaw: 'medium', description: 'Reasoning depth: "low", "medium", or "high"' },
    { name: 'reasoning.summary', type: 'string', required: false, defaultVal: 'auto', defaultRaw: 'auto', description: 'Reasoning summary mode: "auto", "concise", or "detailed"' },
    { name: 'max_tokens', type: 'integer', required: false, defaultVal: '256', defaultRaw: 256, description: 'Maximum tokens to generate' },
    { name: 'temperature', type: 'number', required: false, defaultVal: '0.6', defaultRaw: 0.6, description: 'Sampling temperature (0–5)' },
    { name: 'tools', type: 'array', required: false, defaultVal: 'null', defaultRaw: null, description: 'Function calling tools (model-dependent)' },
];


// =============================================================================
// Modality → endpoint + schema mapping
// =============================================================================

export interface ModalityConfig {
    endpoint: string;
    params: SchemaParam[];
    baseBody: (modelName: string) => any;
}

// Shared baseBody builders to avoid duplication
const chatBaseBody = (m: string) => ({
    model: m,
    messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello, world!' },
    ],
});

const embeddingsBaseBody = (m: string) => ({ model: m, input: 'Hello, world!' });
const imageBaseBody = (m: string) => ({ model: m, prompt: 'A serene mountain lake at sunset' });
const audioTranscriptionBaseBody = (m: string) => ({ model: m, file: '<base64-encoded-audio>' });
const audioSpeechBaseBody = (m: string) => ({ model: m, input: 'Hello, this is a test of text to speech.' });

export const MODALITY_MAP: Record<string, ModalityConfig> = {
    llm: { endpoint: '/api/agents/v1/chat/completions', params: CHAT_COMPLETIONS_PARAMS, baseBody: chatBaseBody },
    'text-generation': { endpoint: '/api/agents/v1/chat/completions', params: CHAT_COMPLETIONS_PARAMS, baseBody: chatBaseBody },
    embedder: { endpoint: '/api/agents/v1/embeddings', params: EMBEDDINGS_PARAMS, baseBody: embeddingsBaseBody },
    'text-embeddings': { endpoint: '/api/agents/v1/embeddings', params: EMBEDDINGS_PARAMS, baseBody: embeddingsBaseBody },
    image_gen: { endpoint: '/api/agents/v1/images/generations', params: IMAGE_GEN_PARAMS, baseBody: imageBaseBody },
    'text-to-image': { endpoint: '/api/agents/v1/images/generations', params: IMAGE_GEN_PARAMS, baseBody: imageBaseBody },
    stt: { endpoint: '/api/agents/v1/audio/transcriptions', params: AUDIO_TRANSCRIPTION_PARAMS, baseBody: audioTranscriptionBaseBody },
    'speech-recognition': { endpoint: '/api/agents/v1/audio/transcriptions', params: AUDIO_TRANSCRIPTION_PARAMS, baseBody: audioTranscriptionBaseBody },
    tts: { endpoint: '/api/agents/v1/audio/speech', params: AUDIO_SPEECH_PARAMS, baseBody: audioSpeechBaseBody },
    responses: {
        endpoint: '/api/agents/v1/responses',
        params: RESPONSES_PARAMS,
        baseBody: (m) => ({
            model: m,
            input: 'What are the benefits of edge computing?',
            reasoning: { effort: 'medium' },
        }),
    },
};

export const DEFAULT_MODALITY: ModalityConfig = {
    endpoint: '/api/agents/v1/chat/completions',
    params: CHAT_COMPLETIONS_PARAMS,
    baseBody: (m) => ({
        model: m,
        messages: [{ role: 'user', content: 'Hello, world!' }],
    }),
};


// =============================================================================
// Context length hints + model card URL
// =============================================================================

const CONTEXT_HINTS: Record<string, string> = {
    '@cf/meta/llama-3.1-8b-instruct': '128K',
    '@cf/meta/llama-3.1-70b-instruct': '128K',
    '@cf/meta/llama-3-8b-instruct': '8K',
    '@cf/meta/llama-2-7b-chat-int8': '4K',
    '@cf/mistral/mistral-7b-instruct-v0.2': '32K',
    '@cf/google/gemma-7b-it': '8K',
    '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b': '128K',
    '@cf/qwen/qwen1.5-14b-chat-awq': '32K',
    '@cf/ibm-granite/granite-4.0-h-micro': '128K',
    '@cf/openai/gpt-oss-120b': '128K',
};

export function getContextSize(modelId?: string): string | null {
    if (!modelId) return null;
    return CONTEXT_HINTS[modelId] ?? null;
}

export function getModelCardUrl(modelId?: string): string | null {
    if (!modelId) return null;
    if (modelId.startsWith('@cf/')) {
        // CF docs use flat model name, e.g. @cf/openai/gpt-oss-120b → /models/gpt-oss-120b/
        const parts = modelId.replace('@cf/', '').split('/');
        const flatSlug = parts[parts.length - 1];
        return `https://developers.cloudflare.com/workers-ai/models/${flatSlug}/`;
    }
    if (modelId.includes('/') && !modelId.startsWith('@')) {
        return `https://huggingface.co/${modelId}`;
    }
    return null;
}
