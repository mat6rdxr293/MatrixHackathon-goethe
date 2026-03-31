import fs from "node:fs";
import http from "node:http";
import https, { type ServerOptions as HttpsServerOptions } from "node:https";
import path from "node:path";
import cors, { type CorsOptions } from "cors";
import dotenv from "dotenv";
import express from "express";
import { authRoutes } from "./routes/authRoutes";
import { adminRoutes } from "./routes/adminRoutes";
import { portalRoutes } from "./routes/portalRoutes";

const preferredEnvFile = process.env.ENV_FILE?.trim() || (process.env.NODE_ENV === "production" ? ".env.production" : ".env");
const preferredEnvPath = path.resolve(process.cwd(), preferredEnvFile);
if (fs.existsSync(preferredEnvPath)) {
  dotenv.config({ path: preferredEnvPath });
} else {
  dotenv.config();
}

if (preferredEnvFile !== ".env") {
  const fallbackEnvPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(fallbackEnvPath)) {
    dotenv.config({ path: fallbackEnvPath });
  }
}

const app = express();
const port = Number(process.env.PORT ?? 4000);
const backendHost = process.env.BACKEND_HOST ?? "0.0.0.0";
const backendProtocol = (process.env.BACKEND_PROTOCOL ?? "").toLowerCase();
const corsOriginRaw = process.env.CORS_ORIGIN ?? "*";
const frontendPort = Number(process.env.FRONTEND_PORT ?? 444);

const configuredCorsOrigins =
  corsOriginRaw === "*"
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

const corsOrigin: CorsOptions["origin"] = corsAllowAll
  ? true
  : (origin, callback) => {
      if (!origin || allowedCorsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    };

const resolveHttpsOptions = (): HttpsServerOptions | null => {
  const certPath = process.env.BACKEND_HTTPS_CERT_PATH;
  const keyPath = process.env.BACKEND_HTTPS_KEY_PATH;

  if (certPath && keyPath) {
    const certResolvedPath = path.resolve(certPath);
    const keyResolvedPath = path.resolve(keyPath);
    if (fs.existsSync(certResolvedPath) && fs.existsSync(keyResolvedPath)) {
      return {
        cert: fs.readFileSync(certResolvedPath),
        key: fs.readFileSync(keyResolvedPath),
      };
    }
  }

  const pfxPath = process.env.BACKEND_HTTPS_PFX_PATH;
  if (pfxPath) {
    const pfxResolvedPath = path.resolve(pfxPath);
    if (fs.existsSync(pfxResolvedPath)) {
      return {
        pfx: fs.readFileSync(pfxResolvedPath),
        passphrase: process.env.BACKEND_HTTPS_PFX_PASS,
      };
    }
  }

  return null;
};

app.use(
  cors({
    origin: corsOrigin,
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "aqbobek-portal-backend",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api", portalRoutes);
app.use("/api/admin", adminRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const httpsOptions = resolveHttpsOptions();
const shouldUseHttps = backendProtocol === "https" || Boolean(httpsOptions);

if (shouldUseHttps && httpsOptions) {
  const secureServer = https.createServer(httpsOptions, app);
  secureServer.listen(port, backendHost, () => {
    console.log(`Backend running on https://${backendHost}:${port}`);
  });
} else {
  if (shouldUseHttps && !httpsOptions) {
    console.warn("HTTPS requested for backend, but certificate files were not found. Falling back to HTTP.");
  }
  const server = http.createServer(app);
  server.listen(port, backendHost, () => {
    console.log(`Backend running on http://${backendHost}:${port}`);
  });
}
