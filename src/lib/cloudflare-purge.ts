/**
 * Purge Cloudflare CDN cache. Paired with `revalidateTag` at every mutation
 * site so that both the Next.js caches and the Cloudflare edge drop stale
 * content at the same time.
 *
 * No-op when CF_ZONE_ID or CF_API_TOKEN is not set, so the code is safe to
 * deploy before Cloudflare is configured — activation is purely an ENV flip.
 *
 * Pass `files` (absolute URLs) to purge ONLY those pages — the least-invasive
 * option, used by the slow lane after regenerating one group's articles so a
 * single match-update does not blow away the whole edge cache. Called with no
 * argument (e.g. clear-all / broad admin ops) it falls back to
 * `purge_everything`; the one-time cache-miss per URL is acceptable there.
 */
export async function purgeCloudflareCache(files?: string[]): Promise<void> {
  const zone = process.env.CF_ZONE_ID;
  const token = process.env.CF_API_TOKEN;
  if (!zone || !token) return;

  // An empty list would mean "purge nothing"; skip the call entirely.
  if (files && files.length === 0) return;

  const body = files && files.length > 0
    ? { files }
    : { purge_everything: true };

  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[cloudflare-purge] Failed:', res.status, body);
    }
  } catch (err) {
    console.error('[cloudflare-purge] Error:', err);
  }
}
