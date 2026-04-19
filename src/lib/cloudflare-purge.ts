/**
 * Purge Cloudflare CDN cache. Paired with `revalidateTag` at every mutation
 * site so that both the Next.js caches and the Cloudflare edge drop stale
 * content at the same time.
 *
 * No-op when CF_ZONE_ID or CF_API_TOKEN is not set, so the code is safe to
 * deploy before Cloudflare is configured — activation is purely an ENV flip.
 *
 * Uses `purge_everything` for simplicity. Mutations are rare (admin-driven),
 * so the one-time cache-miss cost per URL on the next hit is acceptable and
 * avoids having to enumerate every WC/leaderboard URL here.
 */
export async function purgeCloudflareCache(): Promise<void> {
  const zone = process.env.CF_ZONE_ID;
  const token = process.env.CF_API_TOKEN;
  if (!zone || !token) return;

  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ purge_everything: true }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[cloudflare-purge] Failed:', res.status, body);
    }
  } catch (err) {
    console.error('[cloudflare-purge] Error:', err);
  }
}
