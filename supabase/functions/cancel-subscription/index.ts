import { assertAllowedOrigin, assertRateLimit, createServiceClient, createStripeClient, getCorsHeaders, json, requirePost, requireUser, safeError, syncStripeDataForUser, writeSecurityEvent } from "../_shared/billing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    assertAllowedOrigin(req);
    requirePost(req);
    const supabase = createServiceClient();
    const user = await requireUser(req, supabase);
    await assertRateLimit(supabase, req, "cancel-subscription", { limit: 5, windowSeconds: 300, userId: user.id });

    const { data: subscription } = await supabase
      .from("assinaturas")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("usuario_id", user.id)
      .single();

    if (!subscription?.stripe_subscription_id) {
      throw new Error("Nenhuma assinatura ativa encontrada");
    }

    const stripe = createStripeClient();
    const updated = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    await syncStripeDataForUser({
      supabase,
      stripe,
      userId: user.id,
      email: user.email,
      stripeCustomerId: subscription.stripe_customer_id,
      stripeSubscriptionId: subscription.stripe_subscription_id,
    });

    await writeSecurityEvent(supabase, req, { event: "subscription_cancel_requested", user_id: user.id, actor_id: user.id });

    return json({
      success: true,
      access_until: new Date(updated.current_period_end * 1000).toISOString(),
    }, 200, req);
  } catch (error) {
    const { message, status } = safeError(error);
    return json({ error: message }, status, req);
  }
});
