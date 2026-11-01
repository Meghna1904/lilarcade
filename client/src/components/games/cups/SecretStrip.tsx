import type { CupId } from '@arcade/shared';
import { Cup } from './Cup';

export function SecretStrip({ secret, revealed = false }: { secret?: CupId[]; revealed?: boolean }) {
  if (!secret?.length) return null;
  return <div className={`secret-strip ${revealed ? 'secret-revealed' : ''}`}><span>{revealed ? 'The secret order' : 'Your secret'}</span><div>{secret.map(cup => <Cup key={cup} id={cup} compact />)}</div></div>;
}
