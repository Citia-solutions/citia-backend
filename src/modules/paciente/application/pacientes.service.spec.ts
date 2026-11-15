import {
  ContadorTransacciones,
  InMemoryAceptacionTerminosRepository,
  InMemoryPacienteRepository,
} from '../../../../test/support/in-memory-repositories';
import { RutInvalidoError } from '../../../shared/domain/rut-invalido.error';
import {
  AceptacionTerminos,
  CanalAceptacion,
  RegistrarAceptacionProps,
} from '../domain/aceptacion-terminos.entity';
import { CambioContactoVacioError } from '../domain/exceptions/cambio-contacto-vacio.error';
import { CorreoPacienteRequeridoError } from '../domain/exceptions/correo-paciente-requerido.error';
import { VersionTerminosNoVigenteError } from '../domain/exceptions/version-terminos-no-vigente.error';
import { Paciente } from '../domain/paciente.entity';
import { CrearPacienteDto } from '../presentation/dto/crear-paciente.dto';
import { PacienteResponseDto } from '../presentation/dto/paciente-response.dto';
import { PacienteNoEncontradoError } from './paciente-no-encontrado.error';
import { PacientesService } from './pacientes.service';

describe('PacientesService', () => {
  let service: PacientesService;
  let mockPacienteRepository: {
    guardar: jest.Mock;
    buscarPorId: jest.Mock;
    buscarPorRut: jest.Mock;
    buscarPorIds: jest.Mock;
    actualizarContacto: jest.Mock;
    completarCorreoSiVacio: jest.Mock;
    marcarConsentimiento: jest.Mock;
  };
  // US-11: el puerto de `aceptaciones_terminos` y el TransactionRunner.
  let mockAceptaciones: {
    insertarSiNoExiste: jest.Mock;
    existeDelTitular: jest.Mock;
  };
  let mockTx: { run: jest.Mock };

  const TENANT = 'tenant-1';
  const PACIENTE_ID = '3f1c2b9e-8a4d-4c7e-9b21-5d6f7a8b9c0d';
  const USUARIO = { userId: 'usuario-1', tenantId: TENANT };
  const AHORA = new Date('2026-11-14T15:00:00.000Z');

  const dto: CrearPacienteDto = {
    rut: '12.345.678-5',
    nombre: 'Ana Soto',
    telefono: '+56 9 1111 1111',
    correo: 'ana@mail.com',
    consentimiento: true,
    terminosVersion: '1.0',
  };

  // Fila ya persistida (ficha existente). `correo` por defecto en NULL: la
  // ficha vieja típica de antes de la Fase 2 (ADR-13, opción F4).
  const existente = (correo: string | null = null): Paciente =>
    Paciente.reconstituir({
      id: 'paciente-ya-existe',
      rut: '123456785',
      nombre: 'Ana Soto (ficha)',
      telefono: '+56 9 9999 9999',
      correo,
      consentimiento: true,
      tenantId: TENANT,
    });

  beforeEach(() => {
    mockPacienteRepository = {
      guardar: jest
        .fn()
        .mockImplementation((p: Partial<Paciente>) =>
          Promise.resolve({ ...p, id: 'paciente-1' }),
        ),
      buscarPorId: jest.fn(),
      buscarPorRut: jest.fn().mockResolvedValue(null),
      buscarPorIds: jest.fn().mockResolvedValue([]),
      actualizarContacto: jest.fn().mockResolvedValue(true),
      completarCorreoSiVacio: jest.fn().mockResolvedValue(true),
      marcarConsentimiento: jest.fn().mockResolvedValue(true),
    };
    mockAceptaciones = {
      insertarSiNoExiste: jest.fn().mockResolvedValue(true),
      existeDelTitular: jest.fn().mockResolvedValue(false),
    };
    mockTx = {
      run: jest.fn((work: (tx: unknown) => Promise<unknown>) => work('tx')),
    };
    service = new PacientesService(
      mockPacienteRepository,
      mockAceptaciones,
      mockTx,
      () => AHORA,
    );
  });

  // La aceptación pasada al primer `insertarSiNoExiste`, tipada.
  const primeraAceptacion = (): AceptacionTerminos =>
    (
      mockAceptaciones.insertarSiNoExiste.mock
        .calls as unknown as AceptacionTerminos[][]
    )[0][0];

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('resolverOCrear', () => {
    it('debería normalizar el RUT antes de buscarlo', async () => {
      // Act
      await service.resolverOCrear(dto, TENANT);

      // Assert — se busca por la forma canónica, no por lo que tecleó el usuario
      expect(mockPacienteRepository.buscarPorRut).toHaveBeenCalledWith(
        '123456785',
        TENANT,
        undefined,
      );
    });

    it('debería crear el paciente con el RUT canónico cuando no existe', async () => {
      // Act
      await service.resolverOCrear(dto, TENANT);

      // Assert — se persiste normalizado y con el tenant del token
      expect(mockPacienteRepository.guardar).toHaveBeenCalledWith(
        expect.objectContaining({
          rut: '123456785',
          nombre: 'Ana Soto',
          telefono: '+56 9 1111 1111',
          correo: 'ana@mail.com',
          consentimiento: true,
          tenantId: TENANT,
        }),
        undefined,
      );
    });

    it('debería crear a través de la fábrica de dominio (instancia de Paciente)', async () => {
      // Act
      await service.resolverOCrear(dto, TENANT);

      // Assert
      const [guardado] = mockPacienteRepository.guardar.mock.calls[0] as [
        unknown,
      ];
      expect(guardado).toBeInstanceOf(Paciente);
    });

    it('debería guardar el correo normalizado aunque el llamador no pase por el DTO', async () => {
      // Act — p. ej. la aceptación de una solicitud, que arma el dto a mano
      await service.resolverOCrear(
        { ...dto, correo: '  Ana.Soto@Mail.COM ' },
        TENANT,
      );

      // Assert
      expect(mockPacienteRepository.guardar).toHaveBeenCalledWith(
        expect.objectContaining({ correo: 'ana.soto@mail.com' }),
        undefined,
      );
    });

    it('debería rechazar crear un paciente sin correo sin tocar la BD (ADR-13 §14)', async () => {
      // Arrange — un llamador que no pasó por el ValidationPipe
      const sinCorreo = {
        nombre: 'Sin correo',
        telefono: '+56 9 0000 0000',
        consentimiento: true,
      } as CrearPacienteDto;

      // Act & Assert
      await expect(
        service.resolverOCrear(sinCorreo, TENANT),
      ).rejects.toBeInstanceOf(CorreoPacienteRequeridoError);

      expect(mockPacienteRepository.guardar).not.toHaveBeenCalled();
    });

    it('debería rechazar un correo en blanco al crear', async () => {
      // Act & Assert
      await expect(
        service.resolverOCrear({ ...dto, correo: '   ' }, TENANT),
      ).rejects.toBeInstanceOf(CorreoPacienteRequeridoError);

      expect(mockPacienteRepository.guardar).not.toHaveBeenCalled();
    });

    it('debería rechazar un RUT con dígito verificador incorrecto sin tocar la BD', async () => {
      // Act & Assert
      await expect(
        service.resolverOCrear({ ...dto, rut: '12.345.678-9' }, TENANT),
      ).rejects.toBeInstanceOf(RutInvalidoError);

      expect(mockPacienteRepository.buscarPorRut).not.toHaveBeenCalled();
      expect(mockPacienteRepository.guardar).not.toHaveBeenCalled();
    });

    it('debería crear sin buscar cuando no hay RUT (alta manual de alguien sin documento)', async () => {
      // Act
      await service.resolverOCrear(
        {
          nombre: 'Sin RUT',
          telefono: '+56 9 0000 0000',
          correo: 'sin.rut@mail.com',
          consentimiento: false,
        },
        TENANT,
      );

      // Assert — sin RUT no hay identidad que resolver: siempre se crea
      expect(mockPacienteRepository.buscarPorRut).not.toHaveBeenCalled();
      expect(mockPacienteRepository.guardar).toHaveBeenCalledWith(
        expect.objectContaining({ rut: null, correo: 'sin.rut@mail.com' }),
        undefined,
      );
    });

    it('debería propagar el contexto de transacción a las dos operaciones', async () => {
      // Act
      await service.resolverOCrear(dto, TENANT, 'tx');

      // Assert
      expect(mockPacienteRepository.buscarPorRut).toHaveBeenCalledWith(
        '123456785',
        TENANT,
        'tx',
      );
      expect(mockPacienteRepository.guardar).toHaveBeenCalledWith(
        expect.anything(),
        'tx',
      );
    });

    describe('paciente existente por RUT (ADR-13 §14, matiza ADR-09 §3)', () => {
      it('debería vincularlo sin crear otro', async () => {
        // Arrange
        const ficha = existente('ana@mail.com');
        mockPacienteRepository.buscarPorRut.mockResolvedValue(ficha);

        // Act
        const result = await service.resolverOCrear(dto, TENANT);

        // Assert — se vincula al existente; NO se duplica
        expect(result).toBe(ficha);
        expect(mockPacienteRepository.guardar).not.toHaveBeenCalled();
      });

      it('debería completar el correo cuando el guardado está vacío (NULL)', async () => {
        // Arrange
        mockPacienteRepository.buscarPorRut.mockResolvedValue(existente(null));

        // Act
        const result = await service.resolverOCrear(dto, TENANT);

        // Assert — escritura condicional, con el tenant; el resto de la
        // ficha no cambia
        expect(
          mockPacienteRepository.completarCorreoSiVacio,
        ).toHaveBeenCalledWith(
          'paciente-ya-existe',
          TENANT,
          'ana@mail.com',
          undefined,
        );
        expect(result.correo).toBe('ana@mail.com');
        expect(result.nombre).toBe('Ana Soto (ficha)');
        expect(result.telefono).toBe('+56 9 9999 9999');
        expect(mockPacienteRepository.guardar).not.toHaveBeenCalled();
      });

      it('debería completar también un correo guardado en blanco', async () => {
        // Arrange
        mockPacienteRepository.buscarPorRut.mockResolvedValue(existente('  '));

        // Act
        await service.resolverOCrear(dto, TENANT);

        // Assert
        expect(
          mockPacienteRepository.completarCorreoSiVacio,
        ).toHaveBeenCalledTimes(1);
      });

      it('debería completar con el correo normalizado', async () => {
        // Arrange
        mockPacienteRepository.buscarPorRut.mockResolvedValue(existente(null));

        // Act
        await service.resolverOCrear(
          { ...dto, correo: ' Ana@Mail.COM ' },
          TENANT,
        );

        // Assert
        expect(
          mockPacienteRepository.completarCorreoSiVacio,
        ).toHaveBeenCalledWith(
          'paciente-ya-existe',
          TENANT,
          'ana@mail.com',
          undefined,
        );
      });

      it('NO debería tocar un correo distinto ya guardado', async () => {
        // Arrange
        const ficha = existente('otro@mail.com');
        mockPacienteRepository.buscarPorRut.mockResolvedValue(ficha);

        // Act
        const result = await service.resolverOCrear(dto, TENANT);

        // Assert — nunca se reemplaza: ni escritura condicional ni guardar
        expect(result.correo).toBe('otro@mail.com');
        expect(
          mockPacienteRepository.completarCorreoSiVacio,
        ).not.toHaveBeenCalled();
        expect(mockPacienteRepository.guardar).not.toHaveBeenCalled();
      });

      it('NO debería escribir cuando el correo guardado es el mismo', async () => {
        // Arrange
        mockPacienteRepository.buscarPorRut.mockResolvedValue(
          existente('ana@mail.com'),
        );

        // Act
        await service.resolverOCrear(dto, TENANT);

        // Assert
        expect(
          mockPacienteRepository.completarCorreoSiVacio,
        ).not.toHaveBeenCalled();
      });

      it('debería escribir el correo dentro de la transacción del llamador', async () => {
        // Arrange
        mockPacienteRepository.buscarPorRut.mockResolvedValue(existente(null));

        // Act
        await service.resolverOCrear(dto, TENANT, 'tx');

        // Assert
        expect(
          mockPacienteRepository.completarCorreoSiVacio,
        ).toHaveBeenCalledWith(
          'paciente-ya-existe',
          TENANT,
          'ana@mail.com',
          'tx',
        );
      });

      it('debería releer la ficha si otra transacción completó el correo primero', async () => {
        // Arrange — la escritura condicional no encontró la fila vacía
        mockPacienteRepository.buscarPorRut.mockResolvedValue(existente(null));
        mockPacienteRepository.completarCorreoSiVacio.mockResolvedValue(false);
        const ganadora = existente('primero@mail.com');
        mockPacienteRepository.buscarPorId.mockResolvedValue(ganadora);

        // Act
        const result = await service.resolverOCrear(dto, TENANT, 'tx');

        // Assert — se devuelve lo que quedó, sin pisarlo
        expect(mockPacienteRepository.buscarPorId).toHaveBeenCalledWith(
          'paciente-ya-existe',
          TENANT,
          'tx',
        );
        expect(result).toBe(ganadora);
      });

      it('debería vincular sin error aunque el que llega no traiga correo', async () => {
        // Arrange — un llamador interno sin DTO; la fábrica solo aplica al crear
        mockPacienteRepository.buscarPorRut.mockResolvedValue(existente(null));

        // Act
        const result = await service.resolverOCrear(
          { ...dto, correo: undefined as unknown as string },
          TENANT,
        );

        // Assert
        expect(result.id).toBe('paciente-ya-existe');
        expect(
          mockPacienteRepository.completarCorreoSiVacio,
        ).not.toHaveBeenCalled();
      });
    });
  });

  describe('crearPaciente', () => {
    it('debería devolver el RUT formateado para mostrar', async () => {
      // Act
      const result = await service.crearPaciente(dto, USUARIO);

      // Assert — canónico en BD, formateado hacia afuera
      expect(result.rut).toBe('12.345.678-5');
      expect(result.id).toBe('paciente-1');
      expect(result.tenantId).toBe(TENANT);
    });

    it('debería devolver rut null cuando el paciente no tiene', async () => {
      // Act
      const result = await service.crearPaciente(
        {
          nombre: 'Sin RUT',
          telefono: '+56 9 0000 0000',
          correo: 'sin.rut@mail.com',
          consentimiento: true,
          terminosVersion: '1.0',
        },
        USUARIO,
      );

      // Assert
      expect(result.rut).toBeNull();
    });

    describe('US-11: aceptación del canal profesional', () => {
      it('debería abrir UNA transacción y crear y registrar dentro de ella', async () => {
        // Act
        await service.crearPaciente(dto, USUARIO);

        // Assert
        expect(mockTx.run).toHaveBeenCalledTimes(1);
        expect(mockPacienteRepository.guardar).toHaveBeenCalledWith(
          expect.any(Paciente),
          'tx',
        );
        expect(mockAceptaciones.insertarSiNoExiste).toHaveBeenCalledWith(
          expect.any(AceptacionTerminos),
          'tx',
        );
        expect(
          mockPacienteRepository.marcarConsentimiento,
        ).toHaveBeenCalledWith('paciente-1', TENANT, 'tx');
      });

      it('debería registrar canal profesional con el usuario del token, la versión y el reloj', async () => {
        // Act
        await service.crearPaciente(dto, USUARIO);

        // Assert
        const aceptacion = primeraAceptacion();
        expect(aceptacion).toMatchObject({
          tenantId: TENANT,
          pacienteId: 'paciente-1',
          version: '1.0',
          canal: CanalAceptacion.PROFESIONAL,
          aceptadaEn: AHORA,
          usuarioId: 'usuario-1',
          solicitudId: null,
          enlaceId: null,
        });
      });

      it('debería responder consentimiento: true también con un paciente existente que lo tenía en false', async () => {
        // Arrange — ficha vieja por RUT, sin autorización
        mockPacienteRepository.buscarPorRut.mockResolvedValue(
          Paciente.reconstituir({
            id: 'paciente-viejo',
            rut: '123456785',
            nombre: 'Ana (ficha)',
            telefono: '+56 9 9999 9999',
            correo: 'ana@mail.com',
            consentimiento: false,
            tenantId: TENANT,
          }),
        );

        // Act
        const result = await service.crearPaciente(dto, USUARIO);

        // Assert — se registra igual y la bandera queda en true
        expect(result.consentimiento).toBe(true);
        expect(primeraAceptacion().pacienteId).toBe('paciente-viejo');
        expect(
          mockPacienteRepository.marcarConsentimiento,
        ).toHaveBeenCalledWith('paciente-viejo', TENANT, 'tx');
      });

      it.each([undefined, '', '0.2', '9.9'])(
        'debería lanzar VersionTerminosNoVigenteError sin registrar con la versión %p',
        async (terminosVersion) => {
          // Act & Assert
          await expect(
            service.crearPaciente({ ...dto, terminosVersion }, USUARIO),
          ).rejects.toBeInstanceOf(VersionTerminosNoVigenteError);
          expect(mockAceptaciones.insertarSiNoExiste).not.toHaveBeenCalled();
          expect(
            mockPacienteRepository.marcarConsentimiento,
          ).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('registrarAceptacion (US-11)', () => {
    const props = {
      canal: CanalAceptacion.ENLACE_CITA as const,
      enlaceId: 'enlace-1',
      tenantId: TENANT,
      pacienteId: PACIENTE_ID,
      version: '1.0',
      aceptadaEn: AHORA,
    };

    it('debería insertar y marcar la bandera en el tx de quien llama', async () => {
      // Act
      const insertada = await service.registrarAceptacion(props, 'tx-llamador');

      // Assert
      expect(insertada).toBe(true);
      expect(mockAceptaciones.insertarSiNoExiste).toHaveBeenCalledWith(
        expect.objectContaining({ canal: CanalAceptacion.ENLACE_CITA }),
        'tx-llamador',
      );
      expect(mockPacienteRepository.marcarConsentimiento).toHaveBeenCalledWith(
        PACIENTE_ID,
        TENANT,
        'tx-llamador',
      );
      expect(mockTx.run).not.toHaveBeenCalled();
    });

    it('debería marcar la bandera aunque la aceptación ya existiera (no insertó)', async () => {
      // Arrange
      mockAceptaciones.insertarSiNoExiste.mockResolvedValue(false);

      // Act
      const insertada = await service.registrarAceptacion(props, 'tx');

      // Assert
      expect(insertada).toBe(false);
      expect(mockPacienteRepository.marcarConsentimiento).toHaveBeenCalled();
    });
  });

  describe('titularAceptoVigente (US-11)', () => {
    it('debería preguntar por las versiones que cubren, con el tenant y el tx', async () => {
      // Arrange
      mockAceptaciones.existeDelTitular.mockResolvedValue(true);

      // Act
      const acepto = await service.titularAceptoVigente(
        PACIENTE_ID,
        TENANT,
        'tx',
      );

      // Assert
      expect(acepto).toBe(true);
      expect(mockAceptaciones.existeDelTitular).toHaveBeenCalledWith(
        PACIENTE_ID,
        TENANT,
        ['1.0'],
        'tx',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // US-11 con los dobles en memoria: reproducen el SQL (INSERT … SELECT por
  // tenant, el índice único con ON CONFLICT DO NOTHING, el UPDATE condicional
  // de la bandera), así que se comprueba lo que QUEDA, no solo las llamadas.
  describe('US-11 sobre los dobles en memoria (lo que queda escrito)', () => {
    const OTRO_TENANT = 'tenant-2';
    const ENLACE_ID = '0e1a0000-0000-4000-8000-000000000001';
    const SOLICITUD_ID = '5011c000-0000-4000-8000-000000000001';

    let pacientes: InMemoryPacienteRepository;
    let aceptaciones: InMemoryAceptacionTerminosRepository;
    let transacciones: ContadorTransacciones;
    let real: PacientesService;

    const sembrarFicha = (
      id: string,
      props: Partial<{ consentimiento: boolean; tenantId: string }> = {},
    ): void => {
      pacientes.pacientes.set(
        id,
        Paciente.reconstituir({
          id,
          rut: '123456785',
          nombre: 'Ana Soto (ficha)',
          telefono: '+56 9 9999 9999',
          correo: 'ana@mail.com',
          consentimiento: props.consentimiento ?? false,
          tenantId: props.tenantId ?? TENANT,
        }),
      );
    };

    const bandera = (id = PACIENTE_ID): boolean | undefined =>
      pacientes.pacientes.get(id)?.consentimiento;

    const delCanal = (
      canal: CanalAceptacion,
      extra: Partial<{ tenantId: string; version: string }> = {},
    ): RegistrarAceptacionProps => {
      const base = {
        tenantId: extra.tenantId ?? TENANT,
        pacienteId: PACIENTE_ID,
        version: extra.version ?? '1.0',
        aceptadaEn: AHORA,
      };
      switch (canal) {
        case CanalAceptacion.FORMULARIO_PUBLICO:
          return { ...base, canal, solicitudId: SOLICITUD_ID };
        case CanalAceptacion.ENLACE_CITA:
          return { ...base, canal, enlaceId: ENLACE_ID };
        case CanalAceptacion.PROFESIONAL:
          return { ...base, canal, usuarioId: USUARIO.userId };
      }
    };

    beforeEach(() => {
      pacientes = new InMemoryPacienteRepository();
      aceptaciones = new InMemoryAceptacionTerminosRepository(pacientes);
      transacciones = new ContadorTransacciones();
      real = new PacientesService(
        pacientes,
        aceptaciones,
        transacciones,
        () => AHORA,
      );
      // Una ficha vieja, sin autorización (D7: sin relleno).
      sembrarFicha(PACIENTE_ID);
    });

    describe('registrarAceptacion', () => {
      it('debería insertar y encender la bandera la primera vez; la segunda no inserta y la bandera sigue en true', async () => {
        // Act
        const primera = await real.registrarAceptacion(
          delCanal(CanalAceptacion.ENLACE_CITA),
          'tx',
        );
        const segunda = await real.registrarAceptacion(
          delCanal(CanalAceptacion.ENLACE_CITA),
          'tx',
        );

        // Assert
        expect([primera, segunda]).toEqual([true, false]);
        expect(aceptaciones.filas()).toHaveLength(1);
        expect(bandera()).toBe(true);
      });

      it('debería dejar una fila por canal para la misma versión (D11)', async () => {
        // Act
        for (const canal of Object.values(CanalAceptacion)) {
          await real.registrarAceptacion(delCanal(canal), 'tx');
        }

        // Assert
        expect(aceptaciones.filas().map((a) => a.canal)).toEqual([
          CanalAceptacion.FORMULARIO_PUBLICO,
          CanalAceptacion.ENLACE_CITA,
          CanalAceptacion.PROFESIONAL,
        ]);
      });

      it('no debería escribir nada con un paciente de otra organización (ni la fila ni la bandera)', async () => {
        // Act
        const insertada = await real.registrarAceptacion(
          delCanal(CanalAceptacion.ENLACE_CITA, { tenantId: OTRO_TENANT }),
          'tx',
        );

        // Assert
        expect(insertada).toBe(false);
        expect(aceptaciones.filas()).toHaveLength(0);
        expect(bandera()).toBe(false);
      });

      it('no debería escribir nada con una versión que no sirve al canal', async () => {
        // Act & Assert
        await expect(
          real.registrarAceptacion(
            delCanal(CanalAceptacion.PROFESIONAL, { version: '9.9' }),
            'tx',
          ),
        ).rejects.toBeInstanceOf(VersionTerminosNoVigenteError);
        expect(aceptaciones.filas()).toHaveLength(0);
        expect(bandera()).toBe(false);
      });

      it('no debería abrir una transacción propia: corre en la de quien llama', async () => {
        // Act
        await real.registrarAceptacion(
          delCanal(CanalAceptacion.FORMULARIO_PUBLICO),
          'tx-de-quien-llama',
        );

        // Assert
        expect(transacciones.abiertas).toBe(0);
      });
    });

    describe('titularAceptoVigente', () => {
      it('debería ser false sin ninguna aceptación', async () => {
        expect(await real.titularAceptoVigente(PACIENTE_ID, TENANT)).toBe(
          false,
        );
      });

      it('debería ser false con SOLO la del profesional (no es del titular)', async () => {
        // Arrange
        await real.registrarAceptacion(
          delCanal(CanalAceptacion.PROFESIONAL),
          'tx',
        );

        // Act & Assert — la bandera sí se encendió, pero /cita sigue pidiendo
        expect(bandera()).toBe(true);
        expect(await real.titularAceptoVigente(PACIENTE_ID, TENANT)).toBe(
          false,
        );
      });

      it.each([
        CanalAceptacion.FORMULARIO_PUBLICO,
        CanalAceptacion.ENLACE_CITA,
      ])('debería ser true con una de %s de la 1.0', async (canal) => {
        // Arrange
        await real.registrarAceptacion(delCanal(canal), 'tx');

        // Act & Assert
        expect(await real.titularAceptoVigente(PACIENTE_ID, TENANT)).toBe(true);
      });

      it('debería ser false si se pregunta con otra organización', async () => {
        // Arrange
        await real.registrarAceptacion(
          delCanal(CanalAceptacion.ENLACE_CITA),
          'tx',
        );

        // Act & Assert
        expect(await real.titularAceptoVigente(PACIENTE_ID, OTRO_TENANT)).toBe(
          false,
        );
      });
    });

    describe('crearPaciente', () => {
      it('con un paciente existente por RUT con consentimiento false: lo vincula, registra profesional con el usuario y la bandera queda en true', async () => {
        // Act
        const respuesta = await real.crearPaciente(dto, USUARIO);

        // Assert — no se creó otro paciente
        expect(pacientes.pacientes.size).toBe(1);
        expect(respuesta.id).toBe(PACIENTE_ID);
        expect(respuesta.consentimiento).toBe(true);
        expect(bandera()).toBe(true);
        expect(aceptaciones.filas()).toEqual([
          expect.objectContaining({
            tenantId: TENANT,
            pacienteId: PACIENTE_ID,
            version: '1.0',
            canal: CanalAceptacion.PROFESIONAL,
            aceptadaEn: AHORA,
            usuarioId: USUARIO.userId,
            solicitudId: null,
            enlaceId: null,
          }),
        ]);
        expect(transacciones.abiertas).toBe(1);
      });

      it('dos altas del mismo RUT con la misma versión dejan UNA fila profesional', async () => {
        // Act
        await real.crearPaciente(dto, USUARIO);
        await real.crearPaciente(dto, { ...USUARIO, userId: 'usuario-2' });

        // Assert — gana el primer acto
        expect(aceptaciones.filas()).toHaveLength(1);
        expect(aceptaciones.filas()[0].usuarioId).toBe(USUARIO.userId);
        expect(transacciones.abiertas).toBe(2);
      });

      it('un paciente nuevo nace con su aceptación y la bandera en true', async () => {
        // Act
        const respuesta = await real.crearPaciente(
          { ...dto, rut: undefined, correo: 'nueva@mail.com' },
          USUARIO,
        );

        // Assert
        expect(pacientes.pacientes.size).toBe(2);
        expect(bandera(respuesta.id)).toBe(true);
        expect(aceptaciones.filas()[0].pacienteId).toBe(respuesta.id);
      });
    });
  });

  describe('actualizarContacto (PATCH /pacientes/:id)', () => {
    const tras = (correo: string | null, telefono = '+56 9 9999 9999') =>
      Paciente.reconstituir({
        id: PACIENTE_ID,
        rut: '123456785',
        nombre: 'Ana Soto',
        telefono,
        correo,
        consentimiento: true,
        tenantId: TENANT,
      });

    it('debería escribir solo los campos presentes, filtrando por tenant', async () => {
      // Arrange
      mockPacienteRepository.buscarPorId.mockResolvedValue(
        tras('ana@mail.com'),
      );

      // Act
      await service.actualizarContacto(
        PACIENTE_ID,
        { correo: 'ana@mail.com' },
        TENANT,
      );

      // Assert
      expect(mockPacienteRepository.actualizarContacto).toHaveBeenCalledWith(
        PACIENTE_ID,
        TENANT,
        { correo: 'ana@mail.com' },
      );
    });

    it('debería normalizar el correo antes de escribirlo', async () => {
      // Arrange
      mockPacienteRepository.buscarPorId.mockResolvedValue(
        tras('ana@mail.com'),
      );

      // Act
      await service.actualizarContacto(
        PACIENTE_ID,
        { correo: '  ANA@Mail.com ' },
        TENANT,
      );

      // Assert
      expect(mockPacienteRepository.actualizarContacto).toHaveBeenCalledWith(
        PACIENTE_ID,
        TENANT,
        { correo: 'ana@mail.com' },
      );
    });

    it('debería responder con el paciente releído, en el DTO del alta', async () => {
      // Arrange
      mockPacienteRepository.buscarPorId.mockResolvedValue(
        tras('nuevo@mail.com', '+56 9 2222 2222'),
      );

      // Act
      const result = await service.actualizarContacto(
        PACIENTE_ID,
        { telefono: '+56 9 2222 2222', correo: 'nuevo@mail.com' },
        TENANT,
      );

      // Assert
      expect(result).toBeInstanceOf(PacienteResponseDto);
      expect(result).toEqual({
        id: PACIENTE_ID,
        rut: '12.345.678-5',
        nombre: 'Ana Soto',
        telefono: '+56 9 2222 2222',
        correo: 'nuevo@mail.com',
        consentimiento: true,
        tenantId: TENANT,
      });
      expect(mockPacienteRepository.buscarPorId).toHaveBeenCalledWith(
        PACIENTE_ID,
        TENANT,
      );
    });

    it('debería permitir reemplazar un correo ya guardado (edición explícita)', async () => {
      // Arrange
      mockPacienteRepository.buscarPorId.mockResolvedValue(
        tras('corregido@mail.com'),
      );

      // Act
      const result = await service.actualizarContacto(
        PACIENTE_ID,
        { correo: 'corregido@mail.com' },
        TENANT,
      );

      // Assert — a diferencia de la vinculación por RUT, aquí sí se escribe
      expect(mockPacienteRepository.actualizarContacto).toHaveBeenCalled();
      expect(result.correo).toBe('corregido@mail.com');
    });

    it('debería lanzar PacienteNoEncontradoError si el paciente es de otro tenant (o no existe)', async () => {
      // Arrange — el UPDATE filtrado por tenant no encontró fila
      mockPacienteRepository.actualizarContacto.mockResolvedValue(false);

      // Act & Assert
      await expect(
        service.actualizarContacto(
          PACIENTE_ID,
          { telefono: '+56 9 2222 2222' },
          'tenant-ajeno',
        ),
      ).rejects.toBeInstanceOf(PacienteNoEncontradoError);

      expect(mockPacienteRepository.actualizarContacto).toHaveBeenCalledWith(
        PACIENTE_ID,
        'tenant-ajeno',
        { telefono: '+56 9 2222 2222' },
      );
      expect(mockPacienteRepository.buscarPorId).not.toHaveBeenCalled();
    });

    it('debería lanzar CambioContactoVacioError sin tocar la BD si no trae campos', async () => {
      // Act & Assert
      await expect(
        service.actualizarContacto(PACIENTE_ID, {}, TENANT),
      ).rejects.toBeInstanceOf(CambioContactoVacioError);

      expect(mockPacienteRepository.actualizarContacto).not.toHaveBeenCalled();
    });

    it('debería lanzar CorreoPacienteRequeridoError sin tocar la BD si el correo viene en blanco', async () => {
      // Act & Assert
      await expect(
        service.actualizarContacto(PACIENTE_ID, { correo: '  ' }, TENANT),
      ).rejects.toBeInstanceOf(CorreoPacienteRequeridoError);

      expect(mockPacienteRepository.actualizarContacto).not.toHaveBeenCalled();
    });
  });
});
