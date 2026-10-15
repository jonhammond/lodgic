import { createContext, createElement, ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { useColorScheme, useWindowDimensions } from "react-native";
import { readStored, writeStored } from "../lib/storage";
import { dark, light, Palette, space } from "./tokens";

const STORAGE_KEY = "lodgic.theme";

type Scheme = "dark" | "light";
type ThemeValue = {
  t: Palette;
  scheme: Scheme;
  wide: boolean;
  width: number;
  toggleScheme: () => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const [override, setOverride] = useState<Scheme | null>(() => {
    const v = readStored(STORAGE_KEY);
    return v === "dark" || v === "light" ? v : null;
  });
  const scheme: Scheme = override ?? (colorScheme === "dark" ? "dark" : "light");
  const toggleScheme = useCallback(() => {
    const next: Scheme = scheme === "dark" ? "light" : "dark";
    setOverride(next);
    writeStored(STORAGE_KEY, next);
  }, [scheme]);
  const wide = width >= space.breakpoint;
  const value = useMemo<ThemeValue>(
    () => ({ t: scheme === "dark" ? dark : light, scheme, wide, width, toggleScheme }),
    [scheme, wide, width, toggleScheme],
  );
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
