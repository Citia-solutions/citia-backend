import { randomUUID } from 'node:crypto';

import { ContadorTransacciones } from '../../../../test/support/in-memory-repositories';
import { BitacoraEnMemoria } from '../../../../test/support/mensajeria-falsa';
import {
  RecordatorioRepositoryEnMemoria,
  SupresionCorreoRepositoryEnMemoria,
} from '../../../../test/support/recordatorios-en-memoria';
import { calcularHashCorreo } from '../domain/hash-correo';
import {
  EstadoRecordatorio,
  MotivoRecordatorio,
} from '../domain/recordatorio.entity';
import {
  DatosRecordatorio,
  TipoEventoEntrega,
} from '../domain/recordatorio.repository';
import { MotivoSupresion } from '../domain/supresion-correo.repository';
import {
  EventoEntregaRecibido,
  ProcesarWebhookEntregaService,
} from './procesar-webhook-entrega.service';

const AHORA = new Date('2026-10-10T15:00:00Z');
const OCURRIDO = new Date('2026-10-10T15:00:05Z');
const CORREO = 'Paciente@Correo.cl';

describe('ProcesarWebhookEntregaService (ADR-13 §9.4, §10)', () => {
  let transacciones: ContadorTransacciones;
  let recordatorios: RecordatorioRepositoryEnMemoria;
  let supresiones: SupresionCorreoRepositoryEnMemoria;
  let bitacora: BitacoraEnMemoria;
  let servicio: ProcesarWebhookEntregaService;
  let enviado: DatosRecordatorio;
  const tenantId = randomUUID();

  const evento = (
    tipo: TipoEventoEntrega,
    extra: Partial<EventoEntregaRecibido> = {},
  ): EventoEntregaRecibido => ({
    tipo,
    proveedor: 'resend',
    recordatorioId: enviado.id,
    proveedorMensajeId: 're_1',
    ocurridoEn: OCURRIDO,
    destinatarios: [CORREO],
    ...extra,
  });

  const fila = (): DatosRecordatorio =>
    recordatorios.buscar(enviado.id) as DatosRecordatorio;

  beforeEach(() => {
    transacciones = new ContadorTransacciones();
    recordatorios = new RecordatorioRepositoryEnMemoria(() => AHORA);
    supresiones = new SupresionCorreoRepositoryEnMemoria();
    bitacora = new BitacoraEnMemoria();
    servicio = new ProcesarWebhookEntregaService(
      transacciones,
      recordatorios,
      supresiones,
      bitacora,
    );
    enviado = recordatorios.sembrar({
      tenantId,
      citaId: randomUUID(),
      antelacionMin: 120,
      inicioCita: new Date('2026-10-10T17:00:00Z'),
      programadoPara: new Date('2026-10-10T14:59:00Z'),
      estado: EstadoRecordatorio.ENVIADO,
      enviadoEn: new Date('2026-10-10T15:00:00Z'),
      proveedor: 'resend',
      proveedorMensajeId: 're_1',
      intentos: 1,
    });
  });

  it('delivered → entregado, en UNA transacción, deduciendo el tenant de la fila', async () => {
    // Act
    const resultado = await servicio.procesar(
      evento(TipoEventoEntrega.ENTREGADO),
    );

    // Assert
    expect(resultado).toEqual({
      resultado: 'aplicado',
      recordatorioId: enviado.id,
      tenantId,
      estado: EstadoRecordatorio.ENTREGADO,
      supresionesAgregadas: 0,
    });
    expect(fila().entregadoEn).toEqual(OCURRIDO);
    expect(transacciones.abiertas).toBe(1);
    expect(supresiones.supresiones.size).toBe(0);
  });

  it('evento repetido → sin cambios', async () => {
    // Arrange
    await servicio.procesar(evento(TipoEventoEntrega.ENTREGADO));
    const antes = fila();

    // Act
    const resultado = await servicio.procesar(
      evento(TipoEventoEntrega.ENTREGADO, {
        ocurridoEn: new Date('2026-10-10T16:00:00Z'),
      }),
    );

    // Assert
    expect(resultado).toMatchObject({ resultado: 'sin_cambios' });
    expect(fila()).toEqual(antes);
  });

  it('id desconocido → se ignora, sin supresión', async () => {
    // Act
    const resultado = await servicio.procesar(
      evento(TipoEventoEntrega.REBOTADO, {
        recordatorioId: randomUUID(),
        proveedorMensajeId: 're_otro',
      }),
    );

    // Assert
    expect(resultado).toEqual({ resultado: 'desconocido' });
    expect(supresiones.supresiones.size).toBe(0);
    expect(bitacora.de('recordatorios.webhook_desconocido')).toHaveLength(1);
  });

  it('sin etiqueta, se encuentra por el id del proveedor', async () => {
    // Act
    const resultado = await servicio.procesar(
      evento(TipoEventoEntrega.ENTREGADO, { recordatorioId: null }),
    );

    // Assert
    expect(resultado).toMatchObject({ resultado: 'aplicado' });
  });

  it('rebote permanente → fallido (rebote) y supresión por HASH del correo normalizado', async () => {
    // Act
    const resultado = await servicio.procesar(
      evento(TipoEventoEntrega.REBOTADO, {
        motivoSupresion: MotivoSupresion.REBOTE,
      }),
    );

    // Assert
    expect(fila()).toMatchObject({
      estado: EstadoRecordatorio.FALLIDO,
      motivo: MotivoRecordatorio.REBOTE,
    });
    expect(resultado).toMatchObject({ supresionesAgregadas: 1 });
    const hash = calcularHashCorreo('paciente@correo.cl');
    expect(supresiones.supresiones.get(hash)).toMatchObject({
      correoHash: hash,
      motivo: MotivoSupresion.REBOTE,
      origenRecordatorioId: enviado.id,
    });
    expect([...supresiones.supresiones.keys()].join()).not.toContain('@');
  });

  it('queja → fija queja_en, el estado no cambia, y supresión (queja)', async () => {
    // Arrange
    await servicio.procesar(evento(TipoEventoEntrega.ENTREGADO));

    // Act
    await servicio.procesar(evento(TipoEventoEntrega.QUEJA));

    // Assert
    expect(fila()).toMatchObject({
      estado: EstadoRecordatorio.ENTREGADO,
      quejaEn: OCURRIDO,
    });
    expect(
      supresiones.supresiones.get(calcularHashCorreo(CORREO))?.motivo,
    ).toBe(MotivoSupresion.QUEJA);
  });

  it('un rebote repetido no agrega otra supresión ni cambia la fila', async () => {
    // Arrange
    await servicio.procesar(evento(TipoEventoEntrega.REBOTADO));
    const antes = fila();

    // Act
    const resultado = await servicio.procesar(
      evento(TipoEventoEntrega.REBOTADO),
    );

    // Assert
    expect(resultado).toMatchObject({
      resultado: 'sin_cambios',
      supresionesAgregadas: 0,
    });
    expect(fila()).toEqual(antes);
    expect(supresiones.supresiones.size).toBe(1);
  });

  it('failed → fallido (rechazado), sin supresión', async () => {
    // Act
    await servicio.procesar(evento(TipoEventoEntrega.RECHAZADO));

    // Assert
    expect(fila().motivo).toBe(MotivoRecordatorio.RECHAZADO);
    expect(supresiones.supresiones.size).toBe(0);
  });

  it('no registra el correo en los logs', async () => {
    // Act
    await servicio.procesar(evento(TipoEventoEntrega.REBOTADO));

    // Assert
    expect(bitacora.comoTexto().toLowerCase()).not.toContain(
      'paciente@correo.cl',
    );
  });
});
