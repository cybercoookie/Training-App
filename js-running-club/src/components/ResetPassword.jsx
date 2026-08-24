import { useState } from 'react';
import { supabase } from '../utils/supabase';

// Se muestra cuando el usuario llega desde el enlace de recuperación del email
// (evento PASSWORD_RECOVERY). Permite establecer una nueva contraseña.
export default function ResetPassword({ onDone }) {
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);

    async function handleReset(e) {
        e.preventDefault();
        setError('');
        if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
        if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            setDone(true);
        } catch (err) {
            setError(err.message || 'No se pudo actualizar la contraseña.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-black text-gray-100 font-sans">
            <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl text-center">
                <h1 className="text-2xl font-black italic tracking-tighter mb-1">
                    JS <span className="text-orange-500">RUNNING CLUB</span>
                </h1>
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-6">Nueva Contraseña</p>

                {done ? (
                    <>
                        <i className="fas fa-check-circle text-5xl text-green-500 mb-4"></i>
                        <p className="text-sm text-gray-300 mb-6">¡Contraseña actualizada! Ya puedes usar la app con tu nueva contraseña.</p>
                        <button onClick={onDone} className="w-full bg-orange-600 hover:bg-orange-700 p-4 rounded-xl font-black text-white transition active:scale-95">CONTINUAR</button>
                    </>
                ) : (
                    <form className="space-y-4 text-left" onSubmit={handleReset}>
                        <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1 ml-1">Nueva contraseña</label>
                            <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
                                className="w-full bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-orange-500 outline-none transition" placeholder="Mín. 8 caracteres" />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1 ml-1">Confirmar contraseña</label>
                            <input type="password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)}
                                className="w-full bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-orange-500 outline-none transition" placeholder="Repite la contraseña" />
                        </div>
                        {error && <p className="text-red-500 text-xs text-center font-bold">{error}</p>}
                        <button type="submit" disabled={loading} className="w-full bg-orange-600 hover:bg-orange-700 p-4 rounded-xl font-black text-white shadow-lg transition active:scale-95 mt-2 disabled:opacity-50">
                            {loading ? 'Guardando...' : 'GUARDAR CONTRASEÑA'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
