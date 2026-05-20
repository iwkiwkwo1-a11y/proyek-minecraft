import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// Constants
export const CORE_PRICE = 100000;

export function getCoreScore(player) {
    const obj = world.scoreboard.getObjective("core");
    if (!obj) return 0;
    try {
        return obj.getScore(player) || 0;
    } catch {
        return 0;
    }
}

export function setCoreScore(player, score) {
    const obj = world.scoreboard.getObjective("core");
    if (obj) {
        obj.setScore(player, score);
    }
}


export function openGachaMenu(player) {
    const form = new ActionFormData();
    form.title("§5[ Gacha & Core ]");

    const coreCount = getCoreScore(player);
    form.body(`§fMata Uang Core: §b${coreCount} Core\n\n§7Gunakan Core untuk menggacha kekuatan senjata legendaris atau mendapatkan skill pasif tingkat dewa!`);

    form.button("§bTukar Rupiah -> Core\n§7Rp100.000 = 1 Core");
    form.button("§dGacha Senjata/Armor (Main Hand)\n§7Harga: 5 Core");
    form.button("§eGacha Pasif Dewa\n§7Harga: 10 Core");
    form.button("§cKembali ke Menu Utama");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) openConvertMenu(player);
        else if (res.selection === 1) openEquipmentGacha(player);
        else if (res.selection === 2) openPassiveGacha(player);
    });
}

const GACHA_COST_PASSIVE = 10; // Costs 10 Cores

export const PASSIVE_POOL = [
    { id: "fortitude", name: "🛡 Fortitude", desc: "Resistance Permanen" },
    { id: "agility", name: "💨 Agility", desc: "Speed & Jump Boost Permanen" },
    { id: "titans_grip", name: "⚔ Titan's Grip", desc: "Strength Permanen" },
    { id: "vitality", name: "❤ Vitality", desc: "Health Boost Permanen" },
    { id: "regeneration", name: "✨ Vigor", desc: "Regen HP Perlahan" }
];

import { getPlayerRpgData, savePlayerRpgData } from "./rpg_system.js";

export function openPassiveGacha(player) {
    const objCore = world.scoreboard.getObjective("core");
    let currentCore = 0;
    try { if (objCore) currentCore = objCore.getScore(player) || 0; } catch (e) {}

    if (currentCore < GACHA_COST_PASSIVE) {
        player.sendMessage(`§c[Gacha] Core tidak cukup! Butuh §b${GACHA_COST_PASSIVE} Core§c.`);
        return;
    }

    const rpgData = getPlayerRpgData(player);
    // Initialize if missing (for existing players before update)
    if (!rpgData.unlockedGachaPassives) rpgData.unlockedGachaPassives = [];

    if (rpgData.unlockedGachaPassives.length >= PASSIVE_POOL.length) {
        player.sendMessage("§c[Gacha] Kamu sudah memiliki semua Pasif Dewa yang tersedia saat ini!");
        return;
    }

    // Deduct Core
    objCore.setScore(player, currentCore - GACHA_COST_PASSIVE);

    // Filter pool to only give un-owned passives
    const availablePool = PASSIVE_POOL.filter(p => !rpgData.unlockedGachaPassives.includes(p.id));
    const rollIndex = Math.floor(Math.random() * availablePool.length);
    const wonPassive = availablePool[rollIndex];

    rpgData.unlockedGachaPassives.push(wonPassive.id);
    savePlayerRpgData(player, rpgData);

    // Server-side execution to bypass player permissions
    const px = Math.floor(player.location.x);
    const py = Math.floor(player.location.y);
    const pz = Math.floor(player.location.z);

    player.dimension.runCommandAsync(`summon fireworks_rocket ${px} ${py + 1} ${pz}`);
    player.dimension.runCommandAsync(`playsound random.levelup @a[x=${px},y=${py},z=${pz},r=10]`);
    player.dimension.runCommandAsync(`camerashake add @a[x=${px},y=${py},z=${pz},r=10] 0.5 1 positional`);

    world.sendMessage(`§5§l[GACHA DEWA] §r§fPemain §b${player.name} §fberhasil mendapatkan Pasif Dewa: §e${wonPassive.name}§f!`);
}

function openConvertMenu(player) {
    const form = new ModalFormData();
    form.title("§b[ Tukar Core ]");
    form.slider(`Berapa Core yang ingin dibeli?\n§7Harga: Rp${CORE_PRICE.toLocaleString("id-ID")} / Core`, 1, 64, 1, 1);

    form.show(player).then(res => {
        if (res.canceled) return;

        const amount = Math.floor(res.formValues[0]);
        const cost = amount * CORE_PRICE;

        // Dynamic import workaround since getScore is inside main.js and causes circular dependency if heavily nested.
        // We will refactor score logic if needed, but for now we use world.scoreboard directly.
        const objDompet = world.scoreboard.getObjective("dompet");
        const objCore = world.scoreboard.getObjective("core");
        if (!objDompet || !objCore) return;

        let currentRupiah = 0;
        try { currentRupiah = objDompet.getScore(player) || 0; } catch (e) {}

        if (currentRupiah >= cost) {
            objDompet.setScore(player, currentRupiah - cost);
            let currentCore = 0;
            try { currentCore = objCore.getScore(player) || 0; } catch (e) {}
            objCore.setScore(player, currentCore + amount);

            player.sendMessage(`§a[System] Berhasil membeli §b${amount} Core §aseharga §eRp${cost.toLocaleString("id-ID")}!`);
        } else {
            player.sendMessage(`§c[System] Rupiah kamu tidak cukup! Butuh Rp${cost.toLocaleString("id-ID")}.`);
        }
    });
}

const GACHA_COST_EQUIPMENT = 5; // Costs 5 Cores

const RARITIES = [
    { name: "§f[Common]", weight: 74.99, effect: "none" },
    { name: "§a[Rare]", weight: 20, effect: "frostbite" },
    { name: "§d[Epic]", weight: 5, effect: "abyssal_wither" },
    { name: "§6§l[Legendary]", weight: 0.01, effect: "thunderous_smite" }
];

function getRandomRarity() {
    const totalWeight = RARITIES.reduce((acc, r) => acc + r.weight, 0);
    let randomNum = Math.random() * totalWeight;
    for (const rarity of RARITIES) {
        if (randomNum < rarity.weight) return rarity;
        randomNum -= rarity.weight;
    }
    return RARITIES[0];
}

export function openEquipmentGacha(player) {
    const invComponent = player.getComponent("inventory");
    if (!invComponent) return;
    const inv = invComponent.container;
    const selectedSlot = player.selectedSlotIndex;
    const item = inv.getItem(selectedSlot);

    if (!item) {
        player.sendMessage("§c[Gacha] Kamu harus memegang senjata atau armor di tangan utama (Main Hand)!");
        return;
    }

    // Simplistic check to ensure it's a gear piece
    const isGear = item.typeId.includes("sword") || item.typeId.includes("axe") || item.typeId.includes("helmet") || item.typeId.includes("chestplate") || item.typeId.includes("leggings") || item.typeId.includes("boots");

    if (!isGear) {
        player.sendMessage("§c[Gacha] Barang di tanganmu bukan senjata atau armor yang valid!");
        return;
    }

    const objCore = world.scoreboard.getObjective("core");
    let currentCore = 0;
    try { if (objCore) currentCore = objCore.getScore(player) || 0; } catch (e) {}

    if (currentCore < GACHA_COST_EQUIPMENT) {
        player.sendMessage(`§c[Gacha] Core tidak cukup! Butuh §b${GACHA_COST_EQUIPMENT} Core§c.`);
        return;
    }

    // Deduct Core
    objCore.setScore(player, currentCore - GACHA_COST_EQUIPMENT);

    // Perform Gacha
    const rarity = getRandomRarity();

    // Apply dynamic property to item
    item.setDynamicProperty("gacha_effect", rarity.effect);

    // Update Lore to display effect
    let effectText = "";
    if (rarity.effect === "frostbite") effectText = "§bFrostbite (Slow & Damage)";
    if (rarity.effect === "abyssal_wither") effectText = "§8Abyssal Wither (Wither Area)";
    if (rarity.effect === "thunderous_smite") effectText = "§eThunderous Smite (Petir OP)";
    if (rarity.effect === "none") effectText = "§7Kosong";

    const newLore = [
        `§r${rarity.name}`,
        `§r§7Kekuatan Gacha: ${effectText}`
    ];
    item.setLore(newLore);

    // Save item back to inventory
    inv.setItem(selectedSlot, item);

    // Animations & Feedback
    if (rarity.name.includes("Epic") || rarity.name.includes("Legendary")) {
        const px = Math.floor(player.location.x);
        const py = Math.floor(player.location.y);
        const pz = Math.floor(player.location.z);

        player.dimension.runCommandAsync(`summon fireworks_rocket ${px} ${py + 1} ${pz}`);
        player.dimension.runCommandAsync(`playsound random.levelup @a[x=${px},y=${py},z=${pz},r=10]`);
        player.dimension.runCommandAsync(`camerashake add @a[x=${px},y=${py},z=${pz},r=10] 0.5 1 positional`);

        world.sendMessage(`§6§l[GACHA] §r§fPemain §b${player.name} §fbaru saja mendapatkan senjata §l${rarity.name} §fberkekuatan §e${effectText}§f!`);
    } else {
        player.sendMessage(`§a[Gacha] Sukses menyihir barang! Kamu mendapatkan grade ${rarity.name}.`);
        player.dimension.runCommandAsync(`playsound random.orb @a[x=${Math.floor(player.location.x)},y=${Math.floor(player.location.y)},z=${Math.floor(player.location.z)},r=5]`);
    }
}
