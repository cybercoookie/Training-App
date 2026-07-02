import { createContext, useContext, useState, useCallback } from 'react'

const STRINGS = {
  en: {
    map: 'Map',
    wishlist: 'Wishlist',
    journal: 'Journal',
    profile: 'Profile',
    explore: 'Explore Puerto Rico',
    all: 'All',
    directions: 'Directions',
    details: 'Details',
    addToWishlist: 'Add to wishlist',
    removeFromWishlist: 'Remove from wishlist',
    logVisit: 'Log a visit',
    difficulty: 'Difficulty',
    easy: 'Easy',
    moderate: 'Moderate',
    hard: 'Hard',
    municipality: 'Municipality',
    emptyWishlist: 'Your wishlist is empty. Tap the heart on any place to save it here.',
    emptyJournal: 'No adventures logged yet. Visit a place and log it!',
    signIn: 'Sign in',
    signUp: 'Create account',
    signOut: 'Sign out',
    email: 'Email',
    password: 'Password',
    needAccount: 'Need an account? Sign up',
    haveAccount: 'Already have an account? Sign in',
    signInPrompt: 'Sign in to save wishlists, log visits, and add photos.',
    checkEmail: 'Check your email to confirm your account, then sign in.',
    visitedOn: 'Date of visit',
    notes: 'Notes',
    rating: 'Rating',
    photos: 'Photos',
    addPhotos: 'Add photos',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    confirmDelete: 'Delete this entry and its photos?',
    language: 'Language',
    myLocation: 'My location',
    locationError: 'Could not get your location. Check permission settings.',
    kmAway: 'km away',
    visits: 'visits',
    loading: 'Loading…',
    notesPlaceholder: 'How was it? Trail conditions, tips, favorite moments…',
    places: 'places',
    backToMap: 'Back to map',
  },
  es: {
    map: 'Mapa',
    wishlist: 'Deseos',
    journal: 'Diario',
    profile: 'Perfil',
    explore: 'Explora Puerto Rico',
    all: 'Todos',
    directions: 'Cómo llegar',
    details: 'Detalles',
    addToWishlist: 'Añadir a deseos',
    removeFromWishlist: 'Quitar de deseos',
    logVisit: 'Registrar visita',
    difficulty: 'Dificultad',
    easy: 'Fácil',
    moderate: 'Moderado',
    hard: 'Difícil',
    municipality: 'Municipio',
    emptyWishlist: 'Tu lista de deseos está vacía. Toca el corazón en un lugar para guardarlo aquí.',
    emptyJournal: '¡Aún no has registrado aventuras. Visita un lugar y regístralo!',
    signIn: 'Iniciar sesión',
    signUp: 'Crear cuenta',
    signOut: 'Cerrar sesión',
    email: 'Correo electrónico',
    password: 'Contraseña',
    needAccount: '¿No tienes cuenta? Regístrate',
    haveAccount: '¿Ya tienes cuenta? Inicia sesión',
    signInPrompt: 'Inicia sesión para guardar deseos, registrar visitas y añadir fotos.',
    checkEmail: 'Revisa tu correo para confirmar tu cuenta y luego inicia sesión.',
    visitedOn: 'Fecha de la visita',
    notes: 'Notas',
    rating: 'Calificación',
    photos: 'Fotos',
    addPhotos: 'Añadir fotos',
    save: 'Guardar',
    saving: 'Guardando…',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    edit: 'Editar',
    confirmDelete: '¿Eliminar esta entrada y sus fotos?',
    language: 'Idioma',
    myLocation: 'Mi ubicación',
    locationError: 'No pudimos obtener tu ubicación. Revisa los permisos.',
    kmAway: 'km de distancia',
    visits: 'visitas',
    loading: 'Cargando…',
    notesPlaceholder: '¿Cómo estuvo? Condiciones del camino, consejos, momentos favoritos…',
    places: 'lugares',
    backToMap: 'Volver al mapa',
  },
}

const LanguageContext = createContext(null)

function detectLanguage() {
  const saved = localStorage.getItem('pr-adventures-lang')
  if (saved === 'en' || saved === 'es') return saved
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(detectLanguage)

  const changeLang = useCallback((next) => {
    localStorage.setItem('pr-adventures-lang', next)
    setLang(next)
  }, [])

  const t = useCallback((key) => STRINGS[lang][key] ?? STRINGS.en[key] ?? key, [lang])

  // pick() chooses the right field from a bilingual record, e.g. description_en/description_es
  const pick = useCallback(
    (record, field) => record?.[`${field}_${lang}`] || record?.[`${field}_en`] || '',
    [lang],
  )

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLang, t, pick }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useI18n() {
  return useContext(LanguageContext)
}
