import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // THIS IS CRITICAL: It tells the app it lives in a sub-folder named 'Portfolio-Tracker'
  base: '/Portfolio-Tracker/',
});