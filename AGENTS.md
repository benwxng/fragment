# Library consistency

The product name is **Glance**. Use this spelling in all user-facing copy. Legacy package, storage, and animation asset identifiers may retain their existing names for compatibility.

Treat the web library and extension library as two surfaces of the same product. Apply library presentation and behavior changes to both in the same task. Shared card styles live in `packages/capture/src/library.css`; shared labels, dates, and filter definitions live in `packages/capture/src/presentation.ts`. Keep shared rules there instead of copying them into each app. Preserve platform-specific account, storage, and navigation behavior. Validate both consumers, rebuild the extension, and tell the user when Chrome must reload the unpacked extension.
