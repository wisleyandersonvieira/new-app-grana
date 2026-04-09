import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: callerProfile } = await supabaseAdmin.from("profiles").select("is_admin").eq("user_id", caller.id).single();
    if (!callerProfile?.is_admin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { action, ...body } = await req.json();

    if (action === "create") {
      const { nome, email, password, is_admin, status } = body;

      // Create auth user
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome },
      });
      if (createErr) return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const userId = newUser.user.id;

      // Update profile (created by trigger)
      await supabaseAdmin.from("profiles").update({
        is_admin: is_admin ?? false,
        status: status ?? "ativo",
      }).eq("user_id", userId);

      // Clone default categories from the ADMIN's categories that are marked as categoria_padrao
      const { data: defaultCats } = await supabaseAdmin
        .from("categorias")
        .select("id, nome, obrigatoria")
        .eq("categoria_padrao", true)
        .eq("usuario_id", caller.id);

      if (defaultCats) {
        for (const cat of defaultCats) {
          const { data: newCat } = await supabaseAdmin.from("categorias").insert({
            nome: cat.nome,
            usuario_id: userId,
            categoria_padrao: true,
            obrigatoria: cat.obrigatoria,
          }).select("id").single();

          if (newCat) {
            // Clone default subcategories from admin's matching category
            const { data: defaultSubs } = await supabaseAdmin
              .from("subcategorias")
              .select("nome, obrigatoria, subcategoria_padrao")
              .eq("categoria_id", cat.id)
              .eq("subcategoria_padrao", true);

            if (defaultSubs) {
              for (const sub of defaultSubs) {
                await supabaseAdmin.from("subcategorias").insert({
                  nome: sub.nome,
                  categoria_id: newCat.id,
                  usuario_id: userId,
                  subcategoria_padrao: true,
                  obrigatoria: sub.obrigatoria,
                });
              }
            }
          }
        }
      }

      // Ensure "Cartão De Crédito" category exists for new user
      let cartaoCatId: string | null = null;
      const { data: existingCartao } = await supabaseAdmin
        .from("categorias")
        .select("id")
        .eq("nome", "Cartão De Crédito")
        .eq("usuario_id", userId)
        .maybeSingle();

      if (existingCartao) {
        cartaoCatId = existingCartao.id;
      } else {
        const { data: newCartao } = await supabaseAdmin.from("categorias").insert({
          nome: "Cartão De Crédito",
          usuario_id: userId,
          obrigatoria: true,
        }).select("id").single();
        if (newCartao) cartaoCatId = newCartao.id;
      }

      // Ensure "Fatura Consolidada" subcategory exists
      if (cartaoCatId) {
        const { data: existingSub } = await supabaseAdmin
          .from("subcategorias")
          .select("id")
          .eq("nome", "Fatura Consolidada")
          .eq("categoria_id", cartaoCatId)
          .maybeSingle();

        if (!existingSub) {
          await supabaseAdmin.from("subcategorias").insert({
            nome: "Fatura Consolidada",
            categoria_id: cartaoCatId,
            usuario_id: userId,
            obrigatoria: true,
            subcategoria_padrao: true,
          });
        }
      }

      return new Response(JSON.stringify({ success: true, user_id: userId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "update") {
      const { user_id, nome, email, is_admin, status } = body;
      if (email) await supabaseAdmin.auth.admin.updateUserById(user_id, { email });
      const updates: Record<string, any> = {};
      if (nome !== undefined) updates.nome = nome;
      if (is_admin !== undefined) updates.is_admin = is_admin;
      if (status !== undefined) updates.status = status;
      if (Object.keys(updates).length > 0) {
        await supabaseAdmin.from("profiles").update(updates).eq("user_id", user_id);
      }
      // If status changed to 'inativo', ban the user in auth; 'ativo' → unban
      if (status === "inativo") {
        await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
      } else if (status === "ativo") {
        await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      }
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete") {
      const { user_id } = body;
      // Delete all user data in dependency order
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
      await supabaseAdmin.from("profiles").delete().eq("user_id", user_id);
      await supabaseAdmin.auth.admin.deleteUser(user_id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "list") {
      const { data: profiles } = await supabaseAdmin.from("profiles").select("*").order("nome");
      const { data: assinaturas } = await supabaseAdmin.from("assinaturas").select("*");
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const emailMap: Record<string, string> = {};
      users?.forEach((u: any) => { emailMap[u.id] = u.email ?? ""; });
      const assinaturaMap: Record<string, any> = {};
      (assinaturas ?? []).forEach((a: any) => { assinaturaMap[a.usuario_id] = a; });
      const result = (profiles ?? []).map(p => ({
        ...p,
        email: emailMap[p.user_id] ?? "",
        assinatura: assinaturaMap[p.user_id] || null,
      }));
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
