export const BOOKING_SOURCES = ["Walk-in", "Travel Agent", "Agoda", "Make My Trip", "Other"] as const;

export const EXTRA_UNITS: Record<string, string> = {
  per_person_night: "per person / night",
  per_night: "per night",
  once: "one time",
};

/** Room charges minus discount, plus tax on the positive remainder. */
export function bookingTotal(ratePerNightSum: number, nights: number, discount: number, taxRate: number) {
  const base = ratePerNightSum * nights - discount;
  return Math.round((base + Math.max(0, base) * (taxRate / 100)) * 100) / 100;
}

/** Suggested quantity for an extra: food per person per night, beds per night. */
export function suggestedQty(unit: string, nights: number, guests: number) {
  if (unit === "per_person_night") return Math.max(1, nights * guests);
  if (unit === "per_night") return Math.max(1, nights);
  return 1;
}

type R = { id: string; number: string; category_id: string | null };
export function groupRoomsByCategory<T extends R>(rooms: T[], cats: { id: string; name: string }[]) {
  const names = new Map(cats.map((c) => [c.id, c.name]));
  const groups = new Map<string, { id: string; name: string; rooms: T[] }>();
  for (const r of rooms) {
    const key = r.category_id ?? "none";
    if (!groups.has(key)) groups.set(key, { id: key, name: names.get(key) ?? "Other rooms", rooms: [] });
    groups.get(key)!.rooms.push(r);
  }
  for (const g of groups.values()) g.rooms.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function billTitle(gstBill: boolean) {
  return gstBill ? "GST Bill" : "Booking Receipt";
}
