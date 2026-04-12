import Stripe from "https://esm.sh/stripe@18.5.0";
import { createServiceClient, createStripeClient, json, syncStripeDataForUser, writeAdminLog } from "../_shared/billing.ts";

const logStep = (step: string, details?: unknown) => {
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

const findUserIdByCustomer = async (supabase: ReturnType<typeof createServiceClient>, customerId?: string | null) => {
  if (!customerId) return null;

  const { data: assinatura } = await supabase
    .from("assinaturas")
    .select("usuario_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (assinatura?.usuario_id) return assinatura.usuario_id;

  const { data: paymentMethod } = await supabase
    .from("billing_payment_methods")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  return paymentMethod?.user_id ?? null;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) return new Response("Server configuration error", { status: 500 });

  const stripe = createStripeClient();
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("No signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  const supabase = createServiceClient();
  logStep("Event received", { type: event.type, id: event.id });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = typeof session.customer === "string" ? session.customer : null;
        const email = session.customer_details?.email ?? null;

        const authUsers = await supabase.auth.admin.listUsers();
        const user = authUsers.data.users.find((entry) => entry.email === email);

        if (user) {
          await syncStripeDataForUser({
            supabase,
            stripe,
            userId: user.id,
            email: user.email,
            stripeCustomerId: customerId,
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : null,
          });
          await writeAdminLog(supabase, {
            user_id: user.id,
            acao: "stripe_checkout_completed",
            detalhes: { event_id: event.id, customer_id: customerId, session_id: session.id },
          });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = await findUserIdByCustomer(supabase, typeof subscription.customer === "string" ? subscription.customer : null);
        if (!userId) break;

        const authUser = await supabase.auth.admin.getUserById(userId);
        await syncStripeDataForUser({
          supabase,
          stripe,
          userId,
          email: authUser.data.user?.email,
          stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : null,
          stripeSubscriptionId: subscription.id,
        });

        await writeAdminLog(supabase, {
          user_id: userId,
          acao: `stripe_${event.type.replaceAll(".", "_")}`,
          detalhes: { event_id: event.id, subscription_id: subscription.id, status: subscription.status },
        });
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
        const userId = await findUserIdByCustomer(supabase, customerId);
        if (!userId) break;

        const authUser = await supabase.auth.admin.getUserById(userId);
        await syncStripeDataForUser({
          supabase,
          stripe,
          userId,
          email: authUser.data.user?.email,
          stripeCustomerId: customerId,
          stripeSubscriptionId: typeof invoice.subscription === "string" ? invoice.subscription : null,
        });

        await writeAdminLog(supabase, {
          user_id: userId,
          acao: event.type === "invoice.paid" ? "stripe_invoice_paid" : "stripe_invoice_payment_failed",
          detalhes: {
            event_id: event.id,
            invoice_id: invoice.id,
            amount_paid: invoice.amount_paid / 100,
            amount_due: invoice.amount_due / 100,
            status: invoice.status,
          },
        });
        break;
      }

      case "payment_method.attached": {
        const paymentMethod = event.data.object as Stripe.PaymentMethod;
        const customerId = typeof paymentMethod.customer === "string" ? paymentMethod.customer : null;
        const userId = await findUserIdByCustomer(supabase, customerId);
        if (!userId) break;

        const authUser = await supabase.auth.admin.getUserById(userId);
        await syncStripeDataForUser({
          supabase,
          stripe,
          userId,
          email: authUser.data.user?.email,
          stripeCustomerId: customerId,
        });

        await writeAdminLog(supabase, {
          user_id: userId,
          acao: "stripe_payment_method_attached",
          detalhes: { event_id: event.id, payment_method_id: paymentMethod.id, brand: paymentMethod.card?.brand ?? null },
        });
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("Processing error", { error: msg, type: event.type });
    return json({ received: true, error: msg });
  }

  return json({ received: true });
});
