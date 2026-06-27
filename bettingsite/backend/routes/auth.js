const express = require("express");
const router  = express.Router();

const Round      = require("../models/Round");
const User       = require("../models/User");
const authMiddleware = require("../middleware/auth"); // your JWT middleware

// ── GET /api/game/stats ───────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
    try {
        const totalRounds  = await Round.countDocuments();
        const latestRound  = await Round.findOne().sort({ createdAt: -1 });

        res.json({
            totalRounds,
            latestCrash: latestRound?.crashPoint || 0,
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});

// ── GET /api/game/history ─────────────────────────────────────────────────────
router.get("/history", async (req, res) => {
    try {
        const rounds = await Round.find().sort({ createdAt: -1 }).limit(20);
        res.json(rounds);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

// ── POST /api/game/bet ────────────────────────────────────────────────────────
// Called when a player places a bet before a round starts.
// Deducts the stake from their balance immediately.
router.post("/bet", authMiddleware, async (req, res) => {
    try {
        const { betAmount } = req.body;
        const amount = parseFloat(betAmount);

        if (!amount || amount <= 0) {
            return res.status(400).json({ error: "Invalid bet amount" });
        }

        const user = await User.findById(req.user.userId);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (user.balance < amount) {
            return res.status(400).json({ error: "Insufficient balance" });
        }

        user.balance = parseFloat((user.balance - amount).toFixed(2));
        await user.save();

        res.json({
            success: true,
            balance: user.balance,
            message: `Bet of ${amount} placed`,
        });
    } catch (err) {
        console.error("Bet error:", err);
        res.status(500).json({ error: "Failed to place bet" });
    }
});

// ── POST /api/game/cashout ────────────────────────────────────────────────────
// Called when a player cashes out during a round.
// Credits betAmount * multiplier to their balance.
router.post("/cashout", authMiddleware, async (req, res) => {
    try {
        const { betAmount, multiplier } = req.body;
        const amount = parseFloat(betAmount);
        const mult   = parseFloat(multiplier);

        if (!amount || amount <= 0 || !mult || mult < 1) {
            return res.status(400).json({ error: "Invalid cashout data" });
        }

        const winnings = parseFloat((amount * mult).toFixed(2));

        const user = await User.findById(req.user.userId);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        user.balance = parseFloat((user.balance + winnings).toFixed(2));
        await user.save();

        res.json({
            success:  true,
            balance:  user.balance,
            winnings: winnings,
            message:  `Cashed out at ${mult}x — won ${winnings} credits`,
        });
    } catch (err) {
        console.error("Cashout error:", err);
        res.status(500).json({ error: "Failed to process cashout" });
    }
});

module.exports = router;