import { corsHeaders, createServiceClient, createStripeClient, json, requireUser } from "../_shared/billing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createServiceClient();
    const user = await requireUser(req, supabase);
    const stripe = createStripeClient();

    const { data: subscription } = await supabase
      .from("assinaturas")
      .select("stripe_customer_id")
      .eq("usuario_id", user.id)
      .maybeSingle();

    let customerId = subscription?.stripe_customer_id ?? null;

    if (!customerId && user.email) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = customers.data[0]?.id ?? null;
    }

    if (!customerId) {
      throw new Error("Nenhum cliente Stripe encontrado para este usuário.");
    }

    const origin = req.headers.get("origin") || "http://localhost:3000";
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/minha-conta`,
    });

    return json({ url: portalSession.url });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
