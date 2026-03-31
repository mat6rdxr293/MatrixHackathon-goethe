import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const certPairs = [
  { cert: ".cert/localhost.pem", key: ".cert/localhost-key.pem" },
  { cert: ".cert/cert.pem", key: ".cert/key.pem" },
  { cert: ".cert/fullchain.pem", key: ".cert/privkey.pem" },
  { cert: ".cert/localhost.crt", key: ".cert/localhost.key" },
];

const resolveCertPair = () => {
  for (const pair of certPairs) {
    const certPath = path.resolve(pair.cert);
    const keyPath = path.resolve(pair.key);
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      return { certPath, keyPath };
    }
  }
  return null;
};

const resolvePreviewHttpsOptions = () => {
  const certPath = process.env.PREVIEW_HTTPS_CERT_PATH;
  const keyPath = process.env.PREVIEW_HTTPS_KEY_PATH;
  if (certPath && keyPath) {
    const resolvedCertPath = path.resolve(certPath);
    const resolvedKeyPath = path.resolve(keyPath);
    if (fs.existsSync(resolvedCertPath) && fs.existsSync(resolvedKeyPath)) {
      return {
        cert: fs.readFileSync(resolvedCertPath),
        key: fs.readFileSync(resolvedKeyPath),
      };
    }
  }

  const discoveredPair = resolveCertPair();
  if (discoveredPair) {
    return {
      cert: fs.readFileSync(discoveredPair.certPath),
      key: fs.readFileSync(discoveredPair.keyPath),
    };
  }

  const pfxPath = process.env.PREVIEW_HTTPS_PFX_PATH;
  const fallbackPfxPath = path.resolve(".cert/localhost-prod.pfx");
  const resolvedPath = pfxPath ? path.resolve(pfxPath) : fallbackPfxPath;
  if (!fs.existsSync(resolvedPath)) {
    return undefined;
  }
  return {
    pfx: fs.readFileSync(resolvedPath),
    passphrase: process.env.PREVIEW_HTTPS_PFX_PASS,
  };
};

type BackendProtocol = "http" | "https";

type BackendCandidate = {
  protocol: BackendProtocol;
  port: number;
};

const backendHost = "localhost";

const resolveBackendCandidates = (): BackendCandidate[] => {
  const explicitBackendConfigured = Boolean(process.env.BACKEND_PORT || process.env.BACKEND_PROTOCOL);
  const allowFallback =
    (process.env.BACKEND_ALLOW_FALLBACK ?? "").trim() === "1" ||
    (process.env.BACKEND_ALLOW_FALLBACK ?? "").trim().toLowerCase() === "true";
  const configuredProtocolRaw = (process.env.BACKEND_PROTOCOL ?? "").trim().toLowerCase();
  const configuredProtocol: BackendProtocol | null =
    configuredProtocolRaw === "https" ? "https" : configuredProtocolRaw === "http" ? "http" : null;
  const configuredPort = Number(process.env.BACKEND_PORT ?? 4000);
  const unique = new Set<string>();
  const candidates: BackendCandidate[] = [];

  const addCandidate = (protocol: BackendProtocol, port: number) => {
    if (!Number.isFinite(port) || port <= 0) {
      return;
    }
    const key = `${protocol}:${port}`;
    if (unique.has(key)) {
      return;
    }
    unique.add(key);
    candidates.push({ protocol, port });
  };

  if (configuredProtocol) {
    addCandidate(configuredProtocol, configuredPort);
  } else if (configuredPort === 777) {
    addCandidate("https", configuredPort);
    addCandidate("http", configuredPort);
  } else {
    addCandidate("http", configuredPort);
    addCandidate("https", configuredPort);
  }

  if (!explicitBackendConfigured || allowFallback) {
    addCandidate("https", 777);
    addCandidate("http", 4000);
  }

  return candidates;
};

const isBackendAlive = (candidate: BackendCandidate): Promise<boolean> =>
  new Promise((resolve) => {
    const requestFactory = candidate.protocol === "https" ? https.request : http.request;
    const request = requestFactory(
      {
        hostname: backendHost,
        port: candidate.port,
        method: "GET",
        path: "/health",
        timeout: 1200,
        ...(candidate.protocol === "https" ? { rejectUnauthorized: false } : {}),
      },
      (response) => {
        response.resume();
        resolve(Boolean(response.statusCode && response.statusCode < 500));
      },
    );

    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
    request.end();
  });

const resolveBackendTarget = async (): Promise<BackendCandidate> => {
  const candidates = resolveBackendCandidates();
  for (const candidate of candidates) {
    if (await isBackendAlive(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
};

export default defineConfig(async () => {
  const backendTarget = await resolveBackendTarget();
  const backendProxyTarget = `${backendTarget.protocol}://${backendHost}:${backendTarget.port}`;
  const useSecureBackendProxy = backendTarget.protocol === "https";

  console.log(`[vite preview] Backend proxy target: ${backendProxyTarget}`);

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": "http://localhost:4000",
      },
    },
    preview: {
      port: Number(process.env.FRONTEND_PORT ?? 444),
      strictPort: true,
      allowedHosts: ["matrix-host.ru", ".matrix-host.ru", "localhost", "127.0.0.1", "vite.matrix-host.ru"],
      proxy: {
        "/api": {
          target: backendProxyTarget,
          changeOrigin: true,
          secure: useSecureBackendProxy ? false : undefined,
        },
        "/health": {
          target: backendProxyTarget,
          changeOrigin: true,
          secure: useSecureBackendProxy ? false : undefined,
        },
      },
      https: resolvePreviewHttpsOptions(),
    },
  };
});
