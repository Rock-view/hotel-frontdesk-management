type CustomerRoom = {
  rooms?: { room_categories?: { name: string; description?: string | null } | null } | null;
};

/** Customer documents must never fall back to internal room numbers. */
export function customerRoomCategory(room: CustomerRoom): string {
  return room.rooms?.room_categories?.name?.trim() || "Room";
}