import { supabase } from "@/integrations/supabase/client";

export type QuotationRoom = {
  room_id?: string | undefined;
  room_number?: string | undefined;
  category_id?: string | undefined;
  category_name: string;
  description?: string | undefined;
  rate: number;
};

export type QuotationCharge = {
  description: string;
  amount: number;
  taxable?: boolean;
};

export type Quotation = {
  id: string;
  quotation_no: string;
  guest_name: string;
  guest_mobile: string;
  guest_email?: string | null;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  nights: number;
  source: string;
  gst_bill: boolean;
  tax_rate: number;
  discount: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  notes?: string | null;
  rooms: QuotationRoom[];
  charges: QuotationCharge[];
  created_at: string;
  updated_at: string;
};

export type CreateQuotationInput = Omit<Quotation, "id" | "quotation_no" | "created_at" | "updated_at"> & {
  quotation_no?: string;
};

export async function fetchNextQuotationNo(): Promise<string> {
  // Try atomic database sequence first
  try {
    const { data, error } = await supabase.rpc("next_quotation_no" as never);
    if (!error && data && typeof data === "string") {
      return data;
    }
  } catch {
    // Ignore RPC failure if function not yet migrated
  }

  // Fallback: check count from quotations table or settings
  try {
    const { count } = await supabase.from("quotations" as never).select("id", { count: "exact", head: true });
    const num = (count ?? 0) + 1;
    return `QT-${String(num).padStart(5, "0")}`;
  } catch {
    const random = Math.floor(1000 + Math.random() * 9000);
    return `QT-${random}`;
  }
}

export async function saveQuotation(input: CreateQuotationInput, existingId?: string): Promise<Quotation> {
  const quotation_no = input.quotation_no || (await fetchNextQuotationNo());
  const payload = {
    ...input,
    quotation_no,
    updated_at: new Date().toISOString(),
  };

  if (existingId) {
    const { data, error } = await (supabase.from("quotations" as never) as any)
      .update(payload)
      .eq("id", existingId)
      .select("*")
      .single();
    if (error) throw error;
    return data as Quotation;
  } else {
    const { data, error } = await (supabase.from("quotations" as never) as any)
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as Quotation;
  }
}

export async function deleteQuotation(id: string): Promise<void> {
  const { error } = await (supabase.from("quotations" as never) as any).delete().eq("id", id);
  if (error) throw error;
}

export async function getQuotationById(id: string): Promise<Quotation | null> {
  const { data, error } = await (supabase.from("quotations" as never) as any).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Quotation | null;
}

export function calculateQuotationBreakdown(params: {
  rooms: Array<{ rate: number; category_name?: string }>;
  nights: number;
  charges?: Array<{ amount: number; description?: string; name?: string; taxable?: boolean }>;
  discount?: number;
  gst_bill?: boolean;
  gst_pct?: number;
}): {
  roomTotal: number;
  extrasTotal: number;
  taxableExtras: number;
  nonTaxableExtras: number;
  subtotal: number;
  taxableBase: number;
  taxAmount: number;
  total: number;
} {
  const roomSum = params.rooms.reduce((s, r) => s + (Number(r.rate) || 0), 0);
  const roomTotal = Math.round(roomSum * Math.max(1, params.nights) * 100) / 100;

  const charges = params.charges || [];
  const extrasTotal = Math.round(charges.reduce((s, c) => s + (Number(c.amount) || 0), 0) * 100) / 100;
  const taxableExtras = Math.round(
    charges.filter((c) => c.taxable !== false).reduce((s, c) => s + (Number(c.amount) || 0), 0) * 100
  ) / 100;
  const nonTaxableExtras = Math.round((extrasTotal - taxableExtras) * 100) / 100;

  const discount = Number(params.discount) || 0;
  const subtotal = Math.round((roomTotal + extrasTotal) * 100) / 100;

  const isGst = params.gst_bill !== false && (Number(params.gst_pct) || 0) > 0;
  const taxRate = isGst ? Number(params.gst_pct) || 0 : 0;

  // Follows PostgreSQL booking_totals view formula:
  // GREATEST(room_charges + taxable_extras - discount, 0)
  const taxableBase = Math.max(0, Math.round((roomTotal + taxableExtras - discount) * 100) / 100);
  const taxAmount = Math.round(((taxableBase * taxRate) / 100) * 100) / 100;
  const total = Math.round((roomTotal + extrasTotal - discount + taxAmount) * 100) / 100;

  return {
    roomTotal,
    extrasTotal,
    taxableExtras,
    nonTaxableExtras,
    subtotal,
    taxableBase,
    taxAmount,
    total,
  };
}

export function calculateQuotationTotal(params: {
  rooms: Array<{ rate: number; category_name?: string }>;
  nights: number;
  charges?: Array<{ amount: number; description?: string; name?: string; taxable?: boolean }>;
  discount?: number;
  gst_bill?: boolean;
  gst_pct?: number;
}): number {
  return calculateQuotationBreakdown(params).total;
}


