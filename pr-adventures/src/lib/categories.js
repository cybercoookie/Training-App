// Category metadata: marker emoji, map pin color, and bilingual labels.
export const CATEGORIES = {
  hike: { emoji: '🥾', color: '#16a34a', en: 'Hikes', es: 'Rutas' },
  beach: { emoji: '🏖️', color: '#0ea5e9', en: 'Beaches', es: 'Playas' },
  waterfall: { emoji: '💧', color: '#06b6d4', en: 'Waterfalls', es: 'Cascadas' },
  cave: { emoji: '🕳️', color: '#a16207', en: 'Caves', es: 'Cuevas' },
  bioluminescent: { emoji: '✨', color: '#7c3aed', en: 'Bio Bays', es: 'Bahías Bio' },
  adventure: { emoji: '🪂', color: '#ea580c', en: 'Adventures', es: 'Aventuras' },
  landmark: { emoji: '🏰', color: '#64748b', en: 'Landmarks', es: 'Monumentos' },
}

export function categoryLabel(key, lang) {
  return CATEGORIES[key]?.[lang] ?? key
}
