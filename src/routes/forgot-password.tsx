import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BedDouble, ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMsg } from "@/lib/format";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot Password — Front Desk" },
      {
        name: "description",
        content: "Request a password reset link for your hotel front desk account.",
      },
      { property: "og:title", content: "Forgot Password — Front Desk" },
      {
        property: "og:description",
        content: "Request a password reset link for your hotel front desk account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  ssr: false,
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast.error("Please enter your email address");
      return;
    }

    setBusy(true);
    try {
      const options =
        typeof window !== "undefined"
          ? { redirectTo: `${window.location.origin}/reset-password` }
          : {};

      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, options);

      if (error) {
        // Log generic failure to toast without revealing sensitive internal details
        toast.error(errMsg(error));
      } else {
        setSent(true);
        setCooldown(60);
        toast.success("Password reset instructions sent");
      }
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
            Secure self-service password recovery for property owners and staff.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/60">Staff access only</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>

          {sent ? (
            <div className="space-y-5 rounded-xl border bg-card p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-foreground">Check your email</h2>
                <p className="text-sm text-muted-foreground">
                  If an account exists for{" "}
                  <span className="font-medium text-foreground">{email}</span>, you will receive a
                  secure password reset link shortly.
                </p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3.5 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Didn't receive the email?</p>
                <p>Check your spam or junk folder. Links expire after 24 hours.</p>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={cooldown > 0 || busy}
                  onClick={handleSubmit}
                >
                  {cooldown > 0 ? `Resend link in ${cooldown}s` : "Resend reset link"}
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link to="/auth">Return to sign in</Link>
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Forgot password?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your staff or owner email address to receive a secure password reset link.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pr-10"
                  />
                  <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <Button type="submit" className="h-11 w-full" disabled={busy || !email}>
                {busy ? "Sending reset link…" : "Send reset link"}
              </Button>

              <div className="text-center">
                <Link
                  to="/auth"
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
                >
                  Remember your password? Sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
