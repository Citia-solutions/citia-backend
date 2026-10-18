# La Fase 3 a fondo: el paciente responde desde el correo

> **Qué vas a entender acá:** cómo funciona el enlace que le llega al paciente en el recordatorio, por
> qué se diseñó así, cómo está organizado el código que lo atiende y qué cuidados de seguridad y
> concurrencia tiene. Es la fase más "de sistema" del proyecto hasta ahora, así que sirve también como
> ejemplo de cómo se toman las decisiones aquí.
>
> **Antes conviene leer:** [02 — Cómo está armado](02-como-esta-armado.md) y la sección de la Fase 3
> en [04 — Roadmap y fases](04-roadmap-y-fases.md). Los términos raros están en el
> [glosario](11-glosario.md).

**Estado (2026-10-18):** **en producción desde el 2026-10-17** (release: backend PR #7, frontend PR #8;
antes, merge a `develop` el 2026-10-15 con los PR #6 y #7). Falta cerrarla con la prueba de un correo real
y la del límite de intentos detrás del proxy (abajo, *Lo que queda*).

---

## El problema

Hasta la Fase 2, el paciente recibía un correo que solo le recordaba la hora: "Tienes hora el martes a
las 10:30". Si no podía ir, tenía que llamar o escribirle al profesional. Lo que queríamos es que
pudiera **responder desde el mismo correo**: confirmar que va, cancelar o pedir otra hora, sin crear
cuenta ni recordar contraseñas.

## La idea central: un "ticket" por cita

Cada cita tiene su propio enlace, algo como `app.citiahealth.cl/cita#XyZ123...`. Ese código largo del
final (el **token**) funciona como un ticket de cine: sirve para **esa** cita y nada más. Quien lo tiene
puede ver la hora y responder, pero no puede ver otras citas, ni datos del paciente, ni nada de la
clínica.

### ¿Cómo se fabrica el token?

No es un número al azar. Se calcula con una **clave secreta** que solo conoce el servidor
(`ENLACE_CITA_CLAVE`), mezclada con el id de la cita y una "versión". A eso se le llama **HMAC**: es
como una firma que solo el servidor sabe hacer.

¿Por qué no uno al azar y listo? Por dos detalles que salieron de mirar el código real de la Fase 2:

1. Cada cita recibe **2 o 3 correos** (24 h antes, 2 h antes…). Si cada correo trajera un token nuevo,
   el del primer correo dejaría de funcionar y el paciente abriría un enlace roto.
2. Si el envío falla, **se reintenta**, y Resend (el servicio de correo) exige que el reintento sea
   **idéntico** al original; si no, lo rechaza.

Como el token se puede **recalcular**, siempre sale el mismo: mismo enlace en todos los correos y en
todos los reintentos.

### ¿Y en la base de datos qué se guarda?

Solo el **hash** del token (tabla `enlaces_cita`), igual que se hace con las contraseñas. Si alguien se
roba la base, no puede armar enlaces que funcionen.

### ¿Por qué va después del `#`?

Lo que va después del `#` el navegador **no lo manda al servidor**, no queda en logs y no se filtra a
otros sitios. La página lo lee, lo borra de la barra de direcciones y se lo manda a la API en una
cabecera especial (`X-Enlace-Cita`).

## Qué puede hacer el paciente

- **Confirmar:** la cita pasa a "confirmada", y queda anotado en la bitácora que fue **el paciente** y
  con qué enlace.
- **Cancelar:** la cita se cancela, y el profesional ve "Cancelada por el paciente".
- **Pedir otra hora:** el arquitecto puso aquí una regla clave. El paciente **no mueve la cita**: su
  pedido llega a la **bandeja de solicitudes** como cualquier otra solicitud, así el dashboard del
  profesional no lo cambia un tercero. El profesional ve "Pide otra hora: jueves en la tarde", elige
  la nueva hora a mano y al aceptar **se mueve la misma cita** (mismo id, mismo historial). Además, el
  mismo enlace sigue sirviendo para la hora nueva.

El profesional, desde el voucher de la cita, puede además **invalidar el enlace** (por ejemplo, si el
correo del paciente estaba mal). El siguiente recordatorio llevará un enlace nuevo.

## Las reglas de seguridad, explicadas

- **Siempre el mismo error.** Si el enlace no sirve, por la razón que sea (no existe, está invalidado,
  la cita ya terminó, ya pasó la hora…), la respuesta es **exactamente la misma**: "Enlace no válido o
  vencido". Así un curioso no puede ir probando y aprendiendo algo de cada error.
- **Nada después de la hora de inicio.** Si alguien no fue a su cita, no puede entrar después y
  cancelarla para "limpiar" su historial. Ese historial es la base del futuro scoring de pacientes.
- **Abrir la página no hace nada.** Gmail y Outlook abren los enlaces de los correos para revisar que
  no sean peligrosos. Si confirmar fuera un simple clic al enlace, **el antivirus confirmaría las citas
  solo**. Por eso toda acción exige apretar un botón.
- **Lo mínimo a la vista.** La página muestra fecha, hora, profesional y organización. Nunca el nombre
  del paciente, su RUT, su contacto ni el tipo de consulta (que podría revelar un diagnóstico): un
  enlace se puede reenviar, así que se trata como si lo fuera a leer un tercero.
- **Límite de intentos (rate limit).** Nadie puede martillar el servidor: máximo 30 consultas por
  minuto desde una misma IP en la página del paciente y 5 acciones por hora por enlace. Aprovechamos
  para proteger también el login (5 por minuto) y el registro, que antes no tenían límite.
- **`trust proxy`.** En Railway todas las peticiones pasan por un intermediario. Sin esta configuración
  el servidor creería que todos vienen de la misma IP, y el límite bloquearía a todo el mundo a la vez.

## Cómo está organizado el código

El backend está dividido en módulos, como departamentos de una empresa:

```
  recordatorio     → manda los correos (ahora con el botón "Ver o responder mi hora")
  cita             → la cita, sus estados, su bitácora y su enlace
  solicitud        → la bandeja de pedidos
  portal-paciente  → (nuevo) la "ventanilla" pública del paciente
```

El módulo nuevo, `portal-paciente`, hace de **mesero**: recibe al paciente, le pide la cita a `cita` y
el pedido de otra hora a `solicitud`. ¿Por qué no lo hace `cita` directamente? Porque `cita` no debe
depender de `solicitud`. Si se conocieran mutuamente tendrías un enredo circular difícil de mantener.

¿Y cómo se entera la bandeja de que una cita se canceló, para descartar el pedido pendiente? Con
**eventos**: `cita` deja un aviso en un buzón ("se canceló la cita X") y `solicitud` lo lee y actúa.
Ninguno llama directamente al otro. A ese buzón se le llama **outbox** (viene de la Fase 2, ADR-12).
Si el profesional reagenda la cita desde el voucher, el mismo mecanismo da el pedido por atendido.

## El detalle fino: dos personas tocando la misma cita

¿Qué pasa si el paciente cancela justo en el mismo segundo en que el profesional la está reagendando?
Para eso **bloqueamos la fila** de la cita en la base de datos mientras alguien la modifica: el segundo
espera su turno y después ve el cambio del primero. Regla de oro: **siempre se bloquea la cita
primero**, así nadie queda esperando al otro en círculo.

Usamos un tipo de bloqueo más suave (`FOR NO KEY UPDATE`) porque el normal (`FOR UPDATE`) se trababa
con el envío de correos y dejaba esperando a otras operaciones hasta 10 segundos. Esto se probó con
dos conexiones reales a Postgres peleándose por la misma cita.

## Quién hizo qué

Antes, la bitácora de cambios de una cita siempre decía "lo hizo el profesional". Ahora distingue entre
**profesional, paciente y sistema** (el "actor"). Eso permite mostrar "Confirmada por el paciente" y,
más adelante, calcular qué pacientes cumplen.

Con eso también quedó escrita la regla de **ghosting** (no avisó y no vino), aunque el proceso que la
aplica se construye en la Fase 5: solo cuenta como ghosting si al paciente le llegó un recordatorio
con el enlace, ya terminó el día de la cita y no tenía un pedido de otra hora pendiente.

## Cómo se construyó

1. **Primero se decidió, después se programó.** El desarrollador planteó las preguntas de diseño con
   sus opciones, el arquitecto eligió, y quedó escrito en el [ADR-10](../Decisions/ADR-10.md).
2. **El trabajo se repartió por capas** entre agentes especializados (base de datos, infraestructura,
   API, frontend y tests). Todos trabajaban contra el mismo "contrato" escrito, así nadie inventaba
   nombres distintos.
3. **Se probó mucho:** unos 1.700 tests unitarios, 287 de punta a punta y 139 de integración con
   Postgres real.
4. **Se probó de verdad:** con backend, frontend y Postgres levantados, usando la página como lo haría
   un paciente. Ahí apareció un bug que ningún test había visto: si la página estaba abierta y llegaba
   otro enlace en la misma pestaña, seguía usando el ticket anterior. Se corrigió.
5. **Commits ordenados por capa** y PRs a `develop`.
6. **Release a producción** el 2026-10-17: primero el backend y, solo cuando respondió bien, el
   frontend.

## Qué pasa si falta la clave

Al desplegar, si `ENLACE_CITA_CLAVE` no está cargada, el backend **se niega a arrancar** con el error
`ENLACE_CITA_CLAVE: es obligatoria en producción`. Es a propósito: es mejor no arrancar que funcionar
con una clave insegura. Se genera con
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` y se carga en las
variables de Railway; **una distinta por entorno** (staging y production), y distinta de `JWT_SECRET`.

**Y pasó de verdad.** En el release del 2026-10-17 la clave no le llegó al contenedor de production: el
backend se quedó reiniciándose con ese error y la aplicación estuvo caída unos **9 minutos**, hasta que se
cargó bien en Railway. No se perdieron datos (las migraciones ya habían corrido y son compatibles con el
código anterior), y como el frontend se publicó después, nadie vio una página a medias. Railway marcó el
despliegue como exitoso igual: por eso, tras cada release, hay que mirar que la app responda, no el estado
del despliegue ([incidente](../Fases/fase-3-us04-respuesta-paciente.md#incidente-production-caído-9-minutos)).

## Lo que queda

- ~~Cargar la clave en cada entorno y hacer el release a producción.~~ Hecho el 2026-10-17.
- Probar con un correo real y comprobar que el escáner de Gmail no confirme nada solo.
- Comprobar en production que el límite de intentos ve la IP real de cada persona y no la del proxy de
  Railway (`trust proxy`). Con eso se cierra [DT-18](../Deudas/DT-18.md).
- La **fecha de corte** quedó anotada: el **2026-10-17**. Desde ahí empieza a contar el historial de "no
  avisó y no vino" ([DT-11](../Deudas/DT-11.md)).

## Lecciones para llevarse

- **Diseña antes de programar**, sobre todo cuando hay seguridad de por medio.
- **Mira el código real antes de diseñar:** el problema de los reintentos y los varios correos salió de
  ahí, no de la teoría.
- **No des pistas en los errores.**
- **Piensa en lo que pasa cuando se reintenta algo** (idempotencia).
- **Separa responsabilidades** para que los módulos no se enreden.
- **Los tests no reemplazan probarlo de verdad:** el bug del enlace solo apareció usándolo.
- **Una variable se confirma donde la usa el programa:** en los logs del despliegue, no en el panel donde
  se escribe.

## Para profundizar

- [ADR-10](../Decisions/ADR-10.md): la decisión completa, con sus opciones y notas de implementación.
- [Plan de US-04](../US/04-respuesta-paciente.md): decisiones y Definición de Terminado.
- [Feature us04](../Features/us04-respuesta-paciente.md): endpoints, esquema, flujos y desviaciones.
- [Guía de la Fase 3](../Fases/fase-3-us04-respuesta-paciente.md): checklist de salida a producción.
- Deudas que nacieron aquí: [DT-42](../Deudas/DT-42.md) a [DT-46](../Deudas/DT-46.md).
