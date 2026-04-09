import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DollarSign, Eye, EyeOff, ArrowLeft, Shield, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function Cadastro() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", password: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.email.trim() || !form.password.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    if (form.password.length < 6) {
      toast({ title: "A senha deve ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: { nome: form.nome.trim() },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) throw error;

      toast({
        title: "Conta criada com sucesso! 🎉",
        description: "Verifique seu e-mail para confirmar o cadastro.",
      });
      navigate("/login");
    } catch (err: any) {
      toast({
        title: "Erro ao criar conta",
        description: err.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "linear-gradient(135deg, #07172d 0%, #1e3977 100%)" }}>
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 text-white">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
            <DollarSign className="h-5 w-5 text-white" />
          </div>
          <span className="text-2xl font-black" style={{ fontFamily: "'Fredoka', 'Inter', sans-serif" }}>Grana</span>
        </Link>
        <div>
          <h2 className="text-4xl font-black mb-4 leading-tight" style={{ fontFamily: "'Fredoka', 'Inter', sans-serif" }}>
            Comece seu trial<br />
            <span className="text-[#4CAF50]">gratuito de 7 dias</span>
          </h2>
          <p className="text-white/60 text-lg mb-8">
            Sem cartão de crédito. Cancele quando quiser.
          </p>
          <ul className="space-y-3">
            {[
              "Acesso completo a todas as funcionalidades",
              "Dashboard, relatórios e metas",
              "Gestão de faturas de cartão",
              "Suporte por chat incluído",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-white/75 text-sm">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4CAF50]/20">
                  <Check className="h-3 w-3 text-[#4CAF50]" />
                </div>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-2 text-white/30 text-xs">
          <Shield className="h-3.5 w-3.5" />
          Seus dados protegidos com criptografia
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/30 p-8">
            {/* Mobile logo */}
            <div className="flex items-center gap-2 mb-6 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1e3977]">
                <DollarSign className="h-4 w-4 text-white" />
              </div>
              <span className="text-xl font-black text-[#1e3977]" style={{ fontFamily: "'Fredoka', 'Inter', sans-serif" }}>Grana</span>
            </div>

            <div className="mb-7">
              <h1 className="text-2xl font-black text-gray-900 mb-1">Crie sua conta grátis</h1>
              <p className="text-gray-400 text-sm">7 dias de trial completo. Sem cartão de crédito.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome completo</label>
                <input
                  type="text"
                  placeholder="Seu nome"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3977]/30 focus:border-[#1e3977] transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">E-mail</label>
                <input
                  type="email"
                  placeholder="seu@email.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3977]/30 focus:border-[#1e3977] transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 6 caracteres"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-4 py-3 pr-11 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3977]/30 focus:border-[#1e3977] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-[#1e3977] text-white font-bold text-sm hover:bg-[#152d61] transition-all shadow-lg shadow-[#1e3977]/20 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {loading ? "Criando conta..." : "Criar conta grátis →"}
              </button>
            </form>

            <div className="mt-5 flex items-center gap-2 text-xs text-gray-400 justify-center">
              <Shield className="h-3.5 w-3.5" />
              7 dias grátis · sem cartão · cancele quando quiser
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100 text-center text-sm text-gray-500">
              Já tem conta?{" "}
              <Link to="/login" className="text-[#1e3977] font-semibold hover:underline">
                Entrar
              </Link>
            </div>
          </div>

          <Link to="/" className="flex items-center justify-center gap-1.5 mt-4 text-white/50 hover:text-white text-sm transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
