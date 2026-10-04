import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { EventoDominio } from '../../../shared/application/publicador-eventos';
import { CambioCita, TipoCambio } from '../domain/cambio-cita.entity';
import {
  Cita,
  DURACION_MAXIMA_MIN,
  ESTADOS_VIGENTES,
  EstadoCita,
} from '../domain/cita.entity';
import { TransicionEstadoInvalidaError } from '../domain/exceptions/transicion-estado-invalida.error';
import { AvisosCitaDto } from '../presentation/dto/avisos-cita.dto';
import { CitaDashboardDto } from '../presentation/dto/cita-dashboard.dto';
import { CitaDetalleDto } from '../presentation/dto/cita-detalle.dto';
import { CitaResponseDto } from '../presentation/dto/cita-response.dto';
import { CrearCitaDto } from '../presentation/dto/crear-cita.dto';
import { PacientesService } from '../../paciente/application/pacientes.service';
import { CitasService, MAX_DIAS_RANGO } from './citas.service';
import { CitaNoEncontradaError } from './cita-no-encontrada.error';
import { DatosPacienteRequeridosError } from './datos-paciente-requeridos.error';
import { PacienteNoEncontradoError } from './paciente-no-encontrado.error';
import { RangoFechasInvalidoError } from './rango-fechas-invalido.error';

describe('CitasService', () => {
  let service: CitasService;
  let mockCitaRepository: {
    guardar: jest.Mock;
    buscarPorId: jest.Mock;
    buscarDelDiaPorProfesional: jest.Mock;
    buscarPorProfesionalEnRango: jest.Mock;
  };
  let mockCambioCitaRepository: {
    registrar: jest.Mock;
    historialDeCita: jest.Mock;
  };
  let mockEventos: { publicar: jest.Mock };
  let mockPacienteRepository: {
    guardar: jest.Mock;
    buscarPorId: jest.Mock;
    buscarPorRut: jest.Mock;
    buscarPorIds: jest.Mock;
  };
  let mockPacientesService: { resolverOCrear: jest.Mock };
  // TransactionRunner de mentira: ejecuta el trabajo con un contexto ficticio,
  // sin transaccion real. Basta para probar el orden de las llamadas.
  let mockTx: { run: jest.Mock };

  const usuarioAutenticado: AuthenticatedUser = {
    userId: 'usuario-1',
    email: 'prof@demo.com',
    tenantId: 'tenant-1',
    rol: RolUsuario.PROFESIONAL,
  };

  beforeEach(() => {
    mockCitaRepository = {
      guardar: jest.fn(),
      buscarPorId: jest.fn(),
      buscarDelDiaPorProfesional: jest.fn(),
      buscarPorProfesionalEnRango: jest.fn().mockResolvedValue([]),
    };
    mockCambioCitaRepository = {
      registrar: jest.fn().mockResolvedValue(undefined),
      historialDeCita: jest.fn().mockResolvedValue([]),
    };
    mockEventos = { publicar: jest.fn().mockResolvedValue(undefined) };
    mockPacienteRepository = {
      guardar: jest.fn(),
      buscarPorId: jest.fn(),
      buscarPorRut: jest.fn(),
      buscarPorIds: jest.fn().mockResolvedValue([]),
    };
    mockPacientesService = { resolverOCrear: jest.fn() };
    mockTx = {
      run: jest.fn((work: (tx: unknown) => Promise<unknown>) => work('tx')),
    };

    service = new CitasService(
      mockCitaRepository,
      mockCambioCitaRepository,
      mockPacienteRepository,
      // PacientesService es una clase concreta: el doble no es estructuralmente
      // compatible, por eso el cast. Solo se usa `resolverOCrear`.
      mockPacientesService as unknown as PacientesService,
      mockTx,
      mockEventos,
      'America/Santiago',
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Extrae, tipada, la Cita pasada al primer `guardar` (evita el `any` de
  // mock.calls). El adaptador real recibe una entidad de dominio Cita.
  const primeraCitaGuardada = (): Cita =>
    (mockCitaRepository.guardar.mock.calls as unknown as Cita[][])[0][0];

  describe('crearCita', () => {
    const dto: CrearCitaDto = {
      inicio: '2026-06-30T10:30:00Z',
      duracionMin: 30,
      tipoConsulta: 'Control',
      pacienteId: 'paciente-1',
    };

    it('debería validar que el paciente pertenece al tenant del usuario autenticado', async () => {
      // Arrange
      mockPacienteRepository.buscarPorId.mockResolvedValue({
        id: 'paciente-1',
        rut: '111111111',
        nombre: 'Ana',
        telefono: '+56 9 1111 1111',
        correo: 'ana@mail.com',
        consentimiento: true,
        tenantId: 'tenant-1',
      });
      mockCitaRepository.guardar.mockImplementation((cita: Cita) => {
        cita.id = 'cita-1';
        return Promise.resolve(cita);
      });

      // Act
      await service.crearCita(dto, usuarioAutenticado);

      // Assert — el tenant sale del token, no del body
      expect(mockPacienteRepository.buscarPorId).toHaveBeenCalledWith(
        dto.pacienteId,
        usuarioAutenticado.tenantId,
        'tx',
      );
    });

    it('debería lanzar PacienteNoEncontradoError cuando el paciente no existe o es de otro tenant', async () => {
      // Arrange — el puerto devuelve null (paciente inexistente en este tenant)
      mockPacienteRepository.buscarPorId.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.crearCita(dto, usuarioAutenticado),
      ).rejects.toBeInstanceOf(PacienteNoEncontradoError);

      // No se debe intentar guardar la cita
      expect(mockCitaRepository.guardar).not.toHaveBeenCalled();
    });

    it('debería crear una cita PENDIENTE con tenantId/usuarioId del token y guardarla (happy path)', async () => {
      // Arrange
      mockPacienteRepository.buscarPorId.mockResolvedValue({
        id: 'paciente-1',
        rut: '111111111',
        nombre: 'Ana',
        telefono: '+56 9 1111 1111',
        correo: 'ana@mail.com',
        consentimiento: true,
        tenantId: 'tenant-1',
      });
      mockCitaRepository.guardar.mockImplementation((cita: Cita) => {
        cita.id = 'cita-1';
        return Promise.resolve(cita);
      });

      // Act
      const result = await service.crearCita(dto, usuarioAutenticado);

      // Assert — se guardó una Cita de dominio con los datos correctos
      expect(mockCitaRepository.guardar).toHaveBeenCalledTimes(1);
      const citaGuardada = primeraCitaGuardada();
      expect(citaGuardada).toBeInstanceOf(Cita);
      expect(citaGuardada.estado).toBe(EstadoCita.PENDIENTE);
      expect(citaGuardada.tenantId).toBe(usuarioAutenticado.tenantId);
      expect(citaGuardada.usuarioId).toBe(usuarioAutenticado.userId);
      expect(citaGuardada.pacienteId).toBe(dto.pacienteId);
      expect(citaGuardada.duracionMin).toBe(dto.duracionMin);
      expect(citaGuardada.tipoConsulta).toBe(dto.tipoConsulta);
      expect(citaGuardada.inicio).toEqual(new Date(dto.inicio));

      // Assert — respuesta DTO
      expect(result).toBeInstanceOf(CitaResponseDto);
      expect(result.id).toBe('cita-1');
      expect(result.estado).toBe(EstadoCita.PENDIENTE);
      expect(result.pacienteId).toBe(dto.pacienteId);
    });

    it('NO debe tomar tenantId/usuarioId del dto — solo del usuario autenticado', async () => {
      // Arrange — el dto no expone tenantId/usuarioId (whitelist), pero forzamos
      // valores maliciosos para probar que se ignoran a nivel de service.
      const dtoMalicioso = {
        ...dto,
        tenantId: 'tenant-ATACANTE',
        usuarioId: 'usuario-ATACANTE',
      } as CrearCitaDto & { tenantId: string; usuarioId: string };

      mockPacienteRepository.buscarPorId.mockResolvedValue({
        id: 'paciente-1',
        rut: '111111111',
        nombre: 'Ana',
        telefono: '+56 9 1111 1111',
        correo: 'ana@mail.com',
        consentimiento: true,
        tenantId: 'tenant-1',
      });
      mockCitaRepository.guardar.mockImplementation((cita: Cita) => {
        cita.id = 'cita-1';
        return Promise.resolve(cita);
      });

      // Act
      await service.crearCita(dtoMalicioso, usuarioAutenticado);

      // Assert — se usan los datos del token, no los del body
      const citaGuardada = primeraCitaGuardada();
      expect(citaGuardada.tenantId).toBe('tenant-1');
      expect(citaGuardada.usuarioId).toBe('usuario-1');
    });

    it('debería resolver-o-crear el paciente cuando llegan sus datos en vez de pacienteId', async () => {
      // Arrange — formulario "nueva cita" con los datos del paciente
      const dtoConPaciente: CrearCitaDto = {
        inicio: '2026-06-30T10:30:00Z',
        duracionMin: 30,
        tipoConsulta: 'Primera consulta',
        paciente: {
          rut: '12.345.678-5',
          nombre: 'Ana Soto',
          telefono: '+56 9 1111 1111',
          correo: 'ana@mail.com',
          consentimiento: true,
        },
      };
      mockPacientesService.resolverOCrear.mockResolvedValue({
        id: 'paciente-nuevo',
        rut: '123456785',
        nombre: 'Ana Soto',
        telefono: '+56 9 1111 1111',
        correo: 'ana@mail.com',
        consentimiento: true,
        tenantId: 'tenant-1',
      });
      mockCitaRepository.guardar.mockImplementation((cita: Cita) => {
        cita.id = 'cita-1';
        return Promise.resolve(cita);
      });

      // Act
      const result = await service.crearCita(
        dtoConPaciente,
        usuarioAutenticado,
      );

      // Assert — se delega en el caso de uso de paciente, con el tenant del token
      expect(mockPacientesService.resolverOCrear).toHaveBeenCalledWith(
        dtoConPaciente.paciente,
        usuarioAutenticado.tenantId,
        'tx',
      );
      // Assert — no se busca por id: no se recibió ninguno
      expect(mockPacienteRepository.buscarPorId).not.toHaveBeenCalled();
      // Assert — la cita queda vinculada al paciente resuelto
      expect(primeraCitaGuardada().pacienteId).toBe('paciente-nuevo');
      expect(result.pacienteId).toBe('paciente-nuevo');
      expect(result.paciente?.nombre).toBe('Ana Soto');
    });

    it('debería agendar dentro de una transacción (paciente y cita, todo o nada)', async () => {
      // Arrange
      mockPacientesService.resolverOCrear.mockResolvedValue({
        id: 'paciente-nuevo',
        rut: null,
        nombre: 'Sin RUT',
        telefono: '+56 9 0000 0000',
        correo: null,
        consentimiento: false,
        tenantId: 'tenant-1',
      });
      mockCitaRepository.guardar.mockImplementation((cita: Cita) => {
        cita.id = 'cita-1';
        return Promise.resolve(cita);
      });

      // Act
      await service.crearCita(
        {
          inicio: '2026-06-30T10:30:00Z',
          duracionMin: 30,
          tipoConsulta: 'Control',
          paciente: {
            nombre: 'Sin RUT',
            telefono: '+56 9 0000 0000',
            consentimiento: false,
          },
        },
        usuarioAutenticado,
      );

      // Assert — todo el trabajo pasó por el TransactionRunner
      expect(mockTx.run).toHaveBeenCalledTimes(1);
      // Assert — ambos escritores recibieron el mismo contexto
      expect(mockPacientesService.resolverOCrear).toHaveBeenCalledWith(
        expect.anything(),
        'tenant-1',
        'tx',
      );
      expect(mockCitaRepository.guardar).toHaveBeenCalledWith(
        expect.any(Cita),
        'tx',
      );
    });

    it('debería lanzar DatosPacienteRequeridosError si no llega ni pacienteId ni paciente', async () => {
      // Act & Assert
      await expect(
        service.crearCita(
          {
            inicio: '2026-06-30T10:30:00Z',
            duracionMin: 30,
            tipoConsulta: 'Control',
          },
          usuarioAutenticado,
        ),
      ).rejects.toBeInstanceOf(DatosPacienteRequeridosError);

      expect(mockCitaRepository.guardar).not.toHaveBeenCalled();
    });
  });

  describe('transiciones de estado', () => {
    const CITA_ID = 'cita-1';

    // Devuelve una cita reconstituida en el estado pedido, como la traeria el
    // repositorio desde BD.
    const citaEn = (
      estado: EstadoCita,
      inicio = new Date('2026-08-25T14:00:00Z'),
    ) =>
      Cita.reconstituir({
        id: CITA_ID,
        inicio,
        duracionMin: 30,
        tipoConsulta: 'Control',
        estado,
        tenantId: 'tenant-1',
        pacienteId: 'paciente-1',
        usuarioId: 'usuario-1',
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      });

    const prepararCita = (estado: EstadoCita, inicio?: Date) => {
      const cita = citaEn(estado, inicio);
      mockCitaRepository.buscarPorId.mockResolvedValue(cita);
      mockCitaRepository.guardar.mockImplementation((c: Cita) =>
        Promise.resolve(c),
      );
      return cita;
    };

    // Extrae, tipado, el CambioCita pasado al primer `registrar`.
    const primerCambio = (): CambioCita =>
      (
        mockCambioCitaRepository.registrar.mock
          .calls as unknown as CambioCita[][]
      )[0][0];

    it('deberia confirmar una cita pendiente y dejar el cambio en la bitacora', async () => {
      // Arrange
      prepararCita(EstadoCita.PENDIENTE);

      // Act
      const result = await service.confirmar(CITA_ID, usuarioAutenticado);

      // Assert - el estado se movio
      expect(result.estado).toBe(EstadoCita.CONFIRMADA);
      // Assert - quedo registrado el antes y el despues
      const cambio = primerCambio();
      expect(cambio.tipo).toBe(TipoCambio.CONFIRMADA);
      expect(cambio.estadoAnterior).toBe(EstadoCita.PENDIENTE);
      expect(cambio.estadoNuevo).toBe(EstadoCita.CONFIRMADA);
      expect(cambio.actorId).toBe(usuarioAutenticado.userId);
    });

    it('deberia cancelar guardando el motivo en la bitacora', async () => {
      // Arrange
      prepararCita(EstadoCita.PENDIENTE);

      // Act
      await service.cancelar(CITA_ID, usuarioAutenticado, 'El paciente aviso');

      // Assert
      expect(primerCambio().motivo).toBe('El paciente aviso');
      expect(primerCambio().tipo).toBe(TipoCambio.CANCELADA);
    });

    it('deberia propagar TransicionEstadoInvalidaError sin escribir nada', async () => {
      // Arrange - confirmar una cita ya cancelada es ilegal
      prepararCita(EstadoCita.CANCELADA);

      // Act & Assert
      await expect(
        service.confirmar(CITA_ID, usuarioAutenticado),
      ).rejects.toBeInstanceOf(TransicionEstadoInvalidaError);

      // Ni la cita ni la bitacora se tocan
      expect(mockCitaRepository.guardar).not.toHaveBeenCalled();
      expect(mockCambioCitaRepository.registrar).not.toHaveBeenCalled();
      expect(mockEventos.publicar).not.toHaveBeenCalled();
    });

    it('deberia lanzar CitaNoEncontradaError si la cita es de otro tenant', async () => {
      // Arrange - el repositorio filtra por tenant y no la encuentra
      mockCitaRepository.buscarPorId.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.confirmar(CITA_ID, usuarioAutenticado),
      ).rejects.toBeInstanceOf(CitaNoEncontradaError);

      // Assert - se busco acotado al tenant del token
      expect(mockCitaRepository.buscarPorId).toHaveBeenCalledWith(
        CITA_ID,
        usuarioAutenticado.tenantId,
        'tx',
      );
    });

    it('deberia marcar asistencia solo desde confirmada', async () => {
      // Arrange
      prepararCita(EstadoCita.CONFIRMADA);

      // Act
      const result = await service.marcarAsistencia(
        CITA_ID,
        usuarioAutenticado,
      );

      // Assert
      expect(result.estado).toBe(EstadoCita.ASISTIO);
    });

    it('deberia guardar cita, bitacora y evento en la misma transaccion', async () => {
      // Arrange
      prepararCita(EstadoCita.PENDIENTE);

      // Act
      await service.confirmar(CITA_ID, usuarioAutenticado);

      // Assert - una sola transaccion, y ambas escrituras con su contexto
      expect(mockTx.run).toHaveBeenCalledTimes(1);
      expect(mockCitaRepository.guardar).toHaveBeenCalledWith(
        expect.any(Cita),
        'tx',
      );
      expect(mockCambioCitaRepository.registrar).toHaveBeenCalledWith(
        expect.any(CambioCita),
        'tx',
      );
      expect(mockEventos.publicar).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'CitaConfirmada' }),
      );
    });
  });

  describe('reagendar', () => {
    const CITA_ID = 'cita-1';
    const INICIO_ORIGINAL = new Date('2026-08-25T14:00:00Z');
    const NUEVO_INICIO = '2026-08-26T16:00:00Z';

    const prepararConfirmada = () => {
      const cita = Cita.reconstituir({
        id: CITA_ID,
        inicio: INICIO_ORIGINAL,
        duracionMin: 30,
        tipoConsulta: 'Control',
        estado: EstadoCita.CONFIRMADA,
        tenantId: 'tenant-1',
        pacienteId: 'paciente-1',
        usuarioId: 'usuario-1',
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      });
      mockCitaRepository.buscarPorId.mockResolvedValue(cita);
      mockCitaRepository.guardar.mockImplementation((c: Cita) =>
        Promise.resolve(c),
      );
      return cita;
    };

    it('deberia mover la cita y devolverla a pendiente', async () => {
      // Arrange
      prepararConfirmada();

      // Act
      const result = await service.reagendar(
        CITA_ID,
        { inicio: NUEVO_INICIO },
        usuarioAutenticado,
      );

      // Assert - misma cita, nueva hora, confirmacion invalidada
      expect(result.id).toBe(CITA_ID);
      expect(result.inicio).toEqual(new Date(NUEVO_INICIO));
      expect(result.estado).toBe(EstadoCita.PENDIENTE);
    });

    it('deberia dejar el antes y el despues en la bitacora (materia prima de RF-08)', async () => {
      // Arrange
      prepararConfirmada();

      // Act
      await service.reagendar(
        CITA_ID,
        { inicio: NUEVO_INICIO, motivo: 'Choque de agenda' },
        usuarioAutenticado,
      );

      // Assert
      const cambio = (
        mockCambioCitaRepository.registrar.mock
          .calls as unknown as CambioCita[][]
      )[0][0];
      expect(cambio.tipo).toBe(TipoCambio.REAGENDADA);
      expect(cambio.inicioAnterior).toEqual(INICIO_ORIGINAL);
      expect(cambio.inicioNuevo).toEqual(new Date(NUEVO_INICIO));
      expect(cambio.motivo).toBe('Choque de agenda');
      expect(cambio.estadoAnterior).toBe(EstadoCita.CONFIRMADA);
      expect(cambio.estadoNuevo).toBe(EstadoCita.PENDIENTE);
    });

    it('deberia publicar el hecho con la hora anterior', async () => {
      // Arrange
      prepararConfirmada();

      // Act
      await service.reagendar(
        CITA_ID,
        { inicio: NUEVO_INICIO },
        usuarioAutenticado,
      );

      // Assert - US-03 y US-05 se enchufaran a este hecho sin tocar el caso de uso
      const evento = (
        mockEventos.publicar.mock.calls as unknown as EventoDominio[][]
      )[0][0];
      expect(evento.nombre).toBe('CitaReagendada');
      expect(evento.tenantId).toBe('tenant-1');
      expect(evento.payload.citaId).toBe(CITA_ID);
      expect(evento.payload.inicioAnterior).toEqual(INICIO_ORIGINAL);
    });
  });

  describe('citasDeHoy', () => {
    const reconstituir = (id: string, pacienteId: string, inicio: Date): Cita =>
      Cita.reconstituir({
        id,
        inicio,
        duracionMin: 30,
        tipoConsulta: 'Control',
        estado: EstadoCita.CONFIRMADA,
        tenantId: 'tenant-1',
        pacienteId,
        usuarioId: 'usuario-1',
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      });

    it('debería consultar el repositorio con el tenantId y usuarioId del token', async () => {
      // Arrange
      mockCitaRepository.buscarDelDiaPorProfesional.mockResolvedValue([]);

      // Act
      await service.citasDeHoy(usuarioAutenticado);

      // Assert
      expect(
        mockCitaRepository.buscarDelDiaPorProfesional,
      ).toHaveBeenCalledTimes(1);
      const [tenantId, usuarioId, dia] = (
        mockCitaRepository.buscarDelDiaPorProfesional.mock.calls as unknown as [
          string,
          string,
          Date,
        ][]
      )[0];
      expect(tenantId).toBe(usuarioAutenticado.tenantId);
      expect(usuarioId).toBe(usuarioAutenticado.userId);
      expect(dia).toBeInstanceOf(Date);
    });

    it('debería mapear cada cita a CitaDashboardDto con la hora "HH:mm" en la zona de la clínica', async () => {
      // Arrange — 18:05Z = 14:05 en America/Santiago (UTC-4). Instante UTC
      // explícito: el test es determinista sin importar la TZ de la máquina.
      const inicio = new Date('2026-06-30T18:05:00Z');
      const cita = reconstituir('cita-1', 'paciente-1', inicio);
      mockCitaRepository.buscarDelDiaPorProfesional.mockResolvedValue([cita]);
      mockPacienteRepository.buscarPorIds.mockResolvedValue([
        {
          id: 'paciente-1',
          nombre: 'Ana Pérez',
          contacto: 'ana@mail.com',
          consentimiento: true,
          tenantId: 'tenant-1',
        },
      ]);

      // Act
      const result = await service.citasDeHoy(usuarioAutenticado);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(CitaDashboardDto);
      expect(result[0].hora).toBe('14:05');
      expect(result[0].pacienteNombre).toBe('Ana Pérez');
      expect(result[0].id).toBe('cita-1');
      expect(result[0].estado).toBe(EstadoCita.CONFIRMADA);
    });

    it('debería resolver los nombres de paciente SIN N+1: un solo buscarPorIds con ids únicos', async () => {
      // Arrange — 3 citas pero solo 2 pacientes distintos
      const base = new Date();
      base.setHours(9, 0, 0, 0);
      const citas = [
        reconstituir('c1', 'paciente-A', base),
        reconstituir('c2', 'paciente-A', new Date(base.getTime() + 60000)),
        reconstituir('c3', 'paciente-B', new Date(base.getTime() + 120000)),
      ];
      mockCitaRepository.buscarDelDiaPorProfesional.mockResolvedValue(citas);
      mockPacienteRepository.buscarPorIds.mockImplementation((ids: string[]) =>
        Promise.resolve(
          ids.map((id) => ({
            id,
            nombre: id === 'paciente-A' ? 'Ana' : 'Beto',
            contacto: 'x',
            consentimiento: true,
            tenantId: 'tenant-1',
          })),
        ),
      );

      // Act
      const result = await service.citasDeHoy(usuarioAutenticado);

      // Assert — 3 citas, pero UNA consulta con los 2 ids únicos
      expect(mockPacienteRepository.buscarPorIds).toHaveBeenCalledTimes(1);
      expect(mockPacienteRepository.buscarPorIds).toHaveBeenCalledWith(
        ['paciente-A', 'paciente-B'],
        'tenant-1',
        undefined,
      );
      expect(mockPacienteRepository.buscarPorId).not.toHaveBeenCalled();
      expect(result.map((c) => c.pacienteNombre)).toEqual([
        'Ana',
        'Ana',
        'Beto',
      ]);
    });

    it('debería usar "Paciente" como nombre por defecto cuando el paciente no se resuelve', async () => {
      // Arrange
      const inicio = new Date();
      inicio.setHours(8, 0, 0, 0);
      const cita = reconstituir('cita-1', 'paciente-fantasma', inicio);
      mockCitaRepository.buscarDelDiaPorProfesional.mockResolvedValue([cita]);
      // El id no vuelve del lote (inexistente u otro tenant).
      mockPacienteRepository.buscarPorIds.mockResolvedValue([]);

      // Act
      const result = await service.citasDeHoy(usuarioAutenticado);

      // Assert
      expect(result[0].pacienteNombre).toBe('Paciente');
    });

    it('debería preservar el orden que entrega el repositorio (ASC)', async () => {
      // Arrange — el repo ya devuelve en orden ASC; el service debe respetarlo
      const base = new Date();
      base.setHours(9, 0, 0, 0);
      const citas = [
        reconstituir('c1', 'paciente-A', base),
        reconstituir('c2', 'paciente-B', new Date(base.getTime() + 3600000)),
        reconstituir('c3', 'paciente-C', new Date(base.getTime() + 7200000)),
      ];
      mockCitaRepository.buscarDelDiaPorProfesional.mockResolvedValue(citas);
      mockPacienteRepository.buscarPorIds.mockImplementation((ids: string[]) =>
        Promise.resolve(
          ids.map((id) => ({
            id,
            nombre: id,
            contacto: 'x',
            consentimiento: true,
            tenantId: 'tenant-1',
          })),
        ),
      );

      // Act
      const result = await service.citasDeHoy(usuarioAutenticado);

      // Assert
      expect(result.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    });

    it('debería devolver una lista vacía cuando no hay citas del día', async () => {
      // Arrange
      mockCitaRepository.buscarDelDiaPorProfesional.mockResolvedValue([]);

      // Act
      const result = await service.citasDeHoy(usuarioAutenticado);

      // Assert
      expect(result).toEqual([]);
      expect(mockPacienteRepository.buscarPorIds).not.toHaveBeenCalled();
    });
  });

  describe('detalle (US-02.08)', () => {
    const citaEn = (estado: EstadoCita): Cita =>
      Cita.reconstituir({
        id: 'cita-1',
        // 18:05Z = 15:05 en America/Santiago (UTC-3 en septiembre).
        inicio: new Date('2026-09-25T18:05:00Z'),
        duracionMin: 45,
        tipoConsulta: 'Control',
        estado,
        tenantId: 'tenant-1',
        pacienteId: 'paciente-1',
        usuarioId: 'otro-profesional',
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      });

    const paciente = {
      id: 'paciente-1',
      rut: '123456785',
      nombre: 'Ana Pérez',
      telefono: '+56 9 1111 1111',
      correo: null,
      consentimiento: true,
      tenantId: 'tenant-1',
    };

    it('carga la cita y el paciente por el tenant del token (no filtra por profesional)', async () => {
      mockCitaRepository.buscarPorId.mockResolvedValue(
        citaEn(EstadoCita.PENDIENTE),
      );
      mockPacienteRepository.buscarPorId.mockResolvedValue(paciente);

      await service.detalle('cita-1', usuarioAutenticado);

      expect(mockCitaRepository.buscarPorId).toHaveBeenCalledWith(
        'cita-1',
        usuarioAutenticado.tenantId,
        undefined,
      );
      expect(mockPacienteRepository.buscarPorId).toHaveBeenCalledWith(
        'paciente-1',
        usuarioAutenticado.tenantId,
      );
    });

    it('arma el detalle: hora en zona de la clínica, RUT formateado y acciones de la entidad', async () => {
      mockCitaRepository.buscarPorId.mockResolvedValue(
        citaEn(EstadoCita.CONFIRMADA),
      );
      mockPacienteRepository.buscarPorId.mockResolvedValue(paciente);

      const result = await service.detalle('cita-1', usuarioAutenticado);

      expect(result).toBeInstanceOf(CitaDetalleDto);
      expect(result).toEqual({
        id: 'cita-1',
        estado: EstadoCita.CONFIRMADA,
        inicio: new Date('2026-09-25T18:05:00Z'),
        hora: '15:05',
        duracionMin: 45,
        tipoConsulta: 'Control',
        paciente: {
          id: 'paciente-1',
          nombre: 'Ana Pérez',
          rut: '12.345.678-5',
          telefono: '+56 9 1111 1111',
          correo: null,
        },
        accionesPermitidas: [
          'cancelar',
          'reagendar',
          'asistencia',
          'inasistencia',
          'editar',
        ],
      });
    });

    it('no expone tenantId, usuarioId ni consentimiento', async () => {
      mockCitaRepository.buscarPorId.mockResolvedValue(
        citaEn(EstadoCita.PENDIENTE),
      );
      mockPacienteRepository.buscarPorId.mockResolvedValue(paciente);

      const result = await service.detalle('cita-1', usuarioAutenticado);

      expect(result).not.toHaveProperty('tenantId');
      expect(result).not.toHaveProperty('usuarioId');
      expect(result.paciente).not.toHaveProperty('tenantId');
      expect(result.paciente).not.toHaveProperty('consentimiento');
    });

    it('lanza CitaNoEncontradaError si la cita no existe o es de otro tenant', async () => {
      mockCitaRepository.buscarPorId.mockResolvedValue(null);

      await expect(
        service.detalle('cita-x', usuarioAutenticado),
      ).rejects.toBeInstanceOf(CitaNoEncontradaError);
      expect(mockPacienteRepository.buscarPorId).not.toHaveBeenCalled();
    });

    it('debería lanzar el MISMO error cuando la cita es de otro tenant que cuando no existe', async () => {
      // Arrange: repositorio que filtra por tenant de verdad. La cita vive en
      // tenant-2; el usuario autenticado es de tenant-1.
      const deOtroTenant = Cita.reconstituir({
        id: 'cita-1',
        inicio: new Date('2026-09-25T18:05:00Z'),
        duracionMin: 45,
        tipoConsulta: 'Control',
        estado: EstadoCita.PENDIENTE,
        tenantId: 'tenant-2',
        pacienteId: 'paciente-2',
        usuarioId: 'usuario-2',
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      });
      mockCitaRepository.buscarPorId.mockImplementation(
        (id: string, tenantId: string) =>
          Promise.resolve(
            id === deOtroTenant.id && tenantId === deOtroTenant.tenantId
              ? deOtroTenant
              : null,
          ),
      );

      // Act
      const errorOtroTenant = await service
        .detalle('cita-1', usuarioAutenticado)
        .catch((e: unknown) => e);
      mockCitaRepository.buscarPorId.mockResolvedValue(null);
      const errorInexistente = await service
        .detalle('cita-1', usuarioAutenticado)
        .catch((e: unknown) => e);

      // Assert: misma clase y mismo mensaje; nada delata que existe en otro lado.
      expect(errorOtroTenant).toBeInstanceOf(CitaNoEncontradaError);
      expect(errorInexistente).toBeInstanceOf(CitaNoEncontradaError);
      expect((errorOtroTenant as Error).message).toBe(
        (errorInexistente as Error).message,
      );
      expect((errorOtroTenant as Error).message).not.toMatch(/tenant/i);
      expect(mockPacienteRepository.buscarPorId).not.toHaveBeenCalled();
    });

    it('debería serializar sin tenantId, usuarioId, consentimiento ni RUT canónico cuando se envía por HTTP', async () => {
      // Arrange
      mockCitaRepository.buscarPorId.mockResolvedValue(
        citaEn(EstadoCita.PENDIENTE),
      );
      mockPacienteRepository.buscarPorId.mockResolvedValue(paciente);

      // Act: lo que realmente viaja es el JSON, no la instancia.
      const json = JSON.stringify(
        await service.detalle('cita-1', usuarioAutenticado),
      );

      // Assert: ni las claves ni sus valores aparecen en el cuerpo.
      expect(json).not.toMatch(/tenantId|usuarioId|consentimiento/);
      expect(json).not.toContain('tenant-1');
      expect(json).not.toContain('otro-profesional');
      expect(json).not.toContain('"123456785"');
      expect(json).toContain('"rut":"12.345.678-5"');
    });

    it('debería devolver rut y correo en null cuando el paciente no tiene RUT ni correo', async () => {
      // Arrange: el alta manual admite pacientes sin RUT (ADR-09 §3).
      mockCitaRepository.buscarPorId.mockResolvedValue(
        citaEn(EstadoCita.PENDIENTE),
      );
      mockPacienteRepository.buscarPorId.mockResolvedValue({
        ...paciente,
        rut: null,
        correo: undefined,
      });

      // Act
      const result = await service.detalle('cita-1', usuarioAutenticado);

      // Assert
      expect(result.paciente.rut).toBeNull();
      expect(result.paciente.correo).toBeNull();
    });

    it('debería transportar las acciones que calcula la entidad sin recalcularlas', async () => {
      // Arrange: la entidad responde algo que ninguna tabla del service daría
      // para "pendiente". Si el service calculara por su cuenta, no coincidiría.
      const cita = citaEn(EstadoCita.PENDIENTE);
      const espia = jest
        .spyOn(cita, 'accionesPermitidas')
        .mockReturnValue(['editar']);
      mockCitaRepository.buscarPorId.mockResolvedValue(cita);
      mockPacienteRepository.buscarPorId.mockResolvedValue(paciente);

      // Act
      const result = await service.detalle('cita-1', usuarioAutenticado);

      // Assert
      expect(espia).toHaveBeenCalledTimes(1);
      expect(result.accionesPermitidas).toEqual(['editar']);
    });

    it('debería ser de solo lectura: sin transacción, sin guardar, sin bitácora ni eventos', async () => {
      // Arrange
      mockCitaRepository.buscarPorId.mockResolvedValue(
        citaEn(EstadoCita.CONFIRMADA),
      );
      mockPacienteRepository.buscarPorId.mockResolvedValue(paciente);

      // Act
      await service.detalle('cita-1', usuarioAutenticado);

      // Assert
      expect(mockTx.run).not.toHaveBeenCalled();
      expect(mockCitaRepository.guardar).not.toHaveBeenCalled();
      expect(mockCambioCitaRepository.registrar).not.toHaveBeenCalled();
      expect(mockEventos.publicar).not.toHaveBeenCalled();
    });

    it('falla con un error interno (no 404) si el paciente de la cita no existe en su tenant', async () => {
      mockCitaRepository.buscarPorId.mockResolvedValue(
        citaEn(EstadoCita.PENDIENTE),
      );
      mockPacienteRepository.buscarPorId.mockResolvedValue(null);

      const promesa = service.detalle('cita-1', usuarioAutenticado);

      await expect(promesa).rejects.toThrow(/Integridad/);
      await expect(promesa).rejects.not.toBeInstanceOf(CitaNoEncontradaError);
    });
  });

  // -------------------------------------------------------------------------
  // Cierre de Fase 1 (ADR-11 + agenda por rango)
  // -------------------------------------------------------------------------

  // Cita reconstituida como la traeria el repositorio. Por defecto: del
  // profesional del token, pendiente, 50 minutos.
  const citaFase1 = (props: {
    id: string;
    inicio: string;
    duracionMin?: number;
    estado?: EstadoCita;
    usuarioId?: string;
    pacienteId?: string;
    creadoEn?: Date;
  }): Cita =>
    Cita.reconstituir({
      id: props.id,
      inicio: new Date(props.inicio),
      duracionMin: props.duracionMin ?? 50,
      tipoConsulta: 'Control',
      estado: props.estado ?? EstadoCita.PENDIENTE,
      tenantId: 'tenant-1',
      pacienteId: props.pacienteId ?? 'paciente-1',
      usuarioId: props.usuarioId ?? 'usuario-1',
      creadoEn: props.creadoEn ?? new Date('2026-09-01T00:00:00Z'),
      actualizadoEn: new Date('2026-09-01T00:00:00Z'),
    });

  // Argumentos tipados de la llamada `n` a buscarPorProfesionalEnRango.
  type ArgsRango = [
    string,
    string,
    Date,
    Date,
    { estados?: readonly EstadoCita[] } | undefined,
    unknown,
  ];
  const llamadaRango = (n = 0): ArgsRango =>
    (
      mockCitaRepository.buscarPorProfesionalEnRango.mock
        .calls as unknown as ArgsRango[]
    )[n];

  // Nombres de paciente: el doble devuelve un paciente por id pedido.
  const pacientesPorId = (nombres: Record<string, string>) =>
    mockPacienteRepository.buscarPorIds.mockImplementation((ids: string[]) =>
      Promise.resolve(
        ids
          .filter((id) => nombres[id] !== undefined)
          .map((id) => ({
            id,
            nombre: nombres[id],
            telefono: 'x',
            consentimiento: true,
            tenantId: 'tenant-1',
          })),
      ),
    );

  describe('listarEnRango (GET /citas?desde&hasta)', () => {
    it('debería aceptar un rango de 1 día (desde = hasta) y consultar [00:00, 00:00 del día siguiente) en APP_TZ', async () => {
      // Arrange — 22-sep-2026 en Santiago es UTC-3 (horario de verano).

      // Act
      const result = await service.listarEnRango(
        '2026-09-22',
        '2026-09-22',
        usuarioAutenticado,
      );

      // Assert
      expect(result).toEqual([]);
      expect(
        mockCitaRepository.buscarPorProfesionalEnRango,
      ).toHaveBeenCalledTimes(1);
      const [, , desde, hasta] = llamadaRango();
      expect(desde).toEqual(new Date('2026-09-22T03:00:00.000Z'));
      expect(hasta).toEqual(new Date('2026-09-23T03:00:00.000Z'));
    });

    it(`debería aceptar el máximo de ${MAX_DIAS_RANGO} días inclusivos`, async () => {
      // Arrange — 1-sep..12-oct = 30 + 12 = 42 días.
      expect(MAX_DIAS_RANGO).toBe(42);

      // Act
      await service.listarEnRango(
        '2026-09-01',
        '2026-10-12',
        usuarioAutenticado,
      );

      // Assert — 1-sep aún es invierno (UTC-4); 13-oct ya es verano (UTC-3).
      const [, , desde, hasta] = llamadaRango();
      expect(desde).toEqual(new Date('2026-09-01T04:00:00.000Z'));
      expect(hasta).toEqual(new Date('2026-10-13T03:00:00.000Z'));
    });

    it('debería lanzar RangoFechasInvalidoError cuando el rango tiene 43 días', async () => {
      // Act
      const promesa = service.listarEnRango(
        '2026-09-01',
        '2026-10-13',
        usuarioAutenticado,
      );

      // Assert
      await expect(promesa).rejects.toBeInstanceOf(RangoFechasInvalidoError);
      await expect(promesa).rejects.toThrow('El rango máximo es de 42 días');
      expect(
        mockCitaRepository.buscarPorProfesionalEnRango,
      ).not.toHaveBeenCalled();
    });

    it('debería lanzar RangoFechasInvalidoError cuando hasta es anterior a desde', async () => {
      // Act
      const promesa = service.listarEnRango(
        '2026-09-22',
        '2026-09-21',
        usuarioAutenticado,
      );

      // Assert
      await expect(promesa).rejects.toBeInstanceOf(RangoFechasInvalidoError);
      await expect(promesa).rejects.toThrow(
        'El parámetro "hasta" debe ser igual o posterior a "desde"',
      );
      expect(
        mockCitaRepository.buscarPorProfesionalEnRango,
      ).not.toHaveBeenCalled();
    });

    it('debería consultar con tenantId y usuarioId del token y SIN filtro de estado', async () => {
      // Act
      await service.listarEnRango(
        '2026-09-21',
        '2026-09-27',
        usuarioAutenticado,
      );

      // Assert — la agenda muestra todos los estados (opciones ausente)
      const [tenantId, usuarioId, , , opciones] = llamadaRango();
      expect(tenantId).toBe(usuarioAutenticado.tenantId);
      expect(usuarioId).toBe(usuarioAutenticado.userId);
      expect(opciones).toBeUndefined();
    });

    it('debería calcular bien los instantes en una semana que cruza el cambio de horario de septiembre en Chile', async () => {
      // Arrange — el domingo 6-sep-2026 a las 00:00 Santiago salta a las 01:00
      // (UTC-4 -> UTC-3). La semana 3..9-sep dura 7 días menos 1 hora.
      const antesDelSalto = citaFase1({
        id: 'c-sabado-noche',
        // 23:30 del sábado 5-sep (UTC-4)
        inicio: '2026-09-06T03:30:00Z',
      });
      const primeraDelDomingo = citaFase1({
        id: 'c-domingo',
        // 01:00 del domingo 6-sep: el día empieza a esa hora (UTC-3)
        inicio: '2026-09-06T04:00:00Z',
      });
      mockCitaRepository.buscarPorProfesionalEnRango.mockResolvedValue([
        antesDelSalto,
        primeraDelDomingo,
      ]);

      // Act
      const result = await service.listarEnRango(
        '2026-09-03',
        '2026-09-09',
        usuarioAutenticado,
      );

      // Assert — extremos: 00:00 del 3-sep (UTC-4) y 00:00 del 10-sep (UTC-3)
      const [, , desde, hasta] = llamadaRango();
      expect(desde).toEqual(new Date('2026-09-03T04:00:00.000Z'));
      expect(hasta).toEqual(new Date('2026-09-10T03:00:00.000Z'));
      expect(hasta.getTime() - desde.getTime()).toBe((7 * 24 - 1) * 3_600_000);

      // Assert — `fecha` y `hora` proyectadas en la zona de la clínica
      expect(result.map((c) => [c.id, c.fecha, c.hora])).toEqual([
        ['c-sabado-noche', '2026-09-05', '23:30'],
        ['c-domingo', '2026-09-06', '01:00'],
      ]);
    });

    it('debería consultar el día del salto (6-sep) como un día de 23 horas que empieza a las 01:00', async () => {
      // Act
      await service.listarEnRango(
        '2026-09-06',
        '2026-09-06',
        usuarioAutenticado,
      );

      // Assert
      const [, , desde, hasta] = llamadaRango();
      expect(desde).toEqual(new Date('2026-09-06T04:00:00.000Z'));
      expect(hasta).toEqual(new Date('2026-09-07T03:00:00.000Z'));
    });

    it('debería preservar el orden del repositorio y mapear a CitaDashboardDto con fecha', async () => {
      // Arrange — el repositorio ya ordena por inicio ASC, creadoEn ASC
      const citas = [
        citaFase1({ id: 'c1', inicio: '2026-09-22T13:00:00Z' }),
        citaFase1({
          id: 'c2',
          inicio: '2026-09-22T13:00:00Z',
          pacienteId: 'paciente-2',
          estado: EstadoCita.CANCELADA,
        }),
        citaFase1({ id: 'c3', inicio: '2026-09-24T21:00:00Z' }),
      ];
      mockCitaRepository.buscarPorProfesionalEnRango.mockResolvedValue(citas);
      pacientesPorId({ 'paciente-1': 'Ana', 'paciente-2': 'Beto' });

      // Act
      const result = await service.listarEnRango(
        '2026-09-21',
        '2026-09-27',
        usuarioAutenticado,
      );

      // Assert
      expect(result.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
      expect(result[0]).toBeInstanceOf(CitaDashboardDto);
      expect(result[0]).toEqual({
        id: 'c1',
        pacienteNombre: 'Ana',
        fecha: '2026-09-22',
        hora: '10:00',
        inicio: new Date('2026-09-22T13:00:00Z'),
        duracionMin: 50,
        tipoConsulta: 'Control',
        estado: EstadoCita.PENDIENTE,
      });
      expect(result[1].estado).toBe(EstadoCita.CANCELADA);
      expect(result[1].pacienteNombre).toBe('Beto');
    });

    it('debería resolver los nombres con UN solo buscarPorIds (ids únicos) y sin transacción', async () => {
      // Arrange — 3 citas, 2 pacientes
      mockCitaRepository.buscarPorProfesionalEnRango.mockResolvedValue([
        citaFase1({ id: 'c1', inicio: '2026-09-22T13:00:00Z' }),
        citaFase1({ id: 'c2', inicio: '2026-09-22T14:00:00Z' }),
        citaFase1({
          id: 'c3',
          inicio: '2026-09-22T15:00:00Z',
          pacienteId: 'paciente-2',
        }),
      ]);
      pacientesPorId({ 'paciente-1': 'Ana', 'paciente-2': 'Beto' });

      // Act
      await service.listarEnRango(
        '2026-09-22',
        '2026-09-22',
        usuarioAutenticado,
      );

      // Assert
      expect(mockPacienteRepository.buscarPorIds).toHaveBeenCalledTimes(1);
      expect(mockPacienteRepository.buscarPorIds).toHaveBeenCalledWith(
        ['paciente-1', 'paciente-2'],
        'tenant-1',
        undefined,
      );
      expect(mockPacienteRepository.buscarPorId).not.toHaveBeenCalled();
      expect(mockTx.run).not.toHaveBeenCalled();
    });
  });

  describe('avisos de solapamiento (ADR-11)', () => {
    const CITA_ID = 'cita-1';

    // La cita que se opera: 22-sep 10:00-10:50 en Santiago.
    const INICIO = '2026-09-22T13:00:00Z';

    const prepararExistente = (
      estado: EstadoCita,
      usuarioId = 'usuario-1',
    ): Cita => {
      const cita = citaFase1({
        id: CITA_ID,
        inicio: INICIO,
        estado,
        usuarioId,
      });
      mockCitaRepository.buscarPorId.mockResolvedValue(cita);
      mockCitaRepository.guardar.mockImplementation((c: Cita) =>
        Promise.resolve(c),
      );
      return cita;
    };

    const prepararAlta = () => {
      mockPacienteRepository.buscarPorId.mockResolvedValue({
        id: 'paciente-1',
        rut: '111111111',
        nombre: 'Ana',
        telefono: '+56 9 1111 1111',
        correo: 'ana@mail.com',
        consentimiento: true,
        tenantId: 'tenant-1',
      });
      mockCitaRepository.guardar.mockImplementation((c: Cita) => {
        c.id = CITA_ID;
        return Promise.resolve(c);
      });
    };

    const dtoAlta: CrearCitaDto = {
      inicio: INICIO,
      duracionMin: 50,
      tipoConsulta: 'Control',
      pacienteId: 'paciente-1',
    };

    describe('presencia según la operación', () => {
      it('debería incluir avisos con lista vacía al crear cuando no hay choque', async () => {
        // Arrange
        prepararAlta();

        // Act
        const result = await service.crearCita(dtoAlta, usuarioAutenticado);

        // Assert
        expect(result.avisos).toBeInstanceOf(AvisosCitaDto);
        expect(result.avisos).toEqual({ solapamientos: [] });
      });

      it('debería incluir avisos al reagendar', async () => {
        // Arrange
        prepararExistente(EstadoCita.CONFIRMADA);

        // Act
        const result = await service.reagendar(
          CITA_ID,
          { inicio: '2026-09-23T13:00:00Z' },
          usuarioAutenticado,
        );

        // Assert
        expect(result).toHaveProperty('avisos', { solapamientos: [] });
      });

      it('debería incluir avisos al editar', async () => {
        // Arrange
        prepararExistente(EstadoCita.PENDIENTE);

        // Act
        const result = await service.editar(
          CITA_ID,
          { duracionMin: 90 },
          usuarioAutenticado,
        );

        // Assert
        expect(result).toHaveProperty('avisos', { solapamientos: [] });
      });

      it.each([
        [
          'confirmar',
          EstadoCita.PENDIENTE,
          (s: CitasService, u: AuthenticatedUser) => s.confirmar(CITA_ID, u),
        ],
        [
          'cancelar',
          EstadoCita.PENDIENTE,
          (s: CitasService, u: AuthenticatedUser) =>
            s.cancelar(CITA_ID, u, 'motivo'),
        ],
        [
          'marcarAsistencia',
          EstadoCita.CONFIRMADA,
          (s: CitasService, u: AuthenticatedUser) =>
            s.marcarAsistencia(CITA_ID, u),
        ],
        [
          'marcarInasistencia',
          EstadoCita.CONFIRMADA,
          (s: CitasService, u: AuthenticatedUser) =>
            s.marcarInasistencia(CITA_ID, u),
        ],
      ])(
        'NO debería incluir la clave avisos ni consultar solapamientos al %s',
        async (_nombre, estadoInicial, operar) => {
          // Arrange
          prepararExistente(estadoInicial);

          // Act
          const result = await operar(service, usuarioAutenticado);

          // Assert — no se calcula y NO viaja en el JSON. Nota: con target
          // ES2023 los campos declarados de la clase existen como propiedad
          // propia con valor `undefined`; lo que importa es el cable.
          expect(result.avisos).toBeUndefined();
          expect(JSON.stringify(result)).not.toContain('avisos');
          expect(
            mockCitaRepository.buscarPorProfesionalEnRango,
          ).not.toHaveBeenCalled();
        },
      );
    });

    describe('pre-filtro del repositorio', () => {
      it('debería pre-filtrar con ESTADOS_VIGENTES, ventana [inicio - 1440 min, fin) y el mismo tx al crear', async () => {
        // Arrange
        prepararAlta();

        // Act
        await service.crearCita(dtoAlta, usuarioAutenticado);

        // Assert
        expect(DURACION_MAXIMA_MIN).toBe(1440);
        expect(
          mockCitaRepository.buscarPorProfesionalEnRango,
        ).toHaveBeenCalledWith(
          'tenant-1',
          'usuario-1',
          new Date('2026-09-21T13:00:00.000Z'), // inicio - 24h
          new Date('2026-09-22T13:50:00.000Z'), // fin = inicio + 50 min
          { estados: ESTADOS_VIGENTES },
          'tx',
        );
      });

      it('debería usar la ventana de la cita YA reagendada (calculado después de mutar)', async () => {
        // Arrange
        prepararExistente(EstadoCita.CONFIRMADA);

        // Act
        await service.reagendar(
          CITA_ID,
          { inicio: '2026-09-25T15:00:00Z' },
          usuarioAutenticado,
        );

        // Assert — ventana de la NUEVA hora, no de la original
        const [, , desde, hasta, opciones, tx] = llamadaRango();
        expect(desde).toEqual(new Date('2026-09-24T15:00:00.000Z'));
        expect(hasta).toEqual(new Date('2026-09-25T15:50:00.000Z'));
        expect(opciones).toEqual({ estados: ESTADOS_VIGENTES });
        expect(tx).toBe('tx');
      });

      it('debería usar el fin con la duración nueva al editar', async () => {
        // Arrange
        prepararExistente(EstadoCita.PENDIENTE);

        // Act
        await service.editar(CITA_ID, { duracionMin: 120 }, usuarioAutenticado);

        // Assert — fin = 13:00Z + 120 min
        const [, , , hasta] = llamadaRango();
        expect(hasta).toEqual(new Date('2026-09-22T15:00:00.000Z'));
      });

      it('debería comparar contra la agenda del DUEÑO de la cita (cita.usuarioId), no de quien hace la petición', async () => {
        // Arrange — un colega del tenant reagenda una cita ajena
        prepararExistente(EstadoCita.PENDIENTE, 'otro-profesional');

        // Act
        await service.reagendar(
          CITA_ID,
          { inicio: '2026-09-23T13:00:00Z' },
          usuarioAutenticado,
        );

        // Assert
        const [tenantId, usuarioId] = llamadaRango();
        expect(tenantId).toBe('tenant-1');
        expect(usuarioId).toBe('otro-profesional');
        expect(usuarioId).not.toBe(usuarioAutenticado.userId);
      });

      it('debería calcular los avisos DESPUÉS de guardar la cita y registrar el cambio', async () => {
        // Arrange
        prepararAlta();

        // Act
        await service.crearCita(dtoAlta, usuarioAutenticado);

        // Assert — orden de invocación
        const ordenGuardar =
          mockCitaRepository.guardar.mock.invocationCallOrder[0];
        const ordenRegistrar =
          mockCambioCitaRepository.registrar.mock.invocationCallOrder[0];
        const ordenAvisos =
          mockCitaRepository.buscarPorProfesionalEnRango.mock
            .invocationCallOrder[0];
        expect(ordenGuardar).toBeLessThan(ordenAvisos);
        expect(ordenRegistrar).toBeLessThan(ordenAvisos);
      });

      it('debería calcular los avisos DESPUÉS de guardar también al reagendar', async () => {
        // Arrange
        prepararExistente(EstadoCita.PENDIENTE);

        // Act
        await service.reagendar(
          CITA_ID,
          { inicio: '2026-09-23T13:00:00Z' },
          usuarioAutenticado,
        );

        // Assert
        expect(
          mockCitaRepository.guardar.mock.invocationCallOrder[0],
        ).toBeLessThan(
          mockCitaRepository.buscarPorProfesionalEnRango.mock
            .invocationCallOrder[0],
        );
      });
    });

    describe('decisión fina (Cita.chocaCon)', () => {
      it('debería excluir la propia cita, las pegadas y quedarse solo con los choques reales, en orden', async () => {
        // Arrange — el pre-filtro devuelve la propia cita (misma id) y otras
        prepararAlta();
        const choqueTemprano = citaFase1({
          id: 'choque-1',
          inicio: '2026-09-22T12:30:00Z', // 09:30-10:20 -> se cruza
          pacienteId: 'paciente-2',
        });
        const propia = citaFase1({ id: CITA_ID, inicio: INICIO });
        const choqueTardio = citaFase1({
          id: 'choque-2',
          inicio: '2026-09-22T13:40:00Z', // 10:40-11:30 -> se cruza
          pacienteId: 'paciente-3',
          estado: EstadoCita.CONFIRMADA,
        });
        const pegada = citaFase1({
          id: 'pegada',
          inicio: '2026-09-22T12:10:00Z', // 09:10-10:00 -> NO se cruza
        });
        mockCitaRepository.buscarPorProfesionalEnRango.mockResolvedValue([
          pegada,
          choqueTemprano,
          propia,
          choqueTardio,
        ]);
        pacientesPorId({ 'paciente-2': 'Beto', 'paciente-3': 'Carla' });

        // Act
        const result = await service.crearCita(dtoAlta, usuarioAutenticado);

        // Assert
        const solapamientos = result.avisos?.solapamientos ?? [];
        expect(solapamientos.map((s) => s.id)).toEqual([
          'choque-1',
          'choque-2',
        ]);
        expect(solapamientos[0]).toBeInstanceOf(CitaDashboardDto);
        expect(solapamientos[1]).toEqual({
          id: 'choque-2',
          pacienteNombre: 'Carla',
          fecha: '2026-09-22',
          hora: '10:40',
          inicio: new Date('2026-09-22T13:40:00Z'),
          duracionMin: 50,
          tipoConsulta: 'Control',
          estado: EstadoCita.CONFIRMADA,
        });
      });

      it('debería resolver los nombres de los solapamientos con UN solo buscarPorIds dentro del tx', async () => {
        // Arrange
        prepararExistente(EstadoCita.PENDIENTE);
        mockCitaRepository.buscarPorProfesionalEnRango.mockResolvedValue([
          citaFase1({
            id: 'a',
            inicio: '2026-09-23T12:30:00Z',
            pacienteId: 'paciente-2',
          }),
          citaFase1({
            id: 'b',
            inicio: '2026-09-23T13:10:00Z',
            pacienteId: 'paciente-2',
          }),
          citaFase1({
            id: 'c',
            inicio: '2026-09-23T13:20:00Z',
            pacienteId: 'paciente-3',
          }),
        ]);
        pacientesPorId({ 'paciente-2': 'Beto', 'paciente-3': 'Carla' });

        // Act
        const result = await service.reagendar(
          CITA_ID,
          { inicio: '2026-09-23T13:00:00Z' },
          usuarioAutenticado,
        );

        // Assert
        expect(result.avisos?.solapamientos).toHaveLength(3);
        expect(mockPacienteRepository.buscarPorIds).toHaveBeenCalledTimes(1);
        expect(mockPacienteRepository.buscarPorIds).toHaveBeenCalledWith(
          ['paciente-2', 'paciente-3'],
          'tenant-1',
          'tx',
        );
      });

      it('no debería consultar pacientes cuando no hay solapamientos', async () => {
        // Arrange — solo vuelve la propia cita
        prepararExistente(EstadoCita.PENDIENTE);
        mockCitaRepository.buscarPorProfesionalEnRango.mockImplementation(() =>
          Promise.resolve([
            citaFase1({ id: CITA_ID, inicio: '2026-09-23T13:00:00Z' }),
          ]),
        );

        // Act
        const result = await service.reagendar(
          CITA_ID,
          { inicio: '2026-09-23T13:00:00Z' },
          usuarioAutenticado,
        );

        // Assert
        expect(result.avisos).toEqual({ solapamientos: [] });
        expect(mockPacienteRepository.buscarPorIds).not.toHaveBeenCalled();
      });
    });

    describe('crearCita / agendar', () => {
      it('debería abrir UNA sola transacción y delegar en agendar con ese tx', async () => {
        // Arrange
        prepararAlta();
        const espiaAgendar = jest.spyOn(service, 'agendar');

        // Act
        const result = await service.crearCita(dtoAlta, usuarioAutenticado);

        // Assert
        expect(mockTx.run).toHaveBeenCalledTimes(1);
        expect(espiaAgendar).toHaveBeenCalledTimes(1);
        expect(espiaAgendar).toHaveBeenCalledWith(
          dtoAlta,
          usuarioAutenticado,
          'tx',
        );
        expect(result).toBe(await espiaAgendar.mock.results[0].value);
      });

      it('agendar NO debería abrir otra transacción: usa en todo el tx que recibe', async () => {
        // Arrange — quien llama (la bandeja) ya tiene su transacción
        prepararAlta();
        const txExterna = { soy: 'tx-externa' };

        // Act
        const result = await service.agendar(
          dtoAlta,
          usuarioAutenticado,
          txExterna,
        );

        // Assert
        expect(mockTx.run).not.toHaveBeenCalled();
        expect(mockPacienteRepository.buscarPorId).toHaveBeenCalledWith(
          'paciente-1',
          'tenant-1',
          txExterna,
        );
        expect(mockCitaRepository.guardar).toHaveBeenCalledWith(
          expect.any(Cita),
          txExterna,
        );
        expect(mockCambioCitaRepository.registrar).toHaveBeenCalledWith(
          expect.any(CambioCita),
          txExterna,
        );
        expect(llamadaRango()[5]).toBe(txExterna);
        expect(mockEventos.publicar).toHaveBeenCalledWith(
          expect.objectContaining({ nombre: 'CitaCreada' }),
        );
        expect(result.avisos).toEqual({ solapamientos: [] });
        expect(result.paciente?.id).toBe('paciente-1');
      });

      it('agendar debería registrar el cambio "creada" y responder con el paciente', async () => {
        // Arrange
        prepararAlta();

        // Act
        const result = await service.agendar(dtoAlta, usuarioAutenticado, 'tx');

        // Assert
        const cambio = (
          mockCambioCitaRepository.registrar.mock
            .calls as unknown as CambioCita[][]
        )[0][0];
        expect(cambio.tipo).toBe(TipoCambio.CREADA);
        expect(cambio.estadoNuevo).toBe(EstadoCita.PENDIENTE);
        expect(result.id).toBe(CITA_ID);
        expect(result.paciente?.rut).toBe('11.111.111-1');
      });
    });
  });
});
