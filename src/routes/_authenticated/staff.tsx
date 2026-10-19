import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { createStaff, resetStaffPassword } from "@/lib/staff.functions";
import { PageHeader, Empty } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { errMsg } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({ meta: [{ title: "Staff — Front Desk" }, { name: "description", content: "Staff accounts and permissions." }, { property: "og:title", content: "Staff — Front Desk" }, { property: "og:description", content: "Staff accounts and permissions." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Staff,
});

const PERMS = [
  ["can_discount", "Give discounts"],
  ["can_refund", "Record refunds"],
  ["can_correct", "Correct receipts"],
  ["can_checkout_with_balance", "Check out with balance due"],
  ["can_backdate", "Create past-dated bookings"],
  ["can_view_reports", "View reports"],
  ["can_view_ids", "View guest ID documents"],
] as const;

function Staff() {
  const me = useMe();
  const qc = useQueryClient();
  const create = useServerFn(createStaff);
  const reset = useServerFn(resetStaffPassword);
  const q = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const [{ data: roles }, { data: profiles }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("profiles").select("*").order("created_at"),
      ]);
      const recep = new Set((roles ?? []).filter((r) => r.role === "receptionist").map((r) => r.user_id));
      return (profiles ?? []).filter((p) => recep.has(p.id));
    },
  });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ full_name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  if (me.data && !me.data.isOwner) return <Empty>Only the owner can manage staff.</Empty>;

  async function add() {
    setBusy(true);
    try {
      await create({ data: f });
      toast.success("Staff account created. Share the email and password with them.");
      setF({ full_name: "", email: "", password: "" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["staff"] });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function toggle(id: string, key: string, v: boolean) {
    const { error } = await supabase.from("profiles").update({ [key]: v } as never).eq("id", id);
    if (error) toast.error(errMsg(error)); else qc.invalidateQueries({ queryKey: ["staff"] });
  }
  async function newPassword(id: string) {
    const pw = window.prompt("New password (at least 8 characters)");
    if (!pw) return;
    try { await reset({ data: { user_id: id, password: pw } }); toast.success("Password changed"); } catch (e) { toast.error(errMsg(e)); }
  }

  return (
    <div>
      <PageHeader title="Staff" sub="Receptionist accounts. You can run the property with just your owner account." actions={<Button onClick={() => setOpen(true)}>Add receptionist</Button>} />
      {q.data?.length === 0 ? <Empty>No staff accounts yet.</Empty> : (
        <div className="space-y-3">
          {q.data?.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><div className="font-medium">{p.full_name}</div><div className="text-sm text-muted-foreground">{p.email}</div></div>
                <div className="flex items-center gap-3">
                  <Button size="sm" variant="ghost" onClick={() => newPassword(p.id)}>Reset password</Button>
                  <label className="flex items-center gap-2 text-sm"><Switch checked={p.active} onCheckedChange={(v) => toggle(p.id, "active", v)} /> Active</label>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PERMS.map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2 text-sm"><Switch checked={p[k]} onCheckedChange={(v) => toggle(p.id, k, v)} /> {l}</label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add receptionist</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Name</Label><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email (used to sign in)</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Password</Label><Input type="text" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={add} disabled={busy || !f.full_name || !f.email || f.password.length < 8}>{busy ? "Creating…" : "Create account"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
