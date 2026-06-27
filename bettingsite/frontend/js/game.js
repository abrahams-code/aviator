const socket = io("http://localhost:5000", {
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
});

// ── DOM refs ──────────────────────────────────────────────────────────────────
const multiplierEl   = document.getElementById("multiplier");
const statusEl       = document.getElementById("status");
const historyEl      = document.getElementById("history");
const countdownEl    = document.getElementById("countdown");
const balanceEl      = document.getElementById("balance");
const xpEl           = document.getElementById("xp");
const levelEl        = document.getElementById("level");
const scoreEl        = document.getElementById("score");
const joinBtn        = document.getElementById("joinRoundBtn");
const joinBtn2       = document.getElementById("joineRoundBtn2");
const logoutBtn      = document.getElementById("logoutBtn");

// ── Inject bet-amount inputs next to each button ──────────────────────────────
function injectBetInput(button, id) {
    const input = document.createElement("input");
    input.type        = "number";
    input.id          = id;
    input.min         = "1";
    input.value       = "10";
    input.placeholder = "Bet amount";
    input.style.cssText = `
        width: 80px; padding: 8px; margin-right: 6px;
        border-radius: 6px; border: 1px solid #334155;
        background: #1e293b; color: white; font-size: 14px;
    `;
    button.parentNode.insertBefore(input, button);
    return input;
}

const betInput1 = injectBetInput(joinBtn,  "betAmount1");
const betInput2 = injectBetInput(joinBtn2, "betAmount2");

// ── Game state ────────────────────────────────────────────────────────────────
let currentMultiplier = 1.0;
let roundActive       = false;

let bet1 = { joined: false, amount: 0, cashedOut: false };
let bet2 = { joined: false, amount: 0, cashedOut: false };

let xp    = parseInt(localStorage.getItem("xp"))    || 0;
let level = parseInt(localStorage.getItem("level")) || 1;
let score = parseInt(localStorage.getItem("score")) || 0;

xpEl.textContent    = xp;
levelEl.textContent = level;
scoreEl.textContent = score;

// ── Auth helpers ──────────────────────────────────────────────────────────────
function getToken() {
    return localStorage.getItem("token");
}

logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("loggedInUser");
    window.location.href = "login.html";
});

// ── Balance ───────────────────────────────────────────────────────────────────
async function loadBalance() {
    try {
        const res  = await fetch("http://localhost:5000/api/user/profile", {
            headers: { Authorization: "Bearer " + getToken() },
        });
        if (!res.ok) throw new Error("Auth failed");
        const user = await res.json();
        balanceEl.textContent = Number(user.balance).toFixed(2);
        return Number(user.balance);
    } catch (err) {
        console.error("loadBalance:", err);
        return null;
    }
}

// ── History ───────────────────────────────────────────────────────────────────
async function loadHistory() {
    try {
        const res    = await fetch("http://localhost:5000/api/game/history");
        const rounds = await res.json();
        historyEl.innerHTML = "";
        rounds.forEach(r => addHistoryItem(r.crashPoint));
    } catch (err) {
        console.error("loadHistory:", err);
    }
}

function addHistoryItem(crashPoint) {
    const val  = Number(crashPoint);
    const div  = document.createElement("div");
    div.className   = "history-item";
    div.textContent = val.toFixed(2) + "x";

    // Colour by crash point
    if (val >= 10)     div.style.color = "#a855f7";   // purple — huge
    else if (val >= 3) div.style.color = "#22c55e";   // green  — good
    else if (val >= 2) div.style.color = "#facc15";   // yellow — ok
    else               div.style.color = "#ef4444";   // red    — low

    historyEl.prepend(div);
    while (historyEl.children.length > 15) {
        historyEl.removeChild(historyEl.lastChild);
    }
}

// ── Bet button logic ──────────────────────────────────────────────────────────
function setBetState(btn, input, bet, joined) {
    bet.joined    = joined;
    bet.cashedOut = false;

    if (joined) {
        const amount = parseFloat(input.value);
        if (isNaN(amount) || amount <= 0) {
            alert("Enter a valid bet amount.");
            bet.joined = false;
            return;
        }
        bet.amount           = amount;
        btn.textContent      = roundActive ? "Cash Out" : "Bet Placed ✓";
        btn.style.background = roundActive ? "#f59e0b" : "#22c55e";
        input.disabled       = true;
    } else {
        bet.amount           = 0;
        btn.textContent      = "Place Bet";
        btn.style.background = "";
        input.disabled       = false;
    }
}

joinBtn.addEventListener("click", () => {
    // If round is active and bet is placed → cash out
    if (roundActive && bet1.joined && !bet1.cashedOut) {
        cashOut(1);
        return;
    }
    // Otherwise toggle bet (only allowed before round starts)
    if (!roundActive) {
        setBetState(joinBtn, betInput1, bet1, !bet1.joined);
    }
});

joinBtn2.addEventListener("click", () => {
    if (roundActive && bet2.joined && !bet2.cashedOut) {
        cashOut(2);
        return;
    }
    if (!roundActive) {
        setBetState(joinBtn2, betInput2, bet2, !bet2.joined);
    }
});

// ── Cashout ───────────────────────────────────────────────────────────────────
async function cashOut(slot) {
    const bet = slot === 1 ? bet1 : bet2;
    const btn = slot === 1 ? joinBtn : joinBtn2;

    if (!bet.joined || bet.cashedOut) return;

    const winnings = parseFloat((bet.amount * currentMultiplier).toFixed(2));
    const profit   = parseFloat((winnings - bet.amount).toFixed(2));
    bet.cashedOut  = true;

    btn.textContent      = `Cashed ${winnings} cr ✓`;
    btn.style.background = "#22c55e";
    btn.disabled         = true;

    // Optimistically update balance immediately (winnings = stake + profit)
    const current = parseFloat(balanceEl.textContent.replace(/,/g, "")) || 0;
    balanceEl.textContent = (current + winnings).toFixed(2);

    // Show profit toast
    showToast(`+${profit} cr profit`, "win");

    // Award XP & score
    awardXP(winnings);

    // Sync with server
    try {
        await fetch("http://localhost:5000/api/game/cashout", {
            method:  "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization:  "Bearer " + getToken(),
            },
            body: JSON.stringify({
                betAmount:  bet.amount,
                multiplier: currentMultiplier,
            }),
        });
        // Use server-returned balance (most accurate)
        if (data && data.balance != null) {
            balanceEl.textContent = parseFloat(data.balance).toFixed(2);
        } else {
            await loadBalance();
        }
    } catch (err) {
        console.error("cashOut API:", err);
        // Fall back to reloading balance
        await loadBalance();
    }
}

// ── XP / Level ────────────────────────────────────────────────────────────────
function awardXP(winnings) {
    const gained = Math.max(10, Math.floor(winnings));
    xp    += gained;
    score += Math.floor(winnings);

    while (xp >= level * 100) {
        xp -= level * 100;
        level++;
        showLevelUp(level);
    }

    xpEl.textContent    = xp;
    levelEl.textContent = level;
    scoreEl.textContent = score;

    localStorage.setItem("xp",    xp);
    localStorage.setItem("level", level);
    localStorage.setItem("score", score);
}

function showLevelUp(newLevel) {
    const banner = document.createElement("div");
    banner.textContent  = `🎉 Level Up! You're now Level ${newLevel}`;
    banner.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: #7c3aed; color: white; padding: 14px 28px;
        border-radius: 12px; font-size: 18px; font-weight: bold;
        z-index: 9999; box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        animation: fadeOut 3s forwards;
    `;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 3000);
}

// ── Toast notification ──────────────────────────────────────────────────────────────────────────────
function showToast(message, type) {
    const toast = document.createElement("div");
    const isWin = type === "win";
    toast.textContent  = message;
    toast.style.cssText = `
        position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
        background: ${isWin ? "#22d67a" : "#ff5e1a"};
        color: ${isWin ? "#000" : "#fff"};
        padding: 12px 28px; border-radius: 999px;
        font-family: 'Orbitron', monospace; font-size: 15px; font-weight: 700;
        letter-spacing: 0.08em; z-index: 9999;
        box-shadow: 0 4px 24px rgba(0,0,0,0.4);
        animation: toastFade 2.5s forwards;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// ── Socket events ─────────────────────────────────────────────────────────────
socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
});

socket.on("disconnect", (reason) => {
    console.warn("Socket disconnected:", reason);
    statusEl.textContent = "Reconnecting…";
    statusEl.className   = "status crashed";
});

socket.on("reconnect", () => {
    console.log("Socket reconnected");
    loadBalance();
    loadHistory();
});

socket.on("countdown", data => {
    roundActive              = false;
    countdownEl.textContent  = `Next round in: ${data.seconds}s`;
    statusEl.textContent     = "Waiting for round…";
    statusEl.className       = "status";
    multiplierEl.textContent = "1.00x";
    multiplierEl.style.color = "white";
});

socket.on("roundStart", async () => {
    roundActive              = true;
    currentMultiplier        = 1.0;
    countdownEl.textContent  = "Round Running";
    statusEl.textContent     = "🚀 Round Running";
    statusEl.className       = "status running";

    // Deduct stakes from server for each active bet
    const activeBets = [
        { bet: bet1, btn: joinBtn },
        { bet: bet2, btn: joinBtn2 },
    ].filter(({ bet }) => bet.joined && bet.amount > 0);

    for (const { bet, btn } of activeBets) {
        try {
            const res  = await fetch("http://localhost:5000/api/game/bet", {
                method:  "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization:  "Bearer " + getToken(),
                },
                body: JSON.stringify({ betAmount: bet.amount }),
            });
            const data = await res.json();
            if (!res.ok) {
                // If bet failed (e.g. insufficient balance), cancel it
                showToast(data.error || "Bet failed", "loss");
                bet.joined = false;
                btn.textContent      = "Place Bet";
                btn.style.background = "";
                continue;
            }
            // Update balance from server response
            balanceEl.textContent = parseFloat(data.balance).toFixed(2);
        } catch (err) {
            console.error("Bet deduction error:", err);
        }

        // Switch to Cash Out mode
        btn.textContent      = "Cash Out";
        btn.style.background = "#f59e0b";
    }
});

socket.on("multiplier", data => {
    currentMultiplier        = parseFloat(data.multiplier);
    multiplierEl.textContent = currentMultiplier.toFixed(2) + "x";

    // Colour the multiplier as it climbs
    if (currentMultiplier >= 5)      multiplierEl.style.color = "#a855f7";
    else if (currentMultiplier >= 2) multiplierEl.style.color = "#22c55e";
    else                             multiplierEl.style.color = "white";

    // Live stake on each active cashout button
    if (bet1.joined && !bet1.cashedOut && roundActive) {
        const payout1 = (bet1.amount * currentMultiplier).toFixed(2);
        joinBtn.textContent = `Cash Out — ${payout1} cr`;
    }
    if (bet2.joined && !bet2.cashedOut && roundActive) {
        const payout2 = (bet2.amount * currentMultiplier).toFixed(2);
        joinBtn2.textContent = `Cash Out — ${payout2} cr`;
    }
});

socket.on("crash", async data => {
    roundActive              = false;
    const crashAt            = parseFloat(data.at);

    statusEl.textContent     = `💥 Crashed at ${crashAt.toFixed(2)}x`;
    statusEl.className       = "status crashed";
    multiplierEl.textContent = crashAt.toFixed(2) + "x";
    multiplierEl.style.color = "#ef4444";
    countdownEl.textContent  = "Waiting…";

    addHistoryItem(crashAt);

    // Deduct lost stakes from balance for bets that did NOT cash out
    let totalLost = 0;
    [
        { bet: bet1, btn: joinBtn,  input: betInput1 },
        { bet: bet2, btn: joinBtn2, input: betInput2 },
    ].forEach(({ bet, btn, input }) => {
        if (bet.joined && !bet.cashedOut && bet.amount > 0) {
            totalLost += bet.amount;
        }
        bet.joined    = false;
        bet.cashedOut = false;
        bet.amount    = 0;
        btn.textContent      = "Place Bet";
        btn.style.background = "";
        btn.disabled         = false;
        input.disabled       = false;
    });

    if (totalLost > 0) {
        const current = parseFloat(balanceEl.textContent.replace(/,/g, "")) || 0;
        balanceEl.textContent = Math.max(0, current - totalLost).toFixed(2);
        showToast(`-${totalLost} cr lost`, "loss");
    }

    // Confirm real balance from server
    await loadBalance();
});

// ── Online users / stats (if server emits these) ──────────────────────────────
socket.on("stats", data => {
    const onlineEl      = document.getElementById("onlineUsers");
    const totalRoundsEl = document.getElementById("totalRounds");
    const latestCrashEl = document.getElementById("latestCrash");

    if (onlineEl      && data.onlineUsers  != null) onlineEl.textContent      = data.onlineUsers;
    if (totalRoundsEl && data.totalRounds  != null) totalRoundsEl.textContent = data.totalRounds;
    if (latestCrashEl && data.latestCrash  != null) latestCrashEl.textContent = data.latestCrash + "x";
});

// ── CSS for level-up fade animation (injected once) ──────────────────────────
const style = document.createElement("style");
style.textContent = `
    @keyframes toastFade {
        0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
        70%  { opacity: 1; }
        100% { opacity: 0; transform: translateX(-50%) translateY(-16px); }
    }
    @keyframes fadeOut {
        0%   { opacity: 1; transform: translateX(-50%) translateY(0); }
        80%  { opacity: 1; }
        100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    }
`;
document.head.appendChild(style);

// ── Init ──────────────────────────────────────────────────────────────────────
loadBalance();
loadHistory();