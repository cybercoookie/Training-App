import { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const ordenDias = { 'Lunes': 1, 'Martes': 2, 'Miércoles': 3, 'Miercoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sábado': 6, 'Sabado': 6, 'Domingo': 7 };

export default function AthleteHub({ userName }) {
    const [activeTab, setActiveTab] = useState('plan');
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [plan, setPlan] = useState(null);
    const [currentWeek, setCurrentWeek] = useState(1);
    
    const [routinesByWeek, setRoutinesByWeek] = useState({});
    const [records, setRecords] = useState({});

    const [selectedRoutineId, setSelectedRoutineId] = useState('');
    const [formDist, setFormDist] = useState('');
    const [formPace, setFormPace] = useState('');
    const [formHr, setFormHr] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [formNotes, setFormNotes] = useState('');
    const [saving, setSaving] = useState(false);
    
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [feedbackText, setFeedbackText] = useState('');
    const [feedbackStatus, setFeedbackStatus] = useState('idle');

    const [seconds, setSeconds] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => { cargarDatosDelAtleta(); }, []);

    useEffect(() => {
        if (selectedRoutineId && records[selectedRoutineId]) {
            const rec = records[selectedRoutineId];
            setFormDist(rec.garmin_dist || ''); setFormPace(rec.garmin_pace || '');
            setFormHr(rec.garmin_hr || ''); setFormUrl(rec.garmin_url || ''); setFormNotes(rec.notas || '');
        } else {
            setFormDist(''); setFormPace(''); setFormHr(''); setFormUrl(''); setFormNotes('');
        }
    }, [selectedRoutineId, records]);

    async function cargarDatosDelAtleta() {
        setIsSyncing(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { data: planData } = await supabase.from('planes_entrenamiento')
                .select('*').eq('atleta_id', user.id).eq('estado', 'activo').order('fecha_creacion', { ascending: false }).limit(1).single();

            if (!planData) { setLoading(false); setIsSyncing(false); return; }
            setPlan(planData);

            const { data: rutinas } = await supabase.from('rutinas_programadas').select('*').eq('plan_id', planData.id);
            const { data: ejecuciones } = await supabase.from('registros_ejecucion').select('*, rutinas_programadas!inner(plan_id)').eq('rutinas_programadas.plan_id', planData.id);

            const registrosMap = {};
            if (ejecuciones) ejecuciones.forEach(ej => registrosMap[ej.rutina_id] = ej);
            setRecords(registrosMap);

            const semanas = {};
            for(let i=1; i<=8; i++) semanas[i] = [];
            if (rutinas) {
                rutinas.forEach(r => semanas[r.semana].push(r));
                for(let i=1; i<=8; i++) semanas[i].sort((a, b) => (ordenDias[a.dia_semana] || 99) - (ordenDias[b.dia_semana] || 99));
            }
            setRoutinesByWeek(semanas);
        } catch (error) { console.error("Error:", error); } 
        finally { setLoading(false); setIsSyncing(false); }
    }

    async function toggleTask(rutinaId, isChecked) {
        const updatedRecords = { ...records };
        if (!updatedRecords[rutinaId]) updatedRecords[rutinaId] = {};
        updatedRecords[rutinaId].completado = isChecked;
        setRecords(updatedRecords);

        try {
            const prev = records[rutinaId];
            if (prev && prev.id) await supabase.from('registros_ejecucion').update({ completado: isChecked }).eq('id', prev.id);
            else {
                const { data } = await supabase.from('registros_ejecucion').insert([{ rutina_id: rutinaId, completado: isChecked }]).select().single();
                if (data) setRecords(prevRecs => ({ ...prevRecs, [rutinaId]: data }));
            }
        } catch (error) { console.error(error); }
    }

    async function guardarDetalles() {
        if (!selectedRoutineId) { alert("Selecciona un entrenamiento."); return; }
        setSaving(true);
        const prev = records[selectedRoutineId];
        const currentCompletionStatus = prev ? prev.completado : false; 
        
        const payload = { 
            completado: currentCompletionStatus, 
            garmin_dist: formDist ? parseFloat(formDist) : null, 
            garmin_pace: formPace || null, 
            garmin_hr: formHr ? parseInt(formHr) : null, 
            garmin_url: formUrl || null, 
            notas: formNotes || null 
        };

        try {
            if (prev && prev.id) {
                await supabase.from('registros_ejecucion').update(payload).eq('id', prev.id);
                setRecords({ ...records, [selectedRoutineId]: { ...prev, ...payload } });
            } else {
                const { data } = await supabase.from('registros_ejecucion').insert([{ rutina_id: selectedRoutineId, ...payload }]).select().single();
                if (data) setRecords({ ...records, [selectedRoutineId]: data });
            }
            alert("¡Detalles guardados exitosamente!");
        } catch (e) { alert("Error al guardar."); } 
        finally { setSaving(false); }
    }

    function sendToCoachWhatsApp() {
        if (!selectedRoutineId) { alert("Por favor selecciona un entrenamiento."); return; }
        const req = routinesByWeek[currentWeek].find(r => r.id.toString() === selectedRoutineId.toString());
        if(!req) return;

        let report = `🏃‍♀️ *REPORTE DE ENTRENAMIENTO*\n\n*Atleta:* ${userName}\n*Semana:* ${currentWeek}\n\n✅ *${req.dia_semana}:* ${req.titulo}\n`;
        if (formDist || formPace || formHr) { report += `└ `; if(formDist) report += `⌚ ${formDist}mi `; if(formPace) report += `⚡ ${formPace}/mi `; if(formHr) report += `❤️ ${formHr}bpm`; report += `\n`; }
        if (formUrl) report += `\n🔗 *Actividad:* ${formUrl}\n`;
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

    let totalMillas = 0; let sumHr = 0, countHr = 0; let rutinasCompletadas = 0;
    let datosSemanales = [0, 0, 0, 0, 0, 0, 0, 0];
    if (!loading && plan) {
        Object.values(records).forEach(reg => {
            if (reg.completado) {
                rutinasCompletadas++;
                if (reg.garmin_dist) {
                    totalMillas += reg.garmin_dist;
                    for(let w=1; w<=8; w++) { const existe = routinesByWeek[w]?.find(r => r.id === reg.rutina_id); if (existe) datosSemanales[w-1] += reg.garmin_dist; }
                }
                if (reg.garmin_hr) { sumHr += reg.garmin_hr; countHr++; }
            }
        });
    }
    let avgHr = countHr > 0 ? Math.round(sumHr / countHr) : 0;
    const chartData = { labels: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'], datasets: [{ label: 'Millas', data: datosSemanales, backgroundColor: 'rgba(249, 115, 22, 0.5)', borderColor: 'rgba(249, 115, 22, 1)', borderWidth: 1, borderRadius: 4 }] };
    const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9ca3af' } }, x: { grid: { display: false }, ticks: { color: '#9ca3af' } } } };

    if (loading) return <div className="min-h-screen bg-black text-orange-500 flex justify-center items-center font-bold">Sincronizando...</div>;
    if (!plan) return <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center text-center p-6"><h1 className="text-3xl font-black italic mb-4">JS <span className="text-orange-500">RUNNING</span></h1><p>No tienes un plan activo.</p></div>;

    const rutinasActuales = routinesByWeek[currentWeek] || [];
    const rutinaSeleccionadaInfo = rutinasActuales.find(r => r.id.toString() === selectedRoutineId.toString());

    return (
        <div className="min-h-screen bg-black text-gray-100 font-sans pb-24 relative">
            <header className="p-6 bg-black/90 backdrop-blur-md border-b border-gray-800 flex justify-between items-center sticky top-0 z-40">
                <div>
                    <h1 className="text-xl font-black italic tracking-tighter">JS <span className="text-orange-500">RUNNING CLUB</span></h1>
                    <div className="flex flex-col text-[9px] uppercase tracking-widest font-bold text-gray-500 mt-1"><span>Atleta: <span className="text-white">{userName}</span></span></div>
                </div>
                <div className="flex gap-3">
                    <button onClick={cargarDatosDelAtleta} className="bg-gray-900 p-2 rounded-lg border border-gray-800 text-blue-400 hover:text-blue-300 transition-colors" title="Sincronizar datos">
                        <i className={`fas fa-sync-alt ${isSyncing ? 'fa-spin' : ''}`}></i>
                    </button>
                    <button onClick={() => supabase.auth.signOut()} className="bg-gray-900 p-2 rounded-lg border border-gray-800 text-red-500 hover:text-red-400 transition-colors">
                        <i className="fas fa-sign-out-alt"></i> Salir
                    </button>
                </div>
            </header>

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

                        {/* SELECTOR DE SEMANAS INTELIGENTE */}
                        {/* Busca este bloque dentro de {activeTab === 'plan' && (...)} */}

                <div className="flex overflow-x-auto gap-4 border-b border-gray-900 pb-3 no-scrollbar">
                {Object.keys(routinesByWeek)
                    .sort((a, b) => parseInt(a) - parseInt(b))
                    .map(numStr => {const w = parseInt(numStr);
                    const rutinasDeEstaSemana = routinesByWeek[w] || [];
                    const tieneRutinas = rutinasDeEstaSemana.length > 0;
                    
                    // Lógica: Si todas las rutinas de esta semana tienen un registro completado
                    const estaCompletada = tieneRutinas && rutinasDeEstaSemana.every(r => records[r.id]?.completado);
                    
                    // Determinamos si es la última semana del plan actual
                    const totalSemanas = Object.keys(routinesByWeek).length;
                    const esUltimaSemana = w === totalSemanas;

                    let btnClasses = "px-3 py-1 font-black text-xs rounded-full transition-all border flex items-center gap-1 shrink-0 ";
                    
                    if (estaCompletada) {
                        btnClasses += "bg-[#064e3b] text-green-400 border-green-500/50 "; // Verde si terminó todo
                    } else {
                        btnClasses += "bg-gray-900 text-gray-500 border-gray-800 "; // Gris si falta algo
                    }
                    
                    if (currentWeek === w) {
                        if (estaCompletada) {
                            // Seleccionada y completada: Verde con borde naranja brillante
                            btnClasses += "ring-2 ring-orange-500 ring-offset-2 ring-offset-black !bg-green-600 !text-white !border-green-500 ";
                        } else {
                            // Seleccionada pero incompleta: Naranja sólido
                            btnClasses = btnClasses.replace('bg-gray-900 text-gray-500 border-gray-800', 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/20');
                        }
                    }

                    return (
                        <button 
                            key={w} 
                            onClick={() => setCurrentWeek(w)} 
                            className={btnClasses}
                        >
                            {estaCompletada && <i className="fas fa-check-circle text-[10px]"></i>}
                            {esUltimaSemana ? '🏁' : `S${w}`}
                        </button>
                    );
                })}
            </div>

                        <div className="space-y-4">
                            {rutinasActuales.map(rutina => {
                                const isChecked = records[rutina.id]?.completado || false;
                                return (
                                    <div key={rutina.id} className={`bg-gray-900 p-5 rounded-2xl border transition-colors ${isChecked ? 'border-green-500 bg-[#064e3b]/30' : 'border-gray-800'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex-1 mr-4">
                                                <span className="text-[10px] text-orange-500 font-black italic uppercase">{rutina.dia_semana}</span>
                                                <h3 className="text-lg font-black text-white">{rutina.titulo}</h3>
                                                <p className="text-xs text-gray-400">{rutina.detalle}</p>
                                            </div>
                                            <input type="checkbox" checked={isChecked} onChange={(e) => toggleTask(rutina.id, e.target.checked)} className="w-6 h-6 rounded-full text-green-500 bg-black border-gray-700 cursor-pointer accent-orange-500"/>
                                        </div>
                                        {rutina.notas_coach && rutina.notas_coach.trim() !== '' && (
                                            <div className="mt-3 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                                                <p className="text-[10px] font-bold text-orange-400 uppercase mb-1"><i className="fas fa-bullhorn"></i> Nota del Coach:</p>
                                                <p className="text-xs text-orange-100 whitespace-pre-wrap">{rutina.notas_coach}</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <section className="bg-gray-900 p-6 rounded-3xl border border-gray-800 space-y-4 shadow-lg">
                            <h3 className="text-[10px] font-black uppercase text-orange-500 tracking-widest border-b border-gray-800 pb-2"><i className="fas fa-cloud-upload-alt"></i> Detalles de Hoy</h3>
                            
                            <select value={selectedRoutineId} onChange={(e) => setSelectedRoutineId(e.target.value)} className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm focus:border-orange-500 outline-none text-gray-300">
                                <option value="">Selecciona el entrenamiento...</option>
                                {rutinasActuales.map(r => <option key={r.id} value={r.id}>{r.dia_semana} - {r.titulo}</option>)}
                            </select>

                            {rutinaSeleccionadaInfo?.notas_coach && rutinaSeleccionadaInfo.notas_coach.trim() !== '' && (
                                <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded-xl mb-4">
                                    <p className="text-[10px] font-bold text-orange-400 uppercase mb-1"><i className="fas fa-exclamation-circle"></i> Recuerda la nota del Coach:</p>
                                    <p className="text-xs text-orange-100">{rutinaSeleccionadaInfo.notas_coach}</p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <input type="number" step="0.01" value={formDist} onChange={e => setFormDist(e.target.value)} placeholder="Millas (Ej: 2.5)" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm text-white focus:border-orange-500"/>
                                <input type="text" value={formPace} onChange={e => setFormPace(e.target.value)} placeholder="Paso (Ej: 13:17)" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm text-white focus:border-orange-500"/>
                                <input type="number" value={formHr} onChange={e => setFormHr(e.target.value)} placeholder="BPM (Ej: 145)" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm text-white focus:border-orange-500"/>
                                <input type="url" value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="Link Garmin" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm text-white focus:border-orange-500"/>
                            </div>
                            <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Notas para el Coach..." className="w-full bg-black border border-gray-800 rounded-2xl p-4 text-sm text-white h-20 focus:border-orange-500"></textarea>
                            
                            <div className="flex flex-col gap-2">
                                <button onClick={guardarDetalles} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 p-4 rounded-xl font-black text-white active:scale-95 transition">
                                    {saving ? 'GUARDANDO...' : 'GUARDAR DETALLES'}
                                </button>
                                <button onClick={sendToCoachWhatsApp} className="w-full bg-green-500 hover:bg-green-600 p-4 rounded-xl font-black flex items-center justify-center gap-3 transition shadow-lg text-sm border border-green-400 active:scale-95 text-white">
                                    <i className="fab fa-whatsapp text-xl"></i> ENVIAR REPORTE DIARIO
                                </button>
                            </div>
                        </section>
                    </div>
                )}

                {activeTab === 'dash' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-900 p-5 rounded-3xl border border-gray-800 text-center"><p className="text-[10px] uppercase font-bold text-gray-400">Total Millas</p><h3 className="text-4xl font-black text-orange-500">{totalMillas.toFixed(1)}</h3></div>
                            <div className="bg-gray-900 p-5 rounded-3xl border border-gray-800 text-center"><p className="text-[10px] uppercase font-bold text-gray-400">BPM Promedio</p><h3 className="text-4xl font-black text-red-500">{avgHr > 0 ? avgHr : '--'}</h3></div>
                        </div>
                        <section className="bg-gray-900 p-6 rounded-3xl border border-gray-800"><div className="w-full h-64"><Bar data={chartData} options={chartOptions} /></div></section>
                    </div>
                )}
            </main>

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