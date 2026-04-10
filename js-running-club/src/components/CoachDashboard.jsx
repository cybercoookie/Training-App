import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
const ordenDias = { 'Lunes': 1, 'Martes': 2, 'Miércoles': 3, 'Miercoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sábado': 6, 'Sabado': 6, 'Domingo': 7 };

export default function CoachDashboard({ coachName }) {
    const [athletes, setAthletes] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [selectedAthlete, setSelectedAthlete] = useState(null);
    const [routines, setRoutines] = useState([]);
    const [records, setRecords] = useState({});
    
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [tempNoteText, setTempNoteText] = useState('');

    useEffect(() => { cargarAtletas(); }, []);

    async function cargarAtletas() {
        try {
            const { data: planes } = await supabase.from('planes_entrenamiento')
                .select('id, titulo, atleta_id, perfiles!planes_entrenamiento_atleta_id_fkey(nombre)')
                .eq('estado', 'activo').order('fecha_creacion', { ascending: false });

            const planesUnicos = []; const nombresVistos = new Set();
            for (const plan of planes || []) {
                const nombre = plan.perfiles ? plan.perfiles.nombre : 'Atleta';
                if (!nombresVistos.has(nombre)) { nombresVistos.add(nombre); planesUnicos.push({ ...plan, nombreAtleta: nombre }); }
            }
            setAthletes(planesUnicos);
        } catch (error) { console.error(error); } 
        finally { setLoading(false); }
    }

    async function abrirDetalle(plan) {
        setSelectedAthlete(plan);
        try {
            const { data: rts } = await supabase.from('rutinas_programadas').select('*').eq('plan_id', plan.id);
            const { data: recs } = await supabase.from('registros_ejecucion').select('*');
            
            rts.sort((a, b) => { if (a.semana !== b.semana) return a.semana - b.semana; return (ordenDias[a.dia_semana] || 99) - (ordenDias[b.dia_semana] || 99); });
            setRoutines(rts);

            const recMap = {};
            if(recs) recs.forEach(ej => recMap[ej.rutina_id] = ej);
            setRecords(recMap);
        } catch(e) { console.error(e); }
    }

    async function guardarNotaCoach(rutinaId) {
        try {
            await supabase.from('rutinas_programadas').update({ notas_coach: tempNoteText }).eq('id', rutinaId);
            setRoutines(prevRoutines => prevRoutines.map(r => r.id === rutinaId ? { ...r, notas_coach: tempNoteText } : r));
            setEditingNoteId(null);
            setTempNoteText('');
        } catch(e) { alert("Error al guardar la nota"); }
    }

    // LÓGICA DE EXPORTACIÓN PARA EL COACH
    function exportarReporte() {
        if (!selectedAthlete) return;
        let reporte = `🏃‍♀️ REPORTE DE ENTRENAMIENTO - JS RUNNING CLUB\nAtleta: ${selectedAthlete.nombreAtleta}\nPlan: ${selectedAthlete.titulo}\n\n`;
        
        const semanas = {};
        for(let i=1; i<=8; i++) semanas[i] = [];
        routines.forEach(r => semanas[r.semana].push(r));

        for(let s=1; s<=8; s++) {
            if(semanas[s] && semanas[s].length > 0) {
                reporte += `==== SEMANA ${s} ====\n`;
                semanas[s].forEach(r => {
                    const rec = records[r.id];
                    const status = rec?.completado ? '[X]' : '[ ]';
                    reporte += `${status} ${r.dia_semana}: ${r.titulo}\n`;
                    if(rec?.completado) {
                        if(rec.garmin_dist) reporte += `    - Distancia: ${rec.garmin_dist} mi\n`;
                        if(rec.garmin_pace) reporte += `    - Paso: ${rec.garmin_pace}/mi\n`;
                        if(rec.garmin_hr) reporte += `    - BPM: ${rec.garmin_hr}\n`;
                        if(rec.notas) reporte += `    - Notas Atleta: ${rec.notas}\n`;
                    }
                    if(r.notas_coach) reporte += `    - Nota del Coach: ${r.notas_coach}\n`;
                });
                reporte += `\n`;
            }
        }
        
        const blob = new Blob([reporte], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Reporte_${selectedAthlete.nombreAtleta.replace(/ /g, '_')}.txt`;
        a.click();
    }

    let totalMillas = 0; let sumHr = 0, countHr = 0; let datosSemanales = [0,0,0,0,0,0,0,0];
    routines.forEach(r => {
        const rec = records[r.id];
        if(rec?.completado) {
            if(rec.garmin_dist) { totalMillas += rec.garmin_dist; datosSemanales[r.semana-1] += rec.garmin_dist; }
            if(rec.garmin_hr) { sumHr += rec.garmin_hr; countHr++; }
        }
    });

    return (
        <div className="min-h-screen bg-black text-gray-100 font-sans pb-24">
            <header className="p-6 bg-black/90 backdrop-blur-md border-b border-gray-800 flex justify-between items-center sticky top-0 z-40">
                <div>
                    <h1 className="text-xl font-black italic tracking-tighter text-orange-500">PANEL DE CONTROL</h1>
                    <div className="text-[9px] uppercase tracking-widest font-bold text-gray-500 mt-1">Coach: <span className="text-white">{coachName}</span></div>
                </div>
                <button onClick={() => supabase.auth.signOut()} className="bg-gray-900 p-2 rounded-lg border border-gray-800 text-red-500 hover:text-red-400">Salir</button>
            </header>

            <main className="p-4 max-w-md mx-auto space-y-4 mt-4">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-800 pb-2">Atletas Activos</h2>
                {loading ? <div className="text-orange-500 text-center py-4">Cargando...</div> : 
                    athletes.map((plan) => (
                        <div key={plan.id} onClick={() => abrirDetalle(plan)} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-orange-500/50 transition cursor-pointer">
                            <h3 className="font-black text-lg text-white">{plan.nombreAtleta}</h3>
                            <p className="text-xs text-orange-500 uppercase font-bold">{plan.titulo}</p>
                        </div>
                    ))
                }
            </main>

            {selectedAthlete && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center p-0 sm:p-4">
                    <div className="bg-gray-900 border-t sm:border border-gray-700 rounded-t-3xl sm:rounded-3xl w-full max-w-md mx-auto h-[85vh] sm:h-auto max-h-[85vh] flex flex-col">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-start sticky top-0 bg-gray-900 rounded-t-3xl z-10">
                            <div>
                                <h2 className="text-2xl font-black text-orange-500 uppercase italic leading-none">{selectedAthlete.nombreAtleta}</h2>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{selectedAthlete.titulo}</p>
                            </div>
                            <button onClick={() => setSelectedAthlete(null)} className="text-gray-400 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                        </div>

                        <div className="overflow-y-auto flex-1 p-6 space-y-6">
                            
                            {/* BOTÓN DE EXPORTAR DEL COACH */}
                            <button onClick={exportarReporte} className="w-full bg-blue-600 hover:bg-blue-700 p-4 rounded-xl font-black text-white text-sm transition flex items-center justify-center gap-2">
                                <i className="fas fa-file-export"></i> EXPORTAR HISTORIAL (TXT)
                            </button>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-black p-4 rounded-2xl border border-gray-800 text-center"><p className="text-[10px] uppercase text-gray-500">Millas Tot.</p><h3 className="text-2xl font-black text-orange-500">{totalMillas.toFixed(1)}</h3></div>
                                <div className="bg-black p-4 rounded-2xl border border-gray-800 text-center"><p className="text-[10px] uppercase text-gray-500">BPM Prom.</p><h3 className="text-2xl font-black text-red-500">{countHr > 0 ? Math.round(sumHr / countHr) : '--'}</h3></div>
                            </div>

                            <div className="space-y-4">
                                {routines.map((r, i) => {
                                    const showHeader = i === 0 || routines[i-1].semana !== r.semana;
                                    const rec = records[r.id];
                                    const isCompleted = rec?.completado;
                                    return (
                                        <div key={r.id}>
                                            {showHeader && <div className="mt-6 mb-2 flex items-center gap-2"><div className="h-px bg-gray-800 flex-1"></div><span className="text-[10px] font-black uppercase text-gray-500">SEMANA {r.semana}</span><div className="h-px bg-gray-800 flex-1"></div></div>}
                                            
                                            <div className={`p-4 border rounded-2xl ${isCompleted ? 'border-green-500/50 bg-[#064e3b]/30' : 'border-gray-800 bg-black'}`}>
                                                <div className="flex justify-between">
                                                    <div>
                                                        <span className="text-[9px] text-orange-500 font-bold uppercase">{r.dia_semana}</span>
                                                        <h4 className="text-sm font-black text-gray-100">{r.titulo}</h4>
                                                        <p className="text-[10px] text-gray-500">{r.detalle}</p>
                                                    </div>
                                                    {isCompleted ? <i className="fas fa-check-circle text-green-500 text-xl"></i> : <i className="far fa-circle text-gray-700 text-xl"></i>}
                                                </div>

                                                {isCompleted && (rec.garmin_dist || rec.notas) && (
                                                    <div className="mt-3 pt-3 border-t border-gray-700/50 text-[10px] text-gray-300">
                                                        {rec.garmin_dist && <p><i className="fas fa-route text-orange-500"></i> {rec.garmin_dist}mi | ⚡ {rec.garmin_pace || '--'}</p>}
                                                        {rec.notas && <p className="italic text-gray-400 bg-black p-2 rounded mt-1">"{rec.notas}"</p>}
                                                    </div>
                                                )}

                                                <div className="mt-3 pt-3 border-t border-gray-800">
                                                    {editingNoteId === r.id ? (
                                                        <div className="space-y-2">
                                                            <textarea value={tempNoteText} onChange={e => setTempNoteText(e.target.value)} placeholder="Aclara el ejercicio o añade notas..." className="w-full bg-black border border-orange-500/50 rounded p-2 text-xs text-white"/>
                                                            <div className="flex gap-2">
                                                                <button onClick={() => guardarNotaCoach(r.id)} className="bg-orange-600 text-white text-[10px] px-3 py-1 rounded font-bold">Guardar</button>
                                                                <button onClick={() => setEditingNoteId(null)} className="bg-gray-800 text-gray-300 text-[10px] px-3 py-1 rounded font-bold">Cancelar</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex justify-between items-center">
                                                            <p className="text-[10px] text-orange-200 bg-orange-500/10 p-2 rounded-lg flex-1 mr-2">{r.notas_coach ? `💡 ${r.notas_coach}` : "Sin nota de coach"}</p>
                                                            <button onClick={() => { setEditingNoteId(r.id); setTempNoteText(r.notas_coach || ''); }} className="text-gray-500 hover:text-orange-500 transition"><i className="fas fa-edit"></i></button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}