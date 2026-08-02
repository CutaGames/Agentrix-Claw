/**
 * Share card utilities — builds deep-link URLs for poster sharing.
 *
 * Used by any share flow (e.g. ShareCardView / DigestPosterScreen) that needs a trackable URL.
 */

const BASE_URL = 'https://agentrix.top/share';

/**
 * Construct a shareable URL for a given content type.
 *
 * @param type - Content type: 'pet' | 'skill' | 'marketplace'
 * @param id - Unique identifier of the item
 * @param refCode - Optional referral code for attribution
 * @returns Full share URL string
 */
export function buildShareUrl(type: string, id: string, refCode?: string): string {
  const base = `${BASE_URL}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
  if (refCode) {
    return `${base}?ref=${encodeURIComponent(refCode)}`;
  }
  return base;
}
