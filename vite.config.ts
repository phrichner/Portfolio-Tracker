import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Base public path when served from GitHub Pages for a project site:
  base: '/Portfolio-Tracker/',
  plugins: [react()],
});
