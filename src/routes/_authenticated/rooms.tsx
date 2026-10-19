import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe, useSettings } from "@/hooks/use-me";
import { PageHeader, StatusPill, Empty } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addDaysISO, errMsg, fmtDate, money, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/rooms")({
  head: () => ({ meta: [{ title: "Rooms — Front Desk" }, { name: "description", content: "Rooms, categories, housekeeping and blocks." }, { property: "og:title", content: "Rooms — Front Desk" }, { property: "og:description", content: "Rooms, categories, housekeeping and blocks." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Rooms,
});

const UNIT_TYPES = ["Room", "Suite", "Dormitory", "Cottage", "Villa", "Cabin", "Tent"];

type RoomRow = {
  id: string; number: string; category_id: string | null; floor: string | null;
  rate: number; max_guests: number; description: string | null; active: boolean;
  housekeeping: string; room_categories?: { name: string; unit_type: string } | null;
};

function Rooms() {
  const me = useMe();
  const settings = useSettings();
  const cur = settings.data?.currency ?? "INR";
  const qc = useQueryClient();
  const isOwner = !!me.data?.isOwner;
  const q = useQuery({
    queryKey: ["rooms-all"],
    queryFn: async () => {
      const [r, c, b] = await Promise.all([
        supabase.from("rooms").select("*, room_categories(name, unit_type)").order("number"),
        supabase.from("room_categories").select("*").order("name"),
        supabase.from("room_blocks").select("*, rooms(number)").gte("end_date", todayISO()).order("start_date"),
      ]);
      return { rooms: r.data ?? [], cats: c.data ?? [], blocks: b.data ?? [] };
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["rooms-all"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const [roomOpen, setRoomOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [editRoom, setEditRoom] = useState<RoomRow | null>(null);

  async function setHousekeeping(id: string, v: string) {
    const { error } = await supabase.from("rooms").update({ housekeeping: v }).eq("id", id);
    if (error) toast.error(errMsg(error)); else refresh();
  }

  async function deleteRoom(r: RoomRow) {
    if (!window.confirm(`Delete room ${r.number}? Past bills will still show this room number.`)) return;
    const { error } = await supabase.rpc("delete_room", { _room_id: r.id });
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(`Room ${r.number} deleted`);
    refresh();
  }
  const visibleRooms = (q.data?.rooms ?? []) as RoomRow[];

  return (
    <div>
      <PageHeader title="Rooms" sub={`${visibleRooms.length} units`} actions={isOwner && (
        <>
          <Button variant="outline" onClick={() => setCatOpen(true)}>Add category</Button>
          <Button onClick={() => setRoomOpen(true)}>Add rooms</Button>
        </>
      )} />
      <Tabs defaultValue="rooms">
        <TabsList>
          <TabsTrigger value="rooms">Rooms</TabsTrigger>
          <TabsTrigger value="cats">Categories</TabsTrigger>
          <TabsTrigger value="blocks">Blocked dates</TabsTrigger>
        </TabsList>
        <TabsContent value="rooms" className="mt-4">
          {visibleRooms.length === 0 ? <Empty>{isOwner ? "Add a category, then add your rooms." : "No rooms yet."}</Empty> : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleRooms.map((r) => (
                <div key={r.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-display text-xl font-semibold">{r.number}</div>
                      <div className="text-sm text-muted-foreground">{r.room_categories?.name ?? "No category"} · {r.max_guests} guests</div>
                    </div>
                    <div className="text-right font-medium">{money(r.rate, cur)}<div className="text-xs text-muted-foreground">per night</div></div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <StatusPill status={r.housekeeping === "ready" ? "available" : r.housekeeping} label={{ ready: "Ready", cleaning: "Cleaning", maintenance: "Maintenance" }[r.housekeeping]} />
                    <div className="flex items-center gap-1">
                      {isOwner && (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => setEditRoom(r)} aria-label={`Edit room ${r.number}`}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteRoom(r)} aria-label={`Delete room ${r.number}`}><Trash2 className="h-4 w-4" /></Button>
                        </>
                      )}
                      <Select value={r.housekeeping} onValueChange={(v) => setHousekeeping(r.id, v)}>
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ready">Ready</SelectItem>
                          <SelectItem value="cleaning">Cleaning</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="cats" className="mt-4">
          {q.data?.cats.length === 0 ? <Empty>No categories yet.</Empty> : (
            <div className="divide-y rounded-xl border bg-card">
              {q.data?.cats.map((c) => (
                <div key={c.id} className="flex justify-between p-4">
                  <div><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{c.unit_type} · up to {c.max_guests} guests</div></div>
                  <div className="font-medium">{money(c.base_rate, cur)}</div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="blocks" className="mt-4">
          {isOwner && <Button variant="outline" className="mb-3" onClick={() => setBlockOpen(true)}>Block dates</Button>}
          {q.data?.blocks.length === 0 ? <Empty>No upcoming blocks.</Empty> : (
            <div className="divide-y rounded-xl border bg-card">
              {q.data?.blocks.map((b) => (
                <div key={b.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-medium">Room {b.rooms?.number} · {b.kind === "owner" ? "Owner block" : "Maintenance"}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(b.start_date)} → {fmtDate(b.end_date)}{b.reason ? ` · ${b.reason}` : ""}</div>
                  </div>
                  {isOwner && (
                    <Button size="icon" variant="ghost" onClick={async () => { await supabase.from("room_blocks").delete().eq("id", b.id); refresh(); }} aria-label="Remove block"><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CategoryDialog open={catOpen} onClose={() => setCatOpen(false)} onDone={refresh} />
      <RoomDialog open={roomOpen} onClose={() => setRoomOpen(false)} cats={q.data?.cats ?? []} onDone={refresh} />
      <BlockDialog open={blockOpen} onClose={() => setBlockOpen(false)} rooms={q.data?.rooms ?? []} onDone={refresh} />
      <EditRoomDialog room={editRoom} onClose={() => setEditRoom(null)} cats={q.data?.cats ?? []} onDone={refresh} />
    </div>
  );
}

function CategoryDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", unit_type: "Room", base_rate: "", max_guests: "2", description: "" });
  async function save() {
    const { error } = await supabase.from("room_categories").insert({ name: f.name, unit_type: f.unit_type, base_rate: Number(f.base_rate), max_guests: Number(f.max_guests), description: f.description || null });
    if (error) { toast.error(errMsg(error)); return; }
    setF({ name: "", unit_type: "Room", base_rate: "", max_guests: "2", description: "" });
    onDone(); onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New category</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Name</Label><Input placeholder="Deluxe AC, Garden Cottage…" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Type</Label>
            <Select value={f.unit_type} onValueChange={(v) => setF({ ...f, unit_type: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{UNIT_TYPES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>Max guests</Label><Input type="number" min={1} value={f.max_guests} onChange={(e) => setF({ ...f, max_guests: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Standard rate per night</Label><Input type="number" min={0} value={f.base_rate} onChange={(e) => setF({ ...f, base_rate: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Description / amenities</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={!f.name}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Cat = { id: string; name: string; base_rate: number; max_guests: number };
function RoomDialog({ open, onClose, cats, onDone }: { open: boolean; onClose: () => void; cats: Cat[]; onDone: () => void }) {
  const [catId, setCatId] = useState("");
  const [numbers, setNumbers] = useState("");
  const [floor, setFloor] = useState("");
  const cat = cats.find((c) => c.id === catId);

  function parse(): string[] {
    const out: string[] = [];
    for (const part of numbers.split(/[,\s]+/).filter(Boolean)) {
      const m = part.match(/^(\d+)-(\d+)$/);
      if (m) { for (let i = Number(m[1]); i <= Number(m[2]) && out.length < 500; i++) out.push(String(i)); }
      else out.push(part);
    }
    return [...new Set(out)];
  }
  const list = parse();
  async function save() {
    if (!cat) { toast.error("Choose a category"); return; }
    const { error } = await supabase.from("rooms").insert(list.map((n) => ({ number: n, category_id: cat.id, rate: cat.base_rate, max_guests: cat.max_guests, floor: floor || null })));
    if (error) { toast.error(error.code === "23505" ? "One of these room numbers already exists" : errMsg(error)); return; }
    toast.success(`${list.length} room${list.length > 1 ? "s" : ""} added`);
    setNumbers(""); onDone(); onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add rooms</DialogTitle></DialogHeader>
        {cats.length === 0 ? <p className="text-sm text-muted-foreground">Create a category first.</p> : (
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Category</Label>
              <Select value={catId} onValueChange={setCatId}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Room numbers or names</Label><Input placeholder="101-110, 201, Villa A" value={numbers} onChange={(e) => setNumbers(e.target.value)} />
              <p className="text-xs text-muted-foreground">Use ranges like 101-110 to add many at once. {list.length > 0 && `${list.length} will be created.`}</p></div>
            <div className="space-y-1.5"><Label>Floor / block (optional)</Label><Input value={floor} onChange={(e) => setFloor(e.target.value)} /></div>
          </div>
        )}
        <DialogFooter><Button onClick={save} disabled={!cat || list.length === 0}>Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRoomDialog({ room, onClose, cats, onDone }: { room: RoomRow | null; onClose: () => void; cats: Cat[]; onDone: () => void }) {
  const [f, setF] = useState({ number: "", category_id: "", floor: "", rate: "", max_guests: "2", description: "", active: true });
  useEffect(() => {
    if (room) setF({ number: room.number, category_id: room.category_id ?? "", floor: room.floor ?? "", rate: String(room.rate), max_guests: String(room.max_guests), description: room.description ?? "", active: room.active });
  }, [room]);
  async function save() {
    if (!room) return;
    const { error } = await supabase.from("rooms").update({
      number: f.number, category_id: f.category_id || null, floor: f.floor || null,
      rate: Number(f.rate), max_guests: Number(f.max_guests), description: f.description || null, active: f.active,
    }).eq("id", room.id);
    if (error) { toast.error(error.code === "23505" ? "Another room already has this number" : errMsg(error)); return; }
    toast.success(`Room ${f.number} updated`);
    onDone(); onClose();
  }
  return (
    <Dialog open={!!room} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit room {room?.number}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Room number / name</Label><Input value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Category</Label>
            <Select value={f.category_id} onValueChange={(v) => setF({ ...f, category_id: v })}><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>Rate per night</Label><Input type="number" min={0} value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Max guests</Label><Input type="number" min={1} value={f.max_guests} onChange={(e) => setF({ ...f, max_guests: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Floor / block</Label><Input value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Status</Label>
            <Select value={f.active ? "active" : "inactive"} onValueChange={(v) => setF({ ...f, active: v === "active" })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={!f.number}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BlockDialog({ open, onClose, rooms, onDone }: { open: boolean; onClose: () => void; rooms: { id: string; number: string }[]; onDone: () => void }) {
  const [f, setF] = useState({ room_id: "", start_date: todayISO(), end_date: addDaysISO(todayISO(), 1), kind: "maintenance", reason: "" });
  async function save() {
    const { error } = await supabase.from("room_blocks").insert({ ...f, reason: f.reason || null });
    if (error) { toast.error(error.code === "23P01" ? "This room already has a block on those dates" : errMsg(error)); return; }
    onDone(); onClose();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Block dates</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Room</Label>
            <Select value={f.room_id} onValueChange={(v) => setF({ ...f, room_id: v })}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.number}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>Reason type</Label>
            <Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="maintenance">Maintenance</SelectItem><SelectItem value="owner">Owner block</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>From</Label><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Until (exclusive)</Label><Input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Note</Label><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={!f.room_id || f.end_date <= f.start_date}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
