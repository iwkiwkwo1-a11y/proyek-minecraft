import { world, system } from "@minecraft/server";
import { formatRupiah } from "./utils.js";

const QUIZ_INTERVAL_TICKS = 12000; // 10 minutes
const QUIZ_REWARD = 50000; // Rp50.000

let activeQuiz = null;

const WORD_SCRAMBLES = [
    { word: "minecraft", scrambled: "craftemni" },
    { word: "diamond", scrambled: "moindad" },
    { word: "zombie", scrambled: "biezom" },
    { word: "emerald", scrambled: "raldeme" },
    { word: "survival", scrambled: "valvuris" },
    { word: "creeper", scrambled: "percree" },
    { word: "rupiah", scrambled: "piahru" }
];

function generateMathQuiz() {
    const operators = ['+', '-', '*'];
    const op = operators[Math.floor(Math.random() * operators.length)];

    let a, b, answer;

    if (op === '+') {
        a = Math.floor(Math.random() * 100) + 1;
        b = Math.floor(Math.random() * 100) + 1;
        answer = a + b;
    } else if (op === '-') {
        a = Math.floor(Math.random() * 100) + 50;
        b = Math.floor(Math.random() * 50) + 1;
        answer = a - b;
    } else {
        a = Math.floor(Math.random() * 20) + 1;
        b = Math.floor(Math.random() * 10) + 1;
        answer = a * b;
    }

    return {
        question: `Berapakah hasil dari ${a} ${op} ${b}?`,
        answer: answer.toString()
    };
}

function generateWordQuiz() {
    const data = WORD_SCRAMBLES[Math.floor(Math.random() * WORD_SCRAMBLES.length)];
    return {
        question: `Susun kata berikut: ${data.scrambled}`,
        answer: data.word
    };
}

function startQuiz() {
    const isMath = Math.random() > 0.5;
    const quizData = isMath ? generateMathQuiz() : generateWordQuiz();

    activeQuiz = {
        answer: quizData.answer,
        reward: QUIZ_REWARD
    };

    world.sendMessage(`§6§l[KUIS SERVER] §r§fKuis dimulai! Hadiah: §e${formatRupiah(QUIZ_REWARD)}\n§b${quizData.question}\n§7Ketik §a/scriptevent jawab:kuis <jawaban> §7untuk memenangkan kuis!`);
}

export function handleQuizAnswer(player, message) {
    if (!activeQuiz) {
        player.sendMessage("§c[Kuis] Saat ini tidak ada kuis yang aktif.");
        return;
    }

    const answerProvided = message.trim().toLowerCase();

    if (answerProvided === activeQuiz.answer.toLowerCase()) {
        const reward = activeQuiz.reward;
        activeQuiz = null; // Close quiz

        // Give reward
        // Dynamic import workaround to getScore safely
        import("./main.js").then(mod => {
            const objDompet = world.scoreboard.getObjective("dompet");
            if (objDompet) {
                const current = objDompet.getScore(player) || 0;
                objDompet.setScore(player, current + reward);
                world.sendMessage(`§6§l[KUIS SERVER] §r§a${player.name} §fberhasil menjawab kuis dengan benar dan memenangkan §e${formatRupiah(reward)}§f!`);
            }
        }).catch(()=>{});

        player.dimension.runCommandAsync(`playsound random.levelup @a[x=${Math.floor(player.location.x)},y=${Math.floor(player.location.y)},z=${Math.floor(player.location.z)},r=10]`);
    } else {
        player.sendMessage("§c[Kuis] Jawaban Anda salah!");
    }
}

// Start the periodic quiz system
system.runInterval(() => {
    startQuiz();
}, QUIZ_INTERVAL_TICKS);
