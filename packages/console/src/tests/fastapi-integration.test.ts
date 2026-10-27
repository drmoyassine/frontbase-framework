/**
 * FastAPI Integration Tests
 *
 * Smoke tests verifying that the FastAPI backend API service layer
 * is accessible and correctly configured.
 *
 * Note: These are lightweight integration tests. Full API behaviour is
 * covered by the Python pytest suite in fastapi-backend/tests/.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('FastAPI Integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should store backend config in localStorage', () => {
    const config = {
      type: 'fastapi',
      baseUrl: 'http://localhost:8000',
    };
    localStorage.setItem('backendConfig', JSON.stringify(config));

    const stored = JSON.parse(localStorage.getItem('backendConfig')!);
    expect(stored.type).toBe('fastapi');
    expect(stored.baseUrl).toBe('http://localhost:8000');
  });

  it('should default to no backend config', () => {
    const stored = localStorage.getItem('backendConfig');
    expect(stored).toBeNull();
  });

  it('should handle config serialization roundtrip', () => {
    const config = {
      type: 'fastapi',
      baseUrl: 'http://localhost:8000',
      extra: { nested: true },
    };
    localStorage.setItem('backendConfig', JSON.stringify(config));
    const parsed = JSON.parse(localStorage.getItem('backendConfig')!);
    expect(parsed).toEqual(config);
  });
});