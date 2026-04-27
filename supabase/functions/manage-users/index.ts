import { assertAllowedOrigin, assertRateLimit, createServiceClient, createStripeClient, getCorsHeaders, json, requirePost, requireAdmin, safeError, syncStripeDataForUser, writeAdminLog, writeSecurityEvent } from "../_shared/billing.ts";

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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedActions = new Set(["create", "update", "delete", "list", "dashboard", "detail", "sync_stripe"]);
const allowedStatuses = new Set(["active", "inactive", "trial", "blocked"]);

const cleanText = (value: unknown, max = 160) =>
  typeof value === "string" ? value.trim().slice(0, max) : undefined;

const assertUuid = (value: unknown, field: string) => {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error(`${field} inválido.`);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    assertAllowedOrigin(req);
    requirePost(req);
    const supabaseAdmin = createServiceClient();
    const caller = await requireAdmin(req, supabaseAdmin);
    await assertRateLimit(supabaseAdmin, req, "manage-users", { limit: 120, windowSeconds: 300, userId: caller.id });
    const body = await req.json() as ActionBody;
    const action = body.action;
    if (!action || !allowedActions.has(action)) return json({ error: "Ação inválida." }, 400, req);

    if (action === "create") {
      const { nome, email, password, is_admin, status, telefone, empresa } = body;
      if (!nome || !email || !password) return json({ error: "Nome, email e senha são obrigatórios." }, 400, req);
      if (!emailPattern.test(email)) return json({ error: "E-mail inválido." }, 400, req);
      if (password.length < 10) return json({ error: "A senha temporária deve ter pelo menos 10 caracteres." }, 400, req);
      if (status && !allowedStatuses.has(status)) return json({ error: "Status inválido." }, 400, req);

      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome: cleanText(nome) },
      });

      if (createErr || !newUser.user) return json({ error: "Não foi possível criar o usuário." }, 400, req);

      const userId = newUser.user.id;

      await supabaseAdmin
        .from("profiles")
        .update({
          nome: cleanText(nome),
          email,
          telefone: cleanText(telefone, 40) ?? null,
          empresa: cleanText(empresa, 120) ?? null,
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
      await writeSecurityEvent(supabaseAdmin, req, { event: "admin_user_created", user_id: userId, actor_id: caller.id });

      return json({ success: true, user_id: userId }, 200, req);
    }

    if (action === "update") {
      const { user_id, nome, email, is_admin, status, role, access_blocked, telefone, empresa, internal_notes } = body;
      if (!user_id) return json({ error: "user_id é obrigatório." }, 400, req);
      assertUuid(user_id, "user_id");
      if (email && !emailPattern.test(email)) return json({ error: "E-mail inválido." }, 400, req);
      if (status && !allowedStatuses.has(status)) return json({ error: "Status inválido." }, 400, req);

      if (email) {
        await supabaseAdmin.auth.admin.updateUserById(user_id, { email });
      }

      const updates: Record<string, unknown> = {};
      if (nome !== undefined) updates.nome = cleanText(nome);
      if (email !== undefined) updates.email = email;
      if (telefone !== undefined) updates.telefone = cleanText(telefone, 40) ?? null;
      if (empresa !== undefined) updates.empresa = cleanText(empresa, 120) ?? null;
      if (status !== undefined) updates.status = status;
      if (is_admin !== undefined) {
        updates.is_admin = is_admin;
        updates.role = is_admin ? "admin" : (role ?? "user");
      }
      if (role !== undefined) updates.role = role;
      if (access_blocked !== undefined) updates.access_blocked = access_blocked;
      if (internal_notes !== undefined) updates.internal_notes = cleanText(internal_notes, 2000) ?? null;

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
      await writeSecurityEvent(supabaseAdmin, req, { event: "admin_user_updated", user_id, actor_id: caller.id });

      return json({ success: true }, 200, req);
    }

    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id é obrigatório." }, 400, req);
      assertUuid(user_id, "user_id");
      if (user_id === caller.id) return json({ error: "Você não pode excluir seu próprio usuário administrador." }, 400, req);

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

      await writeSecurityEvent(supabaseAdmin, req, { event: "admin_user_deleted", user_id, actor_id: caller.id });

      return json({ success: true }, 200, req);
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
        }, 200, req);
      }

      return json(rows, 200, req);
    }

    if (action === "detail") {
      const { user_id, force_sync } = body;
      if (!user_id) return json({ error: "user_id é obrigatório." }, 400, req);
      assertUuid(user_id, "user_id");

      const [{ data: profile }, { data: subscription }, { data: logs }, authUser] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("user_id", user_id).single(),
        supabaseAdmin.from("assinaturas").select("*").eq("usuario_id", user_id).maybeSingle(),
        supabaseAdmin.from("admin_user_logs").select("*").eq("user_id", user_id).order("created_at", { ascending: false }).limit(50),
        supabaseAdmin.auth.admin.getUserById(user_id),
      ]);

      if (!profile) return json({ error: "Usuário não encontrado." }, 404, req);

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
      }, 200, req);
    }

    if (action === "sync_stripe") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id é obrigatório." }, 400, req);
      assertUuid(user_id, "user_id");

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

      return json({ success: true }, 200, req);
    }

    return json({ error: "Ação inválida." }, 400, req);
  } catch (err) {
    const { message, status } = safeError(err);
    return json({ error: message }, status, req);
  }
});
