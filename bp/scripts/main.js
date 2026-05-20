import { world, system, ItemStack, ItemLockMode, EnchantmentTypes } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { EconomyConfig } from "./economy_config.js";
import { getPlayerRpgData, getXpRequired, generateXpBar, applyPassiveStats, addXp, breakBlockArea, canUseActiveSkill } from "./rpg_system.js";
import { formatRupiah } from "./utils.js";

// Initialize Objective
system.run(() => {
    try {
        if (!world.scoreboard.getObjective("dompet")) {
            world.scoreboard.addObjective("dompet", "§e§lPRO SURVIVAL");
        }
        if (!world.scoreboard.getObjective("core")) {
            world.scoreboard.addObjective("core", "§b§lCORE");
        }
    } catch (e) {
        // Ignore if it already exists or errors
    }
});

// Shop Rotation State
let currentShopItems = [];
let nextRefreshTime = Date.now() + 60000; // 1 minute from now

function refreshShop() {
    const normalKeys = Object.keys(EconomyConfig.buyPoolNormal);
    const opKeys = Object.keys(EconomyConfig.buyPoolOP);

    // Shuffle arrays
    normalKeys.sort(() => 0.5 - Math.random());
    opKeys.sort(() => 0.5 - Math.random());

    currentShopItems = [];

    // Pick 29 random normal items
    const selectedNormals = normalKeys.slice(0, 29);
    for (const key of selectedNormals) {
        currentShopItems.push({ id: key, price: EconomyConfig.buyPoolNormal[key], isOP: false });
    }

    // Pick 1 random OP item
    const selectedOP = opKeys[0];
    currentShopItems.push({ id: selectedOP, price: EconomyConfig.buyPoolOP[selectedOP], isOP: true });

    // Shuffle the final list so the OP item isn't always last
    currentShopItems.sort(() => 0.5 - Math.random());

    nextRefreshTime = Date.now() + 60000;
}

// Initial shop load
refreshShop();

// Shop Rotation Timer (Checks every 20 ticks)
system.runInterval(() => {
    if (Date.now() >= nextRefreshTime) {
        refreshShop();
        world.sendMessage("§e[Shop] §fBarang jualan di Menu Beli telah diperbarui! Cek sekarang!");
    }
}, 20);

function getScore(player, objectiveId) {
    const obj = world.scoreboard.getObjective(objectiveId);
    if (!obj) return 0;
    try {
        return obj.getScore(player.scoreboardIdentity) || 0;
    } catch {
        return 0;
    }
}

function setScore(player, objectiveId, score) {
    const obj = world.scoreboard.getObjective(objectiveId);
    if (obj) {
        obj.setScore(player, score);
    }
}

// Actionbar Loop & Visibility Tracker
const hiddenBoards = new Map();

system.runInterval(() => {
    const players = world.getAllPlayers();
    const online = players.length;
    for (const player of players) {
        // Passive Stats application (runs constantly regardless of actionbar visibility)
        const rpgData = getPlayerRpgData(player);
        applyPassiveStats(player, rpgData);

        if (hiddenBoards.get(player.name)) continue;

        const score = getScore(player, "dompet");
        const coreScore = getScore(player, "core");
        let actionbarText = `§e§lDOMPET: §f${formatRupiah(score)} §8| §b§lCORE: §f${coreScore} §8| §aOnline: ${online}`;

        // Check if player earned XP recently (within last 3 seconds)
        try {
            const recentStr = player.getDynamicProperty("rpg_recent_xp");
            if (recentStr && typeof recentStr === 'string') {
                const recent = JSON.parse(recentStr);
                if (Date.now() - recent.time < 3000) {
                    const prof = recent.prof;
                    const lv = rpgData[prof].level;
                    const xp = rpgData[prof].xp;
                    const req = getXpRequired(lv);
                    const pct = req === Infinity ? "MAX" : Math.floor((xp / req) * 100) + "%";
                    const bar = req === Infinity ? "§b||||||||||||||||||||" : generateXpBar(xp, req);
                    actionbarText = `§e${prof.toUpperCase()} Lv.${lv} §f[${bar}§f] §a${pct}`;
                }
            }
        } catch(e) {}

        player.onScreenDisplay.setActionBar(actionbarText);
    }
}, 20);

// Command handling via /scriptevent since chatSend is not in stable v1.13.0
// Players can type: /scriptevent ekonomi:hideboard or /scriptevent ekonomi:showboard
system.afterEvents.scriptEventReceive.subscribe((event) => {
    const id = event.id;
    const player = event.sourceEntity;

    // We only process if it's from a player
    if (!player || player.typeId !== "minecraft:player") return;

    if (id === "ekonomi:hideboard") {
        hiddenBoards.set(player.name, true);
        player.onScreenDisplay.setActionBar(""); // Clear actionbar immediately
        player.sendMessage("§a[System] Actionbar disembunyikan. Ketik /scriptevent ekonomi:showboard untuk menampilkan kembali.");
    } else if (id === "ekonomi:showboard") {
        hiddenBoards.set(player.name, false);
        player.sendMessage("§a[System] Actionbar ditampilkan.");
    }
}, { namespaces: ["ekonomi"] });

// Give Shop Clock and Guide Book on Spawn
world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;

    // Only give initial items if this is the player's first time spawning (or respawning without the items)
    // In a real server, we might want to track first join using tags, but checking for the item works for returning it if lost.
    system.runTimeout(() => {
        const inventoryComponent = player.getComponent("inventory");
        if (!inventoryComponent) return;
        const inventory = inventoryComponent.container;
        if (!inventory) return;

        let hasShop = false;
        let hasGuideBook = false;

        // Search all slots for the shop clock and guide book
        for (let i = 0; i < inventory.size; i++) {
            const item = inventory.getItem(i);
            if (item) {
                if (item.typeId === "minecraft:clock" && item.nameTag === "§e§lMenu Utama") hasShop = true;
                if (item.typeId === "minecraft:book" && item.nameTag === "§a§lBuku Panduan") hasGuideBook = true;
            }
        }

        if (!hasShop) {
            const clock = new ItemStack("minecraft:clock", 1);
            clock.nameTag = "§e§lMenu Utama";

            // Set lock mode to prevent dropping
            if (typeof ItemLockMode !== 'undefined' && ItemLockMode.inventory) {
                clock.lockMode = ItemLockMode.inventory;
            } else {
                clock.lockMode = "inventory";
            }

            // Attempt to add unbreaking 1 for glow
            try {
                const enchantable = clock.getComponent("enchantable") || clock.getComponent("minecraft:enchantable");
                if (enchantable) {
                    const unbreakingType = EnchantmentTypes.get("unbreaking");
                    if (unbreakingType) {
                        enchantable.addEnchantment({ type: unbreakingType, level: 1 });
                    }
                }
            } catch (e) {}

            const slot8Item = inventory.getItem(8);
            if (slot8Item) {
                let emptySlot = -1;
                for (let i = 0; i < 36; i++) {
                    if (!inventory.getItem(i)) {
                        emptySlot = i;
                        break;
                    }
                }

                if (emptySlot !== -1) {
                    inventory.setItem(emptySlot, slot8Item);
                    inventory.setItem(8, clock);
                } else {
                    player.sendMessage("§c[System] Tas lu penuh, gabisa ngasih Jam Menu Utama! Kosongin slot dulu, cuy.");
                }
            } else {
                inventory.setItem(8, clock);
            }
        }

        if (!hasGuideBook && !player.hasTag("has_received_guide")) {
            const book = new ItemStack("minecraft:book", 1);
            book.nameTag = "§a§lBuku Panduan";

            let emptySlot = -1;
            for (let i = 0; i < 36; i++) {
                if (!inventory.getItem(i)) {
                    emptySlot = i;
                    break;
                }
            }
            if (emptySlot !== -1) {
                inventory.setItem(emptySlot, book);
                player.addTag("has_received_guide");
            }
        }
    }, 10);
});

// Open Menu / Guidebook on Item Use
world.beforeEvents.itemUse.subscribe((event) => {
    const { itemStack, source } = event;
    if (itemStack.typeId === "minecraft:clock" && itemStack.nameTag === "§e§lMenu Utama") {
        event.cancel = true;
        system.run(() => {
            openMainMenu(source);
        });
    } else if (itemStack.typeId === "minecraft:book" && itemStack.nameTag === "§a§lBuku Panduan") {
        event.cancel = true;
        system.run(() => {
            openGuideBook(source);
        });
    }
});

// UI Logic - Guidebook
function openGuideBook(player) {
    const form = new ActionFormData();
    form.title("§a§lBuku Panduan Server");
    form.body("Selamat datang di Server Survival PRO!\n\n§e[1] Toko Dinamis & Jual Barang§f\nJam Menu Utama memutar 30 barang acak (ada barang OP juga!) setiap 1 menit. Jual hasil panen dan tambangmu untuk mendapatkan Rupiah.\n\n§e[2] RPG & Leveling§f\nDapatkan XP dengan nambang (Mining), nebang pohon (Woodcutting), dan bunuh monster (Slayer). Kumpulkan Skill Point (SP) untuk beli skill aktif di Menu RPG!\n\n§e[3] Gacha & Core§f\nTukar Rupiah menjadi Core. Gunakan Core untuk gacha Pasif Dewa permanen, atau gacha sihir kekuatan pada senjata utamamu!\n\n§e[4] Kelola Skill§f\nKamu maksimal hanya bisa memakai 2 Skill Aktif RPG dan 3 Pasif Gacha secara bersamaan. Atur kombinasimu di menu 'Kelola Semua Skill'.\n\nSelamat bermain dan semoga sukses, cuy!");
    form.button("§cTutup");
    form.show(player);
}

// UI Logic - Main Menu
function openMainMenu(player) {
    const form = new ActionFormData();
    form.title("§1[ Server Menu Utama ]");
    form.button("§e§lMenu Beli Barang\n§7Klik untuk beli kebutuhan");
    form.button("§a§lMenu Jual Barang\n§7Pindah & Filter Rupiah");
    form.button("§b§lTransfer Rupiah\n§7Kirim Rupiah ke pemain lain");
    form.button("§c§lSistem Bounty\n§7Pasang buronan");
    form.button("§6§lTop Sultan\n§7Peringkat pemain terkaya");
    form.button("§d§lMenu RPG & Skill\n§7Level & Kemampuan Aktif");
    form.button("§5§lGacha & Core\n§7Sihir Senjata & Pasif Dewa");
    form.button("§4§lTroll Pemain\n§7Jahilin temanmu (Rp1 Juta)");

    form.show(player).then((response) => {
        if (response.canceled) return;
        switch (response.selection) {
            case 0:
                openBuyMenu(player);
                break;
            case 1:
                processSellAll(player);
                break;
            case 2:
                openTransferMenu(player);
                break;
            case 3:
                openBountyMenu(player);
                break;
            case 4:
                openTopKoinMenu(player);
                break;
            case 5:
                openRpgMenu(player);
                break;
            case 6:
                openGachaMenu(player);
                break;
            case 7:
                openTrollMenu(player);
                break;
        }
    });
}

import { openGachaMenu } from "./gacha_system.js";
import { openTrollMenu } from "./troll_system.js";

function openRpgMenu(player) {
    const rpgData = getPlayerRpgData(player);
    const form = new ActionFormData();
    form.title("§d[ Profil RPG & Skill ]");

    let statsStr = `§fSkill Points (SP): §e${rpgData.sp}\n`;
    statsStr += `\n§e⛏ Mining: §fLv.${rpgData.mining.level} §7(${rpgData.mining.xp}/${getXpRequired(rpgData.mining.level)} XP)\n`;
    statsStr += `§a🪓 Woodcutting: §fLv.${rpgData.woodcutting.level} §7(${rpgData.woodcutting.xp}/${getXpRequired(rpgData.woodcutting.level)} XP)\n`;
    statsStr += `§c⚔ Slayer: §fLv.${rpgData.slayer.level} §7(${rpgData.slayer.xp}/${getXpRequired(rpgData.slayer.level)} XP)\n`;

    statsStr += `\n§bAktif Skill RPG (Max 2): \n`;
    if (rpgData.equippedSkills.length === 0) {
        statsStr += "§7- Belum ada yang di-equip\n";
    } else {
        for (const skill of rpgData.equippedSkills) {
            statsStr += `§b- ${skill.toUpperCase()}\n`;
        }
    }

    statsStr += `\n§dPasif Gacha (Max 3): \n`;
    const eqPassives = rpgData.equippedGachaPassives || [];
    if (eqPassives.length === 0) {
        statsStr += "§7- Belum ada pasif dewa yang di-equip\n";
    } else {
        for (const passive of eqPassives) {
            statsStr += `§d- ${passive.toUpperCase()}\n`;
        }
    }

    form.body(statsStr);

    form.button("§eSkill Tree (Beli Skill)\n§7Tukar SP dengan Skill Baru");
    form.button("§aKelola Semua Skill\n§7Pasang Skill & Pasif Dewamu");
    form.button("§cKembali ke Menu Utama");

    form.show(player).then((res) => {
        if (res.canceled) return;
        if (res.selection === 0) openSkillTreeMenu(player);
        else if (res.selection === 1) openEquipUnifiedMenu(player);
        else if (res.selection === 2) openMainMenu(player);
    });
}

import { PASSIVE_POOL } from "./gacha_system.js";

const AVAILABLE_SKILLS = [
    { id: "ore_excavation", name: "⛏ Ore Excavation (Mining)", desc: "Hancurkan 3x3x3 blok batu/ore sekaligus dengan jongkok.", cost: 15 },
    { id: "lumberjacks_sweep", name: "🪓 Lumberjack's Sweep (Woodcutting)", desc: "Tebang 3x3x3 blok kayu sekaligus dengan jongkok.", cost: 15 },
    { id: "siphon_strike", name: "⚔ Siphon Strike (Slayer)", desc: "Menyembuhkan HP saat membunuh monster dengan jongkok.", cost: 20 }
];

import { savePlayerRpgData } from "./rpg_system.js";

function openSkillTreeMenu(player) {
    const rpgData = getPlayerRpgData(player);
    const form = new ActionFormData();
    form.title("§e[ Beli Skill ]");
    form.body(`Sisa Skill Point (SP): §e${rpgData.sp}\n\nPilih skill yang ingin kamu pelajari:`);

    for (const skill of AVAILABLE_SKILLS) {
        if (rpgData.unlockedSkills.includes(skill.id)) {
            form.button(`§a${skill.name}\n§7[Sudah Dimiliki]`);
        } else {
            form.button(`§c${skill.name}\n§7[Harga: ${skill.cost} SP]`);
        }
    }
    form.button("§cKembali");

    form.show(player).then((res) => {
        if (res.canceled) return;
        if (res.selection === AVAILABLE_SKILLS.length) {
            openRpgMenu(player);
            return;
        }

        const selected = AVAILABLE_SKILLS[res.selection];
        if (rpgData.unlockedSkills.includes(selected.id)) {
            player.sendMessage(`§c[RPG] Kamu sudah memiliki skill ${selected.name}!`);
            openSkillTreeMenu(player);
            return;
        }

        if (rpgData.sp < selected.cost) {
            player.sendMessage(`§c[RPG] Skill Point kamu tidak cukup untuk membeli ${selected.name}!`);
            openSkillTreeMenu(player);
            return;
        }

        // Purchase logic
        rpgData.sp -= selected.cost;
        rpgData.unlockedSkills.push(selected.id);
        savePlayerRpgData(player, rpgData);
        player.sendMessage(`§a[RPG] Berhasil mempelajari skill ${selected.name}!`);
        openSkillTreeMenu(player);
    });
}

function openEquipUnifiedMenu(player) {
    const rpgData = getPlayerRpgData(player);
    const unlockedActives = rpgData.unlockedSkills || [];
    const unlockedPassives = rpgData.unlockedGachaPassives || [];

    if (unlockedActives.length === 0 && unlockedPassives.length === 0) {
        player.sendMessage("§c[RPG] Kamu belum memiliki Skill Aktif (dari Level) maupun Pasif Dewa (dari Gacha)!");
        return;
    }

    const form = new ModalFormData();
    form.title("§a[ Kelola Skill & Pasif ]");

    // 1. Add toggles for Active Skills
    for (const skillId of unlockedActives) {
        const skillInfo = AVAILABLE_SKILLS.find(s => s.id === skillId);
        const isEquipped = rpgData.equippedSkills.includes(skillId);
        form.toggle(`§b(Aktif) §r${skillInfo ? skillInfo.name : skillId}`, isEquipped);
    }

    // 2. Add toggles for Gacha Passives
    for (const passiveId of unlockedPassives) {
        const passiveInfo = PASSIVE_POOL.find(p => p.id === passiveId);
        const isEquipped = (rpgData.equippedGachaPassives || []).includes(passiveId);
        form.toggle(`§d(Pasif) §r${passiveInfo ? passiveInfo.name : passiveId}`, isEquipped);
    }

    form.show(player).then((res) => {
        if (res.canceled) return;

        let newActiveEquipped = [];
        let newPassiveEquipped = [];

        let currentIndex = 0;

        // Parse Active Skills responses
        for (let i = 0; i < unlockedActives.length; i++) {
            if (res.formValues[currentIndex] === true) {
                newActiveEquipped.push(unlockedActives[i]);
            }
            currentIndex++;
        }

        // Parse Passive Skills responses
        for (let i = 0; i < unlockedPassives.length; i++) {
            if (res.formValues[currentIndex] === true) {
                newPassiveEquipped.push(unlockedPassives[i]);
            }
            currentIndex++;
        }

        let hasError = false;

        if (newActiveEquipped.length > 2) {
            player.sendMessage("§c[RPG] Kamu melebihi batas! Maksimal 2 Skill Aktif.");
            hasError = true;
        }

        if (newPassiveEquipped.length > 3) {
            player.sendMessage("§c[RPG] Kamu melebihi batas! Maksimal 3 Pasif Dewa.");
            hasError = true;
        }

        if (!hasError) {
            rpgData.equippedSkills = newActiveEquipped;
            rpgData.equippedGachaPassives = newPassiveEquipped;
            savePlayerRpgData(player, rpgData);
            player.sendMessage("§a[RPG] Susunan Skill & Pasif Dewa berhasil diperbarui!");
        }
    });
}


function openTransferMenu(player) {
    const onlinePlayers = world.getAllPlayers().filter(p => p.name !== player.name);
    if (onlinePlayers.length === 0) {
        player.sendMessage("§c[System] Tidak ada pemain lain yang online untuk ditransfer.");
        return;
    }

    const playerNames = onlinePlayers.map(p => p.name);
    const form = new ModalFormData();
    form.title("§b[ Transfer Rupiah ]");
    form.dropdown("Pilih Pemain:", playerNames);
    form.textField("Jumlah Rupiah:", "Contoh: 100");

    form.show(player).then((response) => {
        if (response.canceled) return;

        const targetIndex = response.formValues[0];
        const amountStr = response.formValues[1];
        const amount = parseInt(amountStr);

        if (isNaN(amount) || amount <= 0) {
            player.sendMessage("§c[System] Jumlah Rupiah tidak valid!");
            return;
        }

        const currentCoins = getScore(player, "dompet");
        if (currentCoins < amount) {
            player.sendMessage("§c[System] Rupiah lu gak cukup buat transfer segitu, cuy!");
            return;
        }

        const targetPlayerName = playerNames[targetIndex];
        const targetPlayer = world.getAllPlayers().find(p => p.name === targetPlayerName);

        if (!targetPlayer) {
            player.sendMessage("§c[System] Pemain target tidak ditemukan atau sudah offline.");
            return;
        }

        setScore(player, "dompet", currentCoins - amount);
        const targetCoins = getScore(targetPlayer, "dompet");
        setScore(targetPlayer, "dompet", targetCoins + amount);

        player.sendMessage(`§a[System] Berhasil mentransfer §e${formatRupiah(amount)} §ake §b${targetPlayer.name}§a.`);
        targetPlayer.sendMessage(`§a[System] Kamu menerima §e${formatRupiah(amount)} §adari §b${player.name}§a.`);
    });
}

// Helper functions to persist bounties across server restarts
function loadBounties() {
    try {
        const data = world.getDynamicProperty("active_bounties");
        if (data && typeof data === 'string') {
            return JSON.parse(data);
        }
    } catch(e) {}
    return {};
}

function saveBounties(bountiesObj) {
    world.setDynamicProperty("active_bounties", JSON.stringify(bountiesObj));
}

// Global variable to store active bounties loaded from persistent storage
// Structure: { "TargetPlayerName": { amount: number, setter: "SetterName" } }
let activeBounties = loadBounties();

function openBountyMenu(player) {
    const form = new ActionFormData();
    form.title("§c[ Sistem Bounty ]");
    form.button("§ePasang Bounty Baru\n§7Taruh harga buronan");
    form.button("§aLihat Daftar Bounty\n§7Cek siapa saja yang diincar");

    form.show(player).then((response) => {
        if (response.canceled) return;
        if (response.selection === 0) {
            openSetBountyMenu(player);
        } else if (response.selection === 1) {
            openListBountyMenu(player);
        }
    });
}

function openSetBountyMenu(player) {
    const onlinePlayers = world.getAllPlayers().filter(p => p.name !== player.name);
    if (onlinePlayers.length === 0) {
        player.sendMessage("§c[System] Tidak ada pemain lain yang online untuk dijadikan buronan.");
        return;
    }

    const playerNames = onlinePlayers.map(p => p.name);
    const form = new ModalFormData();
    form.title("§c[ Pasang Bounty ]");
    form.dropdown("Pilih Target Buronan:", playerNames);
    form.textField("Harga Bounty (Rupiah):", "Contoh: 500");

    form.show(player).then((response) => {
        if (response.canceled) return;

        const targetIndex = response.formValues[0];
        const amountStr = response.formValues[1];
        const amount = parseInt(amountStr);

        if (isNaN(amount) || amount <= 0) {
            player.sendMessage("§c[System] Jumlah Rupiah tidak valid!");
            return;
        }

        const currentCoins = getScore(player, "dompet");
        if (currentCoins < amount) {
            player.sendMessage("§c[System] Rupiah lu gak cukup buat masang bounty segitu!");
            return;
        }

        const targetPlayerName = playerNames[targetIndex];

        // Deduct coins
        setScore(player, "dompet", currentCoins - amount);

        // Add to active bounties and save to world properties
        if (activeBounties[targetPlayerName]) {
            activeBounties[targetPlayerName].amount += amount;
        } else {
            activeBounties[targetPlayerName] = { amount: amount, setter: player.name };
        }
        saveBounties(activeBounties);

        world.sendMessage(`§c§l[BOUNTY] §r§e${player.name} §ftelah memasang harga buronan sebesar §a${formatRupiah(amount)} §funtuk kepala §c${targetPlayerName}§f!`);
    });
}

function openListBountyMenu(player) {
    const form = new ActionFormData();
    form.title("§c[ Daftar Buronan ]");

    const targets = Object.keys(activeBounties);
    if (targets.length === 0) {
        form.body("§7Saat ini tidak ada pemain yang menjadi buronan.");
    } else {
        let bodyText = "Daftar pemain yang sedang diincar:\n\n";
        for (const target of targets) {
            bodyText += `§c- ${target} §f(Harga: §e${formatRupiah(activeBounties[target].amount)}§f)\n`;
        }
        form.body(bodyText);
    }

    form.button("§aKembali");
    form.show(player).then(res => {
        if (!res.canceled) {
            openBountyMenu(player);
        }
    });
}

// RPG Triggers: Block Breaking (Mining & Woodcutting)
world.afterEvents.playerBreakBlock.subscribe((event) => {
    const { player, brokenBlockPermutation, block } = event;
    const typeId = brokenBlockPermutation.type.id;

    // Categorize block types
    const isWood = typeId.includes("log") || typeId.includes("stem") || typeId.includes("wood");
    const isOre = typeId.includes("ore") || typeId.includes("stone") || typeId.includes("basalt") || typeId.includes("granite") || typeId.includes("diorite") || typeId.includes("andesite") || typeId.includes("netherrack");

    const rpgData = getPlayerRpgData(player);

    if (isWood) {
        // Base XP: 5 per log
        addXp(player, "woodcutting", 5);

        // Active Skill: Timber (Breaks a 3x3x3 area of logs if sneaking, equipped, and off cooldown)
        if (player.isSneaking && rpgData.equippedSkills.includes("lumberjacks_sweep")) {
            if (canUseActiveSkill(player.name, "lumberjacks_sweep", 5000)) { // 5 second cooldown
                const broken = breakBlockArea(player, block, 1, typeId);
                if (broken > 0) {
                    player.sendMessage(`§a[Skill] §fTimber aktif! Menghancurkan §e${broken} balok kayu§f.`);
                    addXp(player, "woodcutting", broken * 5); // Give XP for the destroyed logs too
                }
            } else {
                player.onScreenDisplay.setActionBar("§cSkill 'Timber' masih cooldown!");
            }
        }
    } else if (isOre) {
        // Base XP: 3 per stone/ore
        addXp(player, "mining", 3);

        // Active Skill: Vein Miner (Breaks a 3x3x3 area of ores if sneaking, equipped, and off cooldown)
        if (player.isSneaking && rpgData.equippedSkills.includes("ore_excavation")) {
            if (canUseActiveSkill(player.name, "ore_excavation", 10000)) { // 10 second cooldown
                const broken = breakBlockArea(player, block, 1, typeId);
                if (broken > 0) {
                    player.sendMessage(`§a[Skill] §fVein Miner aktif! Menghancurkan §e${broken} blok mineral§f.`);
                    addXp(player, "mining", broken * 3);
                }
            } else {
                player.onScreenDisplay.setActionBar("§cSkill 'Vein Miner' masih cooldown!");
            }
        }
    }
});

// Handle RPG Slayer XP and Bounty claims on Entity death
world.afterEvents.entityDie.subscribe((event) => {
    const deadEntity = event.deadEntity;
    const damageSource = event.damageSource;
    const killer = damageSource.damagingEntity;

    // Check if there is a killer and the killer is a player
    if (killer && killer.typeId === "minecraft:player") {
        const killerPlayer = killer;

        // RPG Slayer XP logic (For non-player entity kills)
        const isMonster = !deadEntity.typeId.includes("player") && !deadEntity.typeId.includes("item");
        if (isMonster) {
            // Base XP: 10 per mob kill
            addXp(killerPlayer, "slayer", 10);

            const rpgData = getPlayerRpgData(killerPlayer);
            // Active Skill: Lifesteal (Heals player if sneaking, equipped, and off cooldown)
            if (killerPlayer.isSneaking && rpgData.equippedSkills.includes("siphon_strike")) {
                if (canUseActiveSkill(killerPlayer.name, "siphon_strike", 15000)) { // 15s cooldown
                    killerPlayer.addEffect("instant_health", 1, { amplifier: 0, showParticles: true });
                    killerPlayer.sendMessage("§a[Skill] §fLifesteal aktif! HP dipulihkan.");
                }
            }
        }

        // Check if the dead entity is a player for Bounty claims
        if (deadEntity.typeId === "minecraft:player") {
            const deadPlayerName = deadEntity.name;

            if (activeBounties[deadPlayerName] && killerPlayer.name !== deadPlayerName) {
                const bountyData = activeBounties[deadPlayerName];
                const bountyAmount = bountyData.amount;

                // Give reward to killer
                const killerCoins = getScore(killerPlayer, "dompet");
                setScore(killerPlayer, "dompet", killerCoins + bountyAmount);

                // Announce to world
                world.sendMessage(`§c§l[BOUNTY CLAIMED] §r§b${killerPlayer.name} §ftelah membunuh buronan §c${deadPlayerName} §fdan mendapatkan hadiah §e${formatRupiah(bountyAmount)}§f!`);

                // Remove bounty and save state
                delete activeBounties[deadPlayerName];
                saveBounties(activeBounties);
            }
        }
    }
});

function openTopKoinMenu(player) {
    const obj = world.scoreboard.getObjective("dompet");
    if (!obj) {
        player.sendMessage("§c[System] Scoreboard belum siap.");
        return;
    }

    try {
        const scores = obj.getScores();
        // Sort descending
        scores.sort((a, b) => b.score - a.score);

        const form = new ActionFormData();
        form.title("§6[ Peringkat Top Sultan ]");

        let bodyText = "§eTop 10 Pemain Terkaya Server:\n\n";

        const maxDisplay = Math.min(10, scores.length);
        for (let i = 0; i < maxDisplay; i++) {
            const scoreInfo = scores[i];
            const identity = scoreInfo.participant;
            // Only show Player identities (optional, but good for filtering fake players if any)
            if (identity.type === "Player") {
                bodyText += `§f${i + 1}. §b${identity.displayName} §7- §e${formatRupiah(scoreInfo.score)}\n`;
            } else {
                bodyText += `§f${i + 1}. §b${identity.displayName} §7- §e${formatRupiah(scoreInfo.score)}\n`;
            }
        }

        form.body(bodyText);
        form.button("§cTutup");
        form.show(player);
    } catch (e) {
        player.sendMessage("§c[System] Gagal mengambil data scoreboard.");
    }
}

function formatItemName(id) {
    // Converts "minecraft:apple" to "Apple"
    const name = id.replace("minecraft:", "").replace(/_/g, " ");
    return name.replace(/\b\w/g, l => l.toUpperCase());
}

function openBuyMenu(player) {
    const secondsLeft = Math.ceil((nextRefreshTime - Date.now()) / 1000);
    const form = new ActionFormData();
    form.title("§1[ Toko Dinamis ]");
    form.body(`§eSisa Waktu Refresh: §f${secondsLeft} detik\n§7Barang-barang ini akan berubah secara acak!`);

    // Create buttons for current shop items
    // Since currentShopItems might be updated if timer hits while form is open,
    // we take a local snapshot to avoid out-of-bounds selection errors.
    const snapshot = [...currentShopItems];

    for (const item of snapshot) {
        const displayName = formatItemName(item.id);
        const priceStr = formatRupiah(item.price);
        if (item.isOP) {
            form.button(`§d§l[OP] ${displayName}§r\n§e${priceStr}`);
        } else {
            form.button(`§f${displayName}\n§e${priceStr}`);
        }
    }
    form.button("§cKembali");

    form.show(player).then((response) => {
        if (response.canceled) return;
        if (response.selection === snapshot.length) {
            openMainMenu(player);
            return;
        }

        const selectedItem = snapshot[response.selection];
        openBuyAmountMenu(player, selectedItem);
    });
}

function openBuyAmountMenu(player, itemData) {
    const form = new ModalFormData();
    const displayName = formatItemName(itemData.id);
    const priceStr = formatRupiah(itemData.price);

    form.title("§a[ Beli Barang ]");
    form.slider(`Berapa banyak §e${displayName} §fyang ingin kamu beli?\n§7Harga Satuan: ${priceStr}`, 1, 64, 1, 1);

    form.show(player).then((response) => {
        if (response.canceled) return;

        const amount = Math.floor(response.formValues[0]);
        const totalCost = itemData.price * amount;
        const currentCoins = getScore(player, "dompet");

        if (currentCoins >= totalCost) {
            const invComponent = player.getComponent("inventory");
            if (!invComponent || !invComponent.container) {
                player.sendMessage("§c[Shop] Gagal mengakses inventory kamu!");
                return;
            }

            // Validate if there is at least one empty slot before taking money
            // This is a basic safety net. For unstackable overages, we will spawn it.
            if (invComponent.container.emptySlotsCount === 0) {
                player.sendMessage("§c[Shop] Tas lu penuh cuy! Kosongin dulu sebelum beli.");
                return;
            }

            setScore(player, "dompet", currentCoins - totalCost);

            // Handling unstackable/excess item distributions properly
            const maxStackSize = new ItemStack(itemData.id, 1).maxAmount;
            let remaining = amount;

            while (remaining > 0) {
                let toGive = Math.min(remaining, maxStackSize);
                let stackToGive = new ItemStack(itemData.id, toGive);

                try {
                    invComponent.container.addItem(stackToGive);
                } catch(e) {
                    // Fallback to dropping items on the floor if inventory randomly rejects it
                    player.dimension.spawnItem(stackToGive, player.location);
                }
                remaining -= toGive;
            }

            player.sendMessage(`§a[Shop] Sukses membeli §e${amount}x ${displayName} §aseharga §e${formatRupiah(totalCost)}!`);
        } else {
            player.sendMessage(`§c[Shop] Rupiah lu gak cukup cuy! Butuh ${formatRupiah(totalCost)}.`);
        }
    });
}

function processSellAll(player) {
    const inventoryComponent = player.getComponent("inventory");
    if (!inventoryComponent) return;
    const inventory = inventoryComponent.container;
    if (!inventory) return;

    let totalEarned = 0;
    let hasRejectedItems = false;
    let itemsSold = false;

    // Scan only main inventory (slots 0-35)
    for (let i = 0; i < 36; i++) {
        const item = inventory.getItem(i);
        if (!item) continue;

        // Ignore the Menu Utama clock and Guide Book
        if (item.typeId === "minecraft:clock" && item.nameTag === "§e§lMenu Utama") continue;
        if (item.typeId === "minecraft:book" && item.nameTag === "§a§lBuku Panduan") continue;

        const typeId = item.typeId;
        const sellPrice = EconomyConfig.sellPrices[typeId];

        if (sellPrice !== undefined) {
            // It's a valid rare item to sell
            const amount = item.amount;
            const itemValue = sellPrice * amount;
            totalEarned += itemValue;

            // Remove the item completely
            inventory.setItem(i, undefined);
            itemsSold = true;
        } else {
            // It's an unlisted item
            hasRejectedItems = true;
        }
    }

    if (itemsSold) {
        const currentCoins = getScore(player, "dompet");
        setScore(player, "dompet", currentCoins + totalEarned);
        player.sendMessage(`§a[Shop] Berhasil menjual barang langka! Total didapat: §e${formatRupiah(totalEarned)}`);
    }

    if (hasRejectedItems) {
        player.dimension.runCommandAsync(`title "${player.name}" subtitle §fAda barang ampas/biasa di tas lu!`);
        player.dimension.runCommandAsync(`title "${player.name}" title §c§lDITOLAK`);
    } else if (!itemsSold) {
        player.sendMessage("§c[Shop] Tidak ada barang langka yang bisa dijual di tas lu.");
    }
}

// Handle Custom Gacha Combat Effects on Entity Hit
world.afterEvents.entityHitEntity.subscribe((event) => {
    const attacker = event.damagingEntity;
    const target = event.hitEntity;

    if (!attacker || attacker.typeId !== "minecraft:player") return;
    if (!target) return;

    // Check main hand item for Gacha effects
    const invComponent = attacker.getComponent("inventory");
    if (!invComponent) return;
    const inv = invComponent.container;
    const selectedSlot = attacker.selectedSlotIndex;
    const item = inv.getItem(selectedSlot);

    if (!item) return;

    const effect = item.getDynamicProperty("gacha_effect");
    if (!effect || typeof effect !== 'string') return;

    // Execute Custom Effect Logic
    if (effect === "frostbite") {
        // 20% chance to slow and slightly damage target for 3 seconds
        if (Math.random() < 0.20) {
            target.addEffect("slowness", 60, { amplifier: 1, showParticles: true });
            target.addEffect("weakness", 60, { amplifier: 0, showParticles: true });
        }
    } else if (effect === "abyssal_wither") {
        // 10% chance to Wither Area for 3 seconds
        if (Math.random() < 0.10) {
            target.addEffect("wither", 60, { amplifier: 1, showParticles: true });
            target.dimension.spawnParticle("minecraft:crop_growth_area_emitter", target.location);
        }
    } else if (effect === "thunderous_smite") {
        // 5% chance to strike lightning and apply massive damage effects
        if (Math.random() < 0.05) {
            target.dimension.spawnEntity("minecraft:lightning_bolt", target.location);
            target.addEffect("slowness", 40, { amplifier: 4, showParticles: false });
            attacker.sendMessage("§e§l[THUNDEROUS SMITE] §r§fKekuatan senjata Legendary menebas musuh!");
        }
    }
});
