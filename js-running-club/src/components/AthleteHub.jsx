import { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const DAY_ORDER = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };
const PLAN_START_DATE = '2026-06-30';
const RACE_DATE = '2026-08-09';

const FRASES_MOTIVACIONALES = [
    '"El milagro no es terminar la carrera. El milagro es tener el coraje de empezar." — John Bingham',
    '"No importa qué tan lento vayas, sigues siendo más rápida que quien está en el sofá."',
    '"Corre cuando puedas, camina si debes, gatea si es necesario; pero nunca te rindas." — Dean Karnazes',
    '"El dolor es temporal. Rendirse dura para siempre." — Lance Armstrong',
    '"Tu cuerpo puede aguantar casi todo. Es a tu mente a la que tienes que convencer."',
    '"Cada milla que corres es una promesa que te cumples a ti misma."',
    '"No entrenas para la carrera. Entrenas para convertirte en la persona que puede terminarla."',
    '"Las piernas duelen unos días. Rendirse duele toda la vida."',
    '"La disciplina es elegir entre lo que quieres ahora y lo que quieres más."',
    '"13.1 millas no se corren el día de la carrera. Se corren todos los días antes."',
];

// --- Exportación a calendario (.ics) con recordatorios ---
function icsEscape(text) {
    return String(text || '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

// Plega líneas largas a 75 octetos según RFC 5545
function icsFold(line) {
    if (line.length <= 75) return line;
    const chunks = [];
    let i = 0;
    while (i < line.length) {
        chunks.push((i === 0 ? '' : ' ') + line.slice(i, i + (i === 0 ? 75 : 74)));
        i += (i === 0 ? 75 : 74);
    }
    return chunks.join('\r\n');
}

// Construye un archivo .ics con un evento de día completo por entrenamiento,
// cada uno con una alarma (recordatorio) a la hora elegida el mismo día.
function buildICS(workouts, reminderTime = '07:00') {
    const [rh, rm] = reminderTime.split(':').map(Number);
    const alarmMinutes = (rh || 0) * 60 + (rm || 0); // minutos desde medianoche
    const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//JS Running Club//Training Plan//ES',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:JS Running Club — Mi Plan',
    ];

    const sorted = [...workouts].sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const w of sorted) {
        const ymd = w.date.replace(/-/g, '');
        const next = new Date(w.date + 'T00:00:00');
        next.setDate(next.getDate() + 1);
        const ymdEnd = next.toISOString().split('T')[0].replace(/-/g, '');

        const emoji = w.workout_type === 'Strength' ? '💪' : '🏃';
        const dist = w.distance_mi > 0 ? ` (${w.distance_mi} mi)` : '';
        const summary = `${emoji} ${w.title}${dist}`;
        // Alarma: RELATED=START desde medianoche → hora del recordatorio ese día
        const trigger = `PT${alarmMinutes}M`;

        lines.push(
            'BEGIN:VEVENT',
            icsFold(`UID:${w.id}@jsrunningclub`),
            `DTSTAMP:${dtstamp}`,
            `DTSTART;VALUE=DATE:${ymd}`,
            `DTEND;VALUE=DATE:${ymdEnd}`,
            icsFold(`SUMMARY:${icsEscape(summary)}`),
            icsFold(`DESCRIPTION:${icsEscape(w.description)}`),
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            icsFold(`DESCRIPTION:${icsEscape('Hoy: ' + summary)}`),
            `TRIGGER;RELATED=START:${trigger}`,
            'END:VALARM',
            'END:VEVENT',
        );
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
}

function descargarICS(workouts, reminderTime) {
    const ics = buildICS(workouts, reminderTime);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'js-running-club-plan.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Genera el mensaje del splash a partir del progreso real del plan
function generarMensajeDiario(workouts) {
    const today = new Date().toISOString().split('T')[0];
    const completados = workouts.filter(w => w.is_completed);
    const totalWorkouts = workouts.length;
    const millasHechas = completados.reduce((sum, w) => sum + (parseFloat(w.distance_mi) || 0), 0);
    const millasTotales = workouts.reduce((sum, w) => sum + (parseFloat(w.distance_mi) || 0), 0);
    const millasRestantes = Math.max(0, millasTotales - millasHechas);
    const pctCompletado = totalWorkouts > 0 ? Math.round((completados.length / totalWorkouts) * 100) : 0;

    const msPorDia = 1000 * 60 * 60 * 24;
    const diasParaCarrera = Math.max(0, Math.ceil((new Date(RACE_DATE) - new Date(today)) / msPorDia));

    const workoutHoy = workouts.find(w => w.date === today && !w.is_completed);
    const proximoWorkout = workouts.find(w => w.date >= today && !w.is_completed);

    // Racha: workouts completados consecutivos más recientes (hacia atrás desde hoy)
    const pasados = workouts.filter(w => w.date < today);
    let racha = 0;
    for (let i = pasados.length - 1; i >= 0; i--) {
        if (pasados[i].is_completed) racha++;
        else break;
    }

    let titulo, mensaje;
    if (diasParaCarrera === 0) {
        titulo = '🏅 ¡HOY ES EL DÍA!';
        mensaje = 'Llegó el momento. Todo el trabajo está hecho — hoy solo sal y disfruta tus 13.1 millas. ¡Confía en tu entrenamiento!';
    } else if (completados.length === 0) {
        titulo = '🌅 ¡Todo comienza hoy!';
        mensaje = `Tienes ${totalWorkouts} entrenamientos y ${millasTotales.toFixed(1)} millas por delante rumbo a tu media maratón. El primer paso es el más importante.`;
    } else if (racha >= 3) {
        titulo = `🔥 ¡Racha de ${racha} entrenamientos!`;
        mensaje = `Estás imparable: ${completados.length} de ${totalWorkouts} completados (${pctCompletado}%) y ${millasHechas.toFixed(1)} millas en las piernas. Quedan ${millasRestantes.toFixed(1)} millas y ${diasParaCarrera} días para la carrera.`;
    } else if (pctCompletado >= 75) {
        titulo = '🏁 ¡La meta está cerca!';
        mensaje = `Ya completaste el ${pctCompletado}% del plan con ${millasHechas.toFixed(1)} millas corridas. Solo faltan ${millasRestantes.toFixed(1)} millas y ${diasParaCarrera} días. ¡El trabajo duro ya casi está hecho!`;
    } else if (pctCompletado >= 50) {
        titulo = '💪 ¡Pasaste la mitad!';
        mensaje = `${completados.length} entrenamientos completados y ${millasHechas.toFixed(1)} millas acumuladas. Quedan ${millasRestantes.toFixed(1)} millas en ${diasParaCarrera} días. Cada sesión te acerca más.`;
    } else {
        titulo = '🏃‍♀️ ¡Sigue construyendo!';
        mensaje = `Llevas ${completados.length} de ${totalWorkouts} entrenamientos (${millasHechas.toFixed(1)} millas). Faltan ${diasParaCarrera} días para la carrera — la constancia de hoy es el resultado de mañana.`;
    }

    if (workoutHoy) {
        mensaje += ` Hoy toca: ${workoutHoy.title}${workoutHoy.distance_mi > 0 ? ` (${workoutHoy.distance_mi} mi)` : ''}.`;
    } else if (proximoWorkout) {
        mensaje += ` Próximo entrenamiento: ${proximoWorkout.day_of_week} — ${proximoWorkout.title}.`;
    }

    // Frase del día: rota de forma determinista según la fecha
    const semilla = today.split('-').reduce((a, b) => a + parseInt(b), 0);
    const frase = FRASES_MOTIVACIONALES[semilla % FRASES_MOTIVACIONALES.length];

    return { titulo, mensaje, frase, diasParaCarrera, pctCompletado, millasHechas, millasRestantes };
}

// --- "¿Cómo te sientes?" (estado corporal del atleta) ---
const MOODS = [
    { rating: 1, emoji: '🤕', label: 'Muy mal', grad: 'from-red-600 to-red-500', ring: 'ring-red-500' },
    { rating: 2, emoji: '😣', label: 'Cansado', grad: 'from-orange-600 to-orange-500', ring: 'ring-orange-500' },
    { rating: 3, emoji: '😐', label: 'Normal', grad: 'from-yellow-600 to-yellow-500', ring: 'ring-yellow-500' },
    { rating: 4, emoji: '🙂', label: 'Bien', grad: 'from-green-600 to-green-500', ring: 'ring-green-500' },
    { rating: 5, emoji: '🔥', label: 'Excelente', grad: 'from-orange-500 to-yellow-400', ring: 'ring-orange-400' },
];
const MOOD_TAGS = [
    { key: 'molestia', label: '🤕 Molestia / dolor' },
    { key: 'piernas', label: '🦵 Piernas cansadas' },
    { key: 'sueno', label: '😴 Dormí poco' },
    { key: 'fuerte', label: '💪 Me siento fuerte' },
    { key: 'motivada', label: '😃 Motivado/a' },
];

// Ajusta (o restaura) los próximos entrenamientos según el estado.
// No destructivo: guarda original_distance_mi para poder revertir.
async function ajustarWorkoutsPorEstado(userId, rating, tags) {
    const today = new Date().toISOString().split('T')[0];
    const molestia = (tags || []).includes('molestia');
    const efectivo = molestia ? 1 : rating;

    const { data: futuros } = await supabase
        .from('athlete_program').select('*')
        .eq('athlete_id', userId).eq('is_completed', false)
        .gte('date', today).order('date', { ascending: true });
    if (!futuros || futuros.length === 0) return { changed: 0, mode: 'none' };

    // Buen estado → restaurar entrenamientos previamente ajustados
    if (efectivo >= 4) {
        const ajustados = futuros.filter(w => w.auto_adjusted);
        for (const w of ajustados) {
            await supabase.from('athlete_program').update({
                distance_mi: w.original_distance_mi ?? w.distance_mi,
                original_distance_mi: null, auto_adjusted: false, ajuste_nota: null,
            }).eq('id', w.id);
        }
        return { changed: ajustados.length, mode: 'restore' };
    }

    if (efectivo === 3) return { changed: 0, mode: 'none' };

    // Estado bajo → suavizar los próximos N entrenamientos
    const n = efectivo === 1 ? 3 : 2;
    const factor = efectivo === 1 ? 0.5 : 0.75;
    const nota = efectivo === 1
        ? 'Ajustado por tu estado: baja mucho la intensidad, trota muy suave o descansa. Escucha a tu cuerpo.'
        : 'Ajustado por tu estado: tómalo más suave hoy — reduce el ritmo y la distancia.';

    let changed = 0;
    for (const w of futuros.slice(0, n)) {
        if (w.workout_type === 'Strength') {
            await supabase.from('athlete_program').update({
                auto_adjusted: true,
                ajuste_nota: efectivo === 1 ? 'Solo movilidad ligera hoy, o descansa.' : nota,
            }).eq('id', w.id);
            changed++;
            continue;
        }
        const orig = w.original_distance_mi ?? w.distance_mi;
        const nueva = Math.max(1, Math.round(parseFloat(orig) * factor * 2) / 2);
        await supabase.from('athlete_program').update({
            original_distance_mi: orig, distance_mi: nueva, auto_adjusted: true, ajuste_nota: nota,
        }).eq('id', w.id);
        changed++;
    }
    return { changed, mode: 'reduce' };
}

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
    const [showCalModal, setShowCalModal] = useState(false);
    const [reminderTime, setReminderTime] = useState('07:00');

    const [selectedWorkoutId, setSelectedWorkoutId] = useState('');
    const [formNotes, setFormNotes] = useState('');
    const [formDist, setFormDist] = useState('');
    const [formPace, setFormPace] = useState('');
    const [formHr, setFormHr] = useState('');
    const [formUrl, setFormUrl] = useState('');
    const [saving, setSaving] = useState(false);

    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [feedbackText, setFeedbackText] = useState('');
    const [feedbackStatus, setFeedbackStatus] = useState('idle');

    const [splashData, setSplashData] = useState(null);
    const [showSplash, setShowSplash] = useState(false);

    const [userId, setUserId] = useState(null);
    const [estado, setEstado] = useState(null);
    const [showMood, setShowMood] = useState(false);
    const [moodRating, setMoodRating] = useState(null);
    const [moodTags, setMoodTags] = useState([]);
    const [moodNote, setMoodNote] = useState('');
    const [moodSaving, setMoodSaving] = useState(false);
    const [moodResult, setMoodResult] = useState(null);

    const [seconds, setSeconds] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => { cargarPlan(); }, []);

    useEffect(() => {
        const w = workoutsByWeek[currentWeek];
        const selected = w?.find(r => r.id.toString() === selectedWorkoutId.toString());
        setFormNotes(selected?.athlete_notes || '');
        setFormDist(selected?.actual_distance_mi || '');
        setFormPace(selected?.actual_pace || '');
        setFormHr(selected?.avg_hr || '');
        setFormUrl(selected?.garmin_url || '');
    }, [selectedWorkoutId, currentWeek, workoutsByWeek]);

    async function cargarPlan() {
        setIsSyncing(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            setUserId(user.id);
            supabase.from('perfiles').select('estado_actual').eq('id', user.id).single()
                .then(({ data }) => { if (data) setEstado(data.estado_actual); });
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

                // Splash motivacional: una vez al día por usuario
                const today = new Date().toISOString().split('T')[0];
                const splashKey = `js_splash_${user.id}`;
                if (localStorage.getItem(splashKey) !== today) {
                    setSplashData(generarMensajeDiario(workouts));
                    setShowSplash(true);
                    localStorage.setItem(splashKey, today);
                }
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
        const payload = {
            athlete_notes: formNotes || null,
            actual_distance_mi: formDist ? parseFloat(formDist) : null,
            actual_pace: formPace || null,
            avg_hr: formHr ? parseInt(formHr) : null,
            garmin_url: formUrl || null,
        };
        try {
            await supabase.from('athlete_program').update(payload).eq('id', selectedWorkoutId);
            setWorkoutsByWeek(prev => {
                const updated = { ...prev };
                for (const week of Object.values(updated)) {
                    const w = week.find(r => r.id.toString() === selectedWorkoutId.toString());
                    if (w) { Object.assign(w, payload); break; }
                }
                return { ...updated };
            });
            alert("¡Detalles guardados exitosamente!");
        } catch (e) { alert("Error al guardar."); }
        finally { setSaving(false); }
    }

    function toggleMoodTag(key) {
        setMoodTags(prev => prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]);
    }

    function abrirMood() {
        setMoodRating(estado?.rating || null);
        setMoodTags(estado?.tags || []);
        setMoodNote('');
        setMoodResult(null);
        setShowMood(true);
    }

    async function guardarEstado() {
        if (!moodRating) { alert('Elige cómo te sientes.'); return; }
        if (!userId) return;
        setMoodSaving(true);
        try {
            const estadoObj = { rating: moodRating, tags: moodTags, nota: moodNote || null, updated_at: new Date().toISOString() };
            await supabase.from('perfiles').update({ estado_actual: estadoObj }).eq('id', userId);
            await supabase.from('estado_historial').insert([{ athlete_id: userId, rating: moodRating, tags: moodTags, nota: moodNote || null }]);
            const res = await ajustarWorkoutsPorEstado(userId, moodRating, moodTags);
            setEstado(estadoObj);
            await cargarPlan();

            const mood = MOODS.find(m => m.rating === moodRating);
            let msg;
            if (res.mode === 'reduce') msg = `Gracias por avisar. Suavizamos tus próximos ${res.changed} entrenamiento(s) para que te recuperes bien. 💙`;
            else if (res.mode === 'restore') msg = res.changed > 0 ? `¡Genial! Restauramos ${res.changed} entrenamiento(s) a su plan original. ¡A darlo todo! 🔥` : '¡Nos encanta esa energía! Sigue así. 🔥';
            else msg = '¡Registrado! Sigue escuchando a tu cuerpo. 💪';
            setMoodResult({ emoji: mood?.emoji, msg });
        } catch (e) { alert('Error al guardar tu estado.'); }
        finally { setMoodSaving(false); }
    }

    function sendToCoachWhatsApp() {
        if (!selectedWorkoutId) { alert("Por favor selecciona un entrenamiento."); return; }
        const workout = workoutsByWeek[currentWeek]?.find(r => r.id.toString() === selectedWorkoutId.toString());
        if (!workout) return;
        let report = `🏃‍♀️ *REPORTE DE ENTRENAMIENTO*\n\n*Atleta:* ${userName}\n*Plan:* Media Maratón — Meta 3:00 hrs\n*Semana:* ${currentWeek} | *${workout.day_of_week}* ${workout.date}\n\n✅ *${workout.title}*\n`;
        if (workout.distance_mi > 0) report += `📏 Distancia planificada: ${workout.distance_mi} mi\n`;
        if (formDist || formPace || formHr) { report += `└ `; if (formDist) report += `⌚ ${formDist}mi `; if (formPace) report += `⚡ ${formPace}/mi `; if (formHr) report += `❤️ ${formHr}bpm`; report += `\n`; }
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
                        <span className="text-orange-500/70">Media Maratón · Meta 3:00 hrs · Ago 9</span>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={abrirMood} className="bg-gray-900 w-9 h-9 rounded-lg border border-gray-800 hover:border-orange-500 transition-colors flex items-center justify-center text-lg" title="¿Cómo te sientes?">
                        {estado?.rating ? (MOODS.find(m => m.rating === estado.rating)?.emoji || '🙂') : '🙂'}
                    </button>
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
                            <button onClick={() => setShowCalModal(true)} className="w-full bg-gray-900 hover:bg-gray-800 border border-orange-500/30 rounded-2xl p-4 flex items-center justify-between transition active:scale-[0.99]">
                                <div className="flex items-center gap-3">
                                    <i className="fas fa-calendar-plus text-orange-500 text-lg"></i>
                                    <div className="text-left">
                                        <p className="text-sm font-black text-white">Añadir plan a mi calendario</p>
                                        <p className="text-[10px] text-gray-500">Con recordatorio del entrenamiento del día</p>
                                    </div>
                                </div>
                                <i className="fas fa-chevron-right text-gray-600"></i>
                            </button>

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
                                                        <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                                                            {workout.auto_adjusted && workout.original_distance_mi ? <span className="line-through text-gray-600 mr-1">{workout.original_distance_mi}</span> : null}
                                                            {workout.distance_mi} mi
                                                        </span>
                                                    )}
                                                    {workout.auto_adjusted && <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">🔧 Ajustado</span>}
                                                </div>
                                                <h3 className="text-lg font-black text-white">{workout.title}</h3>
                                                <p className="text-xs text-gray-400 mt-1">{workout.description}</p>
                                            </div>
                                            <input type="checkbox" checked={workout.is_completed} onChange={(e) => toggleTask(workout.id, e.target.checked)} className="w-6 h-6 rounded-full text-green-500 bg-black border-gray-700 cursor-pointer accent-orange-500 mt-1 shrink-0"/>
                                        </div>
                                        {workout.ajuste_nota && (
                                            <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                                                <p className="text-[10px] font-bold text-blue-300 uppercase mb-1"><i className="fas fa-heart-pulse"></i> Ajuste por tu estado:</p>
                                                <p className="text-xs text-blue-100 whitespace-pre-wrap">{workout.ajuste_nota}</p>
                                            </div>
                                        )}
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

                                <div className="grid grid-cols-2 gap-4">
                                    <input type="number" step="0.01" value={formDist} onChange={e => setFormDist(e.target.value)} placeholder="Millas (Ej: 2.5)" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm text-white focus:border-orange-500"/>
                                    <input type="text" value={formPace} onChange={e => setFormPace(e.target.value)} placeholder="Paso (Ej: 13:17)" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm text-white focus:border-orange-500"/>
                                    <input type="number" value={formHr} onChange={e => setFormHr(e.target.value)} placeholder="BPM (Ej: 145)" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm text-white focus:border-orange-500"/>
                                    <input type="url" value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="Link Garmin" className="w-full bg-black border border-gray-800 rounded-xl p-3 text-sm text-white focus:border-orange-500"/>
                                </div>
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

            {showSplash && splashData && (
                <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-gradient-to-b from-gray-900 to-black border border-orange-500/30 rounded-3xl p-8 w-full max-w-sm relative shadow-2xl shadow-orange-500/10 text-center">
                        <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-4">JS Running Club</div>
                        <h2 className="text-2xl font-black text-white mb-3">{splashData.titulo}</h2>
                        <p className="text-sm text-gray-300 mb-5 leading-relaxed">{splashData.mensaje}</p>

                        <div className="grid grid-cols-3 gap-2 mb-5">
                            <div className="bg-black/60 border border-gray-800 rounded-xl p-3">
                                <p className="text-xl font-black text-orange-500">{splashData.pctCompletado}%</p>
                                <p className="text-[9px] uppercase font-bold text-gray-500">Plan</p>
                            </div>
                            <div className="bg-black/60 border border-gray-800 rounded-xl p-3">
                                <p className="text-xl font-black text-blue-400">{splashData.millasHechas.toFixed(1)}</p>
                                <p className="text-[9px] uppercase font-bold text-gray-500">Mi corridas</p>
                            </div>
                            <div className="bg-black/60 border border-gray-800 rounded-xl p-3">
                                <p className="text-xl font-black text-green-400">{splashData.diasParaCarrera}</p>
                                <p className="text-[9px] uppercase font-bold text-gray-500">Días p/ carrera</p>
                            </div>
                        </div>

                        <div className="mb-6 h-2 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-orange-600 to-orange-400 rounded-full transition-all" style={{ width: `${splashData.pctCompletado}%` }}></div>
                        </div>

                        <p className="text-xs text-orange-300/80 italic mb-6 leading-relaxed">{splashData.frase}</p>

                        <button onClick={() => setShowSplash(false)} className="w-full bg-orange-600 hover:bg-orange-500 p-4 rounded-xl font-black text-white text-sm uppercase tracking-wider active:scale-95 transition shadow-lg shadow-orange-600/30">
                            ¡A entrenar! <i className="fas fa-arrow-right ml-2"></i>
                        </button>
                    </div>
                </div>
            )}

            {showMood && (
                <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-gradient-to-b from-gray-900 to-black border border-gray-700 rounded-3xl p-6 w-full max-w-sm relative shadow-2xl">
                        <button onClick={() => setShowMood(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"><i className="fas fa-times text-xl"></i></button>

                        {moodResult ? (
                            <div className="text-center py-6">
                                <div className="text-6xl mb-4 animate-bounce">{moodResult.emoji}</div>
                                <p className="text-sm text-gray-200 mb-6 leading-relaxed">{moodResult.msg}</p>
                                <button onClick={() => setShowMood(false)} className="w-full bg-orange-600 hover:bg-orange-500 p-4 rounded-xl font-black text-white text-sm uppercase tracking-wider active:scale-95 transition">¡Listo!</button>
                            </div>
                        ) : (
                            <>
                                <h2 className="text-xl font-black text-white mb-1 text-center">¿Cómo te sientes hoy?</h2>
                                <p className="text-xs text-gray-400 mb-5 text-center">Tu estado ajusta tu plan. ¡Sé honesto/a con tu cuerpo!</p>

                                <div className="flex justify-between gap-1 mb-5">
                                    {MOODS.map(m => (
                                        <button key={m.rating} onClick={() => setMoodRating(m.rating)}
                                            className={`flex-1 flex flex-col items-center py-3 rounded-2xl border transition-all ${moodRating === m.rating ? `bg-gradient-to-b ${m.grad} border-transparent scale-110 ring-2 ${m.ring} ring-offset-2 ring-offset-black shadow-lg` : 'bg-gray-900 border-gray-800 opacity-60 hover:opacity-100'}`}>
                                            <span className="text-2xl">{m.emoji}</span>
                                            <span className={`text-[8px] font-black uppercase mt-1 ${moodRating === m.rating ? 'text-white' : 'text-gray-500'}`}>{m.label}</span>
                                        </button>
                                    ))}
                                </div>

                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">¿Algo más? (opcional)</p>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {MOOD_TAGS.map(t => (
                                        <button key={t.key} onClick={() => toggleMoodTag(t.key)}
                                            className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition ${moodTags.includes(t.key) ? 'bg-orange-500/20 border-orange-500 text-orange-300' : 'bg-gray-900 border-gray-800 text-gray-400'}`}>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>

                                <textarea value={moodNote} onChange={e => setMoodNote(e.target.value)} placeholder="Cuéntale a tu coach cómo va todo..." className="w-full bg-black border border-gray-800 rounded-2xl p-3 text-sm text-white h-16 focus:border-orange-500 outline-none resize-none mb-4"></textarea>

                                <button onClick={guardarEstado} disabled={moodSaving || !moodRating} className="w-full bg-orange-600 hover:bg-orange-500 p-4 rounded-xl font-black text-white text-sm uppercase tracking-wider active:scale-95 transition disabled:opacity-40">
                                    {moodSaving ? 'Guardando...' : 'Registrar mi estado'}
                                </button>
                                {estado?.updated_at && <p className="text-[10px] text-gray-600 mt-3 text-center">Último registro: {new Date(estado.updated_at).toLocaleDateString()}</p>}
                            </>
                        )}
                    </div>
                </div>
            )}

            {showCalModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-3xl p-6 w-full max-w-sm relative shadow-2xl">
                        <button onClick={() => setShowCalModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"><i className="fas fa-times text-xl"></i></button>
                        <h2 className="text-lg font-black text-white mb-1"><i className="fas fa-calendar-plus text-orange-500 mr-2"></i> Añadir a mi Calendario</h2>
                        <p className="text-xs text-gray-400 mb-4">Descarga tu plan completo como archivo de calendario. Al abrirlo, tu teléfono lo agrega a Apple Calendar o Google Calendar, con un recordatorio automático cada día de entrenamiento.</p>

                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Hora del recordatorio diario</label>
                        <input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} className="w-full bg-black border border-gray-700 rounded-xl p-3 text-sm text-white focus:border-orange-500 outline-none mt-1 mb-4" />

                        <button onClick={() => { descargarICS(Object.values(workoutsByWeek).flat(), reminderTime); setShowCalModal(false); }} className="w-full bg-orange-600 hover:bg-orange-500 p-4 rounded-xl font-black text-white text-sm uppercase tracking-wider active:scale-95 transition">
                            <i className="fas fa-download mr-2"></i> Descargar calendario
                        </button>
                        <p className="text-[10px] text-gray-600 mt-3 text-center">iPhone: se abre en Calendario. Android: se abre en Google Calendar.</p>
                    </div>
                </div>
            )}

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