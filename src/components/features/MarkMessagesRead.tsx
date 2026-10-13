"use client";

import { useEffect } from "react";
import { markMessagesReadAction } from "@/app/dashboard/actions";

/**
 * Meldet nach dem Anzeigen, welche Nachrichten der Empfänger gesehen hat. Kein
 * Refresh danach: die „neu"-Markierung soll beim ersten Ansehen stehen bleiben.
 */
export default function MarkMessagesRead({ messageIds }: { messageIds: string[] }) {
  const key = messageIds.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` fasst die IDs stabil zusammen.
  useEffect(() => {
    if (messageIds.length > 0) void markMessagesReadAction(messageIds);
  }, [key]);
  return null;
}
