import { Router } from "express";
import { z } from "zod";
import { authMiddleware, createToken } from "../middleware/auth";
import { storageService } from "../services/storageService";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(3),
  selectedRole: z.enum(["student", "teacher", "parent", "admin"]),
});

export const authRoutes = Router();

authRoutes.post("/login", (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      message: "Неверные данные запроса",
      errors: result.error.flatten(),
    });
    return;
  }

  const { email, password, selectedRole } = result.data;
  const user = storageService.getUserByEmail(email.toLowerCase());
  if (!user || user.password !== password) {
    res.status(401).json({ message: "Неверная почта или пароль" });
    return;
  }

  if (user.role !== selectedRole) {
    res.status(403).json({ message: "Выбранная роль не совпадает с ролью аккаунта" });
    return;
  }

  const token = createToken({ userId: user.id, role: user.role });
  const { password: _password, ...safeUser } = user;

  res.json({
    token,
    user: safeUser,
  });
});

authRoutes.get("/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});
