import { useState } from 'react';
import { supabase } from '../utils/supabase';
import SignUp from './SignUp';

export default function Login() {
    // React "recuerda" lo que el usuario escribe usando 'useState'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showSignUp, setShowSignUp] = useState(false);
    const [mode, setMode] = useState('login'); // 'login' | 'forgot'
    const [resetSent, setResetSent] = useState(false);

    if (showSignUp) return <SignUp onBack={() => setShowSignUp(false)} />;

    const handleLogin = async (e) => {
        e.preventDefault(); // Evita que la página recargue
        setLoading(true);
        setError('');

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            setError("Credenciales incorrectas.");
            setLoading(false);
        }
    };

    const handleForgot = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
        });
        setLoading(false);
        if (error) setError("No se pudo enviar el correo. Verifica el email.");
        else setResetSent(true);
    };

    // VISTA: RECUPERAR CONTRASEÑA
    if (mode === 'forgot') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-black text-gray-100 font-sans">
                <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl text-center">
                    <h1 className="text-3xl font-black italic tracking-tighter mb-1">
                        JS <span className="text-orange-500">RUNNING CLUB</span>
                    </h1>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-8">Recuperar Contraseña</p>

                    {resetSent ? (
                        <>
                            <i className="fas fa-envelope-circle-check text-5xl text-green-500 mb-4"></i>
                            <p className="text-sm text-gray-300 mb-6">Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja (y spam).</p>
                            <button onClick={() => { setMode('login'); setResetSent(false); }} className="w-full bg-orange-600 hover:bg-orange-700 p-4 rounded-xl font-black text-white transition active:scale-95">VOLVER AL LOGIN</button>
                        </>
                    ) : (
                        <form className="space-y-4 text-left" onSubmit={handleForgot}>
                            <p className="text-xs text-gray-400 mb-2">Ingresa tu email y te enviaremos un enlace para crear una nueva contraseña.</p>
                            <div>
                                <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1 ml-1">Email</label>
                                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-orange-500 outline-none transition" placeholder="tu@email.com" />
                            </div>
                            {error && <p className="text-red-500 text-xs text-center font-bold">{error}</p>}
                            <button type="submit" disabled={loading} className="w-full bg-orange-600 hover:bg-orange-700 p-4 rounded-xl font-black text-white shadow-lg transition active:scale-95 mt-2 disabled:opacity-50">
                                {loading ? 'Enviando...' : 'ENVIAR ENLACE'}
                            </button>
                            <button type="button" onClick={() => { setMode('login'); setError(''); }} className="w-full text-center text-[11px] text-gray-500 font-bold uppercase mt-2 hover:text-orange-400 transition">
                                Volver al login
                            </button>
                        </form>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-black text-gray-100 font-sans">
            <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl text-center">
                <h1 className="text-3xl font-black italic tracking-tighter mb-1">
                    JS <span className="text-orange-500">RUNNING CLUB</span>
                </h1>
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-500 mb-8">Portal de Acceso</p>
                
                <form className="space-y-4 text-left" onSubmit={handleLogin}>
                    <div>
                        <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1 ml-1">Email</label>
                        <input 
                            type="email" 
                            required 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-orange-500 outline-none transition" 
                            placeholder="tu@email.com" 
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-gray-500 font-bold uppercase block mb-1 ml-1">Password</label>
                        <input 
                            type="password" 
                            required 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black border border-gray-800 rounded-xl py-3 px-4 text-sm focus:border-orange-500 outline-none transition" 
                            placeholder="••••••••" 
                        />
                    </div>
                    
                    {error && <p className="text-red-500 text-xs text-center font-bold mt-2">{error}</p>}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-orange-600 hover:bg-orange-700 p-4 rounded-xl font-black text-white shadow-lg transition active:scale-95 mt-6"
                    >
                        {loading ? 'Cargando...' : 'ENTRAR'}
                    </button>

                    <button type="button" onClick={() => { setMode('forgot'); setError(''); }} className="w-full text-center text-[11px] text-gray-500 font-bold uppercase mt-3 hover:text-orange-400 transition">
                        ¿Olvidaste tu contraseña?
                    </button>
                </form>

                <button onClick={() => setShowSignUp(true)} className="w-full text-center text-[11px] text-gray-500 font-bold uppercase mt-6 hover:text-orange-400 transition">
                    ¿Nuevo en el club? <span className="text-orange-500">Regístrate aquí</span>
                </button>
            </div>
        </div>
    );
}