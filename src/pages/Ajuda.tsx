import { useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  CreditCard,
  HelpCircle,
  LayoutDashboard,
  Layers,
  PlayCircle,
  Receipt,
  Settings,
  Target,
} from 'lucide-react';

import { OnboardingTutorial } from '@/components/OnboardingTutorial';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const helpCards = [
  {
    title: 'Dashboard',
    description: 'Entenda seus indicadores principais.',
    icon: LayoutDashboard,
  },
  {
    title: 'Lançamentos',
    description: 'Cadastre receitas e despesas.',
    icon: Receipt,
  },
  {
    title: 'Cartão de Crédito',
    description: 'Controle faturas e importações.',
    icon: CreditCard,
  },
  {
    title: 'Transferências',
    description: 'Movimente saldo entre contas.',
    icon: ArrowLeftRight,
  },
  {
    title: 'Relatórios',
    description: 'Acompanhe resultados e saldos.',
    icon: BarChart3,
  },
  {
    title: 'Metas',
    description: 'Compare planejado e realizado.',
    icon: Target,
  },
  {
    title: 'Cadastros',
    description: 'Configure contas, categorias e subcategorias.',
    icon: Layers,
  },
  {
    title: 'Configurações',
    description: 'Gerencie conta, assinatura e bloqueios.',
    icon: Settings,
  },
];

export default function Ajuda() {
  const [tutorialOpen, setTutorialOpen] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HelpCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Central de Ajuda</h1>
              <p className="text-muted-foreground">
                Aprenda como usar os principais recursos do Top Grana.
              </p>
            </div>
          </div>
        </div>
        <Button type="button" className="w-full sm:w-auto" onClick={() => setTutorialOpen(true)}>
          <PlayCircle className="mr-2 h-4 w-4" />
          Iniciar tutorial guiado
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {helpCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="transition-shadow hover:shadow-md">
              <CardHeader className="space-y-0 pb-3">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base">{card.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <OnboardingTutorial
        open={tutorialOpen}
        onClose={() => {
          setTutorialOpen(false);
        }}
      />
    </div>
  );
}
