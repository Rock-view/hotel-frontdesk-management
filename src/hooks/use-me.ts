import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) return null;
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      ]);
      const isOwner = !!roles?.some((r) => r.role === "owner");
      const p = profile;
      const can = (perm: "refund" | "correct" | "discount" | "checkout_with_balance" | "backdate" | "reports" | "view_ids") =>
        isOwner || !!(p && p.active && (p as Record<string, unknown>)[`can_${perm === "reports" ? "view_reports" : perm}`]);
      return { user, isOwner, isStaff: !!roles?.length && !!p?.active, profile: p, can };
    },
    staleTime: 60_000,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hotel_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}
