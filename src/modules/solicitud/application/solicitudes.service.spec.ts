import { RutInvalidoError } from '../../../shared/domain/rut-invalido.error';
import {
  EstadoSolicitud,
  SolicitudCita,
} from '../domain/solicitud-cita.entity';
import { CrearSolicitudDto } from '../presentation/dto/crear-solicitud.dto';
import { SolicitudesService } from './solicitudes.service';

describe('SolicitudesService', () => {
  let service: SolicitudesService;
  let mockSolicitudRepository: {
    guardar: jest.Mock;
    buscarAbiertaPorRut: jest.Mock;
  };
  let mockTenantRepository: {
    guardar: jest.Mock;
    findById: jest.Mock;
    findBySlug: jest.Mock;
  };

  const SLUG = 'clinica-demo';
  const TENANT = { id: 'tenant-1', nombre: 'Clínica Demo', slug: SLUG };
  const VENTANA_HORAS = 72;

  const dto: CrearSolicitudDto = {
    rut: '12.345.678-5',
    nombrePaciente: '  Ana Soto  ',
    telefono: ' +56 9 1111 1111 ',
    correo: 'ana@mail.com',
    motivo: 'Dolor de muela',
    preferenciaHoraria: 'mañanas',
    consentimiento: true,
  };

  beforeEach(() => {
    mockSolicitudRepository = {
      guardar: jest.fn().mockResolvedValue(undefined),
      buscarAbiertaPorRut: jest.fn().mockResolvedValue(null),
    };
    mockTenantRepository = {
      guardar: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn().mockResolvedValue(TENANT),
    };

    service = new SolicitudesService(
      mockSolicitudRepository,
      mockTenantRepository,
      VENTANA_HORAS,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const primeraGuardada = (): SolicitudCita =>
    (
      mockSolicitudRepository.guardar.mock.calls as unknown as SolicitudCita[][]
    )[0][0];

  describe('recibir', () => {
    it('debería guardar la solicitud en estado RECIBIDA, con el RUT canónico', async () => {
      // Act
      await service.recibir(SLUG, dto);

      // Assert
      const solicitud = primeraGuardada();
      expect(solicitud).toBeInstanceOf(SolicitudCita);
      expect(solicitud.estado).toBe(EstadoSolicitud.RECIBIDA);
      expect(solicitud.rut).toBe('123456785');
      expect(solicitud.tenantId).toBe(TENANT.id);
    });

    it('debería recortar los espacios de los datos que escribió el paciente', async () => {
      // Act
      await service.recibir(SLUG, dto);

      // Assert
      const solicitud = primeraGuardada();
      expect(solicitud.nombrePaciente).toBe('Ana Soto');
      expect(solicitud.telefono).toBe('+56 9 1111 1111');
    });

    it('NO debería asignar profesional ni cita al recibirla', async () => {
      // Act
      await service.recibir(SLUG, dto);

      // Assert — el enlace es de la organización; el dueño se define al aceptar
      expect(primeraGuardada().usuarioId).toBeNull();
      expect(primeraGuardada().citaId).toBeNull();
    });

    it('debería descartar en SILENCIO si la organización no existe', async () => {
      // Arrange — un slug inventado
      mockTenantRepository.findBySlug.mockResolvedValue(null);

      // Act & Assert — no lanza: responder distinto permitiría enumerar clientes
      await expect(service.recibir('no-existe', dto)).resolves.toBeUndefined();
      expect(mockSolicitudRepository.guardar).not.toHaveBeenCalled();
    });

    it('debería descartar en SILENCIO si ese RUT ya tiene una solicitud abierta', async () => {
      // Arrange
      mockSolicitudRepository.buscarAbiertaPorRut.mockResolvedValue(
        SolicitudCita.recibir({
          tenantId: TENANT.id,
          rut: '123456785',
          nombrePaciente: 'Ana Soto',
          telefono: '+56 9 1111 1111',
          correo: 'ana@mail.com',
          motivo: 'Ya pedí hora',
          preferenciaHoraria: 'tardes',
          consentimiento: true,
        }),
      );

      // Act & Assert — silencio: si respondiera distinto se podría sondear qué
      // RUT es paciente de qué profesional
      await expect(service.recibir(SLUG, dto)).resolves.toBeUndefined();
      expect(mockSolicitudRepository.guardar).not.toHaveBeenCalled();
    });

    it('debería acotar la búsqueda de duplicados a la ventana configurada', async () => {
      // Act
      const antes = Date.now();
      await service.recibir(SLUG, dto);
      const despues = Date.now();

      // Assert — el `desde` cae dentro de [ahora - ventana, ahora - ventana]
      const [rut, tenantId, desde] = mockSolicitudRepository.buscarAbiertaPorRut
        .mock.calls[0] as [string, string, Date];
      expect(rut).toBe('123456785');
      expect(tenantId).toBe(TENANT.id);

      const ventanaMs = VENTANA_HORAS * 60 * 60 * 1000;
      expect(desde.getTime()).toBeGreaterThanOrEqual(antes - ventanaMs);
      expect(desde.getTime()).toBeLessThanOrEqual(despues - ventanaMs);
    });

    it('debería rechazar un RUT con dígito verificador incorrecto sin tocar nada', async () => {
      // Act & Assert — este error SÍ se revela: habla del dato que escribió el
      // usuario, no de qué existe en el sistema
      await expect(
        service.recibir(SLUG, { ...dto, rut: '12.345.678-9' }),
      ).rejects.toBeInstanceOf(RutInvalidoError);

      expect(mockTenantRepository.findBySlug).not.toHaveBeenCalled();
      expect(mockSolicitudRepository.guardar).not.toHaveBeenCalled();
    });
  });
});
