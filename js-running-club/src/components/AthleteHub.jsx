import { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const DAY_ORDER = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };
const PLAN_START_DATE = '2026-06-30';

function getWeekForToday(workoutsByWeek) {
    const today = new Date().toISOString().split('T')[0];
    let bestWeek = 1;
    for (const [weekNum, workouts] of Object.entries(workoutsByWeek)) {
        const dates = workouts.map(w => w.date).sort();
        if (dates.length && dates[0] <= today) bestWeek = parseInt(weekNum);
    }
    return bestWeek;
}

export default function AthleteHub({ userName }) {
    const [activeTab, setActiveTab] = useState('plan');
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [hasWorkouts, setHasWorkouts] = useState(false);

    const [currentWeek, setCurrentWeek] = useState(1);
    const [workoutsByWeek, setWorkoutsByWeek] = useState({});

    const [selectedWorkoutId, setSelectedWorkoutId] = useState('');
    const [formNotes, setFormNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [feedbackText, setFeedbackText] = useState('');
    const [feedbackStatus, setFeedbackStatus] = useState('idle');

    const [seconds, setSeconds] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => { cargarPlan(); }, []);

    useEffect(() => {
        const w = workoutsByWeek[currentWeek];
        const selected = w?.find(r => r.id.toString() === selectedWorkoutId.toString());
        setFormNotes(selected?.athlete_notes || '');
    }, [selectedWorkoutId, currentWeek, workoutsByWeek]);

    async function cargarPlan() {
        setIsSyncing(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: workouts, error } = await supabase
                .from('athlete_program')
                .select('*')
                .eq('athlete_id', user.id)
                .gte('date', PLAN_START_DATE)
                .order('date', { ascending: true });

            if (error) throw error;

            if (workouts && workouts.length > 0) {
                const byWeek = {};
                workouts.forEach(w => {
                    if (!byWeek[w.week_number]) byWeek[w.week_number] = [];
                    byWeek[w.week_number].push(w);
                });
                for (const week of Object.values(byWeek)) {
                    week.sort((a, b) => (DAY_ORDER[a.day_of_week] || 99) - (DAY_ORDER[b.day_of_week] || 99));
                }
                setWorkoutsByWeek(byWeek);
                setCurrentWeek(getWeekForToday(byWeek));
                setHasWorkouts(true);
            } else {
                setHasWorkouts(false);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            setIsSyncing(false);
        }
    }

    async function toggleTask(workoutId, isChecked) {
        setWorkoutsByWeek(prev => {
            const updated = { ...prev };
            for (const week of Object.values(updated)) {
                const w = week.find(r => r.id === workoutId);
                if (w) { w.is_completed = isChecked; break; }
            }
            return { ...updated };
        });
        try {
            await supabase.from('athlete_program').update({ is_completed: isChecked }).eq('id', workoutId);
        } catch (error) { console.error(error); }
    }

    async function guardarDetalles() {
        if (!selectedWorkoutId) { alert("Selecciona un entrenamiento."); return; }
        setSaving(true);
        try {
            await supabase.from('athlete_program').update({ athlete_notes: formNotes || null }).eq('id', selectedWorkoutId);
            setWorkoutsByWeek(prev => {
                const updated = { ...prev };
                for (const week of Object.values(updated)) {
                    const w = week.find(r => r.id.toString() === selectedWorkoutId.toString());
                    if (w) { w.athlete_notes = formNotes || null; break; }
                }
                return { ...updated };
            });
            alert("¡Notas guardadas exitosamente!");
        } catch (e) { alert("Error al guardar."); }
        finally { setSaving(false); }
    }

    function sendToCoachWhatsApp() {
        if (!selectedWorkoutId) { alert("Por favor selecciona un entrenamiento."); return; }
        const workout = workoutsByWeek[currentWeek]?.find(r => r.id.toString() === selectedWorkoutId.toString());
        if (!workout) return;
        let report = `🏃‍♀️ *REPORTE DE ENTRENAMIENTO*\n\n*Atleta:* ${userName}\n*Plan:* Media Maratón — Meta 3:00 hrs\n*Semana:* ${currentWeek} | *${workout.day_of_week}* ${workout.date}\n\n✅ *${workout.title}*\n`;
        if (workout.distance_mi > 0) report += `📏 Distancia planificada: ${workout.distance_mi} mi\n`;
        if (formNotes) report += `\n*NOTAS:*\n"${formNotes}"\n`;
        window.open(`https://wa.me/?text=${encodeURIComponent(report)}`);
    }

    async function enviarSugerencia() {
        if (!feedbackText.trim()) return;
        setFeedbackStatus('sending');
        try {
            await supabase.from('sugerencias').insert([{ nombre_atleta: userName, mensaje: feedbackText }]);
            setFeedbackStatus('success');
            setTimeout(() => { setShowFeedbackModal(false); setFeedbackText(''); setFeedbackStatus('idle'); }, 2000);
        } catch (error) {
            setFeedbackStatus('error');
            setTimeout(() => setFeedbackStatus('idle'), 3000);
        }
    }

    const toggleTimer = () => { if (isRunning) clearInterval(timerRef.current); else timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000); setIsRunning(!isRunning); };
    const resetTimer = () => { clearInterval(timerRef.current); setIsRunning(false); setSeconds(0); };
    const formatTime = (secs) => { const h = Math.floor(secs / 3600).toString().padStart(2, '0'); const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0'); const s = (secs % 60).toString().padStart(2, '0'); return `${h}:${m}:${s}`; };

    const totalWeeks = Object.keys(workoutsByWeek).length;
    let totalMillas = 0;
    const datosSemanales = new Array(totalWeeks).fill(0);
    const etiquetasGrafica = Array.from({ length: totalWeeks }, (_, i) => `S${i + 1}`);

    if (!loading) {
        Object.entries(workoutsByWeek).forEach(([weekNum, workouts]) => {
            workouts.forEach(w => {
                if (w.is_completed && w.distance_mi > 0) {
                    totalMillas += parseFloat(w.distance_mi);
                    datosSemanales[parseInt(weekNum) - 1] += parseFloat(w.distance_mi);
                }
            });
        });
    }

    const chartData = { labels: etiquetasGrafica, datasets: [{ label: 'Millas', data: datosSemanales, backgroundColor: 'rgba(249, 115, 22, 0.5)', borderColor: 'rgba(249, 115, 22, 1)', borderWidth: 1, borderRadius: 4 }] };
    const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' } }, x: { grid: { display: false }, ticks: { color: '#9ca3af' } } } };

    if (loading) return <div className="min-h-screen bg-black text-orange-500 flex justify-center items-center font-bold">Sincronizando...</div>;

    const rutinasActuales = workoutsByWeek[currentWeek] || [];
    const rutinaSeleccionada = rutinasActuales.find(r => r.id.toString() === selectedWorkoutId.toString());

    return (
        <div className="min-h-screen bg-black text-gray-100 font-sans pb-24 relative">
            <header className="p-6 bg-black/90 backdrop-blur-md border-b border-gray-800 flex justify-between items-center sticky top-0 z-40">
                <div>
                    <h1 className="text-xl font-black italic tracking-tighter">JS <span className="text-orange-500">RUNNING CLUB</span></h1>
                    <div className="flex flex-col text-[9px] uppercase tracking-widest font-bold text-gray-500 mt-1">
                        <span>Atleta: <span className="text-white">{userName}</span></span>
                        <span className="text-orange-500/70">Media Maratón · Meta 3:00 hrs · Sep 27</span>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={cargarPlan} className="bg-gray-900 p-2 rounded-lg border border-gray-800 text-blue-400 hover:text-blue-300 transition-colors" title="Sincronizar datos">
                        <i className={`fas fa-sync-alt ${isSyncing ? 'fa-spin' : ''}`}></i>
                    </button>
                    <button onClick={() => supabase.auth.signOut()} className="bg-gray-900 p-2 rounded-lg border border-gray-800 text-red-500 hover:text-red-400 transition-colors">
                        <i className="fas fa-sign-out-alt"></i> Salir
                    </button>
                </div>
            </header>

            {!hasWorkouts ? (
                <main className="flex flex-col items-center justify-center p-6 h-[60vh] text-center">
                    <i className="fas fa-running text-4xl text-gray-800 mb-4"></i>
                    <h2 className="text-xl font-black text-gray-400 mb-2">Sin Asignaciones</h2>
                    <p className="text-gray-600 text-sm">No tienes planes de entrenamiento vinculados a tu cuenta en este momento.</p>
                </main>
            ) : (
                <main className="p-4 max-w-md mx-auto space-y-6 mt-2">
                    <div className="flex justify-center gap-6 border-b border-gray-800 pb-2">
                        <button onClick={() => setActiveTab('plan')} className={`pb-2 font-black text-sm uppercase tracking-wider transition-colors ${activeTab === 'plan' ? 'border-b-2 border-orange-500 text-orange-500' : 'text-gray-500'}`}><i className="fas fa-calendar-alt mr-1"></i> Mi Plan</button>
                        <button onClick={() => setActiveTab('dash')} className={`pb-2 font-black text-sm uppercase tracking-wider transition-colors ${activeTab === 'dash' ? 'border-b-2 border-orange-500 text-orange-500' : 'text-gray-500'}`}><i className="fas fa-chart-line mr-1"></i> Progreso</button>
                    </div>

                    {activeTab === 'plan' && (
                        <div className="space-y-6">
                            <section className="bg-gray-900 p-6 rounded-3xl border border-gray-800 text-center shadow-lg">
                                <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-4">Cronómetro JS</h2>
                                <div className="text-5xl font-mono font-bold mb-4 text-white">{formatTime(seconds)}</div>
                                <div className="flex justify-center gap-4">
                                    <button onClick={toggleTimer} className="bg-orange-600 w-12 h-12 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"><i className={`fas ${isRunning ? 'fa-pause' : 'fa-play'} text-white`}></i></button>
                                    <button onClick={resetTimer} className="bg-gray-800 w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform"><i className="fas fa-redo text-gray-400"></i></button>
                                </div>
                            </section>

                            <div className="flex overflow-x-auto gap-2 pb-3 no-scrollbar">
                                {Object.keys(workoutsByWeek)
                                    .sort((a, b) => parseInt(a) - parseInt(b))
                                    .map(numStr => {
                                        const w = parseInt(numStr);
                                        const weekWorkouts = workoutsByWeek[w] || [];
                                        const allDone = weekWorkouts.length > 0 && weekWorkouts.every(r => r.is_completed);
                                        const isLastWeek = w === totalWeeks;
                                        const isActive = currentWeek === w;

                                        let cls = "px-3 py-1 font-black text-xs rounded-full transition-all border flex items-center gap-1 shrink-0 ";
                                        if (allDone) cls += "bg-[#064e3b] text-green-400 border-green-500/50 ";
                                        else cls += "bg-gray-900 text-gray-500 border-gray-800 ";
                                        if (isActive) {
                                            if (allDone) cls += "ring-2 ring-orange-500 ring-offset-2 ring-offset-black !bg-green-600 !text-white !border-green-500 ";
                                            else cls = cls.replace('bg-gray-900 text-gray-500 border-gray-800', 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/20');
                                        }

                                        return (
                                            <button key={w} onClick={() => { setCurrentWeek(w); setSelectedWorkoutId(''); }} className={cls}>
                                                {allDone && <i className="fas fa-check-circle text-[10px]"></i>}
                                                {isLastWeek ? '🏁' : `S${w}`}
                                            </button>
                                        );
                                    })}
                            </div>

                            <div className="space-y-4">
                                {rutinasActuales.map(workout => (
                                    <div key={workout.id} className={`bg-gray-900 p-5 rounded-2xl border transition-colors ${workout.is_completed ? 'border-green-500 bg-[#064e3b]/30' : 'border-gray-800'}`}>
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex-1 mr-4">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] text-orange-500 font-black italic uppercase">{workout.day_of_week}</span>
                                                    <span className="text-[10px] text-gray-600">{workout.date}</span>
                                                    {workout.distance_mi > 0 && (
                                                        <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{workout.distance_mi} mi</span>
                                                    )}
                                                </div>
                                                <h3 className="text-lg font-black text-white">{workout.title}</h3>
                                                <p className="text-xs text-gray-400 mt-1">{workout.description}</p>
                                            </div>
                                            <input type="checkbox" checked={workout.is_completed} onChange={(e) => toggleTask(workout.id, e.target.checked)} className="w-6 h-6 rounded-full text-green-500 bg-black border-gray-700 cursor-pointer accent-orange-500 mt-1 shrink-0"/>
                                        </div>
                                        {workout.coach_feedback && workout.coach_feedback.trim() !== '' && (
                                            <div className="mt-3 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                                                <p className="text-[10px] font-bold text-orange-400 uppercase mb-1"><i className="fas fa-bullhorn"></i> Nota del Coach:</p>
                                                <p className="text-xs text-orange-100 whitespace-pre-wrap">{workout.coach_feedback}</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <section className="bg-gray-900 p-6 rounded-3xl border border-gray-800 space-y-4 shadow-lg">
                                <h3 className="text-[10px] font-black uppercase text-orange-500 tracking-widest border-b border-gray-800 pb-2"><i className="fas fa-cloud-upload-alt"></i> Notas de Hoy</h3>

                                <select value={selectedWorkoutId} onChange={(e) => setSelectedWorkoutId(e.target.value)} className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm focus:border-orange-500 outline-none text-gray-300">
                                    <option value="">Selecciona el entrenamiento...</option>
                                    {rutinasActuales.map(r => <option key={r.id} value={r.id}>{r.day_of_week} — {r.title}</option>)}
                                </select>

                                {rutinaSeleccionada && (
                                    <div className="bg-gray-800/50 border border-gray-700 p-3 rounded-xl text-xs text-gray-300">
                                        <p className="font-bold text-white mb-1">{rutinaSeleccionada.title}</p>
                                        <p>{rutinaSeleccionada.description}</p>
                                    </div>
                                )}

                                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="¿Cómo te fue? Anota tus sensaciones, dificultades o logros para el Coach..." className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-sm text-white h-24 focus:border-orange-500 resize-none"></textarea>

                                <div className="flex flex-col gap-2">
                                    <button onClick={guardarDetalles} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 p-4 rounded-xl font-black text-white active:scale-95 transition">
                                        {saving ? 'GUARDANDO...' : 'GUARDAR NOTAS'}
                                    </button>
                                    <button onClick={sendToCoachWhatsApp} className="w-full bg-green-500 hover:bg-green-600 p-4 rounded-xl font-black flex items-center justify-center gap-3 transition shadow-lg text-sm border border-green-400 active:scale-95 text-white">
                                        <i className="fab fa-whatsapp text-xl"></i> ENVIAR REPORTE AL COACH
                                    </button>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'dash' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-900 p-5 rounded-3xl border border-gray-800 text-center">
                                    <p className="text-[10px] uppercase font-bold text-gray-400">Millas Completadas</p>
                                    <h3 className="text-4xl font-black text-orange-500">{totalMillas.toFixed(1)}</h3>
                                </div>
                                <div className="bg-gray-900 p-5 rounded-3xl border border-gray-800 text-center">
                                    <p className="text-[10px] uppercase font-bold text-gray-400">Semanas Activas</p>
                                    <h3 className="text-4xl font-black text-blue-400">{totalWeeks}</h3>
                                </div>
                            </div>
                            <section className="bg-gray-900 p-6 rounded-3xl border border-gray-800">
                                <div className="w-full h-64"><Bar data={chartData} options={chartOptions} /></div>
                            </section>
                        </div>
                    )}
                </main>
            )}

            <button onClick={() => setShowFeedbackModal(true)} className="fixed bottom-6 right-6 bg-orange-600 hover:bg-orange-500 text-white w-14 h-14 rounded-full shadow-2xl shadow-orange-600/50 flex items-center justify-center text-2xl transition-transform active:scale-90 z-40">
                <i className="fas fa-comment-dots"></i>
            </button>

            {showFeedbackModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-3xl p-6 w-full max-w-sm relative shadow-2xl">
                        <button onClick={() => setShowFeedbackModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"><i className="fas fa-times text-xl"></i></button>
                        <h2 className="text-lg font-black text-white mb-1"><i className="fas fa-lightbulb text-orange-500 mr-2"></i> Buzón del Atleta</h2>
                        <p className="text-xs text-gray-400 mb-4">¿Tienes alguna idea para mejorar la app o un comentario para el Coach? Te leemos.</p>
                        <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)} placeholder="Escribe tu mensaje aquí..." className="w-full bg-black border border-gray-700 rounded-xl p-4 text-sm text-white focus:border-orange-500 outline-none h-32 mb-4 resize-none"></textarea>
                        <button onClick={enviarSugerencia} disabled={feedbackStatus === 'sending' || !feedbackText.trim()} className={`w-full p-4 rounded-xl font-black text-sm transition flex items-center justify-center gap-2 ${feedbackStatus === 'success' ? 'bg-green-600 text-white' : feedbackStatus === 'error' ? 'bg-red-600 text-white' : 'bg-orange-600 hover:bg-orange-500 text-white'} disabled:opacity-50`}>
                            {feedbackStatus === 'sending' ? <i className="fas fa-spinner fa-spin"></i> : feedbackStatus === 'success' ? <><i className="fas fa-check"></i> Enviado</> : feedbackStatus === 'error' ? 'Error al enviar' : <><i className="fas fa-paper-plane"></i> Enviar Mensaje</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}