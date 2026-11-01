import type { NextFunction, Request, Response } from 'express';
import { createClient } from './server.js';

const supabaseEnabled = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const hasSupabaseSession = (cookieHeader = '') => /(?:^|;\s*)sb-[^=]*auth[^=]*=/i.test(cookieHeader);

/** Refresh an existing Supabase cookie session on HTTP requests without adding an auth requirement. */
export async function refreshSupabaseSession(request: Request, response: Response, next: NextFunction) {
  if (!supabaseEnabled() || !hasSupabaseSession(request.headers.cookie)) { next(); return; }
  try {
    const supabase = createClient(request, response);
    await supabase.auth.getClaims();
  } catch {
    // Keep the arcade available if Supabase is temporarily unreachable or the cookie is stale.
  }
  next();
}
