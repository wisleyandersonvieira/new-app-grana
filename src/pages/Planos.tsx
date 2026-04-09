import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Check, Loader2, Crown, Lock, LogOut, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const PLANS: Record<string, { price_id: string; product_id: string; name: string; price: string; period: string; description: string; popular?: boolean; features: string[] }> = {
  mensal: {
    price_id: 'price_1T91XWGbo9PdwdD38zBjKpDx',
    product_id: 'prod_U7G319NX0PxwvN',
    name: 'Mensal',
    price: 'R$ 29',
    period: '/mês',
    description: 'Acesso completo com cobrança mensal',
    features: [
      'Controle ilimitado de receitas e despesas',
      'Categorias e subcategorias personalizadas',
      'Relatórios detalhados',
      'Controle de faturas de cartão',
      'Metas financeiras',
      'Transferências entre contas',
      'Exportação de dados',
    ],
  },
  anual: {
    price_id: 'price_1T91XqGbo9PdwdD30RWk5kSZ',
    product_id: 'prod_U7G3lQTOwn6Ivz',
    name: 'Anual',
    price: 'R$ 290',
    period: '/ano',
    description: 'Economize R$ 58 por ano!',
    popular: true,
    features: [
      'Tudo do plano mensal',
      'Economia de 2 meses',
      'Suporte prioritário',
    ],
  },
};

export default function Planos() {
  const { subscription, signOut } = useAuth();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.get('cancelado') === '1') {
      toast.info('Checkout cancelado. Você pode tentar novamente quando quiser.');
    }
  }, [searchParams]);

  const handleCheckout = async (priceId: string, planKey: string) => {
    setLoadingPlan(planKey);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err: any) {
      toast.error('Erro ao iniciar pagamento: ' + (err.message || 'Tente novamente'));
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleManageSubscription = async () => {
    setLoadingPlan('manage');
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err: any) {
      toast.error('Erro ao abrir portal: ' + (err.message || 'Tente novamente'));
    } finally {
      setLoadingPlan(null);
    }
  };

  const isActive = subscription?.status === 'active';
  const isBlocked = subscription?.status === 'expired';

  // Blocked/expired layout — no sidebar, standalone page
  if (isBlocked) {
    return (
      <div className="min-h-screen bg-muted/50 flex flex-col">
        {/* Minimal header */}
        <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-md">
              <DollarSign className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground tracking-tight">Grana</span>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>

        {/* Lock message */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Lock className="h-8 w-8 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Seu acesso ao Grana está pausado
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Seu período de teste/assinatura expirou. Escolha um plano abaixo para continuar organizando suas finanças.
            </p>
          </div>

          {/* Plan cards */}
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl w-full">
            {Object.entries(PLANS).map(([key, plan]) => (
              <Card
                key={key}
                className={`relative flex flex-col ${
                  plan.popular ? 'border-primary shadow-lg ring-2 ring-primary/20' : ''
                }`}
              >
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                    Mais popular
                  </Badge>
                )}
                <CardHeader className="text-center">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={plan.popular ? 'default' : 'outline'}
                    onClick={() => handleCheckout(plan.price_id, key)}
                    disabled={!!loadingPlan}
                  >
                    {loadingPlan === key ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Assinar agora
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Normal layout (inside AppLayout) for trial/active/canceled users
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Escolha seu plano</h1>
        <p className="text-muted-foreground">
          {isActive
            ? `Você está no plano ${subscription?.plano}. Gerencie sua assinatura abaixo.`
            : subscription?.status === 'trial'
            ? `Seu período de teste termina em ${subscription?.days_left} dia(s). Escolha um plano para continuar.`
            : 'Assine para continuar usando o Grana.'}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {Object.entries(PLANS).map(([key, plan]) => {
          const isCurrent = isActive && subscription?.plano === key;
          return (
            <Card
              key={key}
              className={`relative flex flex-col ${
                plan.popular ? 'border-primary shadow-lg ring-2 ring-primary/20' : ''
              } ${isCurrent ? 'border-green-500 ring-2 ring-green-200' : ''}`}
            >
              {plan.popular && !isCurrent && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                  Mais popular
                </Badge>
              )}
              {isCurrent && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white">
                  <Crown className="w-3 h-3 mr-1" />
                  Seu plano
                </Badge>
              )}
              <CardHeader className="text-center">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {isCurrent ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleManageSubscription}
                    disabled={loadingPlan === 'manage'}
                  >
                    {loadingPlan === 'manage' ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Gerenciar assinatura
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={plan.popular ? 'default' : 'outline'}
                    onClick={() => handleCheckout(plan.price_id, key)}
                    disabled={!!loadingPlan}
                  >
                    {loadingPlan === key ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    {isActive ? 'Trocar para este plano' : 'Assinar agora'}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
