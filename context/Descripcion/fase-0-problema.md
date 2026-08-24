# Fase 0 — Problema, usuario y alcance

**Estado:** ✅ definida
**Entregable:** one-pager (este documento)

---

## En una frase

> **El ausentismo en las horas médicas.** Los profesionales de la salud pierden una cantidad
> importante de dinero por pacientes que reservan y no asisten.

Cada hora perdida es **ingreso perdido + lista de espera más larga**. Es un dolor conocido y
declarado: los dentistas buscan activamente recordatorios automáticos por WhatsApp, y muchos ya
empiezan a cobrar por anticipado para protegerse.

---

## Qué hace hoy esa persona sin el software

- **Gestiona a mano por WhatsApp**: pregunta, insiste, pide que le avisen si van a asistir.
- **Lleva el registro en Excel o en un bloc de notas.**

Es decir: la solución actual existe, funciona a medias, y **consume tiempo del profesional todos los
días**. No competimos contra "nada"; competimos contra WhatsApp más una planilla.

---

## Por qué duele lo suficiente para pagar o cambiar de hábito

| Dolor | Consecuencia |
|---|---|
| No tiene control del paciente | No sabe con quién puede contar |
| No tiene control de la hora reservada | El hueco se pierde sin aviso |
| El dinero queda en manos del paciente | No hay nada que retenga el compromiso |
| Termina discutiendo con sus pacientes | Los pierde como clientes |

Ese último punto es el más silencioso y el más caro: **el profesional paga el no-show dos veces**,
primero con la hora perdida y después con la relación deteriorada por tener que reclamar.

---

## Usuario

1. **Clínicas pequeñas**
2. **Clínicas de nicho** — potencial cliente
3. **Profesionales de la salud independientes**

---

## Propuesta de valor

**Qué ofrecemos.** Un producto que automatiza el control de las reservas de horas de los
profesionales de la salud: control del paciente mediante porcentaje de asistencia, calificación por
comportamiento histórico, y automatización del control de asistencia para que el profesional **se
desligue de esa tarea** y pierda la menor cantidad de horas posible.

**Qué valor entrega.** Desligarse del problema principal —el no-show— sin tener que perseguir a
nadie.

**Qué nos hace diferentes.** Un producto que ataca **un dolor concreto**, diseñado para automatizar
procesos de pequeñas y medianas consultas, a un precio reducido frente a los sistemas pensados para
clínicas grandes.

---

## Criterio de éxito

1. El usuario **deja de mandar mensajes por WhatsApp** a sus pacientes.
2. Se **desliga de presionar** al paciente para que asista.
3. Tiene un lugar donde **monitorear** el estado de sus consultas y todo lo relativo a sus
   pacientes.

---

## Qué NO hará — límites explícitos

- ❌ **No maneja dinero.** Nada de cobros, pagos, retenciones ni facturación.
- ❌ **No gestiona inventarios.**

---

## Tensiones a resolver

Dos cosas que este mismo documento deja en contradicción. No son errores: son decisiones que
conviene tomar a conciencia en vez de descubrirlas más adelante.

### 1. La palanca más fuerte contra el no-show queda fuera del alcance

El diagnóstico dice que *"dejan el dinero en manos del cliente, en vez de retener un pago hasta que
la persona asista"* y que *"muchos empiezan a cobrar por anticipado"*. Es decir: **el prepago aparece
identificado como parte del dolor y como la respuesta que el mercado ya está adoptando.**

Y el alcance lo excluye explícitamente.

Puede ser la decisión correcta —manejar dinero multiplica la complejidad regulatoria y técnica— pero
conviene que quede escrito que **se está renunciando a la palanca que los propios usuarios ya usan**,
y que la apuesta es que recordatorios y reputación basten sin ella. Es una hipótesis, no un hecho:
[Fase 1](fase-1-validacion.md) debería ponerla a prueba.

### 2. Los criterios de éxito 1 y 2 exigen algo que el MVP no incluye

"Dejar de mandar mensajes por WhatsApp" y "desligarse de presionar al paciente" solo se cumplen si
el sistema **le habla al paciente**: recordatorios automáticos (RF-06) y respuesta del paciente
(RF-07).

Ninguno de los dos está entre las tres piezas del MVP. Ver [Fase 3](fase-3-mvp.md), donde está
desarrollado.

---

**Siguiente:** [Fase 1 — Validación](fase-1-validacion.md)
