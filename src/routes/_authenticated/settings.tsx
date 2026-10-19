import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSettings } from "@/hooks/use-me";
import { PageHeader } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errMsg } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";
import { ExtrasSettings } from "@/components/ExtrasSettings";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Front Desk" }, { name: "description", content: "Property details, taxes and receipt settings." }, { property: "og:title", content: "Settings — Front Desk" }, { property: "og:description", content: "Property details, taxes and receipt settings." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: SettingsPage,
});

type S = Database["public"]["Tables"]["hotel_settings"]["Row"];

async function resizeToDataUrl(file: File, max = 256): Promise<string> {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

function SettingsPage() {
  const me = useMe();
  const settings = useSettings();
  const qc = useQueryClient();
  const [f, setF] = useState<S | null>(null);
  const [methods, setMethods] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (settings.data) { setF(settings.data); setMethods(settings.data.payment_methods.join(", ")); }
  }, [settings.data]);
  const isOwner = !!me.data?.isOwner;
  if (!f) return <div className="text-muted-foreground">Loading…</div>;
  const set = <K extends keyof S>(k: K, v: S[K]) => setF((p) => (p ? { ...p, [k]: v } : p));

  async function save() {
    if (!f!.name.trim()) { toast.error("Property name is required"); return; }
    setBusy(true);
    const { id: _id, next_booking_no: _a, next_receipt_no: _b, next_invoice_no: _c, updated_at: _u, ...rest } = f!;
    const { error } = await supabase.from("hotel_settings").update({
      ...rest,
      default_tax_rate: Number(rest.default_tax_rate),
      id_retention_days: Math.max(1, Number(rest.id_retention_days) || 365),
      payment_methods: methods.split(",").map((m) => m.trim()).filter(Boolean),
      setup_complete: true,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  const T = (k: keyof S, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input disabled={!isOwner} value={(f[k] as string | number | null) ?? ""} onChange={(e) => set(k, e.target.value as never)} {...props} />
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" sub={isOwner ? "Changes apply to new receipts. Issued receipts keep their original details." : "Only the owner can change settings."} />

      <Card title="Property">
        <div className="mb-4 flex items-center gap-4">
          {f.logo_url ? <img src={f.logo_url} alt="Logo" className="h-16 w-16 rounded-lg border object-contain" /> : <div className="h-16 w-16 rounded-lg border bg-muted" />}
          {isOwner && (
            <div className="flex gap-2">
              <Button variant="outline" asChild><label className="cursor-pointer">Upload logo<input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) set("logo_url", await resizeToDataUrl(file)); }} /></label></Button>
              {f.logo_url && <Button variant="ghost" onClick={() => set("logo_url", null)}>Remove</Button>}
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {T("name", "Property name")}
          <div className="space-y-1.5"><Label>Type</Label>
            <Select disabled={!isOwner} value={f.property_type} onValueChange={(v) => set("property_type", v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["Hotel", "Lodge", "Resort", "Guest house", "Homestay"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
          </div>
          {T("phone", "Phone")}
          {T("email", "Email", { type: "email" })}
          <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label><Textarea disabled={!isOwner} value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} /></div>
          {T("check_in_time", "Default check-in time", { type: "time" })}
          {T("check_out_time", "Default check-out time", { type: "time" })}
        </div>
      </Card>

      <Card title="Tax & payments">
        <div className="grid gap-4 sm:grid-cols-2">
          {T("gstin", "GSTIN (optional)")}
          {T("currency", "Currency code")}
          {T("tax_label", "Tax name")}
          {T("default_tax_rate", "Default tax %", { type: "number", min: 0, step: "0.01" })}
          <div className="space-y-1.5 sm:col-span-2"><Label>Payment methods (comma separated)</Label><Input disabled={!isOwner} value={methods} onChange={(e) => setMethods(e.target.value)} /></div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Tax rates differ by tariff and change over time. Confirm the correct rate with your accountant.</p>
      </Card>

      <Card title="Extras (food, extra bed…)">
        <p className="mb-3 text-xs text-muted-foreground">Staff can add these to a booking; only the owner can change prices or add new ones.</p>
        <ExtrasSettings isOwner={isOwner} />
      </Card>

      <Card title="Numbering">
        <div className="grid gap-4 sm:grid-cols-3">
          {T("booking_prefix", "Booking ID prefix")}
          {T("receipt_prefix", "Receipt prefix")}
          {T("invoice_prefix", "Invoice prefix")}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Next numbers: {f.booking_prefix}{String(f.next_booking_no).padStart(5, "0")} · {f.receipt_prefix}{String(f.next_receipt_no).padStart(5, "0")} · {f.invoice_prefix}{String(f.next_invoice_no).padStart(5, "0")}</p>
      </Card>

      <Card title="Receipts & policies">
        <div className="grid gap-3 sm:grid-cols-2">
          {([["show_logo", "Show logo"], ["show_address", "Show address"], ["show_gstin", "Show GSTIN"], ["show_balance", "Show balance due"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-3 text-sm"><Switch disabled={!isOwner} checked={f[k]} onCheckedChange={(v) => set(k, v)} /> {l}</label>
          ))}
        </div>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5"><Label>Receipt footer</Label><Textarea disabled={!isOwner} value={f.receipt_footer ?? ""} onChange={(e) => set("receipt_footer", e.target.value)} placeholder="Thank you for staying with us!" /></div>
          <div className="space-y-1.5"><Label>Terms & conditions</Label><Textarea disabled={!isOwner} value={f.terms ?? ""} onChange={(e) => set("terms", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Cancellation & refund policy</Label><Textarea disabled={!isOwner} value={f.cancellation_policy ?? ""} onChange={(e) => set("cancellation_policy", e.target.value)} /></div>
        </div>
        <div className="mt-5 rounded-lg border bg-background p-4">
          <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Receipt header preview</div>
          <div className="flex items-center gap-3">
            {f.show_logo && f.logo_url && <img src={f.logo_url} alt="" className="h-10 w-10 object-contain" />}
            <div>
              <div className="font-display font-semibold">{f.name || "Property name"}</div>
              {f.show_address && <div className="text-xs text-muted-foreground">{f.address}</div>}
              <div className="text-xs text-muted-foreground">{[f.phone, f.email].filter(Boolean).join(" · ")}{f.show_gstin && f.gstin ? ` · GSTIN ${f.gstin}` : ""}</div>
            </div>
          </div>
          {f.receipt_footer && <div className="mt-3 border-t pt-2 text-xs text-muted-foreground">{f.receipt_footer}</div>}
        </div>
      </Card>

      <Card title="Guest ID documents">
        <div className="grid gap-4 sm:grid-cols-2">
          {T("id_retention_days", "Keep ID documents for (days)", { type: "number", min: 1 })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Collect IDs only where you are legally required to. Older documents can be deleted below. Every view, upload and deletion is logged.</p>
        {isOwner && <PurgeIds />}
      </Card>

      <Card title="About this installation">
        <p className="text-sm text-muted-foreground">Backend ID: <span className="font-mono text-foreground">{import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "unknown"}</span></p>
        <p className="mt-1 text-xs text-muted-foreground">Each hotel has its own backend. Check this ID matches the one recorded for this hotel.</p>
      </Card>

      {isOwner && <div className="flex justify-end"><Button size="lg" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button></div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border bg-card p-5"><h2 className="mb-4 font-semibold">{title}</h2>{children}</section>;
}

function PurgeIds() {
  const [busy, setBusy] = useState(false);
  async function purge() {
    const { data, error } = await supabase.rpc("expired_guest_documents");
    if (error) { toast.error(errMsg(error)); return; }
    if (!data?.length) { toast.success("No documents past the retention period"); return; }
    if (!window.confirm(`Permanently delete ${data.length} ID document(s) older than the retention period?`)) return;
    setBusy(true);
    await supabase.storage.from("guest-ids").remove(data.map((d) => d.storage_path));
    const { error: e2 } = await supabase.from("guest_documents").delete().in("id", data.map((d) => d.id));
    setBusy(false);
    if (e2) toast.error(errMsg(e2)); else toast.success(`${data.length} document(s) deleted`);
  }
  return <Button variant="outline" className="mt-4" onClick={purge} disabled={busy}>{busy ? "Deleting…" : "Delete expired ID documents"}</Button>;
}
