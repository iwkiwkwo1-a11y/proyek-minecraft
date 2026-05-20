// gacha_effects.js

export const WEAPON_EFFECTS = [
    { id: "poison_1", name: "Venom Strike", type: "weapon", rarity: "Rare", desc: "Peluang meracuni target." },
    { id: "frostbite", name: "Frostbite", type: "weapon", rarity: "Rare", desc: "Peluang slow dan weakness." },
    { id: "fire_aspect_x", name: "Hellfire", type: "weapon", rarity: "Epic", desc: "Membakar musuh parah." },
    { id: "abyssal_wither", name: "Abyssal Wither", type: "weapon", rarity: "Epic", desc: "Ledakan area wither." },
    { id: "thunderous_smite", name: "Thunderous Smite", type: "weapon", rarity: "Legendary", desc: "Sambar petir mematikan." },
    { id: "vampiric", name: "Vampiric Touch", type: "weapon", rarity: "Legendary", desc: "Lifesteal deras." },
    // Add many more later in main implementation
];

export const HELMET_EFFECTS = [
    { id: "night_owl", name: "Night Owl", type: "helmet", rarity: "Rare", desc: "Night Vision Permanen." },
    { id: "aqua_lung", name: "Gills of Atlantis", type: "helmet", rarity: "Epic", desc: "Water Breathing Permanen." },
    { id: "third_eye", name: "Third Eye", type: "helmet", rarity: "Legendary", desc: "Night Vision & Glowing Mobs." }
];

export const CHEST_EFFECTS = [
    { id: "iron_skin", name: "Iron Skin", type: "chest", rarity: "Rare", desc: "Resistance 1." },
    { id: "turtle_shell", name: "Turtle Shell", type: "chest", rarity: "Epic", desc: "Resistance 2 & Slowness." },
    { id: "dragon_scale", name: "Dragon Scale", type: "chest", rarity: "Legendary", desc: "Resistance 3 & Fire Resist." }
];

export const LEG_EFFECTS = [
    { id: "sturdy_legs", name: "Sturdy", type: "legs", rarity: "Rare", desc: "Sedikit extra HP." },
    { id: "tank_legs", name: "Behemoth", type: "legs", rarity: "Epic", desc: "Extra HP menengah." },
    { id: "colossus", name: "Colossus", type: "legs", rarity: "Legendary", desc: "Health Boost Maksimal." }
];

export const BOOT_EFFECTS = [
    { id: "swift_step", name: "Swiftness", type: "boots", rarity: "Rare", desc: "Speed 1." },
    { id: "frog_jump", name: "Frog Leap", type: "boots", rarity: "Epic", desc: "Jump Boost 2." },
    { id: "hermes_boots", name: "Boots of Hermes", type: "boots", rarity: "Legendary", desc: "Speed 3 & Jump 3." }
];

export const TOOL_EFFECTS = [
    { id: "miner_touch", name: "Dwarven Touch", type: "tool", rarity: "Rare", desc: "Haste 1 saat dipegang." },
    { id: "geo_master", name: "Geomancer", type: "tool", rarity: "Epic", desc: "Haste 2." },
    { id: "god_breaker", name: "World Breaker", type: "tool", rarity: "Legendary", desc: "Haste 4." }
];

export function getItemCategory(typeId) {
    if (typeId.includes("helmet")) return "helmet";
    if (typeId.includes("chestplate")) return "chest";
    if (typeId.includes("leggings")) return "legs";
    if (typeId.includes("boots")) return "boots";
    if (typeId.includes("sword") || typeId.includes("trident") || typeId.includes("mace")) return "weapon";
    if (typeId.includes("pickaxe") || typeId.includes("axe") || typeId.includes("shovel") || typeId.includes("hoe")) return "tool";
    return "invalid";
}

export function getEffectPool(category, rarityName) {
    let pool = [];
    if (category === "helmet") pool = HELMET_EFFECTS;
    else if (category === "chest") pool = CHEST_EFFECTS;
    else if (category === "legs") pool = LEG_EFFECTS;
    else if (category === "boots") pool = BOOT_EFFECTS;
    else if (category === "weapon") pool = WEAPON_EFFECTS;
    else if (category === "tool") pool = TOOL_EFFECTS;

    const filtered = pool.filter(e => `§${getFormatCode(e.rarity)}[${e.rarity}]` === rarityName || e.rarity === rarityName.replace(/§./g, '').replace(/\[|\]/g, ''));

    if (filtered.length === 0) return { id: "none", name: "Kosong", desc: "Tidak Ada Efek" };

    return filtered[Math.floor(Math.random() * filtered.length)];
}

function getFormatCode(rarityStr) {
    if (rarityStr === "Common") return "f";
    if (rarityStr === "Rare") return "a";
    if (rarityStr === "Epic") return "d";
    if (rarityStr === "Legendary") return "6§l";
    return "f";
}
