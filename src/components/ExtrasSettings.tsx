import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AmountInput } from "@/components/AmountInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errMsg } from "@/lib/format";
import { EXTRA_UNITS } from "@/lib/booking";

type Extra = { id: string; name: string; price: number; unit: string; active: boolean };

export function ExtrasSettings({ isOwner }: { isOwner: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["extras-all"],
    queryFn: async () => (await supabase.from("extras").select("*").order("sort").order("name")).data ?? [],
  });
  const [draft, setDraft] = useState({ name: "", price: 0, unit: "per_night" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["extras-all"] });

  async function update(id: string, patch: Partial<Extra>) {
    const { error } = await supabase.from("extras").update(patch).eq("id", id);
    if (error) toast.error(errMsg(error)); else refresh();
  }
  async function add() {
    const { error } = await supabase.from("extras").insert({ ...draft, sort: (q.data?.length ?? 0) + 1 });
    if (error) { toast.error(errMsg(error)); return; }
    setDraft({ name: "", price: 0, unit: "per_night" });
    refresh();
  }

  return (
    <div className="space-y-3">
      {q.data?.map((e) => <ExtraRow key={e.id} e={e} isOwner={isOwner} onSave={update} />)}
      {isOwner && (
        <div className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_7rem_10rem_auto]">
          <Input placeholder="New extra, e.g. Airport pickup" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <AmountInput aria-label="Price" value={draft.price} onValueChange={(price) => setDraft((d) => ({ ...d, price }))} />
          <UnitSelect value={draft.unit} onChange={(unit) => setDraft({ ...draft, unit })} />
          <Button onClick={add} disabled={!draft.name.trim()}>Add</Button>
        </div>
      )}
    </div>
  );
}

function ExtraRow({ e, isOwner, onSave }: { e: Extra; isOwner: boolean; onSave: (id: string, p: Partial<Extra>) => void }) {
  const [name, setName] = useState(e.name);
  const [price, setPrice] = useState(Number(e.price));
  const dirty = name !== e.name || price !== Number(e.price);
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[1fr_7rem_10rem_auto]">
      <Input disabled={!isOwner} value={name} onChange={(ev) => setName(ev.target.value)} />
      <AmountInput aria-label={`${e.name} price`} disabled={!isOwner} value={price} onValueChange={setPrice} />
      <UnitSelect disabled={!isOwner} value={e.unit} onChange={(unit) => onSave(e.id, { unit })} />
      <div className="flex items-center gap-2">
        {dirty && <Button size="sm" onClick={() => onSave(e.id, { name, price })}>Save</Button>}
        <label className="flex items-center gap-2 text-xs"><Switch disabled={!isOwner} checked={e.active} onCheckedChange={(active) => onSave(e.id, { active })} /> On</label>
      </div>
    </div>
  );
}

function UnitSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Select disabled={!!disabled} value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>{Object.entries(EXTRA_UNITS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}
