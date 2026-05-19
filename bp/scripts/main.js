import { world, system, ItemStack, ItemLockMode, EnchantmentTypes } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { EconomyConfig } from "./economy_config.js";

// Initialize Objective
system.run(() => {
    try {
        if (!world.scoreboard.getObjective("dompet")) {
            world.scoreboard.addObjective("dompet", "§e§lPRO SURVIVAL");
        }
    } catch (e) {
        // Ignore if it already exists or errors
    }
});

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
        if (hiddenBoards.get(player.name)) continue;

        const score = getScore(player, "dompet");
        const actionbarText = `§e§lDOMPET: §f${score} Koin §8| §bPing: 45ms §8| §aOnline: ${online}`;
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
    form.body("Selamat datang di Server Survival PRO!\n\n1. Gunakan Jam Menu Utama untuk membeli/menjual barang langka.\n2. Jaga baik-baik koin mu, kamu bisa mentransfer koin ke teman.\n3. Hati-hati dengan sistem Bounty! Pemain bisa menaruh harga buronan di kepalamu.\n4. Kumpulkan barang langka untuk dijual dan jadilah top global sultan server ini!\n\nSelamat bermain dan semoga sukses cuy!");
    form.button("§cTutup");
    form.show(player);
}

// UI Logic - Main Menu
function openMainMenu(player) {
    const form = new ActionFormData();
    form.title("§1[ Server Menu Utama ]");
    form.button("§e§lMenu Beli Barang\n§7Klik untuk beli kebutuhan");
    form.button("§a§lMenu Jual Barang\n§7Pindah & Filter Koin");
    form.button("§b§lTransfer Koin\n§7Kirim koin ke pemain lain");
    form.button("§c§lSistem Bounty\n§7Pasang buronan");
    form.button("§6§lTop Sultan\n§7Peringkat pemain terkaya");

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
    form.title("§b[ Transfer Koin ]");
    form.dropdown("Pilih Pemain:", playerNames);
    form.textField("Jumlah Koin:", "Contoh: 100");

    form.show(player).then((response) => {
        if (response.canceled) return;

        const targetIndex = response.formValues[0];
        const amountStr = response.formValues[1];
        const amount = parseInt(amountStr);

        if (isNaN(amount) || amount <= 0) {
            player.sendMessage("§c[System] Jumlah koin tidak valid!");
            return;
        }

        const currentCoins = getScore(player, "dompet");
        if (currentCoins < amount) {
            player.sendMessage("§c[System] Koin lu gak cukup buat transfer segitu, cuy!");
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

        player.sendMessage(`§a[System] Berhasil mentransfer §e${amount} Koin §ake §b${targetPlayer.name}§a.`);
        targetPlayer.sendMessage(`§a[System] Kamu menerima §e${amount} Koin §adari §b${player.name}§a.`);
    });
}

// Global variable to store active bounties
// Structure: { "TargetPlayerName": { amount: number, setter: "SetterName" } }
const activeBounties = {};

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
    form.textField("Harga Bounty (Koin):", "Contoh: 500");

    form.show(player).then((response) => {
        if (response.canceled) return;

        const targetIndex = response.formValues[0];
        const amountStr = response.formValues[1];
        const amount = parseInt(amountStr);

        if (isNaN(amount) || amount <= 0) {
            player.sendMessage("§c[System] Jumlah koin tidak valid!");
            return;
        }

        const currentCoins = getScore(player, "dompet");
        if (currentCoins < amount) {
            player.sendMessage("§c[System] Koin lu gak cukup buat masang bounty segitu!");
            return;
        }

        const targetPlayerName = playerNames[targetIndex];

        // Deduct coins
        setScore(player, "dompet", currentCoins - amount);

        // Add to active bounties
        if (activeBounties[targetPlayerName]) {
            activeBounties[targetPlayerName].amount += amount;
        } else {
            activeBounties[targetPlayerName] = { amount: amount, setter: player.name };
        }

        world.sendMessage(`§c§l[BOUNTY] §r§e${player.name} §ftelah memasang harga buronan sebesar §a${amount} Koin §funtuk kepala §c${targetPlayerName}§f!`);
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
            bodyText += `§c- ${target} §f(Harga: §e${activeBounties[target].amount} Koin§f)\n`;
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

// Handle Bounty claims on Entity death
world.afterEvents.entityDie.subscribe((event) => {
    const deadEntity = event.deadEntity;
    const damageSource = event.damageSource;

    // Check if the dead entity is a player
    if (deadEntity.typeId !== "minecraft:player") return;

    const deadPlayerName = deadEntity.name;
    const killer = damageSource.damagingEntity;

    // Check if there is a killer and the killer is a player
    if (killer && killer.typeId === "minecraft:player") {
        const killerPlayer = killer;

        // Check if the dead player had a bounty
        if (activeBounties[deadPlayerName]) {
            const bountyData = activeBounties[deadPlayerName];
            const bountyAmount = bountyData.amount;

            // Give reward to killer
            const killerCoins = getScore(killerPlayer, "dompet");
            setScore(killerPlayer, "dompet", killerCoins + bountyAmount);

            // Announce to world
            world.sendMessage(`§c§l[BOUNTY CLAIMED] §r§b${killerPlayer.name} §ftelah membunuh buronan §c${deadPlayerName} §fdan mendapatkan hadiah §e${bountyAmount} Koin§f!`);

            // Remove bounty
            delete activeBounties[deadPlayerName];
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
                bodyText += `§f${i + 1}. §b${identity.displayName} §7- §e${scoreInfo.score} Koin\n`;
            } else {
                bodyText += `§f${i + 1}. §b${identity.displayName} §7- §e${scoreInfo.score} Koin\n`;
            }
        }

        form.body(bodyText);
        form.button("§cTutup");
        form.show(player);
    } catch (e) {
        player.sendMessage("§c[System] Gagal mengambil data scoreboard.");
    }
}

function openBuyMenu(player) {
    const price = EconomyConfig.buyPrices["minecraft:bread"];
    const form = new ActionFormData();
    form.title("§1[ Menu Beli Roti ]");
    form.button(`Beli Roti\n§e${price} Koin`);

    form.show(player).then((response) => {
        if (response.canceled) return;
        if (response.selection === 0) {
            const currentCoins = getScore(player, "dompet");
            if (currentCoins >= price) {
                setScore(player, "dompet", currentCoins - price);
                player.runCommandAsync(`give @s minecraft:bread 1`);
                player.sendMessage("§a[Shop] Sukses membeli 1 Roti!");
            } else {
                player.sendMessage("§c[Shop] Koin lu gak cukup, cuy!");
            }
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
        player.sendMessage(`§a[Shop] Berhasil menjual barang langka! Total didapat: §e${totalEarned} Koin`);
    }

    if (hasRejectedItems) {
        player.runCommandAsync('title @s subtitle §fAda barang ampas/biasa di tas lu!');
        player.runCommandAsync('title @s title §c§lDITOLAK');
    } else if (!itemsSold) {
        player.sendMessage("§c[Shop] Tidak ada barang langka yang bisa dijual di tas lu.");
    }
}
