const id = "minecraft:cooked_beef";
const cleanName = id.replace("minecraft:", "");
let iconPath = `textures/items/${cleanName}`;

// Simple heuristics for vanilla icon mapping
if (cleanName.includes("log") || cleanName.includes("dirt") || cleanName.includes("sand") || cleanName.includes("stone") || cleanName.includes("block") || cleanName.includes("obsidian") || cleanName.includes("glass")) {
    iconPath = `textures/blocks/${cleanName}`;
}
console.log(iconPath);
