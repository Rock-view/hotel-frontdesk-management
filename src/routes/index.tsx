import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Front Desk — Hotel & Lodge Manager" },
      { name: "description", content: "Run your hotel, lodge or resort front desk: bookings, rooms, payments and receipts." },
      { property: "og:title", content: "Front Desk — Hotel & Lodge Manager" },
      { property: "og:description", content: "Run your hotel, lodge or resort front desk: bookings, rooms, payments and receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
