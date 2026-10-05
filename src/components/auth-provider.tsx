import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { AuthContext, type AuthContextValue } from "@/hooks/auth-context";

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // Evita confundir "todavia no llego el perfil" con "no tiene acceso":
  // esa confusion provocaba un rebote infinito entre "/" y "/pendiente".
  const [profileReady, setProfileReady] = useState(false);
  const currentUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      setProfile(await fetchProfile(userId));
    } catch {
      setProfile(null);
    } finally {
      setProfileReady(true);
    }
  }, []);

  useEffect(() => {
    // El listener se registra antes de restaurar la sesion.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        const userId = nextSession.user.id;
        if (currentUserId.current !== userId) {
          currentUserId.current = userId;
          setProfileReady(false);
        }
        // Llamar al cliente dentro del callback lo bloquea: se difiere.
        setTimeout(() => {
          void loadProfile(userId);
        }, 0);
      } else {
        currentUserId.current = null;
        setProfile(null);
        setProfileReady(true);
      }
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data: current }) => {
      setSession(current.session ?? null);
      setUser(current.session?.user ?? null);
      if (current.session?.user) {
        currentUserId.current = current.session.user.id;
        void loadProfile(current.session.user.id);
      } else {
        setProfile(null);
        setProfileReady(true);
      }
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setProfileReady(true);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      role: profile?.role ?? (user ? "pending" : null),
      sectorId: profile?.sector_id ?? null,
      ready: !loading && (!user || profileReady),
      loading,
      refreshProfile,
      signOut,
    }),
    [user, session, profile, loading, profileReady, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
