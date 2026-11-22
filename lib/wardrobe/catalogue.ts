export const wardrobeItems = [
  { id: "eyewear_smoked_aviators", name: "Smoked Aviators" },
  { id: "mouth_cigarette", name: "Cigarette" },
  { id: "face_clown_makeup", name: "Clown Makeup" },
] as const;

export type WardrobeItemId = (typeof wardrobeItems)[number]["id"];
export type WardrobeAccess = "locked" | "admin" | "subscriber";
export type WardrobeState = {
  access: WardrobeAccess;
  sessionId: string | null;
  itemIds: WardrobeItemId[];
};

export const emptyWardrobe: WardrobeState = { access: "locked", sessionId: null, itemIds: [] };

export function isWardrobeItem(value: unknown): value is WardrobeItemId {
  return wardrobeItems.some(({ id }) => id === value);
}

export function parseWardrobeSelection(value: unknown): WardrobeItemId[] | null {
  if (!Array.isArray(value) || value.length > wardrobeItems.length || !value.every(isWardrobeItem)) return null;
  if (new Set(value).size !== value.length) return null;
  return value;
}

export function wardrobeAssetUrl(itemId: WardrobeItemId, file: string) {
  return `/api/ready/wardrobe/assets/${itemId}/${file}`;
}
