"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRoles = exports.authMiddleware = exports.createToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const storageService_1 = require("../services/storageService");
const jwtSecret = process.env.JWT_SECRET ?? "aqbobek-dev-secret";
const createToken = (payload) => jsonwebtoken_1.default.sign(payload, jwtSecret, { expiresIn: "7d" });
exports.createToken = createToken;
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ message: "Требуется вход в систему" });
        return;
    }
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        const user = storageService_1.storageService.getUserById(decoded.userId);
        if (!user) {
            res.status(401).json({ message: "Пользователь не найден" });
            return;
        }
        const { password: _password, ...safeUser } = user;
        req.user = safeUser;
        next();
    }
    catch {
        res.status(401).json({ message: "Недействительный токен" });
    }
};
exports.authMiddleware = authMiddleware;
const requireRoles = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            res.status(403).json({ message: "Недостаточно прав доступа" });
            return;
        }
        next();
    };
};
exports.requireRoles = requireRoles;
