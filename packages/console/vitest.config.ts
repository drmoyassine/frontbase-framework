/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/tests/setup.ts', './src/lib/auth/__tests__/setup.ts'],
        include: [
            'src/**/*.{test,spec}.{ts,tsx}',
            'src/**/__tests__/**/*.{ts,tsx}',
            'packages/**/*.{test,spec}.{ts,tsx}'
        ],
        exclude: ['node_modules', 'dist', '**/setup.ts', '**/__tests__/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'src/__tests__/',
                'src/tests/',
                '**/*.test.{ts,tsx}',
                '**/*.spec.{ts,tsx}',
                'src/main.tsx',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@frontbase/types': path.resolve(__dirname, './packages/types/src/index.ts'),
            '@frontbase/datatable': path.resolve(__dirname, './packages/datatable/src/index.ts'),
            '@frontbase/infolist': path.resolve(__dirname, './packages/infolist/src/index.ts'),
            '@frontbase/form': path.resolve(__dirname, './packages/form/src/index.ts'),
            '@frontbase/chart': path.resolve(__dirname, './packages/chart/src/index.ts'),
            '@frontbase/kpicard': path.resolve(__dirname, './packages/kpicard/src/index.ts'),
            '@frontbase/grid': path.resolve(__dirname, './packages/grid/src/index.ts'),
            '@frontbase/liquid-core': path.resolve(__dirname, './packages/liquid-core/src/index.ts'),
        },
    },
});
