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
      expand: ["subscription"],
    });

    if (session.status !== "complete") {
      throw new Error("Checkout session not completed");
    }
    if (session.customer_details?.email && session.customer_details.email !== user.email) {
      throw new Error("Forbidden");
    }

    const subscription = session.subscription as Stripe.Subscription;
    if (!subscription) throw new Error("No subscription found");

    const priceId = subscription.items.data[0]?.price?.id;
    const plano = priceId === "price_1T91XWGbo9PdwdD38zBjKpDx" ? "mensal" : "anual";
    const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

    await serviceClient
      .from("assinaturas")
      .update({
        status: "active",
        plano,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        data_expiracao: periodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("usuario_id", user.id);
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
