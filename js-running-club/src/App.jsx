import { useState, useEffect } from 'react';
import { supabase } from './utils/supabase';
import Login from './components/Login';
import CoachDashboard from './components/CoachDashboard';
import AthleteHub from './components/AthleteHub';
import ResetPassword from './components/ResetPassword';

export default function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    // 1. Chequeamos si hay sesión activa
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    // 2. Escuchamos cambios (cuando inician o cierran sesión)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // El usuario llegó desde el enlace de recuperación del email
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setSession(session);
        setLoading(false);
        return;
      }
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Función para buscar el ROL en la base de datos
  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase.from('perfiles').select('rol, nombre').eq('id', userId).single();
      if (!error && data) {
        setUserProfile(data);
      }
    } catch (error) {
      console.error("Error buscando perfil:", error);
    } finally {
      setLoading(false);
    }
  }

  // PANTALLA DE CARGA
  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-orange-500 font-black tracking-widest uppercase">Arrancando Sistema...</div>;
  }

  // FLUJO DE RECUPERACIÓN DE CONTRASEÑA (llegó desde el email)
  if (recoveryMode) {
    return <ResetPassword onDone={() => { setRecoveryMode(false); if (session) fetchProfile(session.user.id); }} />;
  }

  // SI NO ESTÁ LOGUEADO -> Mostrar Login
  if (!session) {
    return <Login />;
  }

  // SI ESTÁ LOGUEADO -> Decidir qué pantalla mostrar según su ROL
  if (userProfile?.rol === 'coach') {
    return <CoachDashboard coachName={userProfile.nombre} />;
  } else {
    return <AthleteHub userName={userProfile?.nombre} />;
  }
}