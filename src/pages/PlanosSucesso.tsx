import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PlanosSucesso() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshSubscription } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plano, setPlano] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      setError('Sessão não encontrada');
      setLoading(false);
      return;
    }

    const verifyCheckout = async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('verify-checkout', {
          body: { sessionId },
        });
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        setPlano(data.plano);
        await refreshSubscription();
      } catch (err: any) {
        setError(err.message || 'Erro ao verificar pagamento');
      } finally {
        setLoading(false);
      }
    };

    verifyCheckout();
  }, [searchParams, refreshSubscription]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Verificando seu pagamento...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Erro</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => navigate('/planos')} className="w-full">
              Voltar para os planos
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-20">
      <Card className="text-center">
        <CardHeader>
          <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-2" />
          <CardTitle className="text-2xl">Assinatura ativada com sucesso!</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-6">
            Seu plano <strong className="text-foreground">{plano}</strong> está ativo.
            Aproveite o Grana! 🎉
          </p>
          <Button onClick={() => navigate('/dashboard')} className="w-full" size="lg">
            Ir para o Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
