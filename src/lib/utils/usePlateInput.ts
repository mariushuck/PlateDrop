"use client";

import { type ChangeEvent, useState } from "react";
import { districtName, parsePlate, plateErrorMessage } from "./plateUtils";

/**
 * Kennzeichenfeld mit automatischen Bindestrichen: Sobald sich die Eingabe
 * eindeutig aufteilen lässt, steht sie in der kanonischen Form im Feld. Nur
 * beim Tippen am Ende – Löschen und Korrekturen mitten im Text bleiben, wie sie
 * sind, sonst springt der Cursor.
 */
export function usePlateInput() {
  const [value, setValue] = useState("");
  const parsed = parsePlate(value);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value.toUpperCase();
    const inputType = (event.nativeEvent as InputEvent).inputType;
    const inserting = inputType === undefined || inputType.startsWith("insert");
    const atEnd = event.target.selectionStart === null || event.target.selectionStart >= raw.length;
    const result = parsePlate(raw);
    setValue(inserting && atEnd && result.ok ? result.plate : raw);
  }

  return {
    value,
    setValue,
    onChange,
    valid: parsed.ok,
    error: value.trim() && !parsed.ok ? plateErrorMessage(parsed.reason) : "",
    candidates: !parsed.ok && parsed.reason === "ambiguous" ? parsed.candidates : [],
    district: parsed.ok ? districtName(parsed.plate.split("-")[0]) : undefined,
  };
}
