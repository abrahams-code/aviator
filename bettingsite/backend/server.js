require("dotenv").config();

const express    = require("express");
const cors       = require("cors");
const mongoose   = require("mongoose");
const http       = require("http");
const path       = require("path");
const { Server } = require("socket.io");

const userRoutes = require("./routes/user");
const authRoutes = require("./routes/auth");
const gameRoutes = require("./routes/game");

const app    = express();
const server = http.createServer(app);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "../frontend")));
app.use(cors());
app.use(express.json());

// ── REST routes ───────────────────────────────────────────────────────────────
app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);

app.get("/", (req, res) => {
    res.json({ message: "Aviatrix API Running" });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
    cors: { origin: "*" }
});

let connectedUsers = 0;

io.on("connection", socket => {
    console.log("User connected:", socket.id);

    connectedUsers++;
    io.emit("stats", { onlineUsers: connectedUsers });

    socket.on("disconnect", () => {
        connectedUsers--;
        io.emit("stats", { onlineUsers: connectedUsers });
        console.log("User disconnected:", socket.id);
    });
});

// ── Game engine — start ONCE, not per connection ──────────────────────────────
const { startRound } = require("./gameEngine");
startRound(io);

// ── Database ──────────────────────────────────────────────────────────────────
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.error("MongoDB error:", err));

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});