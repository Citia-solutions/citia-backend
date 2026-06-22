- RNF-01: Un cambio de cita (crear/reagendar/cancelar) debe reflejarse en el calendario y el dashboard del usuario en menos de 3 segundos, para una carga de hasta 20 profesionales concurrentes. 
    
- RNF-02: Seguridad/Privacidad: cifrado en tránsito (TLS) y en reposo; cada profesional solo accede a SUS datos; consentimiento del paciente para recibir mensajes.
    
- RNF-03: Confiabilidad de notificaciones: el sistema debe entregar ≥99% de los recordatorios programados, con reintento automático ante fallo y registro de entrega. (Si el recordatorio no llega, no tienes producto.)
    
- RNF-04: Disponibilidad: ≥99.5% de uptime en horario de atención (define el rango, ej. L-V 8–20h).
    
- RNF-05: Rendimiento: cargas de dashboard/calendario en <2s (tú defines el umbral real).
    
- RNF-06: Escalabilidad: soportar N profesionales con M citas/día sin degradarse.
    
- RNF-07: Usabilidad: un profesional sin perfil técnico agenda/reagenda en ≤3 pasos sin capacitación.
    
- RNF-08: Observabilidad: logs y alertas para detectar recordatorios fallidos (sin esto, te enteras del bug por el cliente enojado).
    
- RNF-09: Compatibilidad: sincronización con Google Calendar / Outlook (liga con tu RF-02).