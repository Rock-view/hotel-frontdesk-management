import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY_VISIBILITY, getPolicyVisibility } from "@/lib/policies";
import { calculateQuotationBreakdown, calculateQuotationTotal } from "@/lib/quotations";

describe("policy visibility", () => {
  it("defaults have all policies visible on estimate and bill where appropriate", () => {
    expect(DEFAULT_POLICY_VISIBILITY.guarantee).toEqual({ estimate: true, bill: true });
    expect(DEFAULT_POLICY_VISIBILITY.cancellation).toEqual({ estimate: true, bill: true });
    expect(DEFAULT_POLICY_VISIBILITY.photo_id).toEqual({ estimate: true, bill: false });
    expect(DEFAULT_POLICY_VISIBILITY.arrival_departure).toEqual({ estimate: true, bill: true });
    expect(DEFAULT_POLICY_VISIBILITY.receipt_footer).toEqual({ estimate: false, bill: true });
  });

  it("handles null / undefined / partial stored settings safely", () => {
    const parsed = getPolicyVisibility(null);
    expect(parsed.guarantee.estimate).toBe(true);

    const custom = getPolicyVisibility({
      photo_id: { estimate: false, bill: true },
    });
    expect(custom.photo_id.estimate).toBe(false);
    expect(custom.photo_id.bill).toBe(true);
    // Other policies fall back to defaults
    expect(custom.guarantee.estimate).toBe(true);
  });
});

describe("quotation calculations & breakdown", () => {
  it("calculates total for single room across 2 nights with GST", () => {
    const b = calculateQuotationBreakdown({
      rooms: [{ category_name: "Deluxe", rate: 2000 }],
      nights: 2,
      discount: 0,
      gst_pct: 12,
    });
    // Room total: 2000 * 2 = 4000
    // Taxable base: 4000
    // 12% GST = 480
    // Total = 4480
    expect(b.roomTotal).toBe(4000);
    expect(b.taxableBase).toBe(4000);
    expect(b.taxAmount).toBe(480);
    expect(b.total).toBe(4480);
  });

  it("calculates total with discount and taxable extras", () => {
    const total = calculateQuotationTotal({
      rooms: [
        { category_name: "Deluxe", rate: 3000 },
        { category_name: "Standard", rate: 2000 },
      ],
      nights: 3,
      charges: [
        { description: "Extra Bed", amount: 500, taxable: true },
        { description: "Breakfast", amount: 1000, taxable: true },
      ],
      discount: 1500,
      gst_pct: 18,
    });
    // Room total: (3000 + 2000) * 3 = 15000
    // Extras: 1500 (all taxable)
    // Subtotal: 16500
    // Taxable base: (15000 + 1500) - 1500 = 15000
    // GST 18%: 2700
    // Total: 17700
    expect(total).toBe(17700);
  });

  it("regression: distinguishes taxable and non-taxable extra charges so GST is not charged on non-taxable items", () => {
    // 1 room at 2000 for 1 night
    // Taxable charge: 500 (e.g. food/laundry)
    // Non-taxable charge: 1000 (e.g. refundable security deposit / toll)
    // GST: 12%
    const b = calculateQuotationBreakdown({
      rooms: [{ category_name: "Deluxe", rate: 2000 }],
      nights: 1,
      charges: [
        { description: "Food", amount: 500, taxable: true },
        { description: "Security Deposit", amount: 1000, taxable: false },
      ],
      discount: 0,
      gst_pct: 12,
    });

    expect(b.roomTotal).toBe(2000);
    expect(b.extrasTotal).toBe(1500);
    expect(b.taxableExtras).toBe(500);
    expect(b.nonTaxableExtras).toBe(1000);
    expect(b.subtotal).toBe(3500);

    // Taxable base should only be room (2000) + taxable extras (500) = 2500
    // GST 12% on 2500 = 300 (NOT 12% on 3500 = 420)
    expect(b.taxableBase).toBe(2500);
    expect(b.taxAmount).toBe(300);

    // Total = Room (2000) + Food (500) + Security Deposit (1000) + GST (300) = 3800
    expect(b.total).toBe(3800);
  });

  it("regression: preserves quoted GST rate even when tax percentage differs", () => {
    // If a quotation locked in 12% GST:
    const quotedAt12 = calculateQuotationBreakdown({
      rooms: [{ category_name: "Deluxe", rate: 5000 }],
      nights: 2,
      gst_bill: true,
      gst_pct: 12,
    });
    // Room total: 10000. 12% = 1200. Total = 11200.
    expect(quotedAt12.taxAmount).toBe(1200);
    expect(quotedAt12.total).toBe(11200);

    // If default_tax_rate in settings changed to 18%, keeping the quoted 12% preserves 11200
    const changedSettingAt18 = calculateQuotationBreakdown({
      rooms: [{ category_name: "Deluxe", rate: 5000 }],
      nights: 2,
      gst_bill: true,
      gst_pct: 18,
    });
    expect(changedSettingAt18.taxAmount).toBe(1800);
    expect(changedSettingAt18.total).toBe(11800);

    // Confirms that retaining the quoted rate avoids the 600 discrepancy
    expect(changedSettingAt18.total - quotedAt12.total).toBe(600);
  });

  it("regression: handles multiple rooms with different individual tariffs and discounts correctly", () => {
    const b = calculateQuotationBreakdown({
      rooms: [
        { category_name: "Suite", rate: 4500 },
        { category_name: "Deluxe", rate: 3000 },
        { category_name: "Standard", rate: 1800 },
      ],
      nights: 4,
      charges: [
        { description: "Airport Shuttle", amount: 1200, taxable: false },
        { description: "Extra Bed", amount: 800, taxable: true },
      ],
      discount: 2000,
      gst_bill: true,
      gst_pct: 12,
    });

    // Room total: (4500 + 3000 + 1800) * 4 = 9300 * 4 = 37200
    expect(b.roomTotal).toBe(37200);
    expect(b.extrasTotal).toBe(2000);
    expect(b.taxableExtras).toBe(800);
    expect(b.nonTaxableExtras).toBe(1200);
    expect(b.subtotal).toBe(39200);

    // Taxable base: room_charges (37200) + taxable_extras (800) - discount (2000) = 36000
    expect(b.taxableBase).toBe(36000);
    // GST: 12% of 36000 = 4320
    expect(b.taxAmount).toBe(4320);
    // Total: room (37200) + extras (2000) - discount (2000) + GST (4320) = 41520
    expect(b.total).toBe(41520);
  });

  it("regression: non-GST bill has zero tax amount and total equals room charges + extras - discount", () => {
    const b = calculateQuotationBreakdown({
      rooms: [{ category_name: "Standard", rate: 1500 }],
      nights: 2,
      charges: [{ description: "Breakfast", amount: 300, taxable: true }],
      discount: 200,
      gst_bill: false,
      gst_pct: 12, // provided but disabled by gst_bill: false
    });

    // 1500 * 2 = 3000. Extras: 300. Discount: 200. Total = 3100.
    expect(b.roomTotal).toBe(3000);
    expect(b.taxAmount).toBe(0);
    expect(b.total).toBe(3100);
  });

  it("calculates quotation with hotel extras (Extra Bed, CP Plan) at 5% GST correctly", () => {
    // 2 nights, 2 guests. Room rate: 2000/night = 4000
    // Extra Bed: 500/night * 2 = 1000 (taxable)
    // CP Plan: 200 * 2 pax * 2 nights = 800 (taxable)
    // 5% GST on (4000 + 1000 + 800) = 5% of 5800 = 290
    // Total = 5800 + 290 = 6090
    const b = calculateQuotationBreakdown({
      rooms: [{ category_name: "Deluxe", rate: 2000 }],
      nights: 2,
      charges: [
        { description: "Extra Bed (2nt)", amount: 1000, taxable: true },
        { description: "CP Plan (2pax × 2nt)", amount: 800, taxable: true },
      ],
      gst_bill: true,
      gst_pct: 5,
    });

    expect(b.roomTotal).toBe(4000);
    expect(b.extrasTotal).toBe(1800);
    expect(b.taxableExtras).toBe(1800);
    expect(b.taxableBase).toBe(5800);
    expect(b.taxAmount).toBe(290);
    expect(b.total).toBe(6090);
  });

  it("pdf options configures html2canvas with oklch sanitizer and standard A4 dimensions", async () => {
    const { getPdfOptions } = await import("@/lib/pdf");
    const opt = getPdfOptions("test.pdf");
    expect(opt.filename).toBe("test.pdf");
    expect(opt.jsPDF.format).toBe("a4");
    expect(opt.html2canvas.scale).toBe(2);
    expect(typeof opt.html2canvas.onclone).toBe("function");

    // Test onclone behavior
    const doc = document.implementation.createHTMLDocument();
    opt.html2canvas.onclone(doc);
    const injectedStyle = doc.querySelector("style[data-pdf-sanitizer='true']");
    expect(injectedStyle).not.toBeNull();
    expect(injectedStyle?.textContent).toContain("--background: #ffffff !important;");
    expect(injectedStyle?.textContent).toContain("--card: #ffffff !important;");
  });
});

