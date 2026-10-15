export type MapPin = { key: string; lat: number; lng: number; label: string; color: string; title?: string; subtitle?: string };

export type FieldMapProps = {
  pins: MapPin[];
  me: { lat: number; lng: number } | null;
  /* Height covered by the sheet over the map, so pins are fitted into the part that shows. */
  bottomInset?: number;
  /* A point to move to (quick locate); changing it re-centres. */
  focus?: { lat: number; lng: number; key: string } | null;
  onPinPress?: (pin: MapPin) => void;
};
