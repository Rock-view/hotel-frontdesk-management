import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { supabase } from "@/integrations/supabase/client";

// Mock Supabase client auth methods
vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      auth: {
        resetPasswordForEmail: vi.fn(),
        updateUser: vi.fn(),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({
          data: { subscription: { unsubscribe: vi.fn() } },
        }),
        exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        signInWithPassword: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "test-user" } }, error: null }),
      },
      rpc: vi.fn().mockImplementation((fn: string) => {
        if (fn === "owner_exists") return Promise.resolve({ data: true, error: null });
        return Promise.resolve({ data: null, error: null });
      }),
    },
  };
});

describe("Authentication & Password Recovery Routes", () => {
  let queryClient: QueryClient;

  async function createAndLoadRouter(initialPath: string) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    const history = createMemoryHistory({ initialEntries: [initialPath] });
    const router = createRouter({
      routeTree,
      history,
      context: { queryClient },
    });

    await router.load();
    return router;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Route Tree Definition", () => {
    it("matches the /auth login route", async () => {
      const router = await createAndLoadRouter("/auth");
      const matches = router.matchRoutes("/auth");
      expect(matches.at(-1)?.routeId).toBe("/auth");
    });

    it("matches the /forgot-password route", async () => {
      const router = await createAndLoadRouter("/forgot-password");
      const matches = router.matchRoutes("/forgot-password");
      expect(matches.at(-1)?.routeId).toBe("/forgot-password");
    });

    it("matches the /reset-password route", async () => {
      const router = await createAndLoadRouter("/reset-password");
      const matches = router.matchRoutes("/reset-password");
      expect(matches.at(-1)?.routeId).toBe("/reset-password");
    });
  });

  describe("Forgot Password Flow", () => {
    it("renders the forgot password form with email input and actions", async () => {
      const router = await createAndLoadRouter("/forgot-password");
      render(<RouterProvider router={router} />);

      expect(await screen.findByRole("heading", { name: /forgot password/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /back to sign in/i })).toBeInTheDocument();
    });

    it("calls supabase.auth.resetPasswordForEmail with target email and /reset-password redirect", async () => {
      vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValueOnce({
        data: {},
        error: null,
      } as never);

      const router = await createAndLoadRouter("/forgot-password");
      render(<RouterProvider router={router} />);

      const emailInput = await screen.findByLabelText(/email/i);
      fireEvent.change(emailInput, { target: { value: "reception@hotel.com" } });

      const submitButton = screen.getByRole("button", { name: /send reset link/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
          "reception@hotel.com",
          expect.objectContaining({
            redirectTo: expect.stringContaining("/reset-password"),
          }),
        );
      });

      // Confirmation screen should now be shown
      expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
      expect(screen.getByText(/reception@hotel.com/i)).toBeInTheDocument();
    });

    it("displays error feedback if resetPasswordForEmail returns an error", async () => {
      vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValueOnce({
        data: null,
        error: { message: "Too many requests. Try later." },
      } as never);

      const router = await createAndLoadRouter("/forgot-password");
      render(<RouterProvider router={router} />);

      const emailInput = await screen.findByLabelText(/email/i);
      fireEvent.change(emailInput, { target: { value: "owner@hotel.com" } });

      fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

      await waitFor(() => {
        expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalled();
      });

      // Still renders form rather than confirmation on failure
      expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument();
    });
  });

  describe("Reset Password Flow", () => {
    it("displays an error state when URL indicates expired recovery token", async () => {
      const originalLocation = window.location;
      Object.defineProperty(window, "location", {
        writable: true,
        value: {
          ...originalLocation,
          hash: "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
          search: "",
          origin: "http://localhost:3000",
        },
      });

      const router = await createAndLoadRouter("/reset-password");
      render(<RouterProvider router={router} />);

      expect(await screen.findByText(/reset link expired or invalid/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /request new reset link/i })).toBeInTheDocument();

      Object.defineProperty(window, "location", {
        writable: true,
        value: originalLocation,
      });
    });

    it("renders password input fields when a valid recovery session is present", async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: {
          session: {
            access_token: "mock-token",
            refresh_token: "mock-refresh",
            user: { id: "user-123" },
          } as never,
        },
        error: null,
      });

      const router = await createAndLoadRouter("/reset-password");
      render(<RouterProvider router={router} />);

      expect(await screen.findByRole("heading", { name: /set new password/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^confirm new password/i)).toBeInTheDocument();
    });

    it("toggles password visibility when eye toggle button is clicked", async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { user: { id: "user-123" } } as never },
        error: null,
      });

      const router = await createAndLoadRouter("/reset-password");
      render(<RouterProvider router={router} />);

      const passwordInput = await screen.findByLabelText(/^new password/i);
      expect(passwordInput).toHaveAttribute("type", "password");

      const toggleButton = screen.getByLabelText(/show password/i);
      fireEvent.click(toggleButton);

      expect(passwordInput).toHaveAttribute("type", "text");
    });

    it("validates that passwords match and disables submit on mismatch", async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { user: { id: "user-123" } } as never },
        error: null,
      });

      const router = await createAndLoadRouter("/reset-password");
      render(<RouterProvider router={router} />);

      const newPassInput = await screen.findByLabelText(/^new password/i);
      const confirmPassInput = screen.getByLabelText(/^confirm new password/i);
      const submitBtn = screen.getByRole("button", { name: /save new password/i });

      // Passwords do not match
      fireEvent.change(newPassInput, { target: { value: "CorrectHorse8!" } });
      fireEvent.change(confirmPassInput, { target: { value: "WrongBattery9@" } });

      expect(submitBtn).toBeDisabled();
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();

      // Passwords match
      fireEvent.change(confirmPassInput, { target: { value: "CorrectHorse8!" } });
      expect(submitBtn).not.toBeDisabled();
      expect(screen.getByText(/passwords match/i)).toBeInTheDocument();
    });

    it("calls updateUser and signs out on successful password update", async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: { user: { id: "user-123" } } as never },
        error: null,
      });
      vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce({
        data: { user: { id: "user-123" } as never },
        error: null,
      });

      const router = await createAndLoadRouter("/reset-password");
      render(<RouterProvider router={router} />);

      const newPassInput = await screen.findByLabelText(/^new password/i);
      const confirmPassInput = screen.getByLabelText(/^confirm new password/i);

      fireEvent.change(newPassInput, { target: { value: "NewSecurePass123!" } });
      fireEvent.change(confirmPassInput, { target: { value: "NewSecurePass123!" } });

      const submitBtn = screen.getByRole("button", { name: /save new password/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(supabase.auth.updateUser).toHaveBeenCalledWith({
          password: "NewSecurePass123!",
        });
        expect(supabase.auth.signOut).toHaveBeenCalled();
      });

      expect(await screen.findByText(/password reset complete/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /sign in with new password/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Sign-in Screen Integration", () => {
    it("renders the Forgot Password link on the login page for existing installations", async () => {
      const router = await createAndLoadRouter("/auth");
      render(<RouterProvider router={router} />);

      const forgotLink = await screen.findByRole("link", { name: /forgot password\?/i });
      expect(forgotLink).toBeInTheDocument();
      expect(forgotLink).toHaveAttribute("href", "/forgot-password");
    });
  });
});
