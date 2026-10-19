/**
 * Motor Hápctico para feedback físico nativo en dispositivos móviles.
 * Ignora silenciosamente si el dispositivo no soporta vibración (ej. Desktop iOS o PC).
 */
export const Haptics = {
  // Vibración ligera para interacciones (taps, selecciones)
  light: () => {
    if (typeof window !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  },
  
  // Vibración media para acciones completadas o cambios de estado
  medium: () => {
    if (typeof window !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(30);
    }
  },
  
  // Vibración fuerte para errores
  error: () => {
    if (typeof window !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([50, 100, 50]);
    }
  },

  // Patrón especial de éxito (ej. meta alcanzada)
  success: () => {
    if (typeof window !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([30, 50, 30]);
    }
  }
};
