import { createServiceClient, createStripeClient, corsHeaders, json, requireAdmin, syncStripeDataForUser, writeAdminLog } from "../_shared/billing.ts";

type ActionBody = {
  action?: string;
  user_id?: string;
  nome?: string;
  email?: string;
  password?: string;
  is_admin?: boolean;
  status?: string;
  role?: string;
  access_blocked?: boolean;
  telefone?: string | null;
  empresa?: string | null;
  internal_notes?: string | null;
  force_sync?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createServiceClient();
    const caller = await requireAdmin(req, supabaseAdmin);
    const body = await req.json() as ActionBody;
    const action = body.action;

    if (action === "create") {
      const { nome, email, password, is_admin, status, telefone, empresa } = body;
      if (!nome || !email || !password) return json({ error: "Nome, email e senha são obrigatórios." }, 400);

      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome },
      });

      if (createErr || !newUser.user) return json({ error: createErr?.message || "Erro ao criar usuário." }, 400);

      const userId = newUser.user.id;

      await supabaseAdmin
        .from("profiles")
        .update({
          nome,
          email,
          telefone: telefone ?? null,
          empresa: empresa ?? null,
          is_admin: is_admin ?? false,
          role: is_admin ? "admin" : "user",
          status: status ?? "active",
          access_blocked: false,
        })
        .eq("user_id", userId);

      await writeAdminLog(supabaseAdmin, {
        admin_id: caller.id,
        user_id: userId,
        acao: "user_created",
        detalhes: { nome, email, is_admin: is_admin ?? false },
      });

      return json({ success: true, user_id: userId });
    }

    if (action === "update") {
      const { user_id, nome, email, is_admin, status, role, access_blocked, telefone, empresa, internal_notes } = body;
      if (!user_id) return json({ error: "user_id é obrigatório." }, 400);

      if (email) {
        await supabaseAdmin.auth.admin.updateUserById(user_id, { email });
      }

      const updates: Record<string, unknown> = {};
      if (nome !== undefined) updates.nome = nome;
      if (email !== undefined) updates.email = email;
      if (telefone !== undefined) updates.telefone = telefone;
      if (empresa !== undefined) updates.empresa = empresa;
      if (status !== undefined) updates.status = status;
      if (is_admin !== undefined) {
        updates.is_admin = is_admin;
        updates.role = is_admin ? "admin" : (role ?? "user");
      }
      if (role !== undefined) updates.role = role;
      if (access_blocked !== undefined) updates.access_blocked = access_blocked;
      if (internal_notes !== undefined) updates.internal_notes = internal_notes;

      if (Object.keys(updates).length > 0) {
        await supabaseAdmin.from("profiles").update(updates).eq("user_id", user_id);
      }

      const banUser = status === "inactive" || access_blocked === true;
      const unbanUser = status === "active" && access_blocked === false;
      if (banUser) {
        await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
      } else if (unbanUser) {
        await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      }

      await writeAdminLog(supabaseAdmin, {
        admin_id: caller.id,
        user_id,
        acao: "user_updated",
        detalhes: updates as Record<string, unknown>,
      });

      return json({ success: true });
    }

    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id é obrigatório." }, 400);

      await supabaseAdmin.from("billing_invoices").delete().eq("user_id", user_id);
      await supabaseAdmin.from("billing_payment_methods").delete().eq("user_id", user_id);
      await supabaseAdmin.from("billing_subscriptions").delete().eq("user_id", user_id);
      await supabaseAdmin.from("admin_user_logs").delete().eq("user_id", user_id);
      await supabaseAdmin.from("itens_fatura").delete().eq("usuario_id", user_id);
      await supabaseAdmin.from("faturas_cartao").delete().eq("usuario_id", user_id);
      await supabaseAdmin.from("despesas").delete().eq("usuario_id", user_id);
      await supabaseAdmin.from("receitas").delete().eq("usuario_id", user_id);
      await supabaseAdmin.from("transferencias").delete().eq("usuario_id", user_id);
      await supabaseAdmin.from("metas").delete().eq("usuario_id", user_id);
      await supabaseAdmin.from("bloqueios").delete().eq("usuario_id", user_id);
      await supabaseAdmin.from("subcategorias").delete().eq("usuario_id", user_id);
      await supabaseAdmin.from("categorias").delete().eq("usuario_id", user_id);
      await supabaseAdmin.from("contas").delete().eq("usuario_id", user_id);
      await supabaseAdmin.from("assinaturas").delete().eq("usuario_id", user_id);
      await supabaseAdmin.from("profiles").delete().eq("user_id", user_id);
      await supabaseAdmin.auth.admin.deleteUser(user_id);

      return json({ success: true });
    }

    if (action === "list" || action === "dashboard") {
      const [{ data: profiles }, { data: subscriptions }, authUsers] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }),
        supabaseAdmin.from("assinaturas").select("*"),
        supabaseAdmin.auth.admin.listUsers(),
      ]);

      const emailMap: Record<string, string> = {};
      (authUsers.data.users ?? []).forEach((entry) => {
        emailMap[entry.id] = entry.email ?? "";
      });

      const subscriptionMap = new Map((subscriptions ?? []).map((item) => [item.usuario_id, item]));

      const rows = (profiles ?? []).map((profile) => {
        const subscription = subscriptionMap.get(profile.user_id);
        return {
          ...profile,
          email: profile.email || emailMap[profile.user_id] || "",
          assinatura: subscription || null,
          plano_atual: subscription?.plano ?? null,
          subscription_status: subscription?.status ?? null,
          current_period_end: subscription?.current_period_end ?? subscription?.data_expiracao ?? null,
          stripe_customer_id: subscription?.stripe_customer_id ?? null,
          stripe_subscription_id: subscription?.stripe_subscription_id ?? null,
        };
      });

      if (action === "dashboard") {
        const now = Date.now();
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        const mrr = rows.reduce((sum, row) => {
          const value = Number(row.assinatura?.valor ?? 0);
          const frequency = row.assinatura?.frequencia;
          if (row.subscription_status !== "active" && row.subscription_status !== "trial") return sum;
          if (!value) return sum;
          return sum + (frequency === "anual" ? value / 12 : value);
        }, 0);

        return json({
          totalUsers: rows.length,
          activeUsers: rows.filter((row) => row.status === "active" && !row.access_blocked).length,
          trialUsers: rows.filter((row) => row.subscription_status === "trial").length,
          subscribedUsers: rows.filter((row) => row.subscription_status === "active").length,
          expiredUsers: rows.filter((row) => ["expired", "past_due", "unpaid"].includes(row.subscription_status ?? "")).length,
          canceledUsers: rows.filter((row) => row.subscription_status === "canceled").length,
          monthlyRecurringRevenue: mrr,
          newUsersLast30Days: rows.filter((row) => row.created_at && new Date(row.created_at).getTime() >= thirtyDaysAgo).length,
        });
      }

      return json(rows);
    }

    if (action === "detail") {
      const { user_id, force_sync } = body;
      if (!user_id) return json({ error: "user_id é obrigatório." }, 400);

      const [{ data: profile }, { data: subscription }, { data: logs }, authUser] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("user_id", user_id).single(),
        supabaseAdmin.from("assinaturas").select("*").eq("usuario_id", user_id).maybeSingle(),
        supabaseAdmin.from("admin_user_logs").select("*").eq("user_id", user_id).order("created_at", { ascending: false }).limit(50),
        supabaseAdmin.auth.admin.getUserById(user_id),
      ]);

      if (!profile) return json({ error: "Usuário não encontrado." }, 404);

      let syncedSubscription = subscription;
      if (force_sync || subscription?.stripe_customer_id || subscription?.stripe_subscription_id) {
        const stripe = createStripeClient();
        const syncResult = await syncStripeDataForUser({
          supabase: supabaseAdmin,
          stripe,
          userId: user_id,
          email: authUser.data.user?.email ?? profile.email,
          stripeCustomerId: subscription?.stripe_customer_id,
          stripeSubscriptionId: subscription?.stripe_subscription_id,
        });

        syncedSubscription = {
          ...subscription,
          ...{
            stripe_customer_id: syncResult.customerId,
            stripe_subscription_id: syncResult.subscription?.id ?? subscription?.stripe_subscription_id ?? null,
            status: syncResult.normalizedStatus ?? subscription?.status ?? "expired",
            plano: syncResult.plan.planName ?? subscription?.plano ?? null,
          },
        };

        await writeAdminLog(supabaseAdmin, {
          admin_id: caller.id,
          user_id,
          acao: "stripe_sync",
          detalhes: {
            stripe_customer_id: syncResult.customerId,
            stripe_subscription_id: syncResult.subscription?.id ?? null,
          },
        });
      }

      const [{ data: invoices }, { data: paymentMethods }, { data: cachedSubscription }] = await Promise.all([
        supabaseAdmin.from("billing_invoices").select("*").eq("user_id", user_id).order("created_at", { ascending: false }).limit(12),
        supabaseAdmin.from("billing_payment_methods").select("*").eq("user_id", user_id).order("is_default", { ascending: false }).limit(5),
        supabaseAdmin.from("billing_subscriptions").select("*").eq("user_id", user_id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      return json({
        profile: {
          ...profile,
          email: profile.email || authUser.data.user?.email || "",
        },
        auth: {
          id: authUser.data.user?.id ?? user_id,
          email_confirmed_at: authUser.data.user?.email_confirmed_at ?? null,
          last_sign_in_at: authUser.data.user?.last_sign_in_at ?? null,
        },
        subscription: syncedSubscription,
        cachedSubscription,
        invoices: invoices ?? [],
        paymentMethods: paymentMethods ?? [],
        logs: logs ?? [],
      });
    }

    if (action === "sync_stripe") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id é obrigatório." }, 400);

      const [{ data: profile }, { data: subscription }, authUser] = await Promise.all([
        supabaseAdmin.from("profiles").select("email").eq("user_id", user_id).single(),
        supabaseAdmin.from("assinaturas").select("stripe_customer_id, stripe_subscription_id").eq("usuario_id", user_id).maybeSingle(),
        supabaseAdmin.auth.admin.getUserById(user_id),
      ]);

      const stripe = createStripeClient();
      const result = await syncStripeDataForUser({
        supabase: supabaseAdmin,
        stripe,
        userId: user_id,
        email: authUser.data.user?.email ?? profile?.email,
        stripeCustomerId: subscription?.stripe_customer_id,
        stripeSubscriptionId: subscription?.stripe_subscription_id,
      });

      await writeAdminLog(supabaseAdmin, {
        admin_id: caller.id,
        user_id,
        acao: "stripe_sync",
        detalhes: {
          stripe_customer_id: result.customerId,
          stripe_subscription_id: result.subscription?.id ?? null,
        },
      });

      return json({ success: true });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
