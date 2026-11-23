import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo-name>/. The deploy workflow sets
// BASE_PATH from the repository name; the default matches this repo.
const base = process.env.BASE_PATH ?? '/WorkshopManager/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Libraries in their own chunks: they change rarely, so browsers keep
        // them cached across deploys. Pages are split by lazy routes in App.tsx.
        codeSplitting: {
          groups: [
            { name: 'supabase', test: /node_modules[\/]@supabase[\/]/ },
            { name: 'react', test: /node_modules[\/](react|react-dom|react-router|scheduler)[\/]/ },
          ],
        },
      },
    },
  },
});
