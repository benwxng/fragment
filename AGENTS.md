# Library consistency

The product name is **Glance**. Use this spelling in all user-facing copy. Legacy package, storage, and animation asset identifiers may retain their existing names for compatibility.

Treat the web library and extension library as two surfaces of the same product. Their one shared renderer, markup, and interactions live in `packages/capture/src/library/`; all library styles live in `packages/capture/src/library.css`; shared labels, dates, and filter definitions live in `packages/capture/src/presentation.ts`. Change these shared sources rather than adding separate app components. Keep platform-specific account, storage, and navigation in the adapters. Validate both consumers, rebuild the extension, and tell the user when Chrome must reload the unpacked extension.
