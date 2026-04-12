import { corsHeaders, createServiceClient, createStripeClient, json, requireUser, syncStripeDataForUser } from "../_shared/billing.ts";

const buildResponse = (subscription: Record<string, unknown> | null) => {
  if (!subscription) {
    return {
      subscribed: false,
      status: "expired",
      message: "Nenhuma assinatura ativa encontrada.",
    };
  }

  const status = String(subscription.status ?? "expired");
  const trialEnd = subscription.trial_fim as string | null;
  const currentPeriodEnd = (subscription.current_period_end ?? subscription.data_expiracao) as string | null;

  const daysLeft = trialEnd
    ? Math.max(0, Math.ceil((new Date(trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : undefined;

  return {
    subscribed: ["trial", "active", "past_due", "canceled"].includes(status),
    status,
    plano: subscription.plano ?? null,
    trial_end: trialEnd,
    days_left: daysLeft,
    subscription_end: currentPeriodEnd,
    current_period_end: currentPeriodEnd,
    current_period_start: subscription.current_period_start ?? null,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    amount: subscription.valor ?? null,
    frequency: subscription.frequencia ?? null,
    payment_method: subscription.payment_method_type ?? null,
    card_brand: subscription.payment_brand ?? null,
    card_last4: subscription.payment_last4 ?? null,
    message:
      status === "trial"
        ? daysLeft === 0
          ? "Seu período de teste expirou."
          : undefined
        : status === "past_due"
          ? "Tivemos um problema com seu pagamento. Atualize sua forma de pagamento."
          : status === "canceled"
            ? "Sua assinatura será encerrada ao fim do período atual."
            : status === "expired"
              ? "Sua assinatura expirou. Escolha um plano para continuar."
              : undefined,
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createServiceClient();
    const user = await requireUser(req, supabase);

    let { data: subscription } = await supabase
      .from("assinaturas")
      .select("*")
      .eq("usuario_id", user.id)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("user_id", user.id)
      .single();

    if (!subscription && profile?.is_admin) {
      return json({
        subscribed: true,
        status: "admin_free",
        message: "Acesso liberado para administrador.",
      });
    }

    if (subscription?.stripe_customer_id || subscription?.stripe_subscription_id || user.email) {
      const stripe = createStripeClient();
      await syncStripeDataForUser({
        supabase,
        stripe,
        userId: user.id,
        email: user.email,
        stripeCustomerId: subscription?.stripe_customer_id,
        stripeSubscriptionId: subscription?.stripe_subscription_id,
      });

      const refreshed = await supabase
        .from("assinaturas")
        .select("*")
        .eq("usuario_id", user.id)
        .maybeSingle();
      subscription = refreshed.data;
    }

    return json(buildResponse(subscription as Record<string, unknown> | null));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
