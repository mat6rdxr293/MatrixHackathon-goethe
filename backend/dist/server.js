"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const authRoutes_1 = require("./routes/authRoutes");
const adminRoutes_1 = require("./routes/adminRoutes");
const portalRoutes_1 = require("./routes/portalRoutes");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = Number(process.env.PORT ?? 4000);
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN ?? "*",
}));
app.use(express_1.default.json());
app.get("/health", (_req, res) => {
    res.json({
        status: "ok",
        service: "aqbobek-portal-backend",
    });
});
app.use("/api/auth", authRoutes_1.authRoutes);
app.use("/api", portalRoutes_1.portalRoutes);
app.use("/api/admin", adminRoutes_1.adminRoutes);
app.use((_req, res) => {
    res.status(404).json({ message: "Маршрут не найден" });
});
app.listen(port, () => {
    console.log(`Backend running on http://localhost:${port}`);
});
