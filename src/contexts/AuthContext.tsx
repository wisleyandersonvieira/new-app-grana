import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  user_id: string;
  nome: string | null;
  email: string | null;
  telefone?: string | null;
  empresa?: string | null;
  is_admin: boolean | null;
  role?: string | null;
  status: string | null;
  access_blocked?: boolean | null;
  internal_notes?: string | null;
  ultimo_acesso: string | null;
  last_login_at?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SubscriptionInfo {
  subscribed: boolean;
  status: 'trial' | 'active' | 'expired' | 'canceled' | 'past_due' | 'admin_free';
  plano?: string;
  trial_end?: string;
  days_left?: number;
  subscription_end?: string;
  product_id?: string;
  price_id?: string;
  message?: string;
  grace_period?: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  subscription: SubscriptionInfo | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  subscription: null,
  loading: true,
  signOut: async () => {},
  refreshSubscription: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const checkSubscription = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) {
        // If unauthorized, session is invalid - don't log as error
        if (error.message?.includes('non-2xx')) {
          return;
        }
        console.error('Error checking subscription:', error);
        return;
      }
      setSubscription(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchProfile = async (userId: string) => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', userId)
          .single();
        if (mounted) setProfile(data);

        const timestamp = new Date().toISOString();
        supabase
          .from('profiles')
          .update({ ultimo_acesso: timestamp, last_login_at: timestamp })
          .eq('user_id', userId)
          .then(() => {});
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          fetchProfile(session.user.id);
          setTimeout(() => checkSubscription(), 0);
        } else {
          setProfile(null);
          setSubscription(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        checkSubscription();
      } else {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      authSub.unsubscribe();
    };
  }, [checkSubscription]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(checkSubscription, 60000);
    return () => clearInterval(interval);
  }, [user, checkSubscription]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setSubscription(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, subscription, loading, signOut, refreshSubscription: checkSubscription }}>
      {children}
    </AuthContext.Provider>
  );
}
