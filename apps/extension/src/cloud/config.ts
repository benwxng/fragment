export interface CloudConfig { apiUrl: string; siteUrl: string }
function configuredUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    const local = url.protocol === 'http:' && ['127.0.0.1','localhost'].includes(url.hostname);
    if (url.protocol !== 'https:' && !local) return null;
    return url.origin;
  } catch { return null; }
}
export function getCloudConfig(): CloudConfig | null {
  const apiUrl = configuredUrl(import.meta.env.WXT_NEON_API_URL);
  const siteUrl = configuredUrl(import.meta.env.WXT_SITE_URL);
  return apiUrl && siteUrl ? { apiUrl, siteUrl } : null;
}
