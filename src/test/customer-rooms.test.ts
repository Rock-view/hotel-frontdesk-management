import { describe, expect, it } from "vitest";
import { customerRoomCategory } from "@/lib/customer-rooms";

describe("customer room privacy", () => {
  it("uses the category instead of the internal room number", () => {
    const room = { room_number: "201", rooms: { number: "201", room_categories: { name: "Sea View Room" } } };
    expect(customerRoomCategory(room)).toBe("Sea View Room");
    expect(customerRoomCategory(room)).not.toContain("201");
  });
  it("never exposes saved numbers when a room was deleted or has no category", () => {
    expect(customerRoomCategory({ room_number: "305", rooms: null } as Parameters<typeof customerRoomCategory>[0])).toBe("Room");
    expect(customerRoomCategory({ rooms: { room_categories: null } })).toBe("Room");
  });
});