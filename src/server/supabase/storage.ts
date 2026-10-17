import "server-only";
import { createClient } from "@supabase/supabase-js";

const LOGO_BUCKET = "shop-logos";

export function createStorageAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for private logo storage.");
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { client, bucket: LOGO_BUCKET };
}

export function isShopLogoKey(shopId: string, key: string): boolean {
  return key.startsWith(`${shopId}/`) && /^[a-f0-9-]+\.(png|jpg|webp)$/.test(key.slice(shopId.length + 1));
}
