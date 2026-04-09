import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Check assinaturas table
    const { data: assinatura } = await supabaseClient
      .from('assinaturas')
      .select('*')
      .eq('usuario_id', user.id)
      .single();

    // No subscription record → admin-created user, full access
    if (!assinatura) {
      logStep("No subscription record - admin user, full access");
      return new Response(JSON.stringify({
        subscribed: true,
        status: 'admin_free',
        message: 'Acesso liberado (usuário administrativo)',
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const now = new Date();

    // Handle trial status
    if (assinatura.status === 'trial') {
      const trialEnd = new Date(assinatura.trial_fim);
      const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysLeft > 0) {
        logStep("Trial valid", { daysLeft });
        return new Response(JSON.stringify({
          subscribed: false,
          status: 'trial',
          trial_end: assinatura.trial_fim,
          days_left: daysLeft,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } else {
        // Trial expired → update status
        await supabaseClient
          .from('assinaturas')
          .update({ status: 'expired', updated_at: now.toISOString() })
          .eq('usuario_id', user.id);
        logStep("Trial expired, updated to expired");
        return new Response(JSON.stringify({
          subscribed: false,
          status: 'expired',
          message: 'Seu período de teste expirou. Escolha um plano para continuar.',
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // For active/past_due/canceled, also check Stripe for latest info
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Handle active status
    if (assinatura.status === 'active') {
      // Optionally sync with Stripe
      if (assinatura.stripe_subscription_id) {
        try {
          const sub = await stripe.subscriptions.retrieve(assinatura.stripe_subscription_id);
          const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
          const priceId = sub.items.data[0]?.price?.id;
          const plano = priceId === 'price_1T91XWGbo9PdwdD38zBjKpDx' ? 'mensal' : 'anual';

          // Sync status if changed on Stripe side
          if (sub.status !== 'active') {
            const newStatus = sub.status === 'past_due' ? 'past_due' :
                              sub.status === 'canceled' ? 'canceled' : 'expired';
            await supabaseClient
              .from('assinaturas')
              .update({
                status: newStatus,
                data_expiracao: periodEnd,
                plano,
                stripe_price_id: priceId,
                updated_at: now.toISOString(),
                ...(newStatus === 'canceled' ? { data_cancelamento: now.toISOString() } : {}),
              })
              .eq('usuario_id', user.id);

            return new Response(JSON.stringify({
              subscribed: newStatus === 'past_due' || newStatus === 'canceled',
              status: newStatus,
              plano,
              subscription_end: periodEnd,
              ...(newStatus === 'past_due' ? {
                message: 'Tivemos um problema com seu pagamento. Atualize seus dados de pagamento.',
                grace_period: true,
              } : {}),
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            });
          }

          // Update local data
          await supabaseClient
            .from('assinaturas')
            .update({ data_expiracao: periodEnd, plano, stripe_price_id: priceId, updated_at: now.toISOString() })
            .eq('usuario_id', user.id);

          return new Response(JSON.stringify({
            subscribed: true,
            status: 'active',
            plano,
            subscription_end: periodEnd,
            price_id: priceId,
            product_id: sub.items.data[0]?.price?.product,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        } catch (e) {
          logStep("Error checking Stripe subscription, using local data", { error: String(e) });
        }
      }

      return new Response(JSON.stringify({
        subscribed: true,
        status: 'active',
        plano: assinatura.plano,
        subscription_end: assinatura.data_expiracao,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Handle past_due - 3 day grace period
    if (assinatura.status === 'past_due') {
      const expiration = new Date(assinatura.data_expiracao);
      const graceEnd = new Date(expiration.getTime() + 3 * 24 * 60 * 60 * 1000);

      if (now <= graceEnd) {
        logStep("past_due within grace period");
        return new Response(JSON.stringify({
          subscribed: true,
          status: 'past_due',
          plano: assinatura.plano,
          subscription_end: assinatura.data_expiracao,
          message: 'Tivemos um problema com seu pagamento. Atualize seus dados de pagamento.',
          grace_period: true,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } else {
        // Grace period expired
        await supabaseClient
          .from('assinaturas')
          .update({ status: 'expired', updated_at: now.toISOString() })
          .eq('usuario_id', user.id);
        logStep("past_due grace period expired, set to expired");
        return new Response(JSON.stringify({
          subscribed: false,
          status: 'expired',
          message: 'Sua assinatura expirou. Escolha um plano para continuar usando o Grana.',
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // Handle canceled - access until data_expiracao
    if (assinatura.status === 'canceled') {
      const expiration = new Date(assinatura.data_expiracao);

      if (now <= expiration) {
        logStep("canceled but still in paid period");
        return new Response(JSON.stringify({
          subscribed: true,
          status: 'canceled',
          plano: assinatura.plano,
          subscription_end: assinatura.data_expiracao,
          message: 'Sua assinatura foi cancelada. Acesso disponível até o fim do período pago.',
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } else {
        await supabaseClient
          .from('assinaturas')
          .update({ status: 'expired', updated_at: now.toISOString() })
          .eq('usuario_id', user.id);
        logStep("canceled period ended, set to expired");
        return new Response(JSON.stringify({
          subscribed: false,
          status: 'expired',
          message: 'Sua assinatura expirou. Escolha um plano para continuar usando o Grana.',
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // Handle expired
    logStep("Subscription expired");
    return new Response(JSON.stringify({
      subscribed: false,
      status: 'expired',
      message: 'Sua assinatura expirou. Escolha um plano para continuar usando o Grana.',
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
