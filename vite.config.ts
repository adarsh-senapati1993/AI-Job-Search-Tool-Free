import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    server: {
      proxy: {
        // We removed /api/perplexity proxy because direct calls are more stable.
        
        // Keep Ollama proxy for local development (CORS is often stricter on localhost:11434)
        '/ollama_proxy': {
          target: 'http://127.0.0.1:11434',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ollama_proxy/, ''),
          secure: false,
        },
      },
    },
  };
});