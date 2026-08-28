/**
 * Test setup for Supabase auth tests
 *
 * Provides common mocks and utilities for testing
 */

import { vi } from 'vitest';

// Mock window.location.origin for tests
Object.defineProperty(window, 'location', {
  value: {
    origin: 'http://localhost:5173',
    protocol: 'http:',
    hostname: 'localhost',
    port: '5173',
    pathname: '/',
    search: {},
    hash: {},
  },
  writable: true,
});

// Mock fetch globally
global.fetch = vi.fn();

// Mock FormData, Blob, etc. for Supabase
global.FormData = vi.fn() as any;
global.Blob = vi.fn() as any;

// Clear mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});
