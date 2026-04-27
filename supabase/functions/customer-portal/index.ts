import { assertAllowedOrigin, assertRateLimit, createServiceClient, createStripeClient, getCorsHeaders, json, requirePost, requireUser, safeError, writeSecurityEvent } from "../_shared/billing.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    assertAllowedOrigin(req);
    requirePost(req);
    const supabase = createServiceClient();
    const user = await requireUser(req, supabase);
    await assertRateLimit(supabase, req, "customer-portal", { limit: 10, windowSeconds: 300, userId: user.id });
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

    const origin = req.headers.get("origin") || Deno.env.get("APP_ORIGIN") || "http://localhost:3000";
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/minha-conta`,
    });

    await writeSecurityEvent(supabase, req, { event: "customer_portal_opened", user_id: user.id, actor_id: user.id });

    return json({ url: portalSession.url }, 200, req);
  } catch (error) {
    const { message, status } = safeError(error);
    return json({ error: message }, status, req);
  }
});
