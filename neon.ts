import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  buckets: {
    uploads: { access: "private" },
  },
  functions: {
    api: { name: "Refer API", source: "./backend/api.ts" },
  },
});
