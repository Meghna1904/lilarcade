export const DOODLE_EXPRESSIONS = ['idle', 'happy', 'celebrating', 'shocked', 'worried', 'sad', 'thinking', 'smug', 'sleepy', 'wink'] as const;
export type DoodleExpression = typeof DOODLE_EXPRESSIONS[number];
export type DoodleManifestEntry = { id: string; displayName: string; expressions: DoodleExpression[]; format?: 'webp'; fallbackId?: string };
let cached: DoodleManifestEntry[] | undefined;
const preloadCache = new Map<string, Promise<void>>();

export async function loadDoodleManifest(): Promise<DoodleManifestEntry[]> {
  if (cached) return cached;
  const response = await fetch('/doodles/manifest.json');
  if (!response.ok) throw new Error('Unable to load doodles');
  cached = await response.json() as DoodleManifestEntry[];
  return cached;
}

function preloadImage(src: string): Promise<void> {
  let pending = preloadCache.get(src);
  if (!pending) {
    pending = new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = src;
    });
    preloadCache.set(src, pending);
  }
  return pending;
}

export async function preloadDoodleSet(id: string): Promise<void> {
  const item = (await loadDoodleManifest()).find(entry => entry.id === id);
  if (!item) return;
  const files = item.format === 'webp'
    ? item.expressions.map(expression => `/doodles/${item.id}/${expression}.webp`)
    : [`/doodles/${item.id}/idle.svg`];
  await Promise.all(files.map(preloadImage));
}
