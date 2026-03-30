"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const storageService_1 = require("../services/storageService");
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(3),
});
exports.authRoutes = (0, express_1.Router)();
exports.authRoutes.post("/login", (req, res) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({
            message: "Неверные данные запроса",
            errors: result.error.flatten(),
        });
        return;
    }
    const { email, password } = result.data;
    const user = storageService_1.storageService.getUserByEmail(email.toLowerCase());
    if (!user || user.password !== password) {
        res.status(401).json({ message: "Неверная почта или пароль" });
        return;
    }
    const token = (0, auth_1.createToken)({ userId: user.id, role: user.role });
    const { password: _password, ...safeUser } = user;
    res.json({
        token,
        user: safeUser,
    });
});
exports.authRoutes.get("/me", auth_1.authMiddleware, (req, res) => {
    res.json({ user: req.user });
});
