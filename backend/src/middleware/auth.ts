import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role, User } from "../types";
import { storageService } from "../services/storageService";

const jwtSecret = process.env.JWT_SECRET ?? "aqbobek-dev-secret";

export type AuthPayload = {
  userId: string;
  role: Role;
};

export type AuthenticatedRequest = Request & {
  user?: Omit<User, "password">;
};

export const createToken = (payload: AuthPayload) =>
  jwt.sign(payload, jwtSecret, { expiresIn: "7d" });

export const authMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Требуется вход в систему" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, jwtSecret) as AuthPayload;
    const user = storageService.getUserById(decoded.userId);
    if (!user) {
      res.status(401).json({ message: "Пользователь не найден" });
      return;
    }
    const { password: _password, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch {
    res.status(401).json({ message: "Недействительный токен" });
  }
};

export const requireRoles = (allowedRoles: Role[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({ message: "Недостаточно прав доступа" });
      return;
    }
    next();
  };
};
