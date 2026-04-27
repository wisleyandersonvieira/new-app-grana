import { useEffect, useMemo, useState } from 'react';
import type { ElementType } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CreditCard,
  LayoutDashboard,
  Layers,
  Receipt,
  Settings,
  Target,
  X,
  ArrowLeftRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type TutorialStep = {
  key: string;
  title: string;
  description: string;
  icon: ElementType;
  menuSelector: string;
};

const tutorialSteps: TutorialStep[] = [
  {
    key: 'dashboard',
    title: 'Visão geral do seu financeiro',
    description:
      'Aqui você acompanha os principais indicadores do seu financeiro em um só lugar: saldos, receitas, despesas, metas e gráficos de desempenho. O Dashboard é o ponto de partida para entender rapidamente a situação do seu negócio.',
    icon: LayoutDashboard,
    menuSelector: "[data-tour='dashboard']",
  },
  {
    key: 'lancamentos',
    title: 'Registre suas receitas e despesas',
    description:
      'No menu Lançamentos você cadastra novas despesas, novas receitas e acompanha tudo que está em aberto, pago ou recebido. Esse é o coração operacional do sistema, onde os movimentos financeiros do dia a dia são registrados.',
    icon: Receipt,
    menuSelector: "[data-tour='lancamentos']",
  },
  {
    key: 'cartao-credito',
    title: 'Controle suas faturas de cartão',
    description:
      'Neste módulo você cadastra faturas, importa lançamentos de cartão de crédito e acompanha a situação de cada fatura. O sistema consolida os lançamentos para facilitar o controle e evitar duplicidade nas despesas.',
    icon: CreditCard,
    menuSelector: "[data-tour='cartao-credito']",
  },
  {
    key: 'transferencias',
    title: 'Movimente saldo entre contas',
    description:
      'Use Transferências para registrar movimentações entre contas, como envio de dinheiro de uma conta bancária para outra. Essas movimentações afetam o saldo das contas, mas não entram como receita ou despesa.',
    icon: ArrowLeftRight,
    menuSelector: "[data-tour='transferencias']",
  },
  {
    key: 'relatorios',
    title: 'Analise seus resultados com clareza',
    description:
      'Em Relatórios você consulta informações detalhadas, comparativos mensais, saldos de contas e relatórios completos. Essa área ajuda você a entender para onde o dinheiro está indo e como está a evolução financeira ao longo do tempo.',
    icon: BarChart3,
    menuSelector: "[data-tour='relatorios']",
  },
  {
    key: 'metas',
    title: 'Acompanhe seus objetivos financeiros',
    description:
      'No menu Metas você cadastra objetivos de receitas, despesas ou categorias específicas e acompanha o realizado de cada competência. Isso permite comparar o planejado com o executado e tomar decisões melhores.',
    icon: Target,
    menuSelector: "[data-tour='metas']",
  },
  {
    key: 'cadastros',
    title: 'Organize a estrutura do sistema',
    description:
      'Em Cadastros você configura categorias, subcategorias e contas. Essas informações são a base para organizar seus lançamentos, relatórios e saldos de forma correta.',
    icon: Layers,
    menuSelector: "[data-tour='cadastros']",
  },
  {
    key: 'configuracoes',
    title: 'Gerencie sua conta e preferências',
    description:
      'Em Configurações você acessa informações da sua assinatura, dados da sua conta, bloqueio de datas e a Central de Ajuda. Sempre que precisar rever este tutorial, basta acessar Configurações > Ajuda.',
    icon: Settings,
    menuSelector: "[data-tour='configuracoes']",
  },
];

type OnboardingTutorialProps = {
  open: boolean;
  onClose: (completed: boolean) => void | Promise<void>;
};

export function OnboardingTutorial({ open, onClose }: OnboardingTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const step = tutorialSteps[currentStep];
  const Icon = step.icon;
  const isFirst = currentStep === 0;
  const isLast = currentStep === tutorialSteps.length - 1;
  const progress = useMemo(() => ((currentStep + 1) / tutorialSteps.length) * 100, [currentStep]);

  useEffect(() => {
    if (open) setCurrentStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const target = document.querySelector(step.menuSelector);
    target?.classList.add('tour-menu-highlight');

    return () => {
      target?.classList.remove('tour-menu-highlight');
    };
  }, [open, step.menuSelector]);

  if (!open) return null;

  const finish = () => {
    void onClose(true);
  };

  const skip = () => {
    void onClose(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6">
      <div className="fixed inset-0 z-[-1] bg-slate-950/55 backdrop-blur-[2px]" />
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase text-primary">
                Etapa {currentStep + 1} de {tutorialSteps.length}
              </p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                {step.title}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Pular tutorial"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={skip}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <p className="text-sm leading-6 text-slate-600 sm:text-base">{step.description}</p>

          <div className="mt-6">
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-4 flex justify-center gap-2">
              {tutorialSteps.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  aria-label={`Ir para etapa ${index + 1}`}
                  className={cn(
                    'h-2.5 rounded-full transition-all',
                    index === currentStep ? 'w-8 bg-primary' : 'w-2.5 bg-slate-200 hover:bg-slate-300',
                  )}
                  onClick={() => setCurrentStep(index)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Button type="button" variant="ghost" onClick={skip}>
            Pular tutorial
          </Button>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isFirst}
              onClick={() => setCurrentStep((value) => Math.max(0, value - 1))}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (isLast) finish();
                else setCurrentStep((value) => Math.min(tutorialSteps.length - 1, value + 1));
              }}
            >
              {isLast ? 'Finalizar' : 'Próximo'}
              {!isLast && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
