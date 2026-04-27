import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { assertAllowedOrigin, assertRateLimit, getCorsHeaders, requirePost, safeError, writeSecurityEvent } from "../_shared/billing.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    assertAllowedOrigin(req);
    requirePost(req);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Unauthorized");
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");
    const user = userData.user;

    const { sessionId } = await req.json();
    if (!sessionId || typeof sessionId !== "string" || !sessionId.startsWith("cs_")) throw new Error("sessionId is required");

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );
    await assertRateLimit(serviceClient, req, "verify-checkout", { limit: 20, windowSeconds: 300, userId: user.id });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "subscription.items.data.price"],
    });
    console.log("[verify-checkout] session", {
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
      customer: session.customer,
      email: session.customer_details?.email,
      mode: session.mode,
    });

    if (session.status !== "complete") {
      throw new Error(`Checkout session not completed (status=${session.status})`);
    }
    const sessionEmail = session.customer_details?.email?.toLowerCase();
    const userEmail = user.email?.toLowerCase();
    if (sessionEmail && userEmail && sessionEmail !== userEmail) {
      throw new Error("Forbidden");
    }

    const subscription = session.subscription as Stripe.Subscription | null;
    if (!subscription) throw new Error("No subscription found");
    console.log("[verify-checkout] subscription", {
      id: subscription.id,
      status: subscription.status,
      current_period_end: subscription.current_period_end,
      trial_end: (subscription as any).trial_end,
    });

    const priceId = subscription.items.data[0]?.price?.id ?? null;
    // Map known price IDs -> plan; default to "mensal"
    const PLAN_BY_PRICE: Record<string, string> = {
      price_1TLP0bGrbv5UzR86IczFvXwg: "mensal",
      price_1TLP1AGrbv5UzR86KwUWNdGZ: "anual",
      price_1T91XWGbo9PdwdD38zBjKpDx: "mensal",
    };
    const plano = (priceId && PLAN_BY_PRICE[priceId]) || "mensal";

    const periodStartUnix = (subscription as any).current_period_start ?? null;
    const periodEndUnix =
      (subscription as any).current_period_end ??
      (subscription as any).trial_end ??
      null;
    const trialEndUnix = (subscription as any).trial_end ?? null;
    const periodStart = periodStartUnix
      ? new Date(periodStartUnix * 1000).toISOString()
      : null;
    const periodEnd = periodEndUnix
      ? new Date(periodEndUnix * 1000).toISOString()
      : null;
    const trialEnd = trialEndUnix
      ? new Date(trialEndUnix * 1000).toISOString()
      : null;

    const { error: updError } = await serviceClient
      .from("assinaturas")
      .update({
        status: "active",
        stripe_status: subscription.status,
        plano,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        trial_fim: trialEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("usuario_id", user.id);
    if (updError) {
      console.error("[verify-checkout] update error", updError);
      throw new Error(`DB update failed: ${updError.message}`);
    }
    await writeSecurityEvent(serviceClient, req, { event: "checkout_verified", user_id: user.id, actor_id: user.id, metadata: { sessionId } });

    return new Response(
      JSON.stringify({
        success: true,
        plano,
        subscription_end: periodEnd,
      }),
      {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const { message, status } = safeError(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      status,
    });
  }
});
