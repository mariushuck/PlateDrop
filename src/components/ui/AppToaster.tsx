"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/lib/useTheme";

/** sonner kennt nur das Gerät; diese Hülle folgt zusätzlich dem Darstellungs-Schalter. */
export default function AppToaster() {
  const theme = useTheme();
  return <Toaster richColors theme={theme ?? "system"} position="top-center" />;
}
