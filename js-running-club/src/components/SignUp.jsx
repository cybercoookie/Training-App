import { useState } from 'react';
import { supabase } from '../utils/supabase';

export default function SignUp({ onBack }) {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const [form, setForm] = useState({
        nombre: '', email: '', password: '', sexo: '', disciplina: '',
        nivel: 'principiante', corridaMasLarga: '', diasSemana: '4', historial: '',
        meta: '21k', tiempoMeta: '', fechaCarrera: '',
    });

    const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

    async function handleSignUp(e) {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: form.email,
                password: form.password,
                options: { data: { nombre: form.nombre } }
            });
            if (authError) throw authError;

            const { error: perfilError } = await supabase.from('perfiles').upsert({
                id: authData.user.id,
                nombre: form.nombre,
                sexo: form.sexo,
                disciplina: form.disciplina,
                deporte: 'Running',
                email: form.email,
                rol: 'atleta',
                datos_entrenamiento: {
                    nivel: form.nivel,
                    corrida_mas_larga_mi: form.corridaMasLarga || null,
                    dias_por_semana: form.diasSemana,
                    historial: form.historial || null,
                    meta: form.meta,
                    tiempo_meta: form.tiempoMeta || null,
                    fecha_carrera: form.fechaCarrera || null,
                },
            });
            if (perfilError) throw perfilError;

            // Avisar al coach del nuevo registro (aparece en su campana)
            await supabase.from('notificaciones_coach').insert([{
                athlete_id: authData.user.id,
                athlete_name: form.nombre,
                workout_title: '📥 Nuevo atleta registrado — pendiente de plan',
                workout_date: new Date().toISOString().split('T')[0],
                distance_mi: 0,
            }]);

            setDone(true);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    if (done) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-black text-gray-100 font-sans">
                <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl text-center">
                    <i className="fas fa-check-circle text-5xl text-green-500 mb-4"></i>
                    <h1 className="text-xl font-black text-white mb-2">¡Cuenta Creada!</h1>
                    <p className="text-sm text-gray-400 mb-6">Tu coach revisará tu información y te asignará un plan de entrenamiento pronto. Ya puedes iniciar sesión.</p>
                    <button onClick={onBack} className="w-full bg-orange-600 hover:bg-orange-700 p-4 rounded-xl font-black text-white transition active:scale-95">IR AL LOGIN</button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-black text-gray-100 font-sans">
            <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl">
                <h1 className="text-2xl font-black italic tracking-tighter mb-1 text-center">
                    JS <span className="text-orange-500">RUNNING CLUB</span>
                </h1>
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-4 text-center">Registro de Atleta · Paso {step}/2</p>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden mb-6">
                    <div className="h-full bg-orange-500 transition-all" style={{ width: `${step * 50}%` }}></div>
                </div>

                <form className="space-y-4" onSubmit={handleSignUp}>
                    {step === 1 && (
                        <>
                            <input required placeholder="Nombre Completo" value={form.nombre} onChange={set('nombre')} className="w-full bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-orange-500 outline-none" />
                            <input required type="email" placeholder="Email" value={form.email} onChange={set('email')} className="w-full bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-orange-500 outline-none" />
                            <input required type="password" minLength={8} placeholder="Contraseña (mín. 8 caracteres)" value={form.password} onChange={set('password')} className="w-full bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-orange-500 outline-none" />
                            <div className="grid grid-cols-2 gap-3">
                                <select value={form.sexo} onChange={set('sexo')} className="bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm">
                                    <option value="">Sexo</option><option>M</option><option>F</option>
                                </select>
                                <input placeholder="Disciplina" value={form.disciplina} onChange={set('disciplina')} className="bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm" />
                            </div>
                            <button type="button" onClick={() => {
                                if (!form.nombre || !form.email || form.password.length < 8) { setError('Completa nombre, email y contraseña (8+ caracteres).'); return; }
                                setError(''); setStep(2);
                            }} className="w-full bg-orange-600 hover:bg-orange-700 p-4 rounded-xl font-black text-white transition active:scale-95">
                                SIGUIENTE <i className="fas fa-arrow-right ml-1"></i>
                            </button>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Cuéntanos de tu entrenamiento</p>
                            <div className="grid grid-cols-2 gap-3">
                                <select value={form.nivel} onChange={set('nivel')} className="bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm">
                                    <option value="principiante">Principiante</option>
                                    <option value="intermedio">Intermedio</option>
                                    <option value="avanzado">Avanzado</option>
                                </select>
                                <select value={form.diasSemana} onChange={set('diasSemana')} className="bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm">
                                    <option value="3">3 días/sem</option>
                                    <option value="4">4 días/sem</option>
                                    <option value="5">5 días/sem</option>
                                </select>
                            </div>
                            <input type="number" step="0.5" placeholder="Corrida más larga reciente (millas)" value={form.corridaMasLarga} onChange={set('corridaMasLarga')} className="w-full bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-orange-500 outline-none" />
                            <div className="grid grid-cols-2 gap-3">
                                <select value={form.meta} onChange={set('meta')} className="bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm">
                                    <option value="5k">Meta 5K</option>
                                    <option value="10k">Meta 10K</option>
                                    <option value="21k">Meta 21K</option>
                                    <option value="42k">Meta 42K</option>
                                </select>
                                <input placeholder="Tiempo meta (min u h:mm)" value={form.tiempoMeta} onChange={set('tiempoMeta')} className="bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm" />
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold">Fecha de tu carrera (si ya la tienes)</label>
                                <input type="date" value={form.fechaCarrera} onChange={set('fechaCarrera')} className="w-full bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm text-white" />
                            </div>
                            <textarea placeholder="Historial: entrenamientos previos, lesiones, carreras pasadas..." value={form.historial} onChange={set('historial')} className="w-full bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm h-20 resize-none focus:border-orange-500 outline-none"></textarea>

                            {error && <p className="text-red-500 text-xs text-center font-bold">{error}</p>}

                            <div className="flex gap-3">
                                <button type="button" onClick={() => setStep(1)} className="flex-1 text-gray-500 font-bold text-xs uppercase"><i className="fas fa-arrow-left mr-1"></i> Atrás</button>
                                <button type="submit" disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700 p-4 rounded-xl font-black text-white transition active:scale-95 disabled:opacity-50">
                                    {loading ? 'CREANDO...' : 'CREAR MI CUENTA'}
                                </button>
                            </div>
                        </>
                    )}

                    {error && step === 1 && <p className="text-red-500 text-xs text-center font-bold">{error}</p>}
                </form>

                <button onClick={onBack} className="w-full text-center text-[11px] text-gray-500 font-bold uppercase mt-6 hover:text-orange-400 transition">
                    ¿Ya tienes cuenta? Inicia sesión
                </button>
            </div>
        </div>
    );
}
