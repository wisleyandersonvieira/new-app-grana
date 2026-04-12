import { corsHeaders, createServiceClient, createStripeClient, json, requireUser, syncStripeDataForUser } from "../_shared/billing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createServiceClient();
    const user = await requireUser(req, supabase);

    const [{ data: profile }, { data: subscription }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).single(),
      supabase.from("assinaturas").select("*").eq("usuario_id", user.id).maybeSingle(),
    ]);

    if (!profile) return json({ error: "Perfil não encontrado." }, 404);

    const shouldSync = Boolean(subscription?.stripe_customer_id || subscription?.stripe_subscription_id || user.email);
    if (shouldSync) {
      const stripe = createStripeClient();
      await syncStripeDataForUser({
        supabase,
        stripe,
        userId: user.id,
        email: user.email,
        stripeCustomerId: subscription?.stripe_customer_id,
        stripeSubscriptionId: subscription?.stripe_subscription_id,
      });
    }

    const [{ data: refreshedSubscription }, { data: invoices }, { data: paymentMethods }, { data: logs }] = await Promise.all([
      supabase.from("assinaturas").select("*").eq("usuario_id", user.id).maybeSingle(),
      supabase.from("billing_invoices").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(12),
      supabase.from("billing_payment_methods").select("*").eq("user_id", user.id).order("is_default", { ascending: false }).limit(5),
      supabase.from("admin_user_logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]);

    return json({
      profile: {
        ...profile,
        email: profile.email || user.email || "",
      },
      auth: {
        email_confirmed_at: user.email_confirmed_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
      },
      subscription: refreshedSubscription,
      invoices: invoices ?? [],
      paymentMethods: paymentMethods ?? [],
      logs: logs ?? [],
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
