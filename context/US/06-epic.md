## Descripción 

- Como profesional de la salud quiero ver un layout con mis citas del día para prepararme para cada atención.

- Al iniciar sesión, el dashboard carga en <2s

- Muestra solo las citas del día actual del profesional logueado

- Cada cita muestra: paciente, hora, duración estimada, tipo de consulta, estado (confirmada/pendiente)

- Orden cronológico ascendente

- Las citas pasadas se marcan visualmente (gris/tachado)

- Clic en una cita → detalle con opciones de reagendar/cancelar

## To Do

> Prerequisito: US-00a (registro inicial) y US-00b (login JWT) deben estar completos antes de implementar este dashboard.

- [ ] Endpoint GET /citas/hoy — devuelve citas del día del profesional autenticado (requiere auth)
- [ ] Ordenar cronológicamente, marcar citas pasadas
- [ ] Endpoint GET /citas/:id — detalle de una cita con opciones reagendar/cancelar


