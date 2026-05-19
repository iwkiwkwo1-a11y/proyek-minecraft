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

// Give Shop Clock on Spawn
world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;

    system.runTimeout(() => {
        const inventoryComponent = player.getComponent("inventory");
        if (!inventoryComponent) return;
        const inventory = inventoryComponent.container;
        if (!inventory) return;

        let hasShop = false;
        // Search all slots for the shop clock
        for (let i = 0; i < inventory.size; i++) {
            const item = inventory.getItem(i);
            if (item && item.typeId === "minecraft:clock" && item.nameTag === "§e§lShop") {
                hasShop = true;
                break;
            }
        }

        if (!hasShop) {
            const clock = new ItemStack("minecraft:clock", 1);
            clock.nameTag = "§e§lShop";

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
            } catch (e) {
                // Silently fail if enchanting fails
            }

            const slot8Item = inventory.getItem(8);
            if (slot8Item) {
                // Find empty slot in main inventory (slots 0-35)
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
                    player.sendMessage("§c[System] Tas lu penuh, gabisa ngasih Jam Shop! Kosongin slot dulu, cuy.");
                }
            } else {
                inventory.setItem(8, clock);
            }
        }
    }, 10);
});

// Open Main Menu on Item Use
world.beforeEvents.itemUse.subscribe((event) => {
    const { itemStack, source } = event;
    if (itemStack.typeId === "minecraft:clock" && itemStack.nameTag === "§e§lShop") {
        event.cancel = true;
        system.run(() => {
            openMainMenu(source);
        });
    }
});

// UI Logic
function openMainMenu(player) {
    const form = new ActionFormData();
    form.title("§1[ Server Menu Utama ]");
    form.button("§e§lMenu Beli Barang\n§7Klik untuk beli kebutuhan");
    form.button("§a§lMenu Jual Barang\n§7Pindah & Filter Koin");

    form.show(player).then((response) => {
        if (response.canceled) return;
        if (response.selection === 0) {
            openBuyMenu(player);
        } else if (response.selection === 1) {
            processSellAll(player);
        }
    });
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

        // Ignore the Shop clock
        if (item.typeId === "minecraft:clock" && item.nameTag === "§e§lShop") continue;

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
        player.runCommandAsync('title @s title §c§lDITOLAK');
        player.runCommandAsync('title @s subtitle §fAda barang ampas/biasa di tas lu!');
    } else if (!itemsSold) {
        player.sendMessage("§c[Shop] Tidak ada barang langka yang bisa dijual di tas lu.");
    }
}
