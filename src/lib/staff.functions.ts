import { createServerFn } from "@tanstack/react-start";
import * as z from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ownerSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
});

/** One-time: creates the first owner account. Refuses once any owner exists. */
export const setupOwner = createServerFn({ method: "POST" })
  .inputValidator((d) => ownerSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: cErr } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "owner");
    if (cErr) throw new Error("Could not check setup status");
    if ((count ?? 0) > 0) throw new Error("Setup already completed. Please sign in.");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create owner");
    const uid = created.user.id;
    await supabaseAdmin.from("profiles").insert({ id: uid, full_name: data.full_name, email: data.email });
    const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "owner" });
    if (rErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error("Could not assign owner role");
    }
    return { ok: true };
  });

const staffSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
});

type RpcClient = { rpc: (fn: "has_role", args: { _user_id: string; _role: "owner" }) => PromiseLike<{ data: boolean | null }> };
async function assertOwner(supabase: RpcClient, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "owner" });
  if (!data) throw new Error("Only the owner can manage staff");
}

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => staffSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase as unknown as RpcClient, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create staff account");
    const uid = created.user.id;
    await supabaseAdmin.from("profiles").insert({ id: uid, full_name: data.full_name, email: data.email });
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: "receptionist" });
    return { ok: true };
  });

export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase as unknown as RpcClient, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
