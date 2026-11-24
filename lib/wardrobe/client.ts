import { parseWardrobeOutfit, type WardrobeSelection, type WardrobeState } from "./catalogue";

export const wardrobeEndpoint = "/api/ready/wardrobe";
type AvailableOutfit = WardrobeState & { access: "admin" | "subscriber"; sessionId: string };
type OutfitListener = (state: AvailableOutfit | null) => void;

const listeners = new Map<string, Set<OutfitListener>>();
const pendingSaves = new Map<string, Promise<unknown>>();

export function observeWardrobe(sessionId: string, listener: OutfitListener) {
  const subscriptions = listeners.get(sessionId) ?? new Set<OutfitListener>();
  listeners.set(sessionId, subscriptions);
  subscriptions.add(listener);
  return () => {
    subscriptions.delete(listener);
    if (!subscriptions.size) listeners.delete(sessionId);
  };
}

function publish(sessionId: string, state: AvailableOutfit | null) {
  for (const listener of listeners.get(sessionId) ?? []) listener(state);
}

export function invalidateWardrobe(sessionId: string) {
  publish(sessionId, null);
}

function ownedOutfit(value: unknown, sessionId: string): AvailableOutfit | null {
  const state = value as Partial<WardrobeState> | null;
  if (state?.sessionId !== sessionId || (state.access !== "admin" && state.access !== "subscriber")) return null;
  const outfit = parseWardrobeOutfit(state.itemIds, state.dynamiteRestore);
  return outfit && { ...outfit, access: state.access, sessionId };
}

export async function readWardrobe(sessionId: string, signal: AbortSignal) {
  const response = await fetch(wardrobeEndpoint, { cache: "no-store", signal });
  if ([401, 403, 404].includes(response.status)) return null;
  if (!response.ok) throw new Error("Ready’s saved wardrobe could not be loaded.");
  return ownedOutfit(await response.json(), sessionId);
}

export async function saveWardrobe(sessionId: string, outfit: WardrobeSelection, signal: AbortSignal) {
  // A save from a page being left must finish before the next page can save.
  const previous = pendingSaves.get(sessionId) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    signal.throwIfAborted();
    const response = await fetch(wardrobeEndpoint, {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, itemIds: outfit.itemIds, dynamiteRestore: outfit.dynamiteRestore }),
    });
    if ([401, 403, 404].includes(response.status)) {
      invalidateWardrobe(sessionId);
      return null;
    }
    if (!response.ok) throw new Error("Ready’s look could not be saved.");
    const saved = ownedOutfit(await response.json(), sessionId);
    if (!saved) throw new Error("The wardrobe session changed.");
    publish(sessionId, saved);
    return saved;
  });
  pendingSaves.set(sessionId, pending);
  try {
    return await pending;
  } finally {
    if (pendingSaves.get(sessionId) === pending) pendingSaves.delete(sessionId);
  }
}
