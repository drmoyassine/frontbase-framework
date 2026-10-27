/**
 * Test setup — extends Vitest with jest-dom matchers and mocks
 */
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock import.meta.env
const originalEnv = import.meta.env;

Object.defineProperty(import.meta, 'env', {
  value: new Proxy({} as any, {
    get(target, prop) {
      if (prop === 'DEV') return true;
      if (prop === 'PROD') return false;
      if (prop === 'MODE') return 'test';
      if (prop === 'VITE_SUPABASE_URL') return 'https://fake.supabase.co';
      if (prop === 'VITE_SUPABASE_ANON_KEY') return 'fake-key';
      if (prop === 'VITE_AUTH_PROVIDER') return target.VITE_AUTH_PROVIDER;
      return originalEnv[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
    has(target, prop) {
      return prop in originalEnv || prop in target;
    },
    deleteProperty(target, prop) {
      return delete target[prop];
    },
  }),
  writable: true,
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });
