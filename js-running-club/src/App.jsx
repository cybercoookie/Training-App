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

// Nueva funcion para cargar datos del atleta, ahora con soporte dinámico para semanas y orden de días

async function cargarDatosDelAtleta() {
    setIsSyncing(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        
        // Buscamos el plan más reciente (independientemente de si es de 8 o 14 semanas)
        const { data: planData } = await supabase.from('planes_entrenamiento')
            .select('*')
            .eq('atleta_id', user.id)
            // Quitamos el filtro estricto de 'activo' para que mande la fecha de creación
            .order('fecha_creacion', { ascending: false }) 
            .limit(1)
            .single();

        if (!planData) { setLoading(false); setIsSyncing(false); return; }
        setPlan(planData);

        const { data: rutinas } = await supabase.from('rutinas_programadas')
            .select('*')
            .eq('plan_id', planData.id);
        
        const { data: ejecuciones } = await supabase.from('registros_ejecucion')
            .select('*, rutinas_programadas!inner(plan_id)')
            .eq('rutinas_programadas.plan_id', planData.id);

        const registrosMap = {};
        if (ejecuciones) ejecuciones.forEach(ej => registrosMap[ej.rutina_id] = ej);
        setRecords(registrosMap);

        // DINÁMICO: Detectamos el número máximo de semanas en las rutinas
        const maxSemana = rutinas ? Math.max(...rutinas.map(r => r.semana), 1) : 1;
        const semanas = {};
        for(let i=1; i<=maxSemana; i++) semanas[i] = [];
        
        if (rutinas) {
            rutinas.forEach(r => {
                if (!semanas[r.semana]) semanas[r.semana] = [];
                semanas[r.semana].push(r);
            });
            // Ordenar por día
            Object.keys(semanas).forEach(s => {
                semanas[s].sort((a, b) => (ordenDias[a.dia_semana] || 99) - (ordenDias[b.dia_semana] || 99));
            });
        }
        setRoutinesByWeek(semanas);
    } catch (error) { 
        console.error("Error cargando el nuevo plan:", error); 
    } finally { 
        setLoading(false); 
        setIsSyncing(false); 
    }
}


}