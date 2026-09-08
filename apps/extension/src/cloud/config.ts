export interface CloudConfig {
  url: string;
  publishableKey: string;
}

function configuredUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    const localDevelopment = url.protocol === 'http:'
      && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
    if (url.protocol !== 'https:' && !localDevelopment) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Cloud configuration is deliberately optional; an incomplete setup is local-only. */
export function getCloudConfig(): CloudConfig | null {
  const url = configuredUrl(import.meta.env.WXT_SUPABASE_URL);
  const publishableKey = import.meta.env.WXT_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}
