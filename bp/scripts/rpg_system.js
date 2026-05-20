import { world, system } from "@minecraft/server";

export const MAX_LEVEL = 50;

export function getXpRequired(level) {
    if (level >= MAX_LEVEL) return Infinity;
    // Base XP: 100, scales by 1.2 each level
    return Math.floor(100 * Math.pow(1.2, level - 1));
}

export function getPlayerRpgData(player) {
    const defaultData = {
        mining: { level: 1, xp: 0 },
        woodcutting: { level: 1, xp: 0 },
        slayer: { level: 1, xp: 0 },
        sp: 0,
        unlockedSkills: [],
        equippedSkills: [],
        unlockedGachaPassives: [],
        equippedGachaPassives: []
    };
    try {
        const str = player.getDynamicProperty("rpg_data");
        if (str && typeof str === 'string') {
            return { ...defaultData, ...JSON.parse(str) };
        }
    } catch(e) {}
    return defaultData;
}

export function savePlayerRpgData(player, data) {
    player.setDynamicProperty("rpg_data", JSON.stringify(data));
}

export function addXp(player, profession, amount) {
    const data = getPlayerRpgData(player);
    if (!data[profession]) return false;
    if (data[profession].level >= MAX_LEVEL) return false;

    data[profession].xp += amount;
    let leveledUp = false;

    while (data[profession].level < MAX_LEVEL && data[profession].xp >= getXpRequired(data[profession].level)) {
        data[profession].xp -= getXpRequired(data[profession].level);
        data[profession].level += 1;
        data.sp += 1; // Gain 1 Skill Point per level
        leveledUp = true;
    }

    // Set temporary flag so Actionbar knows to show this profession's XP bar
    player.setDynamicProperty("rpg_recent_xp", JSON.stringify({
        prof: profession,
        time: Date.now()
    }));

    savePlayerRpgData(player, data);

    if (leveledUp) {
        player.runCommandAsync(`playsound random.levelup @s`);
        player.sendMessage(`§a[RPG] §fLevel §e${profession.toUpperCase()} §fnaik ke level §b${data[profession].level}§f! (+1 Skill Point)`);
        applyPassiveStats(player, data);
    }
    return true;
}

export function generateXpBar(xp, maxXp) {
    const barLength = 20;
    const filled = Math.min(barLength, Math.floor((xp / maxXp) * barLength));
    const empty = barLength - filled;
    return `§a${"|".repeat(filled)}§7${"|".repeat(empty)}`;
}

// Helper to execute block breaking recursively for active skills
export function breakBlockArea(player, originBlock, radius, typeId) {
    const dimension = player.dimension;
    let brokenCount = 0;

    for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
            for (let z = -radius; z <= radius; z++) {
                if (x === 0 && y === 0 && z === 0) continue; // Original block already broken
                try {
                    const targetBlock = dimension.getBlock({
                        x: originBlock.x + x,
                        y: originBlock.y + y,
                        z: originBlock.z + z
                    });

                    if (targetBlock && targetBlock.typeId === typeId) {
                        player.runCommandAsync(`setblock ${targetBlock.x} ${targetBlock.y} ${targetBlock.z} air destroy`);
                        brokenCount++;
                    }
                } catch(e) {}
            }
        }
    }
    return brokenCount;
}

// Global active skill cooldowns map
export const activeCooldowns = new Map();

export function canUseActiveSkill(playerName, skillId, cooldownMs) {
    const key = `${playerName}_${skillId}`;
    const lastUsed = activeCooldowns.get(key) || 0;
    if (Date.now() - lastUsed > cooldownMs) {
        activeCooldowns.set(key, Date.now());
        return true;
    }
    return false;
}

export function applyPassiveStats(player, rpgData) {
    try {
        // Mining Level -> Haste
        // Lvl 10 = Haste 1, Lvl 30 = Haste 2, Lvl 50 = Haste 3
        if (rpgData.mining.level >= 10) {
            let hasteLvl = Math.floor(rpgData.mining.level / 20);
            if (hasteLvl > 0) player.addEffect("haste", 30, { amplifier: hasteLvl - 1, showParticles: false });
        }

        // Slayer Level -> Health Boost & Speed
        // Lvl 15 = Health Boost 1, Lvl 40 = Health Boost 2
        if (rpgData.slayer.level >= 15) {
            let hbLvl = rpgData.slayer.level >= 40 ? 1 : 0;
            player.addEffect("health_boost", 30, { amplifier: hbLvl, showParticles: false });
        }

        // Speed
        if (rpgData.slayer.level >= 25) {
            player.addEffect("speed", 30, { amplifier: 0, showParticles: false }); // Speed 1
        }

        // --- Gacha Passives ---
        if (rpgData.equippedGachaPassives && rpgData.equippedGachaPassives.includes("juggernaut")) {
            player.addEffect("resistance", 30, { amplifier: 1, showParticles: false }); // Resistance 2
        }

        if (rpgData.equippedGachaPassives && rpgData.equippedGachaPassives.includes("ninja")) {
            player.addEffect("speed", 30, { amplifier: 1, showParticles: false }); // Speed 2 (Overrides Slayer Speed 1)
            player.addEffect("jump_boost", 30, { amplifier: 1, showParticles: false });
        }

        if (rpgData.equippedGachaPassives && rpgData.equippedGachaPassives.includes("berserker")) {
            player.addEffect("strength", 30, { amplifier: 0, showParticles: false }); // Strength 1
        }
    } catch(e) {}
}
