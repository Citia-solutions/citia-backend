import {
  EstadoSolicitud,
  PedirOtraHoraProps,
  RecibirSolicitudProps,
  SolicitudCita,
  TipoSolicitud,
} from './solicitud-cita.entity';
import { TransicionSolicitudInvalidaError } from './transicion-solicitud-invalida.error';

describe('SolicitudCita (dominio)', () => {
  const props: RecibirSolicitudProps = {
    tenantId: 'tenant-1',
    rut: '123456785',
    nombrePaciente: 'Ana Soto',
    telefono: '+56 9 1111 1111',
    correo: 'ana@mail.com',
    motivo: 'Dolor de muela',
    preferenciaHoraria: 'mañanas',
    consentimiento: true,
  };

  describe('recibir', () => {
    it('nace RECIBIDA, sin profesional y sin cita', () => {
      const solicitud = SolicitudCita.recibir(props);

      expect(solicitud.estado).toBe(EstadoSolicitud.RECIBIDA);
      expect(solicitud.usuarioId).toBeNull();
      expect(solicitud.citaId).toBeNull();
      expect(solicitud.esTerminal()).toBe(false);
    });

    it('no permite fijar el estado desde fuera', () => {
      const solicitud = SolicitudCita.recibir(props);

      // `estado` es solo lectura: la única forma de moverlo es aceptar/rechazar.
      expect(
        Object.getOwnPropertyDescriptor(solicitud, 'estado'),
      ).toBeUndefined();
    });
  });

  describe('aceptar', () => {
    it('pasa a ACEPTADA registrando quién la aceptó y con qué cita', () => {
      const solicitud = SolicitudCita.recibir(props);

      solicitud.aceptar('usuario-1', 'cita-1');

      expect(solicitud.estado).toBe(EstadoSolicitud.ACEPTADA);
      expect(solicitud.usuarioId).toBe('usuario-1');
      expect(solicitud.citaId).toBe('cita-1');
      expect(solicitud.esTerminal()).toBe(true);
    });

    it('rechaza aceptar dos veces: generaría dos citas', () => {
      const solicitud = SolicitudCita.recibir(props);
      solicitud.aceptar('usuario-1', 'cita-1');

      expect(() => solicitud.aceptar('usuario-2', 'cita-2')).toThrow(
        TransicionSolicitudInvalidaError,
      );
      // La primera aceptación queda intacta.
      expect(solicitud.citaId).toBe('cita-1');
    });

    it('rechaza aceptar una solicitud ya rechazada', () => {
      const solicitud = SolicitudCita.recibir(props);
      solicitud.rechazar('usuario-1');

      expect(() => solicitud.aceptar('usuario-1', 'cita-1')).toThrow(
        TransicionSolicitudInvalidaError,
      );
    });
  });

  describe('rechazar', () => {
    it('pasa a RECHAZADA sin generar cita', () => {
      const solicitud = SolicitudCita.recibir(props);

      solicitud.rechazar('usuario-1');

      expect(solicitud.estado).toBe(EstadoSolicitud.RECHAZADA);
      expect(solicitud.citaId).toBeNull();
      expect(solicitud.esTerminal()).toBe(true);
    });

    it('rechaza rechazar una solicitud ya resuelta', () => {
      const solicitud = SolicitudCita.recibir(props);
      solicitud.aceptar('usuario-1', 'cita-1');

      expect(() => solicitud.rechazar('usuario-1')).toThrow(
        TransicionSolicitudInvalidaError,
      );
    });
  });

  describe('reconstituir', () => {
    it('repuebla el estado ya materializado sin pasar por las validaciones', () => {
      const solicitud = SolicitudCita.reconstituir({
        ...props,
        id: 'solicitud-1',
        usuarioId: 'usuario-1',
        estado: EstadoSolicitud.ACEPTADA,
        citaId: 'cita-1',
        recibidaEn: new Date('2026-08-24T12:00:00Z'),
        resueltaEn: new Date('2026-08-25T09:00:00Z'),
      });

      expect(solicitud.id).toBe('solicitud-1');
      expect(solicitud.estado).toBe(EstadoSolicitud.ACEPTADA);
      expect(solicitud.esTerminal()).toBe(true);
      expect(solicitud.resueltaEn?.toISOString()).toBe(
        '2026-08-25T09:00:00.000Z',
      );
    });
  });

  describe('resueltaEn y asegurarResolvible', () => {
    it('nace sin resueltaEn', () => {
      expect(SolicitudCita.recibir(props).resueltaEn).toBeNull();
    });

    it('aceptar y rechazar fijan resueltaEn', () => {
      const ahora = new Date('2026-09-25T15:40:00Z');
      const aceptada = SolicitudCita.recibir(props);
      aceptada.aceptar('usuario-1', 'cita-1', ahora);
      expect(aceptada.resueltaEn).toBe(ahora);

      // Sin `ahora` explícito, usa el reloj del sistema.
      const rechazada = SolicitudCita.recibir(props);
      rechazada.rechazar('usuario-1');
      expect(rechazada.resueltaEn).toBeInstanceOf(Date);
    });

    it('asegurarResolvible deja pasar una recibida y rechaza una resuelta', () => {
      const solicitud = SolicitudCita.recibir(props);
      expect(() => solicitud.asegurarResolvible('aceptar')).not.toThrow();

      solicitud.rechazar('usuario-1');
      expect(() => solicitud.asegurarResolvible('aceptar')).toThrow(
        'Transición inválida: no se puede aplicar "aceptar" a una solicitud "rechazada"',
      );
    });
  });

  describe('tipo (Fase 3)', () => {
    it('recibir nace NUEVA, sin cita de origen ni enlace', () => {
      const solicitud = SolicitudCita.recibir(props);

      expect(solicitud.tipo).toBe(TipoSolicitud.NUEVA);
      expect(solicitud.esReagendamiento()).toBe(false);
      expect(solicitud.citaOrigenId).toBeNull();
      expect(solicitud.enlaceId).toBeNull();
    });

    it('reconstituir sin tipo lo deja como NUEVA (filas anteriores a la Fase 3)', () => {
      const solicitud = SolicitudCita.reconstituir({
        ...props,
        id: 'solicitud-1',
        usuarioId: null,
        estado: EstadoSolicitud.RECIBIDA,
        citaId: null,
        recibidaEn: new Date('2026-08-24T12:00:00Z'),
        resueltaEn: null,
      });

      expect(solicitud.tipo).toBe(TipoSolicitud.NUEVA);
      expect(solicitud.citaOrigenId).toBeNull();
      expect(solicitud.enlaceId).toBeNull();
    });

    it('reconstituir conserva un reagendamiento con RUT y correo nulos', () => {
      const solicitud = SolicitudCita.reconstituir({
        ...props,
        rut: null,
        correo: null,
        id: 'solicitud-1',
        usuarioId: 'usuario-1',
        estado: EstadoSolicitud.RECIBIDA,
        citaId: null,
        recibidaEn: new Date('2026-08-24T12:00:00Z'),
        resueltaEn: null,
        tipo: TipoSolicitud.REAGENDAMIENTO,
        citaOrigenId: 'cita-origen',
        enlaceId: 'enlace-1',
      });

      expect(solicitud.esReagendamiento()).toBe(true);
      expect(solicitud.rut).toBeNull();
      expect(solicitud.correo).toBeNull();
      expect(solicitud.citaOrigenId).toBe('cita-origen');
      expect(solicitud.enlaceId).toBe('enlace-1');
    });
  });

  describe('pedirOtraHora', () => {
    const otraHora: PedirOtraHoraProps = {
      tenantId: 'tenant-1',
      citaOrigenId: 'cita-origen',
      enlaceId: 'enlace-1',
      usuarioId: 'duenio-cita',
      rut: null,
      nombrePaciente: 'Ana Soto',
      telefono: '+56 9 1111 1111',
      correo: 'ana@mail.com',
      consentimiento: true,
      preferenciaHoraria: 'martes en la tarde',
      motivo: 'Me cambiaron el turno',
    };

    it('nace RECIBIDA, de REAGENDAMIENTO, asignada al dueño de la cita y sin cita generada', () => {
      const solicitud = SolicitudCita.pedirOtraHora(otraHora);

      expect(solicitud.estado).toBe(EstadoSolicitud.RECIBIDA);
      expect(solicitud.tipo).toBe(TipoSolicitud.REAGENDAMIENTO);
      expect(solicitud.esReagendamiento()).toBe(true);
      expect(solicitud.usuarioId).toBe('duenio-cita');
      expect(solicitud.citaOrigenId).toBe('cita-origen');
      expect(solicitud.enlaceId).toBe('enlace-1');
      expect(solicitud.citaId).toBeNull();
      expect(solicitud.resueltaEn).toBeNull();
      expect(solicitud.esTerminal()).toBe(false);
    });

    it('copia los datos del paciente tal cual, incluido un RUT nulo', () => {
      const solicitud = SolicitudCita.pedirOtraHora(otraHora);

      expect(solicitud).toMatchObject({
        tenantId: 'tenant-1',
        rut: null,
        nombrePaciente: 'Ana Soto',
        telefono: '+56 9 1111 1111',
        correo: 'ana@mail.com',
        consentimiento: true,
        preferenciaHoraria: 'martes en la tarde',
        motivo: 'Me cambiaron el turno',
      });
    });

    it.each([undefined, null])(
      'sin motivo (%p) lo guarda como cadena vacía (columna NOT NULL)',
      (motivo) => {
        const solicitud = SolicitudCita.pedirOtraHora({ ...otraHora, motivo });

        expect(solicitud.motivo).toBe('');
      },
    );

    it('aceptarla registra la cita de origen como cita', () => {
      const solicitud = SolicitudCita.pedirOtraHora(otraHora);

      solicitud.aceptar('usuario-1', 'cita-origen');

      expect(solicitud.estado).toBe(EstadoSolicitud.ACEPTADA);
      expect(solicitud.citaId).toBe('cita-origen');
    });
  });

  describe('descartar', () => {
    it('pasa de RECIBIDA a DESCARTADA (terminal) con resueltaEn, sin tocar dueño ni cita', () => {
      const solicitud = SolicitudCita.pedirOtraHora({
        tenantId: 'tenant-1',
        citaOrigenId: 'cita-origen',
        enlaceId: 'enlace-1',
        usuarioId: 'duenio-cita',
        rut: '123456785',
        nombrePaciente: 'Ana Soto',
        telefono: '+56 9 1111 1111',
        correo: null,
        consentimiento: true,
        preferenciaHoraria: 'martes',
      });
      const ahora = new Date('2026-10-15T09:00:00Z');

      solicitud.descartar(ahora);

      expect(solicitud.estado).toBe(EstadoSolicitud.DESCARTADA);
      expect(solicitud.esTerminal()).toBe(true);
      expect(solicitud.resueltaEn).toBe(ahora);
      expect(solicitud.usuarioId).toBe('duenio-cita');
      expect(solicitud.citaId).toBeNull();
    });

    it('sin `ahora` explícito usa el reloj del sistema', () => {
      const solicitud = SolicitudCita.recibir(props);

      solicitud.descartar();

      expect(solicitud.resueltaEn).toBeInstanceOf(Date);
    });

    it.each<[string, (s: SolicitudCita) => void]>([
      ['aceptada', (s) => s.aceptar('usuario-1', 'cita-1')],
      ['rechazada', (s) => s.rechazar('usuario-1')],
      ['descartada', (s) => s.descartar()],
    ])('rechaza descartar una solicitud %s', (_estado, resolver) => {
      const solicitud = SolicitudCita.recibir(props);
      resolver(solicitud);

      expect(() => solicitud.descartar()).toThrow(
        TransicionSolicitudInvalidaError,
      );
    });

    it('de una DESCARTADA no se sale: ni aceptar ni rechazar', () => {
      const solicitud = SolicitudCita.recibir(props);
      solicitud.descartar();

      expect(() => solicitud.aceptar('usuario-1', 'cita-1')).toThrow(
        'Transición inválida: no se puede aplicar "aceptar" a una solicitud "descartada"',
      );
      expect(() => solicitud.rechazar('usuario-1')).toThrow(
        TransicionSolicitudInvalidaError,
      );
    });
  });
});
