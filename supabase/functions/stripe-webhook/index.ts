import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    console.error("Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return new Response("Server configuration error", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("No signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logStep("Signature verification failed", { error: msg });
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  logStep("Event received", { type: event.type, id: event.id });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription" || !session.subscription) break;

        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        const customerId = session.customer as string;
        const customer = await stripe.customers.retrieve(customerId);
        const email = (customer as Stripe.Customer).email;

        if (!email) {
          logStep("No email found for customer", { customerId });
          break;
        }

        // Find user by email
        const { data: users } = await supabase.auth.admin.listUsers();
        const user = users?.users?.find((u) => u.email === email);
        if (!user) {
          logStep("No user found for email", { email });
          break;
        }

        const priceId = sub.items.data[0]?.price?.id;
        const plano = priceId === "price_1T91XWGbo9PdwdD38zBjKpDx" ? "mensal" : "anual";
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

        await supabase
          .from("assinaturas")
          .update({
            status: "active",
            plano,
            stripe_customer_id: customerId,
            stripe_subscription_id: sub.id,
            stripe_price_id: priceId,
            data_expiracao: periodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq("usuario_id", user.id);

        logStep("checkout.session.completed processed", { userId: user.id, plano });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;

        const sub = await stripe.subscriptions.retrieve(subId);
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

        await supabase
          .from("assinaturas")
          .update({
            status: "active",
            data_expiracao: periodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subId);

        logStep("invoice.payment_succeeded processed", { subId });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;

        await supabase
          .from("assinaturas")
          .update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subId);

        logStep("invoice.payment_failed processed", { subId });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

        let status: string;
        switch (sub.status) {
          case "active":
            status = "active";
            break;
          case "past_due":
            status = "past_due";
            break;
          case "canceled":
            status = "canceled";
            break;
          default:
            status = sub.status;
        }

        const updateData: Record<string, any> = {
          status,
          data_expiracao: periodEnd,
          updated_at: new Date().toISOString(),
        };

        if (status === "canceled") {
          updateData.data_cancelamento = new Date().toISOString();
        }

        // Update price/plano if changed
        const priceId = sub.items.data[0]?.price?.id;
        if (priceId) {
          updateData.stripe_price_id = priceId;
          updateData.plano = priceId === "price_1T91XWGbo9PdwdD38zBjKpDx" ? "mensal" : "anual";
        }

        await supabase
          .from("assinaturas")
          .update(updateData)
          .eq("stripe_subscription_id", sub.id);

        logStep("customer.subscription.updated processed", { subId: sub.id, status });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        const now = new Date();
        const isStillValid = new Date(periodEnd) > now;

        await supabase
          .from("assinaturas")
          .update({
            status: isStillValid ? "canceled" : "expired",
            data_expiracao: periodEnd,
            data_cancelamento: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);

        logStep("customer.subscription.deleted processed", { subId: sub.id });
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("Error processing webhook", { error: msg, type: event.type });
    // Still return 200 to avoid Stripe retries for processing errors
    return new Response(JSON.stringify({ received: true, error: msg }), { status: 200 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
