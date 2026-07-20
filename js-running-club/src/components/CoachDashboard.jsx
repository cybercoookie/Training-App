import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

const DAY_ORDER = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };
const MAX_HR_DEFAULT = 190;

// Convierte "13:45" a segundos por milla para comparar paces
function paceToSeconds(pace) {
    if (!pace || typeof pace !== 'string') return null;
    const parts = pace.split(':').map(Number);
    if (parts.length !== 2 || parts.some(isNaN)) return null;
    return parts[0] * 60 + parts[1];
}

function hrZone(hr, maxHr = MAX_HR_DEFAULT) {
    const pct = (hr / maxHr) * 100;
    if (pct < 60) return 1;
    if (pct < 70) return 2;
    if (pct < 80) return 3;
    if (pct < 90) return 4;
    return 5;
}

const ZONE_INFO = {
    1: { label: 'Z1 Recuperación', color: 'rgba(96, 165, 250, 0.7)' },
    2: { label: 'Z2 Aeróbica', color: 'rgba(52, 211, 153, 0.7)' },
    3: { label: 'Z3 Tempo', color: 'rgba(250, 204, 21, 0.7)' },
    4: { label: 'Z4 Umbral', color: 'rgba(251, 146, 60, 0.7)' },
    5: { label: 'Z5 Máxima', color: 'rgba(248, 113, 113, 0.7)' },
};

const METAS = {
    '5k':  { dist: 3.1,  longMax: 4,  nombre: '5K' },
    '10k': { dist: 6.2,  longMax: 7,  nombre: '10K' },
    '21k': { dist: 13.1, longMax: 11, nombre: 'Media Maratón' },
    '42k': { dist: 26.2, longMax: 20, nombre: 'Maratón' },
};

function fmtPace(secsPerMi) {
    const m = Math.floor(secsPerMi / 60), s = Math.round(secsPerMi % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// AI Coach: genera un plan periodizado (base → build → peak → taper)
// a partir de los datos de preparación previa del atleta.
function generarPlanAI(datos) {
    const meta = METAS[datos.meta] || METAS['21k'];
    const nivel = datos.nivel || 'principiante';
    const diasSemana = parseInt(datos.diasSemana) || 4;
    const currentLong = parseFloat(datos.corridaMasLarga) || 2;

    // Ritmo meta a partir del tiempo objetivo (formato "3:00" hrs:min)
    let paceMeta = null;
    if (datos.tiempoMeta) {
        const [h, m] = datos.tiempoMeta.split(':').map(Number);
        if (!isNaN(h)) paceMeta = fmtPace(((h * 60 + (m || 0)) * 60) / meta.dist);
    }

    // Semanas disponibles hasta la carrera (min 4, max 16)
    const hoy = new Date();
    const inicio = new Date(hoy);
    inicio.setDate(inicio.getDate() + ((2 - inicio.getDay() + 7) % 7 || 7)); // próximo martes
    let totalSemanas = 8;
    if (datos.fechaCarrera) {
        const carrera = new Date(datos.fechaCarrera + 'T00:00:00');
        totalSemanas = Math.max(4, Math.min(16, Math.floor((carrera - inicio) / (7 * 24 * 3600 * 1000)) + 1));
    }

    const taperSemanas = meta.dist >= 13 ? 2 : 1;
    const buildSemanas = totalSemanas - taperSemanas;

    // Progresión del largo: de la corrida más larga actual hasta el máximo del plan
    const longInicial = Math.max(2, Math.min(currentLong, meta.longMax));
    const factorNivel = nivel === 'avanzado' ? 1.15 : nivel === 'intermedio' ? 1.0 : 0.85;
    const easyBase = Math.max(2, Math.round(longInicial * 0.6 * factorNivel * 2) / 2);

    const workouts = [];
    const addDias = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };

    for (let s = 1; s <= totalSemanas; s++) {
        const lunes = addDias(inicio, (s - 1) * 7 - 1);
        const esTaper = s > buildSemanas;
        const esCutback = !esTaper && s % 4 === 0;
        const esCarrera = s === totalSemanas && datos.fechaCarrera;
        const progreso = buildSemanas > 1 ? (s - 1) / (buildSemanas - 1) : 1;

        let longRun = longInicial + (meta.longMax - longInicial) * Math.min(1, progreso);
        if (esCutback) longRun *= 0.75;
        if (esTaper) longRun = meta.longMax * (esCarrera ? 0 : 0.5);
        longRun = Math.round(longRun * 2) / 2;

        let easy = easyBase + progreso * 1.5;
        if (esCutback || esTaper) easy *= 0.8;
        easy = Math.round(easy * 2) / 2;

        // Martes: easy
        workouts.push({ week_number: s, day_of_week: 'Tuesday', date: addDias(lunes, 1), title: 'Easy Run', description: `Trote suave conversacional. Esfuerzo 5/10.${esTaper ? ' Semana de taper: prioriza descanso e hidratación.' : ''}`, distance_mi: esCarrera ? Math.min(easy, 2) : easy, workout_type: 'Running' });

        // Jueves: easy al inicio, tempo desde el segundo tercio
        const conTempo = !esTaper && !esCutback && s > Math.ceil(buildSemanas / 3);
        workouts.push({ week_number: s, day_of_week: 'Thursday', date: addDias(lunes, 3), title: esCarrera ? 'Easy Run' : conTempo ? 'Tempo Run' : 'Easy Run', description: esCarrera ? 'Trote corto de activación. Confía en tu entrenamiento.' : conTempo ? `Calentamiento 1 mi + tempo a ritmo ${paceMeta ? `meta (${paceMeta}/mi)` : 'controlado'} + enfriamiento.` : 'Trote aeróbico base. Enfócate en postura y cadencia.', distance_mi: esCarrera ? 1.5 : easy, workout_type: 'Running' });

        // Sábado: fuerza (si entrena 4+ días), excepto taper
        if (diasSemana >= 4) {
            workouts.push({ week_number: s, day_of_week: 'Saturday', date: addDias(lunes, 5), title: esTaper ? 'Mobility Only' : 'Strength & Mobility', description: esTaper ? 'Solo movilidad y estiramientos suaves. Nada nuevo antes de la carrera.' : 'Fuerza para corredores: sentadillas, RDL, lunges, core y estabilidad de cadera.', distance_mi: 0, workout_type: 'Strength' });
        }

        // Domingo: largo (o carrera)
        workouts.push({ week_number: s, day_of_week: 'Sunday', date: addDias(lunes, 6), title: esCarrera ? `🏅 RACE DAY — ${meta.nombre}` : esCutback ? 'Recovery Long Run' : 'Long Run', description: esCarrera ? `DÍA DE CARRERA. Meta: ${datos.tiempoMeta || 'terminar'}${paceMeta ? ` (~${paceMeta}/mi)` : ''}. Empieza conservador, hidrátate en cada puesto y disfruta.` : esCutback ? 'Semana de descarga: reduce volumen para asimilar la carga.' : `Largo progresivo. Ritmo muy suave, hidratación cada 20 min.${longRun >= meta.longMax * 0.8 ? ' Practica tu nutrición de carrera.' : ''}`, distance_mi: esCarrera ? meta.dist : longRun, workout_type: 'Running' });
    }
    return workouts;
}

// Genera métricas y análisis estilo Strava/Garmin a partir del programa
function analizarPrograma(workouts) {
    const running = workouts.filter(w => w.workout_type === 'Running');
    const completados = workouts.filter(w => w.is_completed);
    const runsCompletados = running.filter(w => w.is_completed);

    const millasPlan = running.reduce((s, w) => s + (parseFloat(w.distance_mi) || 0), 0);
    const millasHechas = runsCompletados.reduce((s, w) => s + (parseFloat(w.actual_distance_mi ?? w.distance_mi) || 0), 0);
    const pct = workouts.length ? Math.round((completados.length / workouts.length) * 100) : 0;

    // Mejor esfuerzo: corrida más larga y mejor pace registrado
    let mejorDistancia = null, mejorPace = null;
    runsCompletados.forEach(w => {
        const dist = parseFloat(w.actual_distance_mi ?? w.distance_mi) || 0;
        if (!mejorDistancia || dist > mejorDistancia.dist) mejorDistancia = { dist, w };
        const secs = paceToSeconds(w.actual_pace);
        if (secs && (!mejorPace || secs < mejorPace.secs)) mejorPace = { secs, w };
    });

    // FC promedio y zonas
    const conHr = runsCompletados.filter(w => w.avg_hr);
    const avgHr = conHr.length ? Math.round(conHr.reduce((s, w) => s + w.avg_hr, 0) / conHr.length) : null;
    const zonas = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    conHr.forEach(w => { zonas[hrZone(w.avg_hr)]++; });

    // Millaje semanal: plan vs real
    const semanas = [...new Set(workouts.map(w => w.week_number))].sort((a, b) => a - b);
    const millajeSemanal = semanas.map(s => {
        const runs = running.filter(w => w.week_number === s);
        return {
            semana: s,
            plan: runs.reduce((sum, w) => sum + (parseFloat(w.distance_mi) || 0), 0),
            real: runs.filter(w => w.is_completed).reduce((sum, w) => sum + (parseFloat(w.actual_distance_mi ?? w.distance_mi) || 0), 0),
        };
    });

    // Áreas de mejora generadas de los datos
    const insights = [];
    const today = new Date().toISOString().split('T')[0];
    const pasados = workouts.filter(w => w.date < today);
    const saltados = pasados.filter(w => !w.is_completed);
    if (saltados.length > 0) insights.push({ icon: 'fa-calendar-times', text: `${saltados.length} entrenamiento(s) pasados sin completar — reforzar consistencia.`, tipo: 'warn' });
    const strengthPend = pasados.filter(w => w.workout_type === 'Strength' && !w.is_completed).length;
    if (strengthPend > 0) insights.push({ icon: 'fa-dumbbell', text: `Saltó ${strengthPend} sesión(es) de fuerza — clave para prevenir lesiones.`, tipo: 'warn' });
    const sinDatos = runsCompletados.filter(w => !w.actual_pace && !w.avg_hr).length;
    if (sinDatos > 0) insights.push({ icon: 'fa-watch', text: `${sinDatos} corrida(s) completadas sin datos de pace/FC — pedir que sincronice su reloj.`, tipo: 'info' });
    if (conHr.length >= 2 && (zonas[4] + zonas[5]) > conHr.length / 2) insights.push({ icon: 'fa-heart-pulse', text: 'Más de la mitad de las corridas en Z4-Z5 — está corriendo demasiado fuerte los días easy.', tipo: 'warn' });
    if (conHr.length >= 2 && (zonas[1] + zonas[2]) >= conHr.length * 0.7) insights.push({ icon: 'fa-check-circle', text: 'Buena base aeróbica: la mayoría de corridas en Z1-Z2. Perfecto para principiante.', tipo: 'ok' });
    if (mejorPace) {
        const meta = 13 * 60 + 44;
        if (mejorPace.secs <= meta) insights.push({ icon: 'fa-bolt', text: `Su mejor pace (${mejorPace.w.actual_pace}/mi) ya es más rápido que el ritmo meta (13:44/mi). Meta de 3:00 hrs alcanzable.`, tipo: 'ok' });
        else insights.push({ icon: 'fa-gauge-high', text: `Mejor pace actual ${mejorPace.w.actual_pace}/mi vs meta 13:44/mi — trabajar tempos progresivos.`, tipo: 'info' });
    }
    if (insights.length === 0) insights.push({ icon: 'fa-thumbs-up', text: 'Sin alertas — el plan va según lo esperado.', tipo: 'ok' });

    return { pct, millasPlan, millasHechas, completados: completados.length, total: workouts.length, mejorDistancia, mejorPace, avgHr, zonas, conHrCount: conHr.length, millajeSemanal, insights };
}

export default function CoachDashboard({ coachName }) {
    const [athletes, setAthletes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [notifications, setNotifications] = useState([]);
    const [showNotifs, setShowNotifs] = useState(false);

    const [showAddModal, setShowAddModal] = useState(false);
    const [wizardStep, setWizardStep] = useState(1);
    const [creating, setCreating] = useState(false);
    const [newAthlete, setNewAthlete] = useState({
        nombre: '', email: '', sexo: '', disciplina: '', deporte: 'Running',
        nivel: 'principiante', corridaMasLarga: '', diasSemana: '4', historial: '',
        crearPlanAI: true, meta: '21k', tiempoMeta: '', fechaCarrera: '',
    });

    // Detalle de atleta
    const [selectedAthlete, setSelectedAthlete] = useState(null);
    const [workouts, setWorkouts] = useState([]);
    const [analysis, setAnalysis] = useState(null);
    const [detailTab, setDetailTab] = useState('resumen');
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [tempNoteText, setTempNoteText] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);

    useEffect(() => { cargarAtletas(); cargarNotificaciones(); }, []);

    async function cargarAtletas() {
        setLoading(true);
        try {
            const { data: perfiles } = await supabase.from('perfiles').select('*').eq('rol', 'atleta').order('nombre');
            const { data: programas } = await supabase.from('athlete_program').select('athlete_id, is_completed, date');

            const atletas = (perfiles || []).map(p => {
                const propios = (programas || []).filter(w => w.athlete_id === p.id);
                const completados = propios.filter(w => w.is_completed).length;
                return {
                    ...p,
                    totalWorkouts: propios.length,
                    completados,
                    tienePlan: propios.length > 0,
                };
            });
            setAthletes(atletas);
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    }

    async function cargarNotificaciones() {
        const { data } = await supabase.from('notificaciones_coach').select('*').order('created_at', { ascending: false }).limit(20);
        setNotifications(data || []);
    }

    async function marcarLeidas() {
        const noLeidas = notifications.filter(n => !n.is_read).map(n => n.id);
        if (noLeidas.length === 0) return;
        await supabase.from('notificaciones_coach').update({ is_read: true }).in('id', noLeidas);
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }

    async function registrarAtleta(e) {
        e.preventDefault();
        setCreating(true);
        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: newAthlete.email,
                password: 'ChangeMe2026!',
                options: { data: { nombre: newAthlete.nombre } }
            });
            if (authError) throw authError;

            const datosEntrenamiento = {
                nivel: newAthlete.nivel,
                corrida_mas_larga_mi: newAthlete.corridaMasLarga || null,
                dias_por_semana: newAthlete.diasSemana,
                historial: newAthlete.historial || null,
                meta: newAthlete.meta,
                tiempo_meta: newAthlete.tiempoMeta || null,
                fecha_carrera: newAthlete.fechaCarrera || null,
            };

            await supabase.from('perfiles').update({
                nombre: newAthlete.nombre, sexo: newAthlete.sexo, disciplina: newAthlete.disciplina,
                deporte: newAthlete.deporte, email: newAthlete.email, rol: 'atleta',
                datos_entrenamiento: datosEntrenamiento,
            }).eq('id', authData.user.id);

            let msg = "¡Atleta creado! Contraseña temporal: ChangeMe2026!";
            if (newAthlete.crearPlanAI) {
                const plan = generarPlanAI(newAthlete);
                const rows = plan.map(w => ({ ...w, athlete_id: authData.user.id, is_completed: false }));
                const { error: planError } = await supabase.from('athlete_program').insert(rows);
                if (planError) throw planError;
                msg += ` Plan AI generado: ${plan.length} entrenamientos en ${plan[plan.length - 1].week_number} semanas.`;
            }

            alert(msg);
            setShowAddModal(false);
            setWizardStep(1);
            cargarAtletas();
        } catch (error) { alert("Error: " + error.message); }
        finally { setCreating(false); }
    }

    async function abrirDetalle(atleta) {
        if (!atleta.tienePlan) { alert("Este atleta no tiene entrenamientos asignados."); return; }
        setSelectedAthlete(atleta);
        setDetailTab('resumen');
        const { data: wks } = await supabase.from('athlete_program')
            .select('*')
            .eq('athlete_id', atleta.id)
            .order('date', { ascending: true });
        const sorted = (wks || []).sort((a, b) => a.week_number - b.week_number || (DAY_ORDER[a.day_of_week] || 99) - (DAY_ORDER[b.day_of_week] || 99));
        setWorkouts(sorted);
        setAnalysis(analizarPrograma(sorted));
    }

    async function guardarNotaCoach(workoutId) {
        setIsSavingNote(true);
        try {
            const { error } = await supabase.from('athlete_program').update({ coach_feedback: tempNoteText }).eq('id', workoutId);
            if (error) throw error;
            setWorkouts(prev => prev.map(w => w.id === workoutId ? { ...w, coach_feedback: tempNoteText } : w));
            setEditingNoteId(null);
        } catch (e) { alert(`Error: ${e.message}`); }
        finally { setIsSavingNote(false); }
    }

    const unreadCount = notifications.filter(n => !n.is_read).length;

    const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9ca3af', font: { size: 10 } } } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.08)' }, ticks: { color: '#9ca3af' } }, x: { grid: { display: false }, ticks: { color: '#9ca3af' } } } };

    return (
        <div className="min-h-screen bg-black text-gray-100 font-sans pb-24">
            <header className="p-6 bg-black/90 backdrop-blur-md border-b border-gray-800 flex justify-between items-center sticky top-0 z-40">
                <div>
                    <h1 className="text-xl font-black italic tracking-tighter text-orange-500">JS RUNNING <span className="text-white">COACH</span></h1>
                    <div className="text-[9px] uppercase tracking-widest font-bold text-gray-500 mt-1">Sesión: {coachName}</div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) marcarLeidas(); }} className="bg-gray-900 p-2 rounded-lg border border-gray-800 text-orange-400 relative">
                        <i className="fas fa-bell"></i>
                        {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">{unreadCount}</span>}
                    </button>
                    <button onClick={() => setShowAddModal(true)} className="bg-blue-600 p-2 rounded-lg text-[10px] font-black"><i className="fas fa-user-plus"></i></button>
                    <button onClick={() => supabase.auth.signOut()} className="bg-gray-900 p-2 rounded-lg border border-gray-800 text-red-500"><i className="fas fa-sign-out-alt"></i></button>
                </div>
            </header>

            {/* PANEL DE NOTIFICACIONES */}
            {showNotifs && (
                <div className="max-w-md mx-auto p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
                        <h3 className="text-[10px] font-black uppercase text-orange-500 tracking-widest"><i className="fas fa-bell mr-1"></i> Actividad Reciente</h3>
                        {notifications.length === 0 ? <p className="text-xs text-gray-600">Sin actividad todavía.</p> :
                            notifications.map(n => (
                                <div key={n.id} className="text-xs border-b border-gray-800 pb-2 last:border-0">
                                    <span className="text-green-400 font-bold">{n.athlete_name}</span>
                                    <span className="text-gray-400"> completó </span>
                                    <span className="text-white font-bold">{n.workout_title}</span>
                                    <span className="text-gray-600"> · {n.workout_date}{n.distance_mi > 0 ? ` · ${n.distance_mi} mi` : ''}</span>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            <main className="p-4 max-w-md mx-auto space-y-4 mt-2">
                <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">Gestión de Atletas</h2>
                {loading ? <div className="text-orange-500 text-center py-4">Sincronizando...</div> :
                    athletes.map((atleta) => (
                        <div key={atleta.id} onClick={() => abrirDetalle(atleta)} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-orange-500 transition cursor-pointer">
                            <div className="flex justify-between items-center">
                                <div className="flex-1">
                                    <h3 className="font-black text-white">{atleta.nombre}</h3>
                                    <p className="text-[10px] text-gray-500 uppercase font-bold">{atleta.deporte || 'Running'} {atleta.disciplina ? `• ${atleta.disciplina}` : ''}</p>
                                    {atleta.tienePlan
                                        ? <span className="text-[9px] text-green-500 font-black uppercase">{atleta.completados}/{atleta.totalWorkouts} entrenamientos completados</span>
                                        : <span className="text-[9px] text-red-500 font-black uppercase">Sin Plan Activo</span>}
                                </div>
                                <i className="fas fa-chevron-right text-gray-700"></i>
                            </div>
                            {atleta.tienePlan && (
                                <div className="mt-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-orange-600 to-orange-400" style={{ width: `${atleta.totalWorkouts ? Math.round((atleta.completados / atleta.totalWorkouts) * 100) : 0}%` }}></div>
                                </div>
                            )}
                        </div>
                    ))
                }
            </main>

            {/* MODAL: REGISTRAR ATLETA (WIZARD 2 PASOS) */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
                    <form onSubmit={registrarAtleta} className="bg-gray-900 border border-gray-700 rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-black text-white uppercase italic">Nuevo Atleta</h2>
                            <span className="text-[10px] font-black text-orange-500 uppercase">Paso {wizardStep}/2</span>
                        </div>
                        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-orange-500 transition-all" style={{ width: `${wizardStep * 50}%` }}></div>
                        </div>

                        {wizardStep === 1 && (
                            <>
                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Datos Personales</p>
                                <input required placeholder="Nombre Completo" value={newAthlete.nombre} className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm" onChange={e => setNewAthlete({ ...newAthlete, nombre: e.target.value })} />
                                <input required type="email" placeholder="Correo Electrónico" value={newAthlete.email} className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm" onChange={e => setNewAthlete({ ...newAthlete, email: e.target.value })} />
                                <div className="grid grid-cols-2 gap-3">
                                    <select value={newAthlete.sexo} className="bg-black border border-gray-800 rounded-xl p-3 text-sm" onChange={e => setNewAthlete({ ...newAthlete, sexo: e.target.value })}>
                                        <option value="">Sexo</option><option>M</option><option>F</option>
                                    </select>
                                    <input placeholder="Disciplina" value={newAthlete.disciplina} className="bg-black border border-gray-800 rounded-xl p-3 text-sm" onChange={e => setNewAthlete({ ...newAthlete, disciplina: e.target.value })} />
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 text-gray-500 font-bold text-xs uppercase">Cerrar</button>
                                    <button type="button" onClick={() => { if (!newAthlete.nombre || !newAthlete.email) { alert('Completa nombre y correo.'); return; } setWizardStep(2); }} className="flex-1 bg-orange-600 p-3 rounded-xl font-black text-xs text-white">SIGUIENTE <i className="fas fa-arrow-right ml-1"></i></button>
                                </div>
                            </>
                        )}

                        {wizardStep === 2 && (
                            <>
                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Preparación Previa</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <select value={newAthlete.nivel} className="bg-black border border-gray-800 rounded-xl p-3 text-sm" onChange={e => setNewAthlete({ ...newAthlete, nivel: e.target.value })}>
                                        <option value="principiante">Principiante</option>
                                        <option value="intermedio">Intermedio</option>
                                        <option value="avanzado">Avanzado</option>
                                    </select>
                                    <select value={newAthlete.diasSemana} className="bg-black border border-gray-800 rounded-xl p-3 text-sm" onChange={e => setNewAthlete({ ...newAthlete, diasSemana: e.target.value })}>
                                        <option value="3">3 días/sem</option>
                                        <option value="4">4 días/sem</option>
                                        <option value="5">5 días/sem</option>
                                    </select>
                                </div>
                                <input type="number" step="0.5" placeholder="Corrida más larga reciente (mi)" value={newAthlete.corridaMasLarga} className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm" onChange={e => setNewAthlete({ ...newAthlete, corridaMasLarga: e.target.value })} />
                                <textarea placeholder="Historial: entrenamientos previos, lesiones, carreras pasadas..." value={newAthlete.historial} className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm h-16 resize-none" onChange={e => setNewAthlete({ ...newAthlete, historial: e.target.value })}></textarea>

                                <label className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 cursor-pointer">
                                    <input type="checkbox" checked={newAthlete.crearPlanAI} onChange={e => setNewAthlete({ ...newAthlete, crearPlanAI: e.target.checked })} className="w-5 h-5 accent-orange-500" />
                                    <div>
                                        <p className="text-xs font-black text-orange-400"><i className="fas fa-robot mr-1"></i> Generar plan con AI Coach</p>
                                        <p className="text-[10px] text-gray-400">Plan periodizado (base → build → peak → taper) a partir de estos datos.</p>
                                    </div>
                                </label>

                                {newAthlete.crearPlanAI && (
                                    <>
                                        <div className="grid grid-cols-2 gap-3">
                                            <select value={newAthlete.meta} className="bg-black border border-gray-800 rounded-xl p-3 text-sm" onChange={e => setNewAthlete({ ...newAthlete, meta: e.target.value })}>
                                                <option value="5k">Meta 5K</option>
                                                <option value="10k">Meta 10K</option>
                                                <option value="21k">Meta 21K</option>
                                                <option value="42k">Meta 42K</option>
                                            </select>
                                            <input placeholder="Tiempo meta (3:00)" value={newAthlete.tiempoMeta} className="bg-black border border-gray-800 rounded-xl p-3 text-sm" onChange={e => setNewAthlete({ ...newAthlete, tiempoMeta: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-gray-500 uppercase font-bold">Fecha de la carrera</label>
                                            <input type="date" value={newAthlete.fechaCarrera} className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm text-white" onChange={e => setNewAthlete({ ...newAthlete, fechaCarrera: e.target.value })} />
                                        </div>
                                    </>
                                )}

                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={() => setWizardStep(1)} className="flex-1 text-gray-500 font-bold text-xs uppercase"><i className="fas fa-arrow-left mr-1"></i> Atrás</button>
                                    <button type="submit" disabled={creating} className="flex-1 bg-green-600 p-3 rounded-xl font-black text-xs text-white disabled:opacity-50">{creating ? 'CREANDO...' : newAthlete.crearPlanAI ? 'CREAR + PLAN AI' : 'CREAR CUENTA'}</button>
                                </div>
                            </>
                        )}
                    </form>
                </div>
            )}

            {/* VISTA DETALLE: ANALYTICS DEL ATLETA */}
            {selectedAthlete && analysis && (
                <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-0 overflow-hidden">
                    <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900 shrink-0">
                        <div>
                            <h2 className="text-2xl font-black text-orange-500 italic uppercase">{selectedAthlete.nombre}</h2>
                            <p className="text-[10px] text-gray-500 font-bold uppercase">Media Maratón · Meta 3:00 hrs · Ago 9</p>
                        </div>
                        <button onClick={() => setSelectedAthlete(null)} className="text-gray-400"><i className="fas fa-times text-xl"></i></button>
                    </div>

                    <div className="flex justify-center gap-4 border-b border-gray-800 bg-gray-900/50 shrink-0">
                        {[['resumen', 'Resumen'], ['analisis', 'Análisis'], ['workouts', 'Workouts']].map(([id, label]) => (
                            <button key={id} onClick={() => setDetailTab(id)} className={`py-3 px-2 font-black text-xs uppercase tracking-wider transition-colors ${detailTab === id ? 'border-b-2 border-orange-500 text-orange-500' : 'text-gray-500'}`}>{label}</button>
                        ))}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {detailTab === 'resumen' && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800 text-center">
                                        <p className="text-3xl font-black text-orange-500">{analysis.pct}%</p>
                                        <p className="text-[9px] uppercase font-bold text-gray-500">Plan Completado</p>
                                        <p className="text-[9px] text-gray-600">{analysis.completados}/{analysis.total} workouts</p>
                                    </div>
                                    <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800 text-center">
                                        <p className="text-3xl font-black text-blue-400">{analysis.millasHechas.toFixed(1)}</p>
                                        <p className="text-[9px] uppercase font-bold text-gray-500">Millas Corridas</p>
                                        <p className="text-[9px] text-gray-600">de {analysis.millasPlan.toFixed(1)} planificadas</p>
                                    </div>
                                    <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800 text-center">
                                        <p className="text-3xl font-black text-green-400">{analysis.mejorDistancia ? analysis.mejorDistancia.dist.toFixed(1) : '--'}</p>
                                        <p className="text-[9px] uppercase font-bold text-gray-500">Corrida Más Larga</p>
                                        <p className="text-[9px] text-gray-600">{analysis.mejorDistancia?.w.date || 'sin datos'}</p>
                                    </div>
                                    <div className="bg-gray-900 p-4 rounded-2xl border border-gray-800 text-center">
                                        <p className="text-3xl font-black text-purple-400">{analysis.mejorPace ? analysis.mejorPace.w.actual_pace : '--'}</p>
                                        <p className="text-[9px] uppercase font-bold text-gray-500">Mejor Pace /mi</p>
                                        <p className="text-[9px] text-gray-600">meta: 13:44/mi</p>
                                    </div>
                                </div>

                                <section className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
                                    <h3 className="text-[10px] font-black uppercase text-orange-500 tracking-widest mb-3"><i className="fas fa-chart-column mr-1"></i> Millaje Semanal: Plan vs Real</h3>
                                    <div className="h-52">
                                        <Bar
                                            data={{
                                                labels: analysis.millajeSemanal.map(m => `S${m.semana}`),
                                                datasets: [
                                                    { label: 'Plan', data: analysis.millajeSemanal.map(m => m.plan), backgroundColor: 'rgba(107, 114, 128, 0.4)', borderRadius: 4 },
                                                    { label: 'Real', data: analysis.millajeSemanal.map(m => m.real), backgroundColor: 'rgba(249, 115, 22, 0.7)', borderRadius: 4 },
                                                ],
                                            }}
                                            options={chartOptions}
                                        />
                                    </div>
                                </section>

                                <section className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
                                    <h3 className="text-[10px] font-black uppercase text-orange-500 tracking-widest mb-3"><i className="fas fa-lightbulb mr-1"></i> Áreas de Mejora</h3>
                                    <div className="space-y-2">
                                        {analysis.insights.map((ins, i) => (
                                            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl text-xs ${ins.tipo === 'warn' ? 'bg-red-500/10 text-red-200' : ins.tipo === 'ok' ? 'bg-green-500/10 text-green-200' : 'bg-blue-500/10 text-blue-200'}`}>
                                                <i className={`fas ${ins.icon} mt-0.5`}></i>
                                                <span>{ins.text}</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </>
                        )}

                        {detailTab === 'analisis' && (
                            <>
                                <section className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
                                    <h3 className="text-[10px] font-black uppercase text-orange-500 tracking-widest mb-1"><i className="fas fa-heart-pulse mr-1"></i> Zonas de Frecuencia Cardíaca</h3>
                                    <p className="text-[10px] text-gray-600 mb-3">{analysis.conHrCount} corrida(s) con datos de FC · Promedio: {analysis.avgHr ? `${analysis.avgHr} bpm` : 'sin datos'}</p>
                                    <div className="h-48">
                                        <Bar
                                            data={{
                                                labels: Object.keys(ZONE_INFO).map(z => ZONE_INFO[z].label),
                                                datasets: [{ label: 'Corridas', data: [1, 2, 3, 4, 5].map(z => analysis.zonas[z]), backgroundColor: [1, 2, 3, 4, 5].map(z => ZONE_INFO[z].color), borderRadius: 4 }],
                                            }}
                                            options={{ ...chartOptions, indexAxis: 'y', plugins: { legend: { display: false } } }}
                                        />
                                    </div>
                                    {analysis.conHrCount === 0 && <p className="text-xs text-gray-600 text-center mt-2">Aparecerá cuando el atleta registre FC en sus workouts.</p>}
                                </section>

                                <section className="bg-gray-900 p-5 rounded-2xl border border-gray-800">
                                    <h3 className="text-[10px] font-black uppercase text-orange-500 tracking-widest mb-3"><i className="fas fa-gauge-high mr-1"></i> Evolución del Pace</h3>
                                    <div className="h-48">
                                        <Line
                                            data={{
                                                labels: workouts.filter(w => w.is_completed && paceToSeconds(w.actual_pace)).map(w => w.date.slice(5)),
                                                datasets: [{
                                                    label: 'Pace (min/mi)',
                                                    data: workouts.filter(w => w.is_completed && paceToSeconds(w.actual_pace)).map(w => paceToSeconds(w.actual_pace) / 60),
                                                    borderColor: 'rgba(249, 115, 22, 1)',
                                                    backgroundColor: 'rgba(249, 115, 22, 0.15)',
                                                    tension: 0.3,
                                                    fill: true,
                                                }],
                                            }}
                                            options={{ ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, reverse: true, title: { display: true, text: 'min/mi (menor = mejor)', color: '#9ca3af', font: { size: 9 } } } } }}
                                        />
                                    </div>
                                    {workouts.filter(w => paceToSeconds(w.actual_pace)).length === 0 && <p className="text-xs text-gray-600 text-center mt-2">Aparecerá cuando el atleta registre su pace.</p>}
                                </section>
                            </>
                        )}

                        {detailTab === 'workouts' && workouts.map(w => (
                            <div key={w.id} className={`bg-gray-900 border rounded-2xl p-4 ${w.is_completed ? 'border-green-500/40' : 'border-gray-800'}`}>
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 mr-2">
                                        <span className="text-[9px] text-orange-500 font-black uppercase">S{w.week_number} • {w.day_of_week} • {w.date}</span>
                                        <h4 className="font-black text-white">{w.title} {w.distance_mi > 0 && <span className="text-[10px] text-gray-500 font-bold">({w.distance_mi} mi)</span>}</h4>
                                        <p className="text-[10px] text-gray-500">{w.description}</p>
                                        {w.is_completed && (w.actual_distance_mi || w.actual_pace || w.avg_hr) && (
                                            <div className="flex gap-3 mt-2 text-[10px] font-bold">
                                                {w.actual_distance_mi && <span className="text-blue-400"><i className="fas fa-route mr-1"></i>{w.actual_distance_mi} mi</span>}
                                                {w.actual_pace && <span className="text-purple-400"><i className="fas fa-gauge-high mr-1"></i>{w.actual_pace}/mi</span>}
                                                {w.avg_hr && <span className="text-red-400"><i className="fas fa-heart mr-1"></i>{w.avg_hr} bpm (Z{hrZone(w.avg_hr)})</span>}
                                                {w.garmin_url && <a href={w.garmin_url} target="_blank" rel="noreferrer" className="text-orange-400"><i className="fas fa-link mr-1"></i>Garmin</a>}
                                            </div>
                                        )}
                                        {w.athlete_notes && <p className="text-[10px] text-gray-400 mt-2 italic">"{w.athlete_notes}"</p>}
                                    </div>
                                    {w.is_completed ? <i className="fas fa-check-circle text-green-500"></i> : <i className="far fa-circle text-gray-700"></i>}
                                </div>
                                <div className="mt-3 border-t border-gray-800 pt-3">
                                    {editingNoteId === w.id ? (
                                        <div className="flex gap-2">
                                            <input value={tempNoteText} onChange={e => setTempNoteText(e.target.value)} className="flex-1 bg-black border border-gray-700 rounded p-2 text-[10px] text-white" />
                                            <button onClick={() => guardarNotaCoach(w.id)} disabled={isSavingNote} className="bg-orange-600 px-3 rounded text-[10px] font-bold">{isSavingNote ? '...' : 'OK'}</button>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between text-[10px] text-orange-200 bg-orange-500/5 p-2 rounded">
                                            <span>{w.coach_feedback || "Sin nota del coach..."}</span>
                                            <button onClick={() => { setEditingNoteId(w.id); setTempNoteText(w.coach_feedback || ''); }}><i className="fas fa-edit"></i></button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
