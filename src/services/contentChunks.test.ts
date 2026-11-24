import { describe, it, expect, vi } from 'vitest'
import { contentChunks, createChunkLoader } from './contentChunks'

const chunk = (records: unknown) => vi.fn(() => Promise.resolve(records))

describe('createChunkLoader', () => {
  it('indexes chunks by lane and source from their paths', () => {
    const loader = createChunkLoader({
      '../data/content/monsters/XMM.json': chunk([]),
      '../data/content/monsters/MM.json': chunk([]),
      '../data/content/magic-items/DMG.json': chunk([]),
      '../data/elsewhere/ignored.json': chunk([]),
    })
    expect(loader.lanes()).toEqual(['magic-items', 'monsters'])
    expect(loader.sources('monsters')).toEqual(['MM', 'XMM'])
    expect(loader.sources('spells')).toEqual([])
  })

  it('loads the requested sources in order, or every source of the lane', async () => {
    const loader = createChunkLoader({
      '../data/content/monsters/XMM.json': chunk([{ name: 'Goblin Warrior' }]),
      '../data/content/monsters/MM.json': chunk([{ name: 'Goblin' }, { name: 'Orc' }]),
    })
    expect(await loader.load('monsters', ['XMM', 'MM'])).toEqual([{ name: 'Goblin Warrior' }, { name: 'Goblin' }, { name: 'Orc' }])
    expect(await loader.load('monsters')).toEqual([{ name: 'Goblin' }, { name: 'Orc' }, { name: 'Goblin Warrior' }])
    expect(await loader.load('spells')).toEqual([])
  })

  it('fetches each chunk once, including concurrent requests', async () => {
    const xmm = chunk([{ name: 'Goblin Warrior' }])
    const loader = createChunkLoader({ '../data/content/monsters/XMM.json': xmm })
    await Promise.all([loader.load('monsters'), loader.load('monsters', ['XMM'])])
    await loader.load('monsters')
    expect(xmm).toHaveBeenCalledTimes(1)
  })

  it('retries a chunk whose load failed', async () => {
    const flaky = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce([{ name: 'Goblin' }])
    const loader = createChunkLoader({ '../data/content/monsters/MM.json': flaky })
    await expect(loader.load('monsters')).rejects.toThrow('network')
    expect(await loader.load('monsters')).toEqual([{ name: 'Goblin' }])
    expect(flaky).toHaveBeenCalledTimes(2)
  })

  it('rejects unknown sources and chunks that are not arrays', async () => {
    const loader = createChunkLoader({ '../data/content/monsters/MM.json': chunk({ monster: [] }) })
    await expect(loader.load('monsters', ['VGM'])).rejects.toThrow('Unknown content chunk: monsters/VGM')
    await expect(loader.load('monsters')).rejects.toThrow('monsters/MM is not an array')
  })
})

describe('contentChunks', () => {
  it('is built from src/data/content and every chunk it lists can be loaded', async () => {
    for (const lane of contentChunks.lanes()) {
      const records = await contentChunks.load(lane)
      expect(Array.isArray(records)).toBe(true)
    }
  })
})
