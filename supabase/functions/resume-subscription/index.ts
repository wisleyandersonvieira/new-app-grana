import { corsHeaders, createServiceClient, createStripeClient, json, requireUser, syncStripeDataForUser } from "../_shared/billing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createServiceClient();
    const user = await requireUser(req, supabase);

    const { data: subscription } = await supabase
      .from("assinaturas")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("usuario_id", user.id)
      .single();

    if (!subscription?.stripe_subscription_id) {
      return json({ error: "Nenhuma assinatura Stripe encontrada para reativar." }, 400);
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

    return json({ success: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
