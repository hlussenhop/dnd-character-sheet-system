/**
 * Lazy-loaded content chunks for the large content lanes (magic items, monsters, ...).
 *
 * Each lane lives in `src/data/content/<lane>/<SOURCE>.json`, one JSON array of records per source
 * book. Vite emits every file as its own chunk, so this data never enters the main bundle; a chunk is
 * fetched the first time it is requested and kept in memory afterwards.
 */

type ChunkFactory = () => Promise<unknown>;

const CHUNK_PATH = /\/content\/([^/]+)\/([^/]+)\.json$/;

export interface ChunkLoader {
  /** Lanes that have at least one chunk */
  lanes(): string[];
  /** Source abbreviations available for a lane */
  sources(lane: string): string[];
  /** Records of the given sources (all sources of the lane when omitted), in source order */
  load<T>(lane: string, sources?: string[]): Promise<T[]>;
}

export function createChunkLoader(factories: Record<string, ChunkFactory>): ChunkLoader {
  const index = new Map<string, Map<string, ChunkFactory>>();
  Object.entries(factories).forEach(([path, factory]) => {
    const match = CHUNK_PATH.exec(path);
    if (!match) return;
    const [, lane, source] = match;
    if (!index.has(lane)) index.set(lane, new Map());
    index.get(lane)!.set(source, factory);
  });

  const cache = new Map<string, Promise<unknown[]>>();

  const loadOne = (lane: string, source: string): Promise<unknown[]> => {
    const key = `${lane}/${source}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const factory = index.get(lane)?.get(source);
    if (!factory) return Promise.reject(new Error(`Unknown content chunk: ${key}`));
    const pending = factory().then(data => {
      if (!Array.isArray(data)) throw new Error(`Content chunk ${key} is not an array`);
      return data;
    });
    cache.set(key, pending);
    // A failed load is not cached, so the next request retries
    pending.catch(() => cache.delete(key));
    return pending;
  };

  return {
    lanes: () => Array.from(index.keys()).sort(),
    sources: lane => Array.from(index.get(lane)?.keys() ?? []).sort(),
    async load<T>(lane: string, sources?: string[]): Promise<T[]> {
      const wanted = sources ?? Array.from(index.get(lane)?.keys() ?? []).sort();
      const parts = await Promise.all(wanted.map(source => loadOne(lane, source)));
      return parts.flat() as T[];
    },
  };
}

export const contentChunks = createChunkLoader(
  import.meta.glob('../data/content/*/*.json', { import: 'default' }),
);

/** Records of a lane, loaded lazily (e.g. `loadChunked<Monster>('monsters', ['XMM'])`). */
export const loadChunked = <T>(lane: string, sources?: string[]): Promise<T[]> =>
  contentChunks.load<T>(lane, sources);
