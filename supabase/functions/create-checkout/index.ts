import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { assertAllowedOrigin, assertRateLimit, getCorsHeaders, requirePost, safeError, writeSecurityEvent } from "../_shared/billing.ts";

const allowedPriceIds = (Deno.env.get("STRIPE_PRICE_IDS") ?? "")
  .split(",")
  .map((priceId) => priceId.trim())
  .filter(Boolean);

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
    if (userError || !userData.user?.email) throw new Error("User not authenticated");
    const user = userData.user;

    const { priceId } = await req.json();
    if (!priceId) throw new Error("priceId is required");
    if (allowedPriceIds.length > 0 && !allowedPriceIds.includes(priceId)) {
      throw new Error("Invalid priceId");
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );
    await assertRateLimit(serviceClient, req, "create-checkout", { limit: 10, windowSeconds: 300, userId: user.id });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check or create Stripe customer
    const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      // Get user name from profiles
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("nome")
        .eq("user_id", user.id)
        .single();

      const customer = await stripe.customers.create({
        email: user.email!,
        name: profile?.nome || user.email!,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
    }

    // Check remaining trial days
    const { data: assinatura } = await serviceClient
      .from("assinaturas")
      .select("trial_fim, status")
      .eq("usuario_id", user.id)
      .single();

    let trialDays = 0;
    if (assinatura?.status === "trial" && assinatura?.trial_fim) {
      const trialEnd = new Date(assinatura.trial_fim);
      const now = new Date();
      trialDays = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    const origin = req.headers.get("origin") || Deno.env.get("APP_ORIGIN") || "http://localhost:5173";

    const sessionParams: any = {
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: true,
      success_url: `${origin}/planos/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/planos?cancelado=1`,
    };

    // Give remaining trial days on Stripe if user still in trial
    if (trialDays > 0) {
      sessionParams.subscription_data = { trial_period_days: trialDays };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    await writeSecurityEvent(serviceClient, req, { event: "checkout_created", user_id: user.id, actor_id: user.id, metadata: { priceId } });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const { message, status } = safeError(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      status,
    });
  }
});
