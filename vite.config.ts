import { defineConfig } from 'vite';

// `base: './'` keeps asset paths relative so the same build works on
// Vercel, Netlify, GitHub Pages (sub-path) and inside itch.io's iframe.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three/ },
            { name: 'postfx', test: /node_modules[\\/]postprocessing/ },
          ],
        },
      },
    },
  },
  server: { host: true },
});
