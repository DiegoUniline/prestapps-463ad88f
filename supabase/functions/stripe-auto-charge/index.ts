import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((o) => o.trim()).filter(Boolean);

const withCors = (handler: (req: Request) => Response | Promise<Response>) => async (req: Request) => {
  const res = await handler(req);
  const origin = req.headers.get("Origin") || "";
  const headers = new Headers(res.headers);
  if (!ALLOWED_ORIGINS.length) {
    headers.set("Access-Control-Allow-Origin", "*");
  } else {
    if (ALLOWED_ORIGINS.includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
    else headers.delete("Access-Control-Allow-Origin");
    headers.append("Vary", "Origin");
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

const SUPER_ADMIN_EMAIL = (Deno.env.get("SUPER_ADMIN_EMAIL") || "diego.leon@uniline.mx").trim().toLowerCase();

type Caller = {
  service: boolean;
  userId: string | null;
  email: string | null;
  empresaId: string | null;
  roles: string[];
  superAdmin: boolean;
};

async function getCaller(req: Request, admin: SupabaseClient): Promise<Caller | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && token === serviceKey) {
    return { service: true, userId: null, email: null, empresaId: null, roles: [], superAdmin: false };
  }
  const { data, error } = await admin.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return null;
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    admin.from("profiles").select("empresa_id").eq("id", user.id).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  const email = String(user.email || "").toLowerCase();
  return {
    service: false,
    userId: user.id,
    email,
    empresaId: profile?.empresa_id ?? null,
    roles: (roleRows || []).map((r: { role: string }) => r.role),
    superAdmin: !!email && email === SUPER_ADMIN_EMAIL,
  };
}

interface PrestamoAutoCharge {
  id: string;
  cliente_id: string;
  empresa_id: string | null;
}

interface AutoChargeResult {
  prestamo_id: string;
  status: string;
  reason?: string;
  cuota_id?: string;
  monto?: number;
  error?: string;
}

// Service role and super admin run freely; any other caller (e.g. pg_cron with the anon key) is throttled.
async function cronGate(req: Request, admin: SupabaseClient, nombre: string): Promise<Response | null> {
  const caller = await getCaller(req, admin);
  if (caller?.service || caller?.superAdmin) return null;
  const { data: claimed, error } = await admin.rpc("cron_claim", { p_nombre: nombre, p_min_minutes: 50 });
  if (error) console.error(`[${nombre}] cron_claim error:`, error.message);
  if (error || claimed !== true) {
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

serve(withCors(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const gate = await cronGate(req, supabase, "stripe-auto-charge");
  if (gate) return gate;

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const results: AutoChargeResult[] = [];
  const monedaPorEmpresa = new Map<string | null, string>();

  const getMoneda = async (empresaId: string | null) => {
    if (!monedaPorEmpresa.has(empresaId)) {
      const { data: emp } = await supabase
        .from("empresas")
        .select("moneda_codigo")
        .eq("id", empresaId)
        .maybeSingle();
      monedaPorEmpresa.set(empresaId, String(emp?.moneda_codigo || "usd").toLowerCase());
    }
    return monedaPorEmpresa.get(empresaId)!;
  };

  try {
    // Find all active loans with auto-charge enabled
    const PAGE = 1000;
    const prestamos: PrestamoAutoCharge[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data: page, error: pErr } = await supabase
        .from("prestamos")
        .select("id, cliente_id, empresa_id")
        .eq("cobro_automatico_stripe", true)
        .in("estado", ["Activo", "Al día", "Vencido"])
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (pErr) throw pErr;
      prestamos.push(...(page || []));
      if (!page || page.length < PAGE) break;
    }

    if (!prestamos.length) {
      return new Response(JSON.stringify({ message: "No loans with auto-charge", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = new Date().toISOString().split("T")[0];

    for (const prestamo of prestamos) {
      let moneda = "usd";
      try {
        moneda = await getMoneda(prestamo.empresa_id);

        // Find cuotas due today or overdue that haven't been paid
        const { data: cuotas } = await supabase
          .from("amortizacion")
          .select("id, num_cuota, saldo_total, fecha_vencimiento")
          .eq("prestamo_id", prestamo.id)
          .in("status", ["Pendiente", "Vencida", "Parcial"])
          .lte("fecha_vencimiento", today)
          .gt("saldo_total", 0)
          .order("num_cuota", { ascending: true })
          .limit(1);

        if (!cuotas?.length) continue;

        const cuota = cuotas[0];
        const monto = Math.round(Number(cuota.saldo_total) * 100) / 100;
        if (!(monto > 0)) continue;

        // Check if client has a payment method
        const { data: pm } = await supabase
          .from("stripe_payment_methods")
          .select("stripe_customer_id, stripe_payment_method_id, brand, last4")
          .eq("empresa_id", prestamo.empresa_id)
          .eq("cliente_id", prestamo.cliente_id)
          .eq("activo", true)
          .maybeSingle();

        if (!pm?.stripe_payment_method_id) {
          results.push({ prestamo_id: prestamo.id, status: "skipped", reason: "no_payment_method" });
          continue;
        }

        // Get connect account
        const { data: connectAccount } = await supabase
          .from("stripe_connect_accounts")
          .select("stripe_account_id, charges_enabled")
          .eq("empresa_id", prestamo.empresa_id)
          .single();

        if (!connectAccount?.charges_enabled) {
          results.push({ prestamo_id: prestamo.id, status: "skipped", reason: "connect_not_enabled" });
          continue;
        }

        // Check if already charged today for this cuota
        const { data: existingCharge } = await supabase
          .from("stripe_charges_log")
          .select("id")
          .eq("prestamo_id", prestamo.id)
          .eq("cuota_id", cuota.id)
          .eq("status", "succeeded")
          .gte("created_at", today)
          .limit(1);

        if (existingCharge?.length) {
          results.push({ prestamo_id: prestamo.id, status: "skipped", reason: "already_charged_today" });
          continue;
        }

        // Charge (idempotent per cuota and day)
        const amountCents = Math.round(monto * 100);
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: moneda,
          customer: pm.stripe_customer_id,
          payment_method: pm.stripe_payment_method_id,
          off_session: true,
          confirm: true,
          metadata: {
            prestamo_id: prestamo.id,
            cuota_id: cuota.id,
            cliente_id: prestamo.cliente_id,
            empresa_id: prestamo.empresa_id,
            auto_charge: "true",
          },
        }, { stripeAccount: connectAccount.stripe_account_id, idempotencyKey: `auto-${cuota.id}-${today}` });

        // Log charge (once per PaymentIntent)
        const { data: yaLogueado } = await supabase
          .from("stripe_charges_log")
          .select("id")
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .limit(1);
        if (!yaLogueado?.length) {
          await supabase.from("stripe_charges_log").insert({
            empresa_id: prestamo.empresa_id,
            prestamo_id: prestamo.id,
            cuota_id: cuota.id,
            cliente_id: prestamo.cliente_id,
            stripe_payment_intent_id: paymentIntent.id,
            monto,
            moneda,
            status: paymentIntent.status,
          });
        }

        // (WA notifications are sent by billing-notifications at 9AM)

        results.push({
          prestamo_id: prestamo.id,
          cuota_id: cuota.id,
          status: paymentIntent.status,
          monto,
        });
      } catch (chargeErr) {
        const msg = chargeErr instanceof Error ? chargeErr.message : "Unknown";
        console.error(`Auto-charge error for ${prestamo.id}:`, msg);

        await supabase.from("stripe_charges_log").insert({
          empresa_id: prestamo.empresa_id,
          prestamo_id: prestamo.id,
          cliente_id: prestamo.cliente_id,
          monto: 0,
          moneda,
          status: "failed",
          error_mensaje: msg,
        });

        results.push({ prestamo_id: prestamo.id, status: "failed", error: msg });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("stripe-auto-charge error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
}));
