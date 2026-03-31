"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_http_1 = __importDefault(require("node:http"));
const node_https_1 = __importDefault(require("node:https"));
const node_path_1 = __importDefault(require("node:path"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const authRoutes_1 = require("./routes/authRoutes");
const adminRoutes_1 = require("./routes/adminRoutes");
const portalRoutes_1 = require("./routes/portalRoutes");
const preferredEnvFile = process.env.ENV_FILE?.trim() || (process.env.NODE_ENV === "production" ? ".env.production" : ".env");
const preferredEnvPath = node_path_1.default.resolve(process.cwd(), preferredEnvFile);
if (node_fs_1.default.existsSync(preferredEnvPath)) {
    dotenv_1.default.config({ path: preferredEnvPath });
}
else {
    dotenv_1.default.config();
}
if (preferredEnvFile !== ".env") {
    const fallbackEnvPath = node_path_1.default.resolve(process.cwd(), ".env");
    if (node_fs_1.default.existsSync(fallbackEnvPath)) {
        dotenv_1.default.config({ path: fallbackEnvPath });
    }
}
const app = (0, express_1.default)();
const port = Number(process.env.PORT ?? 4000);
const backendHost = process.env.BACKEND_HOST ?? "0.0.0.0";
const backendProtocol = (process.env.BACKEND_PROTOCOL ?? "").toLowerCase();
const corsOriginRaw = process.env.CORS_ORIGIN ?? "*";
const frontendPort = Number(process.env.FRONTEND_PORT ?? 444);
const configuredCorsOrigins = corsOriginRaw === "*"
    ? ["*"]
    : corsOriginRaw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
const defaultCorsOrigins = [
    "http://localhost:5173",
    `https://localhost:${frontendPort}`,
    `https://matrix-host.ru:${frontendPort}`,
    `https://vite.matrix-host.ru:${frontendPort}`,
];
const corsAllowAll = configuredCorsOrigins.includes("*");
const allowedCorsOrigins = corsAllowAll
    ? ["*"]
    : Array.from(new Set([...configuredCorsOrigins, ...defaultCorsOrigins]));
const corsOrigin = corsAllowAll
    ? true
    : (origin, callback) => {
        if (!origin || allowedCorsOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`CORS blocked for origin: ${origin}`));
    };
const resolveHttpsOptions = () => {
    const certPath = process.env.BACKEND_HTTPS_CERT_PATH;
    const keyPath = process.env.BACKEND_HTTPS_KEY_PATH;
    if (certPath && keyPath) {
        const certResolvedPath = node_path_1.default.resolve(certPath);
        const keyResolvedPath = node_path_1.default.resolve(keyPath);
        if (node_fs_1.default.existsSync(certResolvedPath) && node_fs_1.default.existsSync(keyResolvedPath)) {
            return {
                cert: node_fs_1.default.readFileSync(certResolvedPath),
                key: node_fs_1.default.readFileSync(keyResolvedPath),
            };
        }
    }
    const pfxPath = process.env.BACKEND_HTTPS_PFX_PATH;
    if (pfxPath) {
        const pfxResolvedPath = node_path_1.default.resolve(pfxPath);
        if (node_fs_1.default.existsSync(pfxResolvedPath)) {
            return {
                pfx: node_fs_1.default.readFileSync(pfxResolvedPath),
                passphrase: process.env.BACKEND_HTTPS_PFX_PASS,
            };
        }
    }
    return null;
};
app.use((0, cors_1.default)({
    origin: corsOrigin,
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
    res.status(404).json({ message: "Route not found" });
});
const httpsOptions = resolveHttpsOptions();
const shouldUseHttps = backendProtocol === "https" || Boolean(httpsOptions);
if (shouldUseHttps && httpsOptions) {
    const secureServer = node_https_1.default.createServer(httpsOptions, app);
    secureServer.listen(port, backendHost, () => {
        console.log(`Backend running on https://${backendHost}:${port}`);
    });
}
else {
    if (shouldUseHttps && !httpsOptions) {
        console.warn("HTTPS requested for backend, but certificate files were not found. Falling back to HTTP.");
    }
    const server = node_http_1.default.createServer(app);
    server.listen(port, backendHost, () => {
        console.log(`Backend running on http://${backendHost}:${port}`);
    });
}
