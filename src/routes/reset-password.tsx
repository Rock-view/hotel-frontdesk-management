import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BedDouble,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  KeyRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errMsg } from "@/lib/format";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — Front Desk" },
      { name: "description", content: "Set a new password for your hotel front desk account." },
      { property: "og:title", content: "Reset Password — Front Desk" },
      {
        property: "og:description",
        content: "Set a new password for your hotel front desk account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  ssr: false,
  component: ResetPasswordPage,
});

type RecoveryStatus = "verifying" | "ready" | "error" | "success";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<RecoveryStatus>("verifying");
  const [errorMessage, setErrorMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function verifyRecoveryLink() {
      // 1. Inspect URL hash and query string for standard Supabase error responses
      const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
      const search = typeof window !== "undefined" ? window.location.search : "";
      const hashParams = new URLSearchParams(hash);
      const searchParams = new URLSearchParams(search);

      const errDesc =
        hashParams.get("error_description") ||
        searchParams.get("error_description") ||
        hashParams.get("error") ||
        searchParams.get("error");

      if (errDesc) {
        if (active) {
          setStatus("error");
          setErrorMessage(
            errDesc.toLowerCase().includes("expired")
              ? "This password reset link has expired. Please request a new one."
              : "This password reset link is invalid or has already been used. Please request a new one.",
          );
        }
        return;
      }

      // 2. PKCE code exchange if present in search params
      const code = searchParams.get("code");
      if (code) {
        try {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) {
            if (active) {
              setStatus("error");
              setErrorMessage(
                "Unable to verify the password reset code. The link may have expired or was already used.",
              );
            }
            return;
          }
          if (active) {
            setStatus("ready");
          }
          return;
        } catch {
          if (active) {
            setStatus("error");
            setErrorMessage("Failed to process reset link code. Please request a new reset link.");
          }
          return;
        }
      }

      // 3. Listen for auth state change
      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) {
          setStatus("ready");
        }
      });

      // 4. Check if session is already active or marked as recovery
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const type = hashParams.get("type");

      if (session || type === "recovery") {
        if (active) setStatus("ready");
        authListener.subscription.unsubscribe();
        return;
      }

      // 5. Short fallback timeout in case the hash fragment takes a moment to process
      const timer = setTimeout(async () => {
        if (!active) return;
        const { data: refreshed } = await supabase.auth.getSession();
        if (active) {
          if (refreshed.session) {
            setStatus("ready");
          } else {
            setStatus("error");
            setErrorMessage(
              "No valid password reset session was found. The link may have expired, already been used, or is incomplete.",
            );
          }
        }
      }, 1500);

      return () => {
        authListener.subscription.unsubscribe();
        clearTimeout(timer);
      };
    }

    verifyRecoveryLink();
    return () => {
      active = false;
    };
  }, []);

  const isLengthValid = password.length >= 8;
  const isMatch = password === confirmPassword && confirmPassword.length > 0;
  const canSubmit = isLengthValid && isMatch && !busy;

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!isLengthValid) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Invalidate the recovery session so the user must sign in freshly with new credentials
      await supabase.auth.signOut();

      setStatus("success");
      toast.success("Password reset successfully");
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
            Set a new, secure password for your hotel front desk management account.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/60">Staff access only</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          {status === "verifying" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground animate-pulse">
                <KeyRound className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">Verifying reset link</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Checking your recovery credentials…
                </p>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-5 rounded-xl border border-destructive/20 bg-card p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-foreground">
                  Reset link expired or invalid
                </h2>
                <p className="text-sm text-muted-foreground">
                  {errorMessage ||
                    "This recovery link is no longer valid. Please request a new link to continue."}
                </p>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <Button asChild className="w-full">
                  <Link to="/forgot-password">Request new reset link</Link>
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link to="/auth">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-5 rounded-xl border bg-card p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-foreground">Password reset complete</h2>
                <p className="text-sm text-muted-foreground">
                  Your password has been successfully updated. You can now sign in using your new
                  credentials.
                </p>
              </div>
              <div className="pt-2">
                <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
                  Sign in with new password
                </Button>
              </div>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Set new password</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose a new password with at least 8 characters.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p
                  className={`text-xs ${password.length >= 8 ? "text-primary font-medium" : "text-muted-foreground"}`}
                >
                  • Minimum 8 characters ({password.length}/8)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={
                      showConfirmPassword ? "Hide confirm password" : "Show confirm password"
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  <p
                    className={`text-xs ${isMatch ? "text-primary font-medium" : "text-destructive font-medium"}`}
                  >
                    {isMatch ? "✓ Passwords match" : "✕ Passwords do not match"}
                  </p>
                )}
              </div>

              <Button type="submit" className="h-11 w-full" disabled={!canSubmit}>
                {busy ? "Updating password…" : "Save new password"}
              </Button>

              <div className="text-center">
                <Link
                  to="/auth"
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
                >
                  Cancel and return to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
