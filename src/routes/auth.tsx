import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { BedDouble } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { setupOwner } from "@/lib/staff.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMsg } from "@/lib/format";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Front Desk" },
      { name: "description", content: "Staff sign-in for your hotel's front desk." },
      { property: "og:title", content: "Sign in — Front Desk" },
      { property: "og:description", content: "Staff sign-in for your hotel's front desk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const ownerQ = useQuery({
    queryKey: ["owner-exists"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("owner_exists");
      if (error) throw error;
      return !!data;
    },
  });
  const setup = useServerFn(setupOwner);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const isSetup = ownerQ.data === false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (isSetup) {
        await setup({ data: form });
        toast.success("Owner account created");
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });
      if (error) throw error;
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 font-display text-lg font-semibold">
          <BedDouble className="h-6 w-6" /> Front Desk
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight">
            Every room, every rupee, in one calm place.
          </h1>
          <p className="mt-4 max-w-md text-primary-foreground/80">
            Bookings, check-ins, payments and receipts for your hotel, lodge or resort.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/60">Staff access only</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h2 className="text-2xl font-semibold">
              {isSetup ? "Set up your property" : "Sign in"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isSetup
                ? "Create the owner account. This screen appears only once."
                : "Use the account given to you by the owner."}
            </p>
          </div>
          {isSetup && (
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                required
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={isSetup ? 8 : undefined}
              autoComplete={isSetup ? "new-password" : "current-password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            {!isSetup && (
              <div className="flex justify-end pt-0.5">
                <Link
                  to="/forgot-password"
                  className="text-xs text-muted-foreground transition-colors hover:text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            )}
          </div>
          <Button type="submit" className="h-11 w-full" disabled={busy || ownerQ.isLoading}>
            {busy ? "Please wait…" : isSetup ? "Create owner account" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
