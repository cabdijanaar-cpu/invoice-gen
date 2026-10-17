import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL=https://rjkjncrpvvcsddsnpjwg.supabase.co/rest/v1/
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_vTtbCedJsNWzNzqk4C5Jvg_3Sa-tBtO
  );
}