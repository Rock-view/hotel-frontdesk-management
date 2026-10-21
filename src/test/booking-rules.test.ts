import { describe, expect, it } from "vitest";
import { BOOKING_SOURCES, billTitle, bookingTotal, suggestedQty } from "@/lib/booking";

describe("booking rules", () => {
  it("offers only the five booking sources", () => {
    expect([...BOOKING_SOURCES]).toEqual(["Walk-in", "Google", "Travel Agent", "OTA", "Other"]);
  });
  it("GST bill on is titled GST Bill, off is Booking Receipt", () => {
    expect(billTitle(true)).toBe("GST Bill");
    expect(billTitle(false)).toBe("Booking Receipt");
  });
  it("two rooms at 1000 + 800 for 2 nights with 12% GST", () => {
    expect(bookingTotal(1800, 2, 0, 12)).toBe(4032);
    expect(bookingTotal(1800, 2, 0, 0)).toBe(3600);
  });
  it("food is suggested per person per night, extra bed per night", () => {
    expect(suggestedQty("per_person_night", 2, 3)).toBe(6);
    expect(suggestedQty("per_night", 2, 3)).toBe(2);
  });
});
