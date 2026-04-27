import { assertAllowedOrigin, assertRateLimit, createServiceClient, createStripeClient, getCorsHeaders, json, requirePost, requireUser, safeError, syncStripeDataForUser, writeSecurityEvent } from "../_shared/billing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    assertAllowedOrigin(req);
    requirePost(req);
    const supabase = createServiceClient();
    const user = await requireUser(req, supabase);
    await assertRateLimit(supabase, req, "resume-subscription", { limit: 5, windowSeconds: 300, userId: user.id });

    const { data: subscription } = await supabase
      .from("assinaturas")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("usuario_id", user.id)
      .single();

    if (!subscription?.stripe_subscription_id) {
      return json({ error: "Nenhuma assinatura Stripe encontrada para reativar." }, 400, req);
    }

    const stripe = createStripeClient();
    await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: false,
    });

    await syncStripeDataForUser({
      supabase,
      stripe,
      userId: user.id,
      email: user.email,
      stripeCustomerId: subscription.stripe_customer_id,
      stripeSubscriptionId: subscription.stripe_subscription_id,
    });

    await writeSecurityEvent(supabase, req, { event: "subscription_resume_requested", user_id: user.id, actor_id: user.id });

    return json({ success: true }, 200, req);
  } catch (error) {
    const { message, status } = safeError(error);
    return json({ error: message }, status, req);
  }
});
