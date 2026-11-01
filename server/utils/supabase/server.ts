import { createServerClient } from '@supabase/ssr';
import type { Request, Response } from 'express';

function readCookies(header = '') {
  return header.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const separator = part.indexOf('=');
    const name = separator < 0 ? part : part.slice(0, separator);
    const rawValue = separator < 0 ? '' : part.slice(separator + 1);
    let value = rawValue;
    try { value = decodeURIComponent(rawValue); } catch { /* Keep malformed cookie text inert. */ }
    return { name, value };
  });
}

export const createClient = (request: Request, response: Response) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Supabase URL and publishable key are required to create a server client.');
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return readCookies(request.headers.cookie); },
      setAll(cookiesToSet) {
        const current = new Map(readCookies(request.headers.cookie).map(cookie => [cookie.name, cookie.value]));
        for (const { name, value, options } of cookiesToSet) {
          current.set(name, value);
          response.cookie(name, value, options);
        }
        request.headers.cookie = [...current].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('; ');
      },
    },
  });
};
