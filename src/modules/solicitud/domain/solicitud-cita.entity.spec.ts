import {
  EstadoSolicitud,
  RecibirSolicitudProps,
  SolicitudCita,
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
      });

      expect(solicitud.id).toBe('solicitud-1');
      expect(solicitud.estado).toBe(EstadoSolicitud.ACEPTADA);
      expect(solicitud.esTerminal()).toBe(true);
    });
  });
});
