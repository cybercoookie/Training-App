import { useState, useEffect } from 'react';
import { supabase } from './utils/supabase';
import Login from './components/Login';
import CoachDashboard from './components/CoachDashboard';
import AthleteHub from './components/AthleteHub';

export default function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null); // Aquí guardaremos si es coach o atleta
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Chequeamos si hay sesión activa
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    // 2. Escuchamos cambios (cuando inician o cierran sesión)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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