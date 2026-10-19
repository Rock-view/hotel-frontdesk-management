import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FileUp, Eye, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errMsg, fmtDateTime } from "@/lib/format";

const TYPES = ["Aadhaar", "Passport", "Driving licence", "Voter ID", "PAN", "Other"];

export function GuestDocs({ guestId, bookingId }: { guestId: string; bookingId: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const canView = me.data?.can("view_ids");
  const [type, setType] = useState("Aadhaar");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["guest-docs", guestId],
    enabled: !!canView,
    queryFn: async () => (await supabase.from("guest_documents").select("*").eq("guest_id", guestId).order("created_at", { ascending: false })).data ?? [],
  });

  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024) { toast.error("File must be under 5 MB"); return; }
    setBusy(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${guestId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("guest-ids").upload(path, file, { contentType: file.type });
    if (up.error) { setBusy(false); toast.error(errMsg(up.error)); return; }
    const { data: doc, error } = await supabase.from("guest_documents").insert({ guest_id: guestId, booking_id: bookingId, doc_type: type, storage_path: path }).select("id").single();
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    await supabase.rpc("log_id_access", { _doc_id: doc.id, _action: "upload" });
    toast.success("ID saved");
    qc.invalidateQueries({ queryKey: ["guest-docs", guestId] });
  }
  async function view(docId: string, path: string) {
    await supabase.rpc("log_id_access", { _doc_id: docId, _action: "view" });
    const { data, error } = await supabase.storage.from("guest-ids").createSignedUrl(path, 60);
    if (error || !data) { toast.error("You cannot view this document"); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function remove(id: string, path: string) {
    if (!window.confirm("Delete this ID document?")) return;
    await supabase.storage.from("guest-ids").remove([path]);
    await supabase.from("guest_documents").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["guest-docs", guestId] });
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
        <h2 className="font-semibold">Guest ID</h2>
        <div className="flex gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" asChild disabled={busy}>
            <label className="cursor-pointer"><FileUp className="mr-1 h-4 w-4" />{busy ? "Uploading…" : "Upload / photo"}
              <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
            </label>
          </Button>
        </div>
      </div>
      <ManualIds guestId={guestId} bookingId={bookingId} canView={!!canView} isOwner={!!me.data?.isOwner} />
      {!canView ? (
        <p className="p-4 text-sm text-muted-foreground">You can upload IDs, but viewing them needs the owner's permission.</p>
      ) : q.data?.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No ID photo on file.</p>
      ) : (
        <div className="divide-y">
          {q.data?.map((d) => (
            <div key={d.id} className="flex items-center justify-between p-4 text-sm">
              <div><div className="font-medium">{d.doc_type}</div><div className="text-xs text-muted-foreground">{fmtDateTime(d.created_at)}</div></div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => view(d.id, d.storage_path)} aria-label="View"><Eye className="h-4 w-4" /></Button>
                {me.data?.isOwner && <Button size="sm" variant="ghost" onClick={() => remove(d.id, d.storage_path)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManualIds({ guestId, bookingId, canView, isOwner }: { guestId: string; bookingId: string; canView: boolean; isOwner: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["guest-id-entries", bookingId],
    enabled: canView,
    queryFn: async () => (await supabase.from("guest_id_entries").select("*").eq("booking_id", bookingId).order("created_at")).data ?? [],
  });
  const blank = { person_name: "", id_type: "Aadhaar", id_number: "" };
  const [rows, setRows] = useState([blank]);
  const [busy, setBusy] = useState(false);
  const ready = rows.filter((r) => r.person_name.trim() && r.id_number.trim());
  async function save() {
    setBusy(true);
    const { error } = await supabase.from("guest_id_entries").insert(ready.map((r) => ({ ...r, guest_id: guestId, booking_id: bookingId })));
    setBusy(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("ID details saved");
    setRows([blank]);
    qc.invalidateQueries({ queryKey: ["guest-id-entries", bookingId] });
  }
  async function del(id: string) {
    await supabase.from("guest_id_entries").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["guest-id-entries", bookingId] });
  }
  return (
    <div className="space-y-3 border-b p-4">
      <div className="text-sm font-medium">Enter ID details</div>
      {canView && q.data?.map((e) => (
        <div key={e.id} className="flex items-center justify-between text-sm">
          <span><span className="font-medium">{e.person_name}</span> · {e.id_type} · {e.id_number}</span>
          {isOwner && <Button size="sm" variant="ghost" onClick={() => del(e.id)} aria-label="Delete ID details"><Trash2 className="h-4 w-4" /></Button>}
        </div>
      ))}
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_9rem_1fr]">
          <Input placeholder="Name" value={r.person_name} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, person_name: e.target.value } : x))} />
          <Select value={r.id_type} onValueChange={(v) => setRows(rows.map((x, j) => j === i ? { ...x, id_type: v } : x))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="ID number" value={r.id_number} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, id_number: e.target.value } : x))} />
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setRows([...rows, blank])}>+ Add another</Button>
        <Button size="sm" onClick={save} disabled={busy || ready.length === 0}>{busy ? "Saving…" : "Save ID details"}</Button>
      </div>
    </div>
  );
}
