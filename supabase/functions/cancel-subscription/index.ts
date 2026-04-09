import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("User not authenticated");
    const user = userData.user;

    // Get subscription from DB
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: assinatura } = await serviceClient
      .from("assinaturas")
      .select("stripe_subscription_id")
      .eq("usuario_id", user.id)
      .single();

    if (!assinatura?.stripe_subscription_id) {
      throw new Error("Nenhuma assinatura ativa encontrada");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Cancel at period end (user keeps access until end of billing period)
    const subscription = await stripe.subscriptions.update(assinatura.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

    // Update local DB
    await serviceClient
      .from("assinaturas")
      .update({
        status: "canceled",
        data_cancelamento: new Date().toISOString(),
        data_expiracao: periodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("usuario_id", user.id);

    return new Response(
      JSON.stringify({ success: true, access_until: periodEnd }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CANCEL-SUBSCRIPTION] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
