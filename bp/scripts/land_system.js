import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { formatRupiah, getUiHeader, getScore, setScore } from "./utils.js";

// Konfigurasi Land Claim
const CHUNK_PRICE = 500000;
const MAX_CLAIMS = 10;

// Utility: Convert world coordinates to chunk string key
// Format: "dimension_chunkX_chunkZ"
function getChunkKey(dimensionId, x, z) {
    const chunkX = Math.floor(x / 16);
    const chunkZ = Math.floor(z / 16);
    return `${dimensionId}_${chunkX}_${chunkZ}`;
}

// Load Claims from Dynamic Properties
// Structure: Map<chunkKey, { owner: string, members: string[] }>
function loadClaims() {
    try {
        const dataStr = world.getDynamicProperty("land_claims");
        if (dataStr && typeof dataStr === 'string') {
            const parsed = JSON.parse(dataStr);
            return new Map(Object.entries(parsed));
        }
    } catch (e) {}
    return new Map();
}

function saveClaims(claimsMap) {
    const obj = Object.fromEntries(claimsMap);
    world.setDynamicProperty("land_claims", JSON.stringify(obj));
}

let landClaims = loadClaims();

export function getLandClaims() {
    return landClaims;
}

export function isChunkClaimed(dimensionId, x, z) {
    const key = getChunkKey(dimensionId, x, z);
    return landClaims.has(key);
}

export function getChunkOwner(dimensionId, x, z) {
    const key = getChunkKey(dimensionId, x, z);
    const claim = landClaims.get(key);
    return claim ? claim.owner : null;
}

export function hasPermission(playerName, dimensionId, x, z) {
    const key = getChunkKey(dimensionId, x, z);
    const claim = landClaims.get(key);
    if (!claim) return true; // Unclaimed land, anyone can build

    if (claim.owner === playerName) return true;
    if (claim.members.includes(playerName)) return true;

    return false;
}

export function claimChunk(player) {
    const dim = player.dimension.id;
    const loc = player.location;
    const key = getChunkKey(dim, loc.x, loc.z);

    if (landClaims.has(key)) {
        player.sendMessage("§c[Land] Chunk ini sudah diklaim oleh seseorang.");
        return false;
    }

    // Check player's claim count
    let claimCount = 0;
    for (const claim of landClaims.values()) {
        if (claim.owner === player.name) claimCount++;
    }

    if (claimCount >= MAX_CLAIMS) {
        player.sendMessage(`§c[Land] Kamu sudah mencapai batas maksimal klaim tanah (${MAX_CLAIMS} Chunk).`);
        return false;
    }

    landClaims.set(key, { owner: player.name, members: [] });
    saveClaims(landClaims);
    return true;
}

// === PROTECTION EVENT HANDLERS ===

world.beforeEvents.playerBreakBlock.subscribe((event) => {
    const { player, block } = event;
    if (!hasPermission(player.name, block.dimension.id, block.location.x, block.location.z)) {
        event.cancel = true;
        system.run(() => {
            player.onScreenDisplay.setActionBar("§cTanah ini dilindungi! Kamu tidak bisa menghancurkan blok di sini.");
        });
    }
});

world.beforeEvents.playerPlaceBlock.subscribe((event) => {
    const { player, block } = event;
    if (!hasPermission(player.name, block.dimension.id, block.location.x, block.location.z)) {
        event.cancel = true;
        system.run(() => {
            player.onScreenDisplay.setActionBar("§cTanah ini dilindungi! Kamu tidak bisa meletakkan blok di sini.");
        });
    }
});

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    const { player, block } = event;

    // Check if block is a container or interactive block
    const isInteractive = block.typeId.includes("chest") ||
                          block.typeId.includes("barrel") ||
                          block.typeId.includes("furnace") ||
                          block.typeId.includes("hopper") ||
                          block.typeId.includes("dropper") ||
                          block.typeId.includes("dispenser") ||
                          block.typeId.includes("shulker_box") ||
                          block.typeId.includes("door") ||
                          block.typeId.includes("gate") ||
                          block.typeId.includes("trapdoor") ||
                          block.typeId.includes("button") ||
                          block.typeId.includes("lever");

    if (isInteractive && !hasPermission(player.name, block.dimension.id, block.location.x, block.location.z)) {
        event.cancel = true;
        system.run(() => {
            player.onScreenDisplay.setActionBar("§cTanah ini dilindungi! Kamu tidak bisa berinteraksi dengan blok di sini.");
        });
    }
});

// === UI MENU ===

export function openLandMenu(player) {
    const dim = player.dimension.id;
    const loc = player.location;
    const key = getChunkKey(dim, loc.x, loc.z);

    const owner = getChunkOwner(dim, loc.x, loc.z);
    let status = "§aBelum Diklaim";
    if (owner) {
        status = owner === player.name ? "§eMilik Anda" : `§cMilik ${owner}`;
    }

    const form = new ActionFormData();
    form.title("§2[ Klaim Tanah ]");
    form.body(`${getUiHeader(player)}\nStatus Chunk Saat Ini:\n§fKoordinat: §7X:${Math.floor(loc.x)} Z:${Math.floor(loc.z)}\n§fStatus: ${status}\n\n§7Pilih aksi yang ingin dilakukan:`);

    if (!owner) {
        form.button(`§aKlaim Chunk Ini\n§7Harga: ${formatRupiah(CHUNK_PRICE)}`, "textures/ui/confirm");
    } else if (owner === player.name) {
        form.button("§eKelola Chunk Ini\n§7Anggota & Unclaim", "textures/ui/settings");
    } else {
        form.button("§8Chunk Orang Lain\n§7(Tidak bisa diinteraksi)", "textures/ui/cancel");
    }

    form.button("§bDaftar Tanah Saya\n§7Lihat semua klaim", "textures/ui/map_icon");
    form.button("§cKembali ke Menu Utama", "textures/ui/cancel");

    form.show(player).then(res => {
        if (res.canceled) return;

        // Handle selection based on buttons available
        if (!owner) {
            if (res.selection === 0) processClaim(player);
            else if (res.selection === 1) openListLandMenu(player);
            else if (res.selection === 2) import("./main.js").then(mod => system.runTimeout(() => mod.openMainMenu(player), 5)).catch(()=>{});
        } else if (owner === player.name) {
            if (res.selection === 0) openManageLandMenu(player, key);
            else if (res.selection === 1) openListLandMenu(player);
            else if (res.selection === 2) import("./main.js").then(mod => system.runTimeout(() => mod.openMainMenu(player), 5)).catch(()=>{});
        } else {
            if (res.selection === 0) openLandMenu(player); // Do nothing for locked chunk
            else if (res.selection === 1) openListLandMenu(player);
            else if (res.selection === 2) import("./main.js").then(mod => system.runTimeout(() => mod.openMainMenu(player), 5)).catch(()=>{});
        }
    });
}

function processClaim(player) {
    const currentCoins = getScore(player, "dompet");

    if (currentCoins < CHUNK_PRICE) {
        player.sendMessage(`§c[Land] Saldo Rupiah Anda tidak mencukupi untuk mengklaim tanah! Butuh ${formatRupiah(CHUNK_PRICE)}.`);
        return;
    }

    const success = claimChunk(player);
    if (success) {
        setScore(player, "dompet", currentCoins - CHUNK_PRICE);
        player.sendMessage(`§a[Land] Berhasil mengklaim chunk ini seharga ${formatRupiah(CHUNK_PRICE)}!`);
        player.dimension.runCommandAsync(`playsound random.levelup "${player.name}"`);
    }
}

function openManageLandMenu(player, chunkKey) {
    const claim = landClaims.get(chunkKey);
    if (!claim || claim.owner !== player.name) return;

    const form = new ActionFormData();
    form.title("§e[ Kelola Tanah ]");

    let membersStr = claim.members.length > 0 ? claim.members.join(", ") : "Tidak ada";
    form.body(`Kelola chunk ini.\n\n§fAnggota Saat Ini: §7${membersStr}\n\n§7Anggota dapat membuka peti dan membangun di tanah Anda.`);

    form.button("§aTambah Anggota", "textures/ui/FriendsIcon");
    form.button("§cHapus Anggota", "textures/ui/icon_multiplayer");
    form.button("§4Lepaskan Klaim (Unclaim)\n§7(Tidak ada refund!)", "textures/blocks/barrier");
    form.button("§eKembali");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) openAddMemberMenu(player, chunkKey);
        else if (res.selection === 1) openRemoveMemberMenu(player, chunkKey);
        else if (res.selection === 2) processUnclaim(player, chunkKey);
        else if (res.selection === 3) openLandMenu(player);
    });
}

function openAddMemberMenu(player, chunkKey) {
    const claim = landClaims.get(chunkKey);
    if (!claim) return;

    const form = new ModalFormData();
    form.title("§a[ Tambah Anggota ]");
    form.textField("Masukkan nama pemain yang ingin ditambahkan:", "Ketik nama lengkap pemain");

    form.show(player).then(res => {
        if (res.canceled) {
            openManageLandMenu(player, chunkKey);
            return;
        }

        const targetName = res.formValues[0].trim();
        if (!targetName) {
            player.sendMessage("§c[Land] Nama pemain tidak boleh kosong!");
            return;
        }

        if (targetName === player.name) {
            player.sendMessage("§c[Land] Anda sudah menjadi pemilik tanah ini!");
            return;
        }

        if (claim.members.includes(targetName)) {
            player.sendMessage(`§c[Land] ${targetName} sudah menjadi anggota di tanah ini!`);
            return;
        }

        claim.members.push(targetName);
        saveClaims(landClaims);
        player.sendMessage(`§a[Land] Berhasil menambahkan ${targetName} sebagai anggota!`);
        openManageLandMenu(player, chunkKey);
    });
}

function openRemoveMemberMenu(player, chunkKey) {
    const claim = landClaims.get(chunkKey);
    if (!claim) return;

    if (claim.members.length === 0) {
        player.sendMessage("§c[Land] Tidak ada anggota di tanah ini.");
        openManageLandMenu(player, chunkKey);
        return;
    }

    const form = new ModalFormData();
    form.title("§c[ Hapus Anggota ]");
    form.dropdown("Pilih anggota yang ingin dihapus:", claim.members);

    form.show(player).then(res => {
        if (res.canceled) {
            openManageLandMenu(player, chunkKey);
            return;
        }

        const indexToRemove = res.formValues[0];
        const removedName = claim.members.splice(indexToRemove, 1)[0];
        saveClaims(landClaims);

        player.sendMessage(`§a[Land] Berhasil menghapus ${removedName} dari daftar anggota!`);
        openManageLandMenu(player, chunkKey);
    });
}

function processUnclaim(player, chunkKey) {
    const form = new ActionFormData();
    form.title("§4[ Konfirmasi Unclaim ]");
    form.body("§cApakah Anda yakin ingin melepaskan tanah ini?\n\n§fTanah ini akan menjadi milik umum dan §4TIDAK ADA REFUND §funtuk Rupiah yang telah dikeluarkan.");
    form.button("§cYa, Lepaskan", "textures/ui/confirm");
    form.button("§aTidak, Batal", "textures/ui/cancel");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) {
            landClaims.delete(chunkKey);
            saveClaims(landClaims);
            player.sendMessage("§a[Land] Tanah berhasil dilepaskan. Chunk ini sekarang milik umum.");
        } else {
            openManageLandMenu(player, chunkKey);
        }
    });
}

function openListLandMenu(player) {
    const myClaims = [];
    for (const [key, claim] of landClaims.entries()) {
        if (claim.owner === player.name) {
            myClaims.push(key);
        }
    }

    const form = new ActionFormData();
    form.title("§b[ Daftar Tanah Saya ]");

    if (myClaims.length === 0) {
        form.body("§7Anda belum memiliki tanah satupun.");
    } else {
        form.body(`§fAnda memiliki §e${myClaims.length}/${MAX_CLAIMS} §fchunk tanah.\n\nKlik untuk mengelola (jika Anda berada di lokasi tersebut).`);
        for (const key of myClaims) {
            const parts = key.split("_");
            const dim = parts[0].replace("minecraft:", "");
            const cx = parseInt(parts[1]) * 16;
            const cz = parseInt(parts[2]) * 16;

            form.button(`§aTanah di ${dim}\n§7X:${cx} Z:${cz}`);
        }
    }

    form.button("§cKembali");

    form.show(player).then(res => {
        if (res.canceled) return;
        // Currently just a view, clicking returns to main land menu or you could add teleportation later if wanted.
        openLandMenu(player);
    });
}
