import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    server: {
      deps: {
        // Resolve the SDK's extensionless Next.js imports through Vite.
        inline: ['@neondatabase/auth'],
      },
    },
  },
});
