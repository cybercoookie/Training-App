import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
const ordenDias = { 'Lunes': 1, 'Martes': 2, 'Miércoles': 3, 'Miercoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sábado': 6, 'Sabado': 6, 'Domingo': 7 };

export default function CoachDashboard({ coachName }) {
    const [athletes, setAthletes] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Modals y Estados de Gestión
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [newAthlete, setNewAthlete] = useState({ nombre: '', email: '', sexo: '', disciplina: '', deporte: '' });
    const [importData, setImportData] = useState({ atletaId: '', meta: '21k' });

    // Detalle de Atleta Seleccionado
    const [selectedAthlete, setSelectedAthlete] = useState(null);
    const [routines, setRoutines] = useState([]);
    const [records, setRecords] = useState({});
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [tempNoteText, setTempNoteText] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);

    useEffect(() => { cargarAtletas(); }, []);

    async function cargarAtletas() {
        setLoading(true);
        try {
            const { data: perfiles } = await supabase.from('perfiles').select('*').eq('rol', 'atleta').order('nombre');
            const { data: planes } = await supabase.from('planes_entrenamiento').select('*').eq('estado', 'activo');
            
            const atletasConPlan = perfiles?.map(p => ({
                ...p,
                planActivo: planes?.find(plan => plan.atleta_id === p.id)
            }));
            
            setAthletes(atletasConPlan || []);
        } catch (error) { console.error(error); } 
        finally { setLoading(false); }
    }

    async function registrarAtleta(e) {
        e.preventDefault();
        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: newAthlete.email,
                password: 'ChangeMe2026!',
                options: { data: { nombre: newAthlete.nombre } }
            });

            if (authError) throw authError;

            await supabase.from('perfiles').update({
                nombre: newAthlete.nombre,
                sexo: newAthlete.sexo,
                disciplina: newAthlete.disciplina,
                deporte: newAthlete.deporte,
                email: newAthlete.email,
                rol: 'atleta'
            }).eq('id', authData.user.id);

            alert("¡Atleta creado! Contraseña temporal: ChangeMe2026!");
            setShowAddModal(false);
            cargarAtletas();
        } catch (error) { alert("Error: " + error.message); }
    }

    async function importarPlan() {
        if (!importData.atletaId) return alert("Selecciona un atleta");
        try {
            const { data: plan, error: pErr } = await supabase.from('planes_entrenamiento')
                .insert([{ titulo: `Objetivo ${importData.meta.toUpperCase()}`, atleta_id: importData.atletaId, coach_id: (await supabase.auth.getUser()).data.user.id, estado: 'activo' }]).select().single();
            if (pErr) throw pErr;

            const { data: plantillas } = await supabase.from('plantillas_planes').select('*').eq('meta', importData.meta);
            if (plantillas?.length > 0) {
                const rutinas = plantillas.map(p => ({ plan_id: plan.id, semana: p.semana, dia_semana: p.dia_semana, titulo: p.titulo, detalle: p.detalle }));
                await supabase.from('rutinas_programadas').insert(rutinas);
                alert("Plan importado con éxito.");
            } else { alert("Plan creado, pero no se encontraron rutinas en la plantilla."); }
            setShowImportModal(false);
            cargarAtletas();
        } catch (error) { alert("Error: " + error.message); }
    }

    async function abrirDetalle(atleta) {
        if(!atleta.planActivo) { alert("Este atleta no tiene un plan activo para auditar."); return; }
        setSelectedAthlete(atleta);
        const { data: rts } = await supabase.from('rutinas_programadas').select('*').eq('plan_id', atleta.planActivo.id);
        const { data: recs } = await supabase.from('registros_ejecucion').select('*');
        rts.sort((a, b) => a.semana - b.semana || (ordenDias[a.dia_semana] || 99) - (ordenDias[b.dia_semana] || 99));
        setRoutines(rts);
        const recMap = {};
        recs?.forEach(ej => recMap[ej.rutina_id] = ej);
        setRecords(recMap);
    }

    async function guardarNotaCoach(rutinaId) {
        setIsSavingNote(true);
        try {
            const { data, error } = await supabase.from('rutinas_programadas').update({ notas_coach: tempNoteText }).eq('id', rutinaId).select().single();
            if (error) throw error;
            setRoutines(prev => prev.map(r => r.id === rutinaId ? { ...r, notas_coach: tempNoteText } : r));
            setEditingNoteId(null);
        } catch(e) { alert(`Error: ${e.message}`); } 
        finally { setIsSavingNote(false); }
    }

    return (
        <div className="min-h-screen bg-black text-gray-100 font-sans pb-24">
            <header className="p-6 bg-black/90 backdrop-blur-md border-b border-gray-800 flex justify-between items-center sticky top-0 z-40">
                <div>
                    <h1 className="text-xl font-black italic tracking-tighter text-orange-500">JS RUNNING <span className="text-white">COACH</span></h1>
                    <div className="text-[9px] uppercase tracking-widest font-bold text-gray-500 mt-1">Sesión: {coachName}</div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowAddModal(true)} className="bg-blue-600 p-2 rounded-lg text-[10px] font-black"><i className="fas fa-user-plus"></i></button>
                    <button onClick={() => setShowImportModal(true)} className="bg-green-600 p-2 rounded-lg text-[10px] font-black"><i className="fas fa-file-import"></i></button>
                    <button onClick={() => supabase.auth.signOut()} className="bg-gray-900 p-2 rounded-lg border border-gray-800 text-red-500"><i className="fas fa-sign-out-alt"></i></button>
                </div>
            </header>

            <main className="p-4 max-w-md mx-auto space-y-4 mt-4">
                <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">Gestión de Atletas</h2>
                {loading ? <div className="text-orange-500 text-center py-4">Sincronizando...</div> : 
                    athletes.map((atleta) => (
                        <div key={atleta.id} onClick={() => abrirDetalle(atleta)} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-orange-500 transition cursor-pointer flex justify-between items-center">
                            <div>
                                <h3 className="font-black text-white">{atleta.nombre}</h3>
                                <p className="text-[10px] text-gray-500 uppercase font-bold">{atleta.deporte} • {atleta.disciplina}</p>
                                {atleta.planActivo ? <span className="text-[9px] text-green-500 font-black uppercase">Plan: {atleta.planActivo.titulo}</span> : <span className="text-[9px] text-red-500 font-black uppercase">Sin Plan Activo</span>}
                            </div>
                            <i className="fas fa-chevron-right text-gray-700"></i>
                        </div>
                    ))
                }
            </main>

            {/* MODAL: REGISTRAR ATLETA */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
                    <form onSubmit={registrarAtleta} className="bg-gray-900 border border-gray-700 rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
                        <h2 className="text-lg font-black text-white uppercase italic">Nuevo Atleta</h2>
                        <input required placeholder="Nombre Completo" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm" onChange={e => setNewAthlete({...newAthlete, nombre: e.target.value})}/>
                        <input required type="email" placeholder="Correo Electrónico" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm" onChange={e => setNewAthlete({...newAthlete, email: e.target.value})}/>
                        <div className="grid grid-cols-2 gap-3">
                            <select className="bg-black border border-gray-800 rounded-xl p-3 text-sm" onChange={e => setNewAthlete({...newAthlete, sexo: e.target.value})}>
                                <option>Sexo</option><option>M</option><option>F</option>
                            </select>
                            <input placeholder="Deporte" className="bg-black border border-gray-800 rounded-xl p-3 text-sm" onChange={e => setNewAthlete({...newAthlete, deporte: e.target.value})}/>
                        </div>
                        <input placeholder="Disciplina (ej. Fondo / Trail)" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm" onChange={e => setNewAthlete({...newAthlete, disciplina: e.target.value})}/>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 text-gray-500 font-bold text-xs uppercase">Cerrar</button>
                            <button type="submit" className="flex-1 bg-orange-600 p-3 rounded-xl font-black text-xs text-white">CREAR CUENTA</button>
                        </div>
                    </form>
                </div>
            )}

            {/* MODAL: IMPORTAR PLAN */}
            {showImportModal && (
                <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-3xl p-6 w-full max-w-sm space-y-4">
                        <h2 className="text-lg font-black text-white uppercase italic">Importar Plan</h2>
                        <select className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm text-white" onChange={e => setImportData({...importData, atletaId: e.target.value})}>
                            <option value="">Selecciona Atleta...</option>
                            {athletes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                        </select>
                        <select className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm text-white" onChange={e => setImportData({...importData, meta: e.target.value})}>
                            <option value="5k">Meta 5K</option>
                            <option value="10k">Meta 10K</option>
                            <option value="21k">Meta 21K</option>
                            <option value="42k">Meta 42K</option>
                        </select>
                        <button onClick={importarPlan} className="w-full bg-green-600 p-4 rounded-xl font-black text-white uppercase">IMPORTAR AHORA</button>
                        <button onClick={() => setShowImportModal(false)} className="w-full text-gray-500 font-bold text-xs uppercase">Cancelar</button>
                    </div>
                </div>
            )}

            {/* MODAL: AUDITORÍA (Lo que ya tenías) */}
            {selectedAthlete && (
                <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-0">
                    <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900">
                        <div>
                            <h2 className="text-2xl font-black text-orange-500 italic uppercase">{selectedAthlete.nombre}</h2>
                            <p className="text-[10px] text-gray-500 font-bold uppercase">{selectedAthlete.planActivo.titulo}</p>
                        </div>
                        <button onClick={() => setSelectedAthlete(null)} className="text-gray-400"><i className="fas fa-times text-xl"></i></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {routines.map(r => (
                            <div key={r.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className="text-[9px] text-orange-500 font-black uppercase">S{r.semana} • {r.dia_semana}</span>
                                        <h4 className="font-black text-white">{r.titulo}</h4>
                                        <p className="text-[10px] text-gray-500">{r.detalle}</p>
                                    </div>
                                    {records[r.id]?.completado ? <i className="fas fa-check-circle text-green-500"></i> : <i className="far fa-circle text-gray-700"></i>}
                                </div>
                                <div className="mt-3 border-t border-gray-800 pt-3">
                                    {editingNoteId === r.id ? (
                                        <div className="flex gap-2">
                                            <input value={tempNoteText} onChange={e => setTempNoteText(e.target.value)} className="flex-1 bg-black border border-gray-700 rounded p-2 text-[10px] text-white" />
                                            <button onClick={() => guardarNotaCoach(r.id)} className="bg-orange-600 px-3 rounded text-[10px] font-bold">OK</button>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between text-[10px] text-orange-200 bg-orange-500/5 p-2 rounded">
                                            <span>{r.notas_coach || "Sin nota del coach..."}</span>
                                            <button onClick={() => { setEditingNoteId(r.id); setTempNoteText(r.notas_coach || ''); }}><i className="fas fa-edit"></i></button>
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