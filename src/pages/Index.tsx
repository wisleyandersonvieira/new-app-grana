import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Wallet, Target } from 'lucide-react';

export default function Index() {
  const { profile } = useAuth();

  const cards = [
    { title: 'Receitas', value: 'R$ 0,00', icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
    { title: 'Despesas', value: 'R$ 0,00', icon: TrendingDown, color: 'text-destructive', bg: 'bg-destructive/10' },
    { title: 'Saldo', value: 'R$ 0,00', icon: Wallet, color: 'text-accent', bg: 'bg-accent/10' },
    { title: 'Metas', value: '0 / 0', icon: Target, color: 'text-warning', bg: 'bg-warning/10' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Olá, {profile?.nome || 'Usuário'}! 👋
        </h1>
        <p className="text-muted-foreground mt-0.5">Aqui está o resumo das suas finanças</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.title} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">{card.title}</span>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.bg}`}>
                <card.icon className={`h-[18px] w-[18px] ${card.color}`} />
              </div>
            </div>
            <div className="text-2xl font-bold">{card.value}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Últimos lançamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Nenhum lançamento encontrado. Comece adicionando suas receitas e despesas!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
