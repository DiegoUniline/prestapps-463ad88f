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

class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

serve(withCors(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Set only once the caller is authenticated and the cuota validated; used to log failures.
  let charge: {
    empresa_id: string;
    prestamo_id: string;
    cuota_id: string | null;
    cliente_id: string;
    monto: number;
    moneda: string;
  } | null = null;

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const caller = await getCaller(req, admin);
    if (!caller || caller.service || !caller.userId) throw new AppError("Unauthorized", 401);
    if (!caller.empresaId) throw new AppError("Sin empresa asociada", 403);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { empresa_id: bodyEmpresaId, prestamo_id, cuota_id, cliente_id } = await req.json();
    if (!prestamo_id || !cliente_id) {
      throw new AppError("prestamo_id y cliente_id son requeridos");
    }
    if (bodyEmpresaId && bodyEmpresaId !== caller.empresaId) throw new AppError("Préstamo no encontrado", 404);
    const empresa_id = caller.empresaId;

    // User-scoped reads (RLS) + explicit tenant check
    const { data: prestamo } = await supabase
      .from("prestamos")
      .select("id, cliente_id, empresa_id")
      .eq("id", prestamo_id)
      .maybeSingle();
    if (!prestamo || prestamo.empresa_id !== empresa_id || prestamo.cliente_id !== cliente_id) {
      throw new AppError("Préstamo no encontrado", 404);
    }

    let monto = 0;
    if (cuota_id) {
      const { data: cuota } = await supabase
        .from("amortizacion")
        .select("id, prestamo_id, empresa_id, saldo_total, status")
        .eq("id", cuota_id)
        .maybeSingle();
      if (!cuota || cuota.prestamo_id !== prestamo_id || (cuota.empresa_id && cuota.empresa_id !== empresa_id)) {
        throw new AppError("Cuota no encontrada", 404);
      }
      if (cuota.status === "Pagada") throw new AppError("La cuota ya está pagada");
      monto = Number(cuota.saldo_total || 0);
    } else {
      const { data: cuotas, error: cErr } = await supabase
        .from("amortizacion")
        .select("saldo_total")
        .eq("prestamo_id", prestamo_id)
        .in("status", ["Pendiente", "Parcial", "Vencida"]);
      if (cErr) throw cErr;
      monto = (cuotas || []).reduce((s: number, c: { saldo_total: number | null }) => s + Number(c.saldo_total || 0), 0);
    }
    monto = Math.round(monto * 100) / 100;
    if (!(monto > 0)) throw new AppError("No hay saldo pendiente por cobrar");

    const { data: empresa } = await admin
      .from("empresas")
      .select("moneda_codigo")
      .eq("id", empresa_id)
      .maybeSingle();
    const moneda = String(empresa?.moneda_codigo || "usd").toLowerCase();

    charge = { empresa_id, prestamo_id, cuota_id: cuota_id || null, cliente_id, monto, moneda };

    // Get Connect account
    const { data: connectAccount } = await supabase
      .from("stripe_connect_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("empresa_id", empresa_id)
      .single();

    if (!connectAccount?.charges_enabled) {
      throw new AppError("Stripe Connect no está habilitado para esta empresa");
    }

    // Get payment method
    const { data: pm } = await supabase
      .from("stripe_payment_methods")
      .select("stripe_customer_id, stripe_payment_method_id")
      .eq("empresa_id", empresa_id)
      .eq("cliente_id", cliente_id)
      .eq("activo", true)
      .maybeSingle();

    if (!pm?.stripe_customer_id || !pm?.stripe_payment_method_id) {
      throw new AppError("El cliente no tiene un método de pago registrado");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const stripeAccountId = connectAccount.stripe_account_id;

    // Create payment intent on connected account (1-minute idempotency window stops double clicks)
    const amountCents = Math.round(monto * 100);
    const minuto = Math.floor(Date.now() / 60000);
    const idempotencyKey = cuota_id ? `cuota-${cuota_id}-${minuto}` : `prestamo-${prestamo_id}-${minuto}`;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: moneda,
      customer: pm.stripe_customer_id,
      payment_method: pm.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: { prestamo_id, cuota_id: cuota_id || "", cliente_id, empresa_id },
    }, { stripeAccount: stripeAccountId, idempotencyKey });

    // Log the charge (once per PaymentIntent)
    const { data: yaLogueado } = await admin
      .from("stripe_charges_log")
      .select("id")
      .eq("stripe_payment_intent_id", paymentIntent.id)
      .limit(1);
    if (!yaLogueado?.length) {
      await supabase.from("stripe_charges_log").insert({
        empresa_id,
        prestamo_id,
        cuota_id: cuota_id || null,
        cliente_id,
        stripe_payment_intent_id: paymentIntent.id,
        monto,
        moneda,
        status: paymentIntent.status,
      });
    }

    return new Response(JSON.stringify({
      success: paymentIntent.status === "succeeded",
      status: paymentIntent.status,
      payment_intent_id: paymentIntent.id,
      monto,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("stripe-charge-cuota error:", msg);

    if (charge) {
      try {
        await admin.from("stripe_charges_log").insert({
          ...charge,
          status: "failed",
          error_mensaje: msg,
        });
      } catch { /* ignore logging errors */ }
    }

    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: error instanceof AppError ? error.status : 500,
    });
  }
}));
