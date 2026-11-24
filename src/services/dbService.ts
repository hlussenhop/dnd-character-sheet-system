import { Character, UserMonster, Encounter, NPC } from '../types/dnd';
import { IStorageService, SpellbookEntry } from './storage/IStorageService';
import { IndexedDbAdapter } from './storage/IndexedDbAdapter';

// Create a default instance for standalone mode
let currentStorage: IStorageService = new IndexedDbAdapter();
let externalStorage = false;

// Allow external code (e.g. NexusVTT embedding) to inject a different storage adapter.
// Characters use that adapter only when it is injected. Otherwise they live in Firebase.
export const setStorageAdapter = (adapter: IStorageService) => {
  currentStorage = adapter;
  externalStorage = true;
};

// ==================== Proxy Functions ====================
// We proxy the calls to currentStorage so existing hooks do not need to be refactored immediately.

const stampCharacter = (character: Character): Character => ({
  ...character,
  createdAt: character.createdAt ?? new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const characterCloud = () => import('./firebase/characterCloud');

export const getAllCharacters = async (): Promise<Character[]> => {
  if (externalStorage) return currentStorage.getAllCharacters();
  const cloud = await characterCloud();
  return cloud.listCharacters();
};
export const addCharacter = async (character: Character): Promise<string> => {
  const saved = stampCharacter(character);
  if (externalStorage) return currentStorage.addCharacter(saved);
  const cloud = await characterCloud();
  await cloud.saveCharacter(saved);
  return saved.id;
};
export const deleteCharacter = async (id: string): Promise<void> => {
  if (externalStorage) {
    await currentStorage.deleteCharacter(id);
    return;
  }
  const cloud = await characterCloud();
  await cloud.removeCharacter(id);
};
export const updateCharacter = async (character: Character): Promise<void> => {
  const saved = stampCharacter(character);
  if (externalStorage) {
    await currentStorage.updateCharacter(saved);
    return;
  }
  const cloud = await characterCloud();
  await cloud.saveCharacter(saved);
};

export const getAllCustomMonsters = async (): Promise<UserMonster[]> => currentStorage.getAllCustomMonsters();
export const addCustomMonster = async (monster: UserMonster): Promise<string> => currentStorage.addCustomMonster(monster);
export const updateCustomMonster = async (monster: UserMonster): Promise<void> => currentStorage.updateCustomMonster(monster);
export const deleteCustomMonster = async (id: string): Promise<void> => currentStorage.deleteCustomMonster(id);

export const getFavoriteMonsters = async (): Promise<string[]> => currentStorage.getFavoriteMonsters();
export const addFavorite = async (monsterId: string): Promise<void> => currentStorage.addFavorite(monsterId);
export const removeFavorite = async (monsterId: string): Promise<void> => currentStorage.removeFavorite(monsterId);
export const isFavorite = async (monsterId: string): Promise<boolean> => currentStorage.isFavorite(monsterId);

export const getAllEncounters = async (): Promise<Encounter[]> => currentStorage.getAllEncounters();
export const getEncounter = async (id: string): Promise<Encounter | undefined> => currentStorage.getEncounter(id);
export const saveEncounter = async (encounter: Encounter): Promise<string> => currentStorage.saveEncounter(encounter);
export const deleteEncounter = async (id: string): Promise<void> => currentStorage.deleteEncounter(id);

export const getAllNPCs = async (): Promise<NPC[]> => currentStorage.getAllNPCs();
export const addNPC = async (npc: NPC): Promise<string> => currentStorage.addNPC(npc);
export const updateNPC = async (npc: NPC): Promise<void> => currentStorage.updateNPC(npc);
export const deleteNPC = async (id: string): Promise<void> => currentStorage.deleteNPC(id);

export const getAllSpellbooks = async (): Promise<SpellbookEntry[]> => currentStorage.getAllSpellbooks();
export const addSpellbook = async (spellbook: SpellbookEntry): Promise<string> => currentStorage.addSpellbook(spellbook);
export const updateSpellbook = async (spellbook: SpellbookEntry): Promise<void> => currentStorage.updateSpellbook(spellbook);
export const deleteSpellbook = async (id: string): Promise<void> => currentStorage.deleteSpellbook(id);

