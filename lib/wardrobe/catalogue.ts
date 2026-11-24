export const readyWardrobeHref = "/dashboard?wardrobe=open#ready-wardrobe";
export const readyWardrobeOpenEvent = "ready-wardrobe:open";

export const wardrobeItems = [
  { id: "eyewear_smoked_aviators", name: "Smoked Aviators", slot: "eyes" },
  { id: "mouth_cigarette", name: "Cigarette", slot: "mouth" },
  { id: "face_swat_cheek_guard", name: "SWAT Cheek Guard", slot: "face" },
  { id: "headwear_wwii_full_face_helmet", name: "WWII Full-Face Helmet", slot: "replacement" },
  { id: "helmet_trim_wwii_paratrooper_net", name: "WWII Paratrooper Net", slot: "helmet" },
  { id: "headwear_tanker_beret", name: "Tanker Beret", slot: "replacement" },
  { id: "eyewear_field_veteran_eyepatch", name: "Field Veteran Eyepatch", slot: "eyes" },
  { id: "eyewear_protruding_eyes", name: "Protruding Eyes", slot: "eyes" },
  { id: "eyewear_tanker_dust_goggles", name: "Tanker Dust Goggles", slot: "eyes" },
  { id: "headwear_open_cranium", name: "Open Cranium", slot: "replacement" },
  { id: "mouth_diamond_grin", name: "Diamond Grin", slot: "teeth" },
  { id: "helmet_trim_lucky_dog_tags", name: "Lucky Dog Tags", slot: "helmet-side" },
  { id: "helmet_trim_ace_of_spades_helmet_band", name: "Ace of Spades Helmet Band", slot: "helmet" },
  { id: "headwear_australian_slouch_hat", name: "Australian Slouch Hat", slot: "replacement" },
  { id: "helmet_trim_dynamite_helmet_band", name: "Dynamite Helmet Band", slot: "helmet" },
  { id: "mouth_sparking_dynamite_stick", name: "Sparking Dynamite Stick", slot: "mouth" },
  { id: "face_clown_makeup", name: "Clown Makeup", slot: "paint" },
  { id: "headwear_flip_up_welding_mask", name: "Flip-Up Welding Mask", slot: "visor" },
  { id: "sergeant_majors_moustache", name: "Sergeant Major’s Moustache", slot: "hair" },
  { id: "tankers_crown", name: "Tanker’s Crown", slot: "helmet" },
] as const;

export type WardrobeItemId = (typeof wardrobeItems)[number]["id"];
export type WardrobeAccess = "locked" | "admin" | "subscriber";
export type WardrobeSelection = { itemIds: WardrobeItemId[]; dynamiteRestore?: WardrobeItemId[] | null };
export type WardrobeState = WardrobeSelection & {
  access: WardrobeAccess;
  sessionId: string | null;
};

export const emptyWardrobe: WardrobeState = { access: "locked", sessionId: null, itemIds: [] };
const entries = new Map(wardrobeItems.map(item => [item.id, item] as const));
const fullFace = "headwear_wwii_full_face_helmet";
const cigarette = "mouth_cigarette";
const stick = "mouth_sparking_dynamite_stick";
const band = "helmet_trim_dynamite_helmet_band";
const teeth = "mouth_diamond_grin";
const preset = [band, stick] as const;
const presetSlots = new Set(["mouth", "helmet", "replacement"]);

export function isWardrobeItem(value: unknown): value is WardrobeItemId {
  return typeof value === "string" && entries.has(value as WardrobeItemId);
}

export function pilotWardrobeItems(ids: WardrobeItemId[]): WardrobeItemId[] {
  return ids.filter(id => id === "eyewear_smoked_aviators" || id === cigarette || id === "face_clown_makeup");
}

export function parseWardrobeSelection(value: unknown): WardrobeItemId[] | null {
  if (!Array.isArray(value) || value.length > wardrobeItems.length || !value.every(isWardrobeItem)) return null;
  if (new Set(value).size !== value.length) return null;
  return value;
}

const slotOf = (id: WardrobeItemId) => entries.get(id)!.slot;

function uniqueSlots(ids: WardrobeItemId[]) {
  return new Set(ids.map(slotOf)).size === ids.length;
}

export function parseWardrobeOutfit(ids: unknown, restore: unknown): WardrobeSelection | null {
  const itemIds = parseWardrobeSelection(ids);
  if (!itemIds || !uniqueSlots(itemIds)) return null;
  if (restore === undefined || restore === null) return { itemIds };
  const previous = parseWardrobeSelection(restore);
  if (!previous || !uniqueSlots(previous) || !previous.every(id => presetSlots.has(slotOf(id))) ||
    !preset.every(id => itemIds.includes(id)) || itemIds.some(id => slotOf(id) === "replacement")) return null;
  return { itemIds, dynamiteRestore: previous };
}

export function itemConstraint(id: WardrobeItemId, ids: WardrobeItemId[]) {
  const replacement = ids.find(candidate => slotOf(candidate) === "replacement");
  if (replacement === fullFace && id !== replacement) return "Hidden by WWII Full-Face Helmet";
  if (replacement && ["helmet", "helmet-side", "visor"].includes(slotOf(id))) return "Requires the stock helmet";
  if (replacement && slotOf(id) === "mouth") return "Requires the stock helmet and repaired bite";
  if (id === teeth && (ids.includes(cigarette) || ids.includes(stick))) return "Requires the stock bite";
  return null;
}

export function visibleWardrobeItems({ itemIds }: WardrobeSelection) {
  return itemIds.filter(id => !itemConstraint(id, itemIds));
}

export function toggleWardrobeItem(outfit: WardrobeSelection, id: WardrobeItemId): WardrobeSelection {
  const changingPresetSlot = outfit.dynamiteRestore && presetSlots.has(slotOf(id));
  const itemIds = outfit.itemIds.includes(id)
    ? outfit.itemIds.filter(candidate => candidate !== id)
    : [...outfit.itemIds.filter(candidate => slotOf(candidate) !== slotOf(id)), id];
  return changingPresetSlot || !outfit.dynamiteRestore ? { itemIds } : { itemIds, dynamiteRestore: outfit.dynamiteRestore };
}

export function toggleDynamiteSet(outfit: WardrobeSelection): WardrobeSelection {
  const unchanged = outfit.itemIds.filter(id => !presetSlots.has(slotOf(id)));
  if (outfit.dynamiteRestore) return { itemIds: [...unchanged, ...outfit.dynamiteRestore] };
  return {
    itemIds: [...unchanged, ...preset],
    dynamiteRestore: outfit.itemIds.filter(id => presetSlots.has(slotOf(id))),
  };
}

export function wardrobeAssetUrl(itemId: WardrobeItemId, file: string) {
  return `/api/ready/wardrobe/assets/${itemId}/${file}`;
}
