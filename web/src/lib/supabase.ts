import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = () => {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set — see README");
  return v;
};

/** Session-aware client: used only for Supabase Auth (sign in / out / current user). */
export async function authClient() {
  // Auth is per-request by nature (session expiry reads the clock), so never let it run during prerendering.
  await connection();
  const store = await cookies();
  return createServerClient(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* called from a Server Component: the proxy refreshes the session instead */ }
      },
    },
  });
}

// Untyped on purpose: rows are validated in application code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: SupabaseClient<any, "public", any> | null = null;
/** Secret-key client for data access. Only ever called after a role check (see auth.ts). */
export function db() {
  if (!process.env.SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY is not set — see README");
  return (_admin ??= createClient(url(), process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
}
