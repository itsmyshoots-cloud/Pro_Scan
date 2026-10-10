import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return [...data].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}


async function getAppUserForRequest(request: Request) {
  const token = request.headers.get("x-app-session") ?? "";
  if (token.length < 32) return { user: null, status: 401, error: "Please sign in again." };
  const { data: session, error } = await db.from("app_auth_sessions")
    .select("id,user_id,expires_at,revoked_at")
    .eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (error) throw error;
  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) {
    return { user: null, status: 401, error: "Your session has expired. Please sign in again." };
  }
  const { data: user, error: userError } = await db.from("app_users")
    .select("id,email,role,is_active").eq("id", session.user_id).maybeSingle();
  if (userError) throw userError;
  if (!user || !user.is_active) return { user: null, status: 401, error: "This account is inactive. Contact your administrator." };
  if (user.role !== "super_admin") return { user, status: 403, error: "Only a Super Admin can configure user access." };
  return { user, status: 200, error: "" };
}

function newSetupCode(): string {
  return randomToken(18);
}

const allowedAppRoles = new Set(["super_admin", "planner", "operator"]);

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!supabaseUrl || !serviceKey) return json({ error: "Authentication service is not configured." }, 500);

  try {
    const body = await request.json();
    const action = String(body?.action ?? "");

    if (action === "setup") {
      const email = String(body?.email ?? "").trim().toLowerCase();
      const setupCode = String(body?.setupCode ?? "").trim();
      const password = String(body?.password ?? "");
      if (!email || !setupCode || !password) return json({ error: "Enter your email, setup code, and new password." });
      if (password.length < 10 || password.length > 200) return json({ error: "Choose a password between 10 and 200 characters." });

      const { data: user, error } = await db.from("app_users")
        .select("id,email,role,setup_token_hash,password_hash,is_active")
        .eq("email", email).maybeSingle();
      if (error) throw error;
      if (!user || !user.is_active || user.password_hash || !user.setup_token_hash) {
        return json({ error: "Password setup is unavailable for this account. Contact your administrator." });
      }
      const suppliedHash = await sha256Hex(setupCode);
      if (!safeEqual(suppliedHash, user.setup_token_hash)) return json({ error: "The setup code is invalid or has already been used." });

      const passwordHash = await bcrypt.hash(password, 12);
      const { data: changed, error: updateError } = await db.from("app_users")
        .update({ password_hash: passwordHash, setup_token_hash: null, updated_at: new Date().toISOString() })
        .eq("id", user.id).eq("setup_token_hash", suppliedHash).is("password_hash", null)
        .select("id").maybeSingle();
      if (updateError) throw updateError;
      if (!changed) return json({ error: "Password setup code has already been used. Try signing in." });
      return json({ ok: true, message: "Password created. You can now sign in." });
    }

    if (action === "login") {
      const email = String(body?.email ?? "").trim().toLowerCase();
      const password = String(body?.password ?? "");
      if (!email || !password || email.length > 320 || password.length > 200) return json({ error: "Enter a valid company email and password." });

      const ipHash = await sha256Hex(clientIp(request));
      const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count, error: rateError } = await db.from("app_login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("email", email).eq("ip_hash", ipHash).eq("succeeded", false).gte("created_at", cutoff);
      if (rateError) throw rateError;
      if ((count ?? 0) >= 8) return json({ error: "Too many unsuccessful attempts. Please wait 15 minutes and try again." });

      const { data: user, error } = await db.from("app_users")
        .select("id,email,role,password_hash,is_active")
        .eq("email", email).maybeSingle();
      if (error) throw error;
      const valid = Boolean(user && user.is_active && user.password_hash && await bcrypt.compare(password, user.password_hash));
      if (!valid) {
        await db.from("app_login_attempts").insert({ email, ip_hash: ipHash, succeeded: false });
        return json({ error: "Invalid email or password, or access is disabled." });
      }

      await db.from("app_login_attempts").delete().eq("email", email).eq("ip_hash", ipHash);
      const token = randomToken(32);
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const { error: sessionError } = await db.from("app_auth_sessions").insert({
        user_id: user.id, token_hash: await sha256Hex(token), expires_at: expiresAt,
      });
      if (sessionError) throw sessionError;
      return json({ ok: true, token, expiresAt, user: { email: user.email, role: user.role } });
    }

    if (["list-users", "create-user", "update-user-role", "set-user-active", "reset-user-password"].includes(action)) {
      const access = await getAppUserForRequest(request);
      if (!access.user || access.status !== 200) return json({ error: access.error }, access.status);

      if (action === "list-users") {
        const { data: rows, error } = await db.from("app_users")
          .select("id,email,role,is_active,password_hash,created_at,updated_at")
          .order("created_at", { ascending: true });
        if (error) throw error;
        return json({ users: (rows ?? []).map((row) => ({
          id: row.id,
          email: row.email,
          role: row.role,
          is_active: row.is_active,
          password_configured: Boolean(row.password_hash),
          created_at: row.created_at,
          updated_at: row.updated_at,
        })) });
      }

      if (action === "create-user") {
        const email = String(body?.email ?? "").trim().toLowerCase();
        const role = String(body?.role ?? "");
        if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return json({ error: "Enter a valid company email address." });
        }
        if (!allowedAppRoles.has(role)) return json({ error: "Choose a valid role." });
        const { data: existing, error: existingError } = await db.from("app_users")
          .select("id").eq("email", email).maybeSingle();
        if (existingError) throw existingError;
        if (existing) return json({ error: "An account already exists for this email address." });
        const setupCode = newSetupCode();
        const { data: created, error } = await db.from("app_users").insert({
          email, role, is_active: true, password_hash: null, setup_token_hash: await sha256Hex(setupCode),
        }).select("id,email,role,is_active,created_at").single();
        if (error) throw error;
        return json({ user: { ...created, password_configured: false }, setupCode });
      }

      const userId = String(body?.userId ?? "");
      if (!userId) return json({ error: "User ID is required." });
      if (userId === access.user.id) return json({ error: "You cannot change your own role, deactivate yourself, or reset your own password here." });

      const { data: target, error: targetError } = await db.from("app_users")
        .select("id,email,role,is_active").eq("id", userId).maybeSingle();
      if (targetError) throw targetError;
      if (!target) return json({ error: "The selected account was not found." });

      if (action === "update-user-role") {
        const role = String(body?.role ?? "");
        if (!allowedAppRoles.has(role)) return json({ error: "Choose a valid role." });
        if (target.is_active && target.role === "super_admin" && role !== "super_admin") {
          const { count, error } = await db.from("app_users").select("id", { count: "exact", head: true })
            .eq("role", "super_admin").eq("is_active", true);
          if (error) throw error;
          if ((count ?? 0) <= 1) return json({ error: "At least one active Super Admin must remain." });
        }
        const { error } = await db.from("app_users").update({ role, updated_at: new Date().toISOString() }).eq("id", userId);
        if (error) throw error;
        return json({ ok: true });
      }

      if (action === "set-user-active") {
        const isActive = Boolean(body?.isActive);
        if (!isActive && target.is_active && target.role === "super_admin") {
          const { count, error } = await db.from("app_users").select("id", { count: "exact", head: true })
            .eq("role", "super_admin").eq("is_active", true);
          if (error) throw error;
          if ((count ?? 0) <= 1) return json({ error: "At least one active Super Admin must remain." });
        }
        const { error } = await db.from("app_users").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", userId);
        if (error) throw error;
        if (!isActive) {
          await db.from("app_auth_sessions").update({ revoked_at: new Date().toISOString() })
            .eq("user_id", userId).is("revoked_at", null);
        }
        return json({ ok: true });
      }

      if (action === "reset-user-password") {
        const setupCode = newSetupCode();
        const { error } = await db.from("app_users").update({
          password_hash: null,
          setup_token_hash: await sha256Hex(setupCode),
          updated_at: new Date().toISOString(),
        }).eq("id", userId);
        if (error) throw error;
        await db.from("app_auth_sessions").update({ revoked_at: new Date().toISOString() })
          .eq("user_id", userId).is("revoked_at", null);
        return json({ user: { id: target.id, email: target.email, role: target.role }, setupCode });
      }
    }

    const token = request.headers.get("x-app-session") ?? "";
    if (action === "session") {
      if (token.length < 32) return json({ user: null });
      const { data: session, error } = await db.from("app_auth_sessions")
        .select("id,user_id,expires_at,revoked_at")
        .eq("token_hash", await sha256Hex(token)).maybeSingle();
      if (error) throw error;
      if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) return json({ user: null });

      const { data: user, error: userError } = await db.from("app_users")
        .select("email,role,is_active").eq("id", session.user_id).maybeSingle();
      if (userError) throw userError;
      if (!user || !user.is_active) {
        await db.from("app_auth_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", session.id);
        return json({ user: null });
      }
      return json({ user: { email: user.email, role: user.role }, expiresAt: session.expires_at });
    }

    if (action === "logout") {
      if (token.length >= 32) {
        await db.from("app_auth_sessions")
          .update({ revoked_at: new Date().toISOString() })
          .eq("token_hash", await sha256Hex(token)).is("revoked_at", null);
      }
      return json({ ok: true });
    }

    return json({ error: "Unknown authentication action." });
  } catch (error) {
    console.error("app-auth error", error);
    return json({ error: "Authentication service error. Please try again." }, 500);
  }
});
