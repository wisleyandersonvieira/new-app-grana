import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const securityHeaders = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cache-Control": "no-store",
};

export const getCorsHeaders = (req?: Request) => {
  const origin = req?.headers.get("origin") ?? "";
  const allowOrigin =
    allowedOrigins.length === 0
      ? origin || "http://localhost:5173"
      : allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins[0];

  return {
    ...securityHeaders,
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
};

export const corsHeaders = getCorsHeaders();

export const json = (payload: unknown, status = 200, req?: Request) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });

export const safeError = (error: unknown, fallback = "Não foi possível concluir a operação.") => {
  const message = error instanceof Error ? error.message : String(error);
  if (["Unauthorized", "User not authenticated"].includes(message)) return { message: "Sessão inválida.", status: 401 };
  if (message === "Forbidden") return { message: "Acesso negado.", status: 403 };
  if (message === "Rate limit exceeded") return { message: "Muitas tentativas. Tente novamente em alguns minutos.", status: 429 };
  if (message === "Method not allowed") return { message: "Método não permitido.", status: 405 };
  return { message: fallback, status: 500 };
};

export const createServiceClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

export const createAnonClient = () =>
  createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );

export const createStripeClient = () => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

  return new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
};

export const getPlanFromPrice = (price?: Stripe.Price | null) => {
  const nickname = price?.nickname?.trim();
  const interval = price?.recurring?.interval ?? null;
  const amount = typeof price?.unit_amount === "number" ? price.unit_amount / 100 : null;

  return {
    planName: nickname || (interval === "year" ? "Plano Anual" : interval === "month" ? "Plano Mensal" : "Plano"),
    frequency:
      interval === "year"
        ? "anual"
        : interval === "month"
          ? "mensal"
          : interval || null,
    amount,
    currency: price?.currency ?? "brl",
    priceId: price?.id ?? null,
    productId: typeof price?.product === "string" ? price.product : price?.product?.id ?? null,
  };
};

export const formatStripeStatus = (status?: string | null) => {
  switch (status) {
    case "trialing":
      return "trial";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "unpaid";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    default:
      return status || "expired";
  }
};

const toIso = (unix?: number | null) => (typeof unix === "number" ? new Date(unix * 1000).toISOString() : null);

type SyncArgs = {
  supabase: ReturnType<typeof createServiceClient>;
  stripe: Stripe;
  userId: string;
  email?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
};

export async function syncStripeDataForUser({
  supabase,
  stripe,
  userId,
  email,
  stripeCustomerId,
  stripeSubscriptionId,
}: SyncArgs) {
  let customerId = stripeCustomerId ?? null;

  if (!customerId && email) {
    const customers = await stripe.customers.list({ email, limit: 1 });
    customerId = customers.data[0]?.id ?? null;
  }

  let subscription: Stripe.Subscription | null = null;
  if (stripeSubscriptionId) {
    try {
      subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
        expand: ["default_payment_method", "items.data.price"],
      });
    } catch {
      subscription = null;
    }
  }

  if (!subscription && customerId) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 5,
      expand: ["data.default_payment_method", "data.items.data.price"],
    });
    subscription = subscriptions.data
      .sort((a: Stripe.Subscription, b: Stripe.Subscription) => b.created - a.created)[0] ?? null;
  }

  let paymentMethod: Stripe.PaymentMethod | null = null;
  if (subscription?.default_payment_method && typeof subscription.default_payment_method !== "string") {
    paymentMethod = subscription.default_payment_method;
  } else if (customerId) {
    const customer = await stripe.customers.retrieve(customerId);
    const defaultPaymentMethodId =
      !("deleted" in customer) &&
      typeof customer.invoice_settings?.default_payment_method === "string"
        ? customer.invoice_settings.default_payment_method
        : null;

    if (defaultPaymentMethodId) {
      const retrieved = await stripe.paymentMethods.retrieve(defaultPaymentMethodId);
      if (!("deleted" in retrieved)) {
        paymentMethod = retrieved;
      }
    }
  }

  const invoices =
    customerId
      ? await stripe.invoices.list({
          customer: customerId,
          limit: 12,
          expand: ["data.payment_intent"],
        })
      : { data: [] as Stripe.Invoice[] };

  const price = subscription?.items.data[0]?.price ?? null;
  const plan = getPlanFromPrice(price);
  const normalizedStatus = formatStripeStatus(subscription?.status ?? null);

  if (subscription) {
    await supabase.from("assinaturas").upsert({
      usuario_id: userId,
      status: normalizedStatus,
      stripe_status: subscription.status,
      plano: plan.planName,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_product_id: plan.productId,
      stripe_price_id: plan.priceId,
      trial_inicio: toIso(subscription.trial_start),
      trial_fim: toIso(subscription.trial_end),
      current_period_start: toIso(subscription.current_period_start),
      current_period_end: toIso(subscription.current_period_end),
      data_expiracao: toIso(subscription.current_period_end),
      data_cancelamento: toIso(subscription.canceled_at),
      cancel_at_period_end: subscription.cancel_at_period_end,
      cancel_at: toIso(subscription.cancel_at),
      valor: plan.amount,
      moeda: plan.currency,
      frequencia: plan.frequency,
      payment_method_type: paymentMethod?.type ?? null,
      payment_brand: paymentMethod?.card?.brand ?? null,
      payment_last4: paymentMethod?.card?.last4 ?? null,
      payment_exp_month: paymentMethod?.card?.exp_month ?? null,
      payment_exp_year: paymentMethod?.card?.exp_year ?? null,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "usuario_id" });

    await supabase.from("billing_subscriptions").upsert({
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      stripe_product_id: plan.productId,
      stripe_price_id: plan.priceId,
      plan_name: plan.planName,
      plan_interval: plan.frequency,
      amount: plan.amount,
      currency: plan.currency,
      status: subscription.status,
      trial_start: toIso(subscription.trial_start),
      trial_end: toIso(subscription.trial_end),
      current_period_start: toIso(subscription.current_period_start),
      current_period_end: toIso(subscription.current_period_end),
      cancel_at_period_end: subscription.cancel_at_period_end,
      cancel_at: toIso(subscription.cancel_at),
      canceled_at: toIso(subscription.canceled_at),
      synced_at: new Date().toISOString(),
      raw_data: subscription as unknown as Record<string, unknown>,
    }, { onConflict: "stripe_subscription_id" });
  }

  if (paymentMethod) {
    await supabase.from("billing_payment_methods").upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_payment_method_id: paymentMethod.id,
      type: paymentMethod.type,
      brand: paymentMethod.card?.brand ?? null,
      last4: paymentMethod.card?.last4 ?? null,
      exp_month: paymentMethod.card?.exp_month ?? null,
      exp_year: paymentMethod.card?.exp_year ?? null,
      is_default: true,
      synced_at: new Date().toISOString(),
      raw_data: paymentMethod as unknown as Record<string, unknown>,
    }, { onConflict: "stripe_payment_method_id" });
  }

  for (const invoice of invoices.data) {
    const period = invoice.lines.data[0]?.period;
    await supabase.from("billing_invoices").upsert({
      user_id: userId,
      stripe_invoice_id: invoice.id,
      stripe_customer_id: customerId,
      stripe_subscription_id: typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id ?? null,
      status: invoice.status,
      amount_due: typeof invoice.amount_due === "number" ? invoice.amount_due / 100 : null,
      amount_paid: typeof invoice.amount_paid === "number" ? invoice.amount_paid / 100 : null,
      amount_remaining: typeof invoice.amount_remaining === "number" ? invoice.amount_remaining / 100 : null,
      currency: invoice.currency,
      invoice_pdf: invoice.invoice_pdf,
      hosted_invoice_url: invoice.hosted_invoice_url,
      paid_at: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : null,
      due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
      period_start: period ? new Date(period.start * 1000).toISOString() : null,
      period_end: period ? new Date(period.end * 1000).toISOString() : null,
      synced_at: new Date().toISOString(),
      raw_data: invoice as unknown as Record<string, unknown>,
    }, { onConflict: "stripe_invoice_id" });
  }

  return {
    customerId,
    subscription,
    paymentMethod,
    invoices: invoices.data,
    plan,
    normalizedStatus,
  };
}

export async function requireUser(req: Request, _supabase?: ReturnType<typeof createServiceClient>) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

  const token = authHeader.replace("Bearer ", "");
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error } = await authClient.auth.getUser(token);
  if (error || !userData.user) throw new Error("User not authenticated");
  return userData.user;
}

export async function requireAdmin(req: Request, supabase = createServiceClient()) {
  const user = await requireUser(req, supabase);
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  if (!profile?.is_admin) throw new Error("Forbidden");
  return user;
}

export async function writeAdminLog(
  supabase: ReturnType<typeof createServiceClient>,
  payload: {
    admin_id?: string | null;
    user_id: string;
    acao: string;
    detalhes?: Record<string, unknown>;
  },
) {
  await supabase.from("admin_user_logs").insert({
    admin_id: payload.admin_id ?? null,
    user_id: payload.user_id,
    acao: payload.acao,
    detalhes: payload.detalhes ?? {},
  });
}

const getClientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("cf-connecting-ip") ||
  "unknown";

const hashValue = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export async function assertRateLimit(
  supabase: ReturnType<typeof createServiceClient>,
  req: Request,
  action: string,
  options: { limit: number; windowSeconds: number; userId?: string | null },
) {
  const ipHash = await hashValue(getClientIp(req));
  const subject = options.userId ? `user:${options.userId}` : `ip:${ipHash}`;
  const key = `${action}:${subject}`;
  const now = new Date();
  const oldestWindowStart = new Date(now.getTime() - options.windowSeconds * 1000).toISOString();

  const { data } = await supabase
    .from("security_rate_limits")
    .select("count, window_start")
    .eq("key", key)
    .maybeSingle();

  const shouldReset = !data?.window_start || data.window_start < oldestWindowStart;
  const nextCount = shouldReset ? 1 : Number(data.count ?? 0) + 1;

  await supabase.from("security_rate_limits").upsert({
    key,
    action,
    window_start: shouldReset ? now.toISOString() : data?.window_start,
    count: nextCount,
    updated_at: now.toISOString(),
  });

  if (nextCount > options.limit) throw new Error("Rate limit exceeded");
}

export async function writeSecurityEvent(
  supabase: ReturnType<typeof createServiceClient>,
  req: Request,
  payload: {
    event: string;
    user_id?: string | null;
    actor_id?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const ipHash = await hashValue(getClientIp(req));
  await supabase.from("security_audit_events").insert({
    event: payload.event,
    user_id: payload.user_id ?? null,
    actor_id: payload.actor_id ?? null,
    metadata: payload.metadata ?? {},
    ip_hash: ipHash,
    user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
}

export function requirePost(req: Request) {
  if (req.method !== "POST") throw new Error("Method not allowed");
}

export function assertAllowedOrigin(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  if (allowedOrigins.length > 0 && origin && !allowedOrigins.includes(origin)) {
    throw new Error("Forbidden");
  }
}
