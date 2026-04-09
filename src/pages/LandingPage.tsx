import { useState } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp, TrendingDown, LayoutDashboard, BarChart3,
  Target, ArrowLeftRight, Users, Lock, ChevronDown, ChevronUp,
  Star, Check, Menu, X, CreditCard, DollarSign,
  Zap, Shield, Smartphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

/* ─── Feature cards ─────────────────────────────────────────────── */
const features = [
  { icon: TrendingDown, title: "Despesas e Receitas", desc: "Registre gastos e ganhos com parcelas, categorias e subcategorias personalizáveis." },
  { icon: CreditCard, title: "Faturas de Cartão", desc: "Gerencie faturas detalhadas de cada cartão com itens individuais e competências." },
  { icon: LayoutDashboard, title: "Dashboard Inteligente", desc: "Visão completa do mês: saldo, receitas, despesas e metas em um só lugar." },
  { icon: BarChart3, title: "Relatórios Completos", desc: "Relatórios por categoria, comparativos mensais, extratos e exportação PDF/Excel." },
  { icon: Target, title: "Metas Financeiras", desc: "Defina metas de receita, despesa e por categoria. Acompanhe o progresso em tempo real." },
  { icon: ArrowLeftRight, title: "Transferências", desc: "Registre transferências entre contas e acompanhe o saldo real de cada uma." },
  { icon: Users, title: "Multi-usuário", desc: "Dados isolados e seguros para cada pessoa. Ideal para famílias." },
  { icon: Lock, title: "Bloqueio de Períodos", desc: "Feche meses para evitar alterações acidentais em dados já conferidos." },
];

/* ─── Testimonials ───────────────────────────────────────────────── */
const testimonials = [
  { name: "Ana Clara S.", role: "Professora", text: "Finalmente consegui ver para onde meu dinheiro vai. O Grana mudou minha vida financeira!" },
  { name: "Roberto M.", role: "Empresário", text: "Uso para controlar as despesas da família inteira. Os relatórios são incríveis." },
  { name: "Juliana P.", role: "Freelancer", text: "A gestão de faturas de cartão é sensacional. Nunca mais perdi o controle do limite." },
  { name: "Carlos E.", role: "Engenheiro", text: "Dashboard limpo, rápido e completo. O melhor custo-benefício que encontrei." },
];

/* ─── FAQ ────────────────────────────────────────────────────────── */
const faqs = [
  {
    q: "O teste grátis é mesmo gratuito?",
    a: "Sim! São 7 dias completos sem cobrança. Você não precisa cadastrar cartão de crédito para testar.",
  },
  {
    q: "Como funciona a cobrança?",
    a: "Após o período de teste, você escolhe entre o plano mensal (R$ 29/mês) ou anual (R$ 290/ano). O pagamento é processado de forma segura pelo Stripe.",
  },
  {
    q: "Posso cancelar a qualquer momento?",
    a: "Sim, sem multa. Ao cancelar, você continua com acesso até o fim do período pago.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "Absolutamente. Cada usuário tem dados isolados e protegidos. Não compartilhamos informações com terceiros.",
  },
  {
    q: "Funciona no celular?",
    a: "O sistema é responsivo e funciona em qualquer navegador, no computador ou celular.",
  },
  {
    q: "Posso importar dados?",
    a: "Atualmente o cadastro é manual, mas estamos trabalhando em importação automática de extratos bancários.",
  },
];

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-white font-sans text-gray-800">

      {/* ══════════════ NAVBAR ══════════════ */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white/90 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1e3977]">
              <DollarSign className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl font-black tracking-tight text-[#1e3977]" style={{ fontFamily: "'Fredoka', 'Inter', sans-serif" }}>
              Grana
            </span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-gray-600">
            <button onClick={() => scrollTo("funcionalidades")} className="hover:text-[#1e3977] transition-colors">Funcionalidades</button>
            <button onClick={() => scrollTo("planos")} className="hover:text-[#1e3977] transition-colors">Planos</button>
            <button onClick={() => scrollTo("depoimentos")} className="hover:text-[#1e3977] transition-colors">Depoimentos</button>
            <button onClick={() => scrollTo("faq")} className="hover:text-[#1e3977] transition-colors">FAQ</button>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login">
              <button className="px-4 py-2 rounded-lg border border-[#1e3977] text-[#1e3977] text-sm font-semibold hover:bg-[#1e3977]/5 transition-colors">
                Entrar
              </button>
            </Link>
            <Link to="/cadastro">
              <button className="px-4 py-2 rounded-lg bg-[#1e3977] text-white text-sm font-semibold hover:bg-[#152d61] transition-colors shadow-sm">
                Começar Grátis
              </button>
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button className="md:hidden p-2 rounded-lg text-gray-600" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 flex flex-col gap-4 text-sm font-medium text-gray-700">
            <button onClick={() => scrollTo("funcionalidades")} className="text-left">Funcionalidades</button>
            <button onClick={() => scrollTo("planos")} className="text-left">Planos</button>
            <button onClick={() => scrollTo("depoimentos")} className="text-left">Depoimentos</button>
            <button onClick={() => scrollTo("faq")} className="text-left">FAQ</button>
            <hr className="border-gray-100" />
            <Link to="/login" onClick={() => setMenuOpen(false)} className="text-[#1e3977] font-semibold">Entrar</Link>
            <Link to="/cadastro" onClick={() => setMenuOpen(false)}>
              <button className="w-full py-2.5 rounded-lg bg-[#1e3977] text-white font-semibold">Começar Grátis</button>
            </Link>
          </div>
        )}
      </header>

      {/* ══════════════ HERO ══════════════ */}
      <section
        className="relative pt-32 pb-24 px-6 overflow-hidden"
        style={{ background: "linear-gradient(135deg, #07172d 0%, #1e3977 100%)" }}
      >
        {/* decorative blobs */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle, #4CAF50 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle, #60a5fa 0%, transparent 70%)", transform: "translate(-30%, 30%)" }} />

        <div className="relative max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <div className="text-white">
            <div className="inline-flex items-center gap-2 bg-white/10 text-white/80 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-white/20">
              <Zap className="h-3.5 w-3.5 text-yellow-400" />
              7 dias grátis · sem cartão de crédito
            </div>
            <h1 className="text-4xl md:text-5xl font-black leading-tight mb-5" style={{ fontFamily: "'Fredoka', 'Inter', sans-serif" }}>
              Organize suas finanças de forma{" "}
              <span className="text-[#4CAF50]">simples</span> e{" "}
              <span className="text-[#60a5fa]">inteligente</span>
            </h1>
            <p className="text-white/75 text-lg leading-relaxed mb-8">
              Controle despesas, receitas, faturas de cartão, metas e muito mais. Tudo em um só lugar.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/cadastro">
                <button className="w-full sm:w-auto px-8 py-4 rounded-xl bg-[#4CAF50] text-white text-base font-bold hover:bg-[#43a047] transition-all shadow-lg shadow-green-900/30 hover:scale-105 active:scale-100">
                  Experimente 7 dias grátis
                </button>
              </Link>
              <button
                onClick={() => scrollTo("funcionalidades")}
                className="w-full sm:w-auto px-8 py-4 rounded-xl border border-white/30 text-white/90 text-base font-semibold hover:bg-white/10 transition-colors"
              >
                Ver funcionalidades
              </button>
            </div>
            <p className="mt-4 text-white/50 text-sm flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Sem precisar de cartão de crédito
            </p>
          </div>

          {/* Dashboard mockup */}
          <div className="hidden md:block">
            <div className="rounded-2xl overflow-hidden shadow-2xl shadow-black/40 border border-white/10"
              style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(12px)" }}>
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
                <span className="w-3 h-3 rounded-full bg-red-400/80" />
                <span className="w-3 h-3 rounded-full bg-yellow-400/80" />
                <span className="w-3 h-3 rounded-full bg-green-400/80" />
                <span className="ml-4 text-white/40 text-xs font-mono">grana.app/dashboard</span>
              </div>
              <div className="p-6 space-y-4">
                {/* Fake stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Receitas", value: "R$ 8.500", color: "#4CAF50" },
                    { label: "Despesas", value: "R$ 5.230", color: "#ef4444" },
                    { label: "Saldo", value: "R$ 3.270", color: "#60a5fa" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="text-xs text-white/50 mb-1">{s.label}</div>
                      <div className="text-sm font-bold" style={{ color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                {/* Fake bar chart */}
                <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <div className="text-xs text-white/40 mb-3">Despesas por categoria</div>
                  {[
                    { cat: "Alimentação", pct: 78, color: "#60a5fa" },
                    { cat: "Transporte", pct: 45, color: "#818cf8" },
                    { cat: "Lazer", pct: 32, color: "#4CAF50" },
                    { cat: "Saúde", pct: 20, color: "#f59e0b" },
                  ].map((b) => (
                    <div key={b.cat} className="flex items-center gap-3 mb-2">
                      <div className="text-xs text-white/50 w-20 shrink-0">{b.cat}</div>
                      <div className="flex-1 h-2 rounded-full bg-white/10">
                        <div className="h-2 rounded-full transition-all" style={{ width: `${b.pct}%`, background: b.color }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* Fake recent */}
                <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <div className="text-xs text-white/40 mb-3">Últimos lançamentos</div>
                  {[
                    { desc: "Supermercado", val: "- R$ 280,00", color: "#ef4444" },
                    { desc: "Salário", val: "+ R$ 4.500,00", color: "#4CAF50" },
                    { desc: "Netflix", val: "- R$ 45,90", color: "#ef4444" },
                  ].map((r) => (
                    <div key={r.desc} className="flex justify-between text-xs py-1 border-b border-white/5 last:border-0">
                      <span className="text-white/60">{r.desc}</span>
                      <span style={{ color: r.color }} className="font-semibold">{r.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ TRUST BAR ══════════════ */}
      <section className="bg-white border-b border-gray-100 py-10 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: "2.400+", label: "Usuários ativos" },
            { value: "1,2M+", label: "Lançamentos registrados" },
            { value: "50+", label: "Categorias personalizáveis" },
            { value: "7 dias", label: "Teste grátis sem cartão" },
          ].map((m) => (
            <div key={m.label}>
              <div className="text-3xl font-black text-[#1e3977] mb-1">{m.value}</div>
              <div className="text-sm text-gray-500">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════ FEATURES ══════════════ */}
      <section id="funcionalidades" className="py-24 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-block text-xs font-semibold text-[#1e3977] bg-[#1e3977]/10 px-3 py-1 rounded-full mb-4">Funcionalidades</div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4" style={{ fontFamily: "'Fredoka', 'Inter', sans-serif" }}>
              Por que escolher o Grana?
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto">Tudo que você precisa para ter controle total das suas finanças pessoais.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1e3977]/10 mb-4">
                  <f.icon className="h-5 w-5 text-[#1e3977]" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ HOW IT WORKS ══════════════ */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-block text-xs font-semibold text-[#1e3977] bg-[#1e3977]/10 px-3 py-1 rounded-full mb-4">Como funciona</div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900" style={{ fontFamily: "'Fredoka', 'Inter', sans-serif" }}>
              Comece em 3 passos simples
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Crie sua conta grátis",
                desc: "Cadastre-se em menos de 1 minuto. Sem cartão de crédito. 7 dias grátis para explorar tudo.",
                icon: Zap,
              },
              {
                step: "02",
                title: "Organize suas finanças",
                desc: "Cadastre contas, categorias e comece a lançar suas receitas e despesas facilmente.",
                icon: LayoutDashboard,
              },
              {
                step: "03",
                title: "Acompanhe seus resultados",
                desc: "Use o dashboard, relatórios e metas para tomar melhores decisões financeiras.",
                icon: BarChart3,
              },
            ].map((s, i) => (
              <div key={s.step} className="relative text-center">
                {i < 2 && (
                  <div className="hidden md:block absolute top-10 left-[calc(100%-1rem)] w-8 border-t-2 border-dashed border-[#1e3977]/20 z-0" />
                )}
                <div className="relative z-10 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-[#1e3977] mb-5 mx-auto shadow-lg shadow-[#1e3977]/20">
                  <span className="text-2xl font-black text-white/30 absolute top-2 right-3 leading-none">{s.step}</span>
                  <s.icon className="h-8 w-8 text-white relative z-10" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ PRICING ══════════════ */}
      <section id="planos" className="py-24 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-block text-xs font-semibold text-[#1e3977] bg-[#1e3977]/10 px-3 py-1 rounded-full mb-4">Planos e Preços</div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-3" style={{ fontFamily: "'Fredoka', 'Inter', sans-serif" }}>
              Simples e transparente
            </h2>
            <p className="text-gray-500">Comece grátis por 7 dias. Sem surpresas.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Mensal */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
              <div className="mb-6">
                <h3 className="text-xl font-bold text-gray-900 mb-1">Plano Mensal</h3>
                <p className="text-gray-400 text-sm">Flexibilidade máxima</p>
              </div>
              <div className="mb-6">
                <span className="text-5xl font-black text-gray-900">R$&nbsp;29</span>
                <span className="text-gray-400 text-sm">/mês</span>
              </div>
              <ul className="space-y-3 mb-8">
                {["Acesso completo a todas as funcionalidades", "Dashboard e relatórios avançados", "Suporte por chat", "Cancele quando quiser"].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-[#4CAF50] shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link to="/cadastro">
                <button className="w-full py-3 rounded-xl border-2 border-[#1e3977] text-[#1e3977] font-bold hover:bg-[#1e3977] hover:text-white transition-all">
                  Começar 7 dias grátis
                </button>
              </Link>
            </div>

            {/* Anual */}
            <div className="relative bg-[#1e3977] rounded-2xl p-8 shadow-xl shadow-[#1e3977]/25 text-white overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10 pointer-events-none"
                style={{ background: "radial-gradient(circle, #4CAF50, transparent)", transform: "translate(30%, -30%)" }} />
              <div className="absolute top-4 right-4 bg-[#4CAF50] text-white text-xs font-bold px-3 py-1 rounded-full">
                Economia de 17%
              </div>
              <div className="mb-6">
                <h3 className="text-xl font-bold mb-1">Plano Anual</h3>
                <p className="text-white/60 text-sm">Mais popular · melhor custo-benefício</p>
              </div>
              <div className="mb-1">
                <span className="text-5xl font-black">R$&nbsp;290</span>
                <span className="text-white/60 text-sm">/ano</span>
              </div>
              <p className="text-white/50 text-xs mb-6">≈ R$ 24,17/mês · economia de R$ 58/ano</p>
              <ul className="space-y-3 mb-8">
                {["Tudo do plano mensal", "Economia de R$ 58,00 por ano", "Prioridade no suporte", "Acesso antecipado a novidades"].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-white/85">
                    <Check className="h-4 w-4 text-[#4CAF50] shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link to="/cadastro">
                <button className="w-full py-3 rounded-xl bg-[#4CAF50] text-white font-bold hover:bg-[#43a047] transition-all shadow-lg shadow-green-900/30">
                  Começar 7 dias grátis
                </button>
              </Link>
            </div>
          </div>

          <p className="text-center text-gray-400 text-sm mt-6">
            Teste grátis por 7 dias. Sem compromisso. Cancele a qualquer momento.
          </p>
        </div>
      </section>

      {/* ══════════════ TESTIMONIALS ══════════════ */}
      <section id="depoimentos" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-block text-xs font-semibold text-[#1e3977] bg-[#1e3977]/10 px-3 py-1 rounded-full mb-4">Depoimentos</div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900" style={{ fontFamily: "'Fredoka', 'Inter', sans-serif" }}>
              Quem usa, recomenda
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-gray-50 rounded-2xl p-6 border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-600 leading-relaxed mb-5">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1e3977] text-white text-sm font-bold shrink-0">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{t.name}</div>
                    <div className="text-xs text-gray-400">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ FAQ ══════════════ */}
      <section id="faq" className="py-24 px-6 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-block text-xs font-semibold text-[#1e3977] bg-[#1e3977]/10 px-3 py-1 rounded-full mb-4">FAQ</div>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900" style={{ fontFamily: "'Fredoka', 'Inter', sans-serif" }}>
              Perguntas frequentes
            </h2>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 data-[state=open]:shadow-md transition-shadow">
                <AccordionTrigger className="text-sm font-semibold text-gray-900 hover:no-underline py-5">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-gray-500 leading-relaxed pb-5">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ══════════════ CTA FINAL ══════════════ */}
      <section className="py-24 px-6" style={{ background: "linear-gradient(135deg, #07172d 0%, #1e3977 100%)" }}>
        <div className="max-w-2xl mx-auto text-center text-white">
          <h2 className="text-3xl md:text-4xl font-black mb-4" style={{ fontFamily: "'Fredoka', 'Inter', sans-serif" }}>
            Comece a organizar suas finanças hoje mesmo
          </h2>
          <p className="text-white/60 mb-8 text-lg">7 dias grátis. Sem cartão. Sem burocracia.</p>
          <Link to="/cadastro">
            <button className="px-10 py-4 rounded-xl bg-[#4CAF50] text-white text-lg font-bold hover:bg-[#43a047] transition-all shadow-xl shadow-green-900/30 hover:scale-105 active:scale-100">
              Criar conta grátis
            </button>
          </Link>
          <p className="mt-4 text-white/40 text-sm flex items-center justify-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Seus dados 100% protegidos e seguros
          </p>
        </div>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className="bg-[#07172d] text-white/50 py-12 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8 mb-10">
            {/* Brand */}
            <div className="max-w-xs">
              <a href="#" className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1e3977]">
                  <DollarSign className="h-4 w-4 text-white" />
                </div>
                <span className="text-xl font-black text-white" style={{ fontFamily: "'Fredoka', 'Inter', sans-serif" }}>Grana</span>
              </a>
              <p className="text-sm leading-relaxed">
                Controle financeiro pessoal simples, completo e acessível para você e sua família.
              </p>
            </div>

            {/* Links */}
            <div className="grid grid-cols-2 gap-x-16 gap-y-2 text-sm">
              <a href="#" className="hover:text-white transition-colors">Termos de Uso</a>
              <a href="#" className="hover:text-white transition-colors">Política de Privacidade</a>
              <a href="#" className="hover:text-white transition-colors">Contato</a>
              <a href="#" className="hover:text-white transition-colors">Suporte</a>
            </div>

            {/* Social */}
            <div className="flex gap-3">
              {["f", "in", "ig"].map((s) => (
                <div key={s} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-xs font-bold hover:bg-white/10 cursor-pointer transition-colors">
                  {s}
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-white/5 pt-6 text-center text-xs">
            © 2025 Grana. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
