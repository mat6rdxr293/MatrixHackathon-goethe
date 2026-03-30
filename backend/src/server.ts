import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { authRoutes } from "./routes/authRoutes";
import { adminRoutes } from "./routes/adminRoutes";
import { portalRoutes } from "./routes/portalRoutes";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "*",
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
  res.status(404).json({ message: "Маршрут не найден" });
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
