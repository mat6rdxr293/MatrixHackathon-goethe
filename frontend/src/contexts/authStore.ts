import { createContext } from "react";
import type { AuthContextValue } from "../types/portal";

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

