/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The generated dataset is served as-is: /residents.json, /notes.json.
  publicDir: 'data',
  test: { include: ['src/**/*.test.ts'] },
});
