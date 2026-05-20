export function formatRupiah(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return "Rp0";

    const abs = Math.abs(amount);
    let str = "";

    if (abs >= 1000000000) {
        str = (amount / 1000000000).toFixed(1).replace(/\.0$/, '') + " Miliar";
    } else if (abs >= 1000000) {
        str = (amount / 1000000).toFixed(1).replace(/\.0$/, '') + " Juta";
    } else if (abs >= 10000) {
        str = (amount / 1000).toFixed(1).replace(/\.0$/, '') + " Ribu";
    } else {
        str = amount.toLocaleString("id-ID");
    }

    // Replace JS decimal point with Indonesian comma
    return "Rp" + str.replace('.', ',');
}
