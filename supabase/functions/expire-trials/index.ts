import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { securityHeaders } from "../_shared/billing.ts";

serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...securityHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // Expire trials that have ended
    const { data: expiredTrials, error: selectError } = await supabase
      .from("assinaturas")
      .select("id, usuario_id")
      .eq("status", "trial")
      .lt("trial_fim", new Date().toISOString());

    if (selectError) {
      console.error("[EXPIRE-TRIALS] Select error:", selectError.message);
      return new Response(JSON.stringify({ error: "Erro ao expirar trials." }), { status: 500, headers: securityHeaders });
    }

    if (!expiredTrials || expiredTrials.length === 0) {
      console.log("[EXPIRE-TRIALS] No expired trials found");
      return new Response(JSON.stringify({ expired: 0 }), { status: 200, headers: { ...securityHeaders, "Content-Type": "application/json" } });
    }

    const ids = expiredTrials.map((t) => t.id);

    const { error: updateError } = await supabase
      .from("assinaturas")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .in("id", ids);

    if (updateError) {
      console.error("[EXPIRE-TRIALS] Update error:", updateError.message);
      return new Response(JSON.stringify({ error: "Erro ao expirar trials." }), { status: 500, headers: securityHeaders });
    }

    console.log(`[EXPIRE-TRIALS] Expired ${ids.length} trial(s)`);
    return new Response(JSON.stringify({ expired: ids.length }), {
      status: 200,
      headers: { ...securityHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[EXPIRE-TRIALS] Error:", error instanceof Error ? error.message : String(error));
    return new Response(JSON.stringify({ error: "Erro ao expirar trials." }), { status: 500, headers: securityHeaders });
  }
});
