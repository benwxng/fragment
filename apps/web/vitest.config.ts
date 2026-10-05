import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    server: {
      deps: {
        // Resolve the SDK's extensionless Next.js imports through Vite.
        inline: ['@neondatabase/auth'],
      },
    },
  },
});
