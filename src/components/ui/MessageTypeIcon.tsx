import {
  AppWindow,
  CarFront,
  CircleDot,
  DoorOpen,
  Heart,
  Lightbulb,
  type LucideIcon,
  MessageSquare,
  OctagonAlert,
  Siren,
  Truck,
} from "lucide-react";

/** Symbole zu den Namen in src/lib/messages/catalog.json. */
const ICONS: Record<string, LucideIcon> = {
  lightbulb: Lightbulb,
  "app-window": AppWindow,
  "door-open": DoorOpen,
  "octagon-alert": OctagonAlert,
  truck: Truck,
  siren: Siren,
  "circle-dot": CircleDot,
  "car-front": CarFront,
  heart: Heart,
};

export function MessageTypeIcon({ icon, className }: { icon?: string; className?: string }) {
  const Icon = (icon && ICONS[icon]) || MessageSquare;
  return <Icon className={className} aria-hidden="true" />;
}
