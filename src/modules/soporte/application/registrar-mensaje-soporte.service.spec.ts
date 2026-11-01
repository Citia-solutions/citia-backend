import {
  MensajesSoporteEnMemoria,
  TransaccionesSoporteEnMemoria,
} from '../../../../test/support/soporte-en-memoria';
import { MensajeSoporteInvalidoError } from '../domain/exceptions/mensaje-soporte-invalido.error';
import { TopeMensajesSoporteError } from '../domain/exceptions/tope-mensajes-soporte.error';
import {
  CategoriaSoporte,
  EstadoEnvioSoporte,
} from '../domain/mensaje-soporte.entity';
import { RegistrarMensajeSoporteService } from './registrar-mensaje-soporte.service';

const TENANT = '7e000000-0000-4000-8000-000000000001';
const OTRO_TENANT = '7e000000-0000-4000-8000-000000000002';
const USUARIO = '0a5e0000-0000-4000-8000-000000000001';
const MIN = 60_000;
const HORA = 60 * MIN;
const AHORA = new Date('2026-10-31T15:00:00.000Z');

describe('RegistrarMensajeSoporteService (POST /api/soporte/mensajes)', () => {
  let transacciones: TransaccionesSoporteEnMemoria;
  let mensajes: MensajesSoporteEnMemoria;
  let servicio: RegistrarMensajeSoporteService;

  const autor = { userId: USUARIO, tenantId: TENANT };

  /** Una fila ya guardada de la organización, creada `haceMs` antes de AHORA. */
  const sembrarHace = (haceMs: number, tenantId = TENANT): string => {
    const creadoEn = new Date(AHORA.getTime() - haceMs);
    return mensajes.sembrar({
      tenantId,
      usuarioId: USUARIO,
      categoria: CategoriaSoporte.OTRO,
      mensaje: 'Anterior',
      estadoEnvio: EstadoEnvioSoporte.ENVIADO,
      intentos: 1,
      proximoIntentoEn: creadoEn,
      ultimoError: null,
      proveedor: 'registro',
      proveedorMensajeId: 'reg_1',
      enviadoEn: creadoEn,
      creadoEn,
    });
  };

  beforeEach(() => {
    transacciones = new TransaccionesSoporteEnMemoria();
    mensajes = new MensajesSoporteEnMemoria(transacciones, () => AHORA);
    servicio = new RegistrarMensajeSoporteService(
      transacciones,
      mensajes,
      () => AHORA,
    );
  });

  it('con 4 en las últimas 24 h, inserta el quinto pendiente y devuelve id y creadoEn', async () => {
    // Arrange
    for (const hace of [MIN, HORA, 12 * HORA, 23 * HORA]) sembrarHace(hace);

    // Act
    const guardado = await servicio.registrar(autor, {
      categoria: CategoriaSoporte.PROBLEMA,
      mensaje: '  No carga la agenda\nde mañana  ',
    });

    // Assert
    expect(guardado.estaGuardado()).toBe(true);
    expect(guardado.creadoEn).toEqual(AHORA);
    const fila = mensajes.leer(guardado.id);
    expect(fila.estadoEnvio).toBe(EstadoEnvioSoporte.PENDIENTE);
    expect(fila.intentos).toBe(0);
    expect(fila.tenantId).toBe(TENANT);
    expect(fila.usuarioId).toBe(USUARIO);
    expect(fila.categoria).toBe(CategoriaSoporte.PROBLEMA);
    expect(fila.mensaje).toBe('No carga la agenda\nde mañana');
    expect(mensajes.filas.size).toBe(5);
    expect(transacciones.confirmadas).toBe(1);
  });

  it('con 5 en las últimas 24 h → TopeMensajesSoporteError, sin insertar', async () => {
    // Arrange
    for (const hace of [MIN, HORA, 2 * HORA, 12 * HORA, 23 * HORA]) {
      sembrarHace(hace);
    }

    // Act
    const intento = servicio.registrar(autor, { mensaje: 'Sexto' });

    // Assert
    await expect(intento).rejects.toBeInstanceOf(TopeMensajesSoporteError);
    await expect(intento).rejects.toThrow(
      'Ya enviaste 5 mensajes a soporte en las últimas 24 horas. Vuelve a intentarlo más tarde.',
    );
    expect(mensajes.filas.size).toBe(5);
    expect(transacciones.revertidas).toBe(1);
  });

  it('cuenta desde ahora − 24 h con el reloj inyectado y solo su organización', async () => {
    // Arrange — 5 viejos (de hace más de 24 h) y 5 de otra organización
    for (let i = 0; i < 5; i++) {
      sembrarHace(24 * HORA + MIN * (i + 1));
      sembrarHace(MIN, OTRO_TENANT);
    }

    // Act
    const guardado = await servicio.registrar(autor, { mensaje: 'Hola' });

    // Assert
    expect(guardado.estaGuardado()).toBe(true);
    expect(mensajes.conteos).toEqual([
      { tenantId: TENANT, desde: new Date(AHORA.getTime() - 24 * HORA) },
    ]);
  });

  it('un mensaje de hace exactamente 24 h todavía cuenta (creado_en >= desde)', async () => {
    // Arrange
    sembrarHace(24 * HORA);
    for (const hace of [MIN, HORA, 2 * HORA, 3 * HORA]) sembrarHace(hace);

    // Act + Assert
    await expect(
      servicio.registrar(autor, { mensaje: 'Sexto' }),
    ).rejects.toBeInstanceOf(TopeMensajesSoporteError);
  });

  it.each([undefined, null])('categoría %s → otro (T12)', async (categoria) => {
    // Act
    const guardado = await servicio.registrar(autor, {
      categoria,
      mensaje: 'Sin categoría',
    });

    // Assert
    expect(mensajes.leer(guardado.id).categoria).toBe(CategoriaSoporte.OTRO);
  });

  it('un texto en blanco → MensajeSoporteInvalidoError sin abrir transacción ni contar', async () => {
    // Act
    const intento = servicio.registrar(autor, { mensaje: '   \n ' });

    // Assert
    await expect(intento).rejects.toBeInstanceOf(MensajeSoporteInvalidoError);
    expect(transacciones.abiertas).toBe(0);
    expect(mensajes.conteos).toEqual([]);
    expect(mensajes.filas.size).toBe(0);
  });

  it('el tenant y el usuario salen del autor (el token), nunca del cuerpo', async () => {
    // Arrange — un cuerpo "con" otro tenant (whitelist lo descarta; aquí,
    // aunque llegara, el servicio no lo mira)
    const cuerpo = {
      mensaje: 'Hola',
      tenantId: OTRO_TENANT,
    } as unknown as { mensaje: string };

    // Act
    const guardado = await servicio.registrar(autor, cuerpo);

    // Assert
    expect(mensajes.leer(guardado.id).tenantId).toBe(TENANT);
  });
});
