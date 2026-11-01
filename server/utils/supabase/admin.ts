import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';

function getAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseSecretKey) return null;
  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const isPlayerPersistenceConfigured = () => Boolean(getAdmin());

export async function savePlayer(name: string, passcode: string, deviceToken: string) {
  const admin = getAdmin();
  if (!admin) return;
  const pepper = process.env.ARCADE_PASSCODE_PEPPER;
  if (!pepper) throw new Error('ARCADE_PASSCODE_PEPPER must be configured on the server.');

  const keyedHash = (value: string) => createHmac('sha256', pepper).update(value).digest('hex');
  const { error } = await admin.from('arcade_players').upsert({
    room_key_hash: keyedHash(`room:${passcode}`),
    device_key_hash: keyedHash(`device:${deviceToken}`),
    name,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'room_key_hash,device_key_hash' });

  if (error) throw error;
}
