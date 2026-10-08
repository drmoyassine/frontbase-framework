import { defineConfig } from '@playwright/test';
import qualityConfig from './quality.config';
// Separate temporary fixture run: publishing tests must not alter quality-run generations.
export default defineConfig({...qualityConfig,testMatch:'**/*.publishing.ts'});
