import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo-name>/. The deploy workflow sets
// BASE_PATH from the repository name; the default matches this repo.
const base = process.env.BASE_PATH ?? '/WorkshopManager/';

export default defineConfig({
  base,
  plugins: [react()],
});
