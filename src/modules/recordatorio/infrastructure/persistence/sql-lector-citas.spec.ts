import { EntityManager } from 'typeorm';

import { SqlLectorCitas } from './sql-lector-citas';

/**
 * Lector SQL SIN base de datos: se verifica el SQL, los parámetros y el mapeo.
 * El SQL real (JOIN, NOT EXISTS, cursor) lo cubren el smoke del paso 7 y la
 * integración del paso 14.
 */
describe('SqlLectorCitas', () => {
  const CITA = '0c170000-0000-4000-8000-000000000001';
  const TENANT = '7e000000-0000-4000-8000-000000000001';
  const USUARIO = '05000000-0000-4000-8000-000000000001';
  const PACIENTE = '0a000000-0000-4000-8000-000000000001';
  const INICIO = new Date('2026-10-05T13:00:00.000Z');
  const AHORA = new Date('2026-10-03T12:00:00.000Z');
  const EN_8_DIAS = new Date('2026-10-11T12:00:00.000Z');

  let tx: { query: jest.Mock<Promise<unknown>, [string, unknown[]?]> };
  let lector: SqlLectorCitas;

  const comoTx = () => tx as unknown as EntityManager;
  const sql = (i = 0): string =>
    tx.query.mock.calls[i][0].replace(/\s+/g, ' ').trim();
  const parametros = (i = 0): unknown[] =>
    tx.query.mock.calls[i][1] as unknown[];

  const filaCita = (estado = 'pendiente') => ({
    id: CITA,
    tenantId: TENANT,
    usuarioId: USUARIO,
    pacienteId: PACIENTE,
    inicio: INICIO,
    estado,
  });

  beforeEach(() => {
    tx = {
      query: jest
        .fn<Promise<unknown>, [string, unknown[]?]>()
        .mockResolvedValue([]),
    };
    lector = new SqlLectorCitas();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sin transacción', () => {
    it.each<[string, () => Promise<unknown>]>([
      ['obtenerCita', () => lector.obtenerCita(CITA, TENANT, undefined)],
      [
        'obtenerDatosEnvio',
        () => lector.obtenerDatosEnvio(CITA, TENANT, undefined),
      ],
      [
        'listarVigentesDeProfesionalDesde',
        () =>
          lector.listarVigentesDeProfesionalDesde(
            TENANT,
            USUARIO,
            AHORA,
            undefined,
          ),
      ],
      [
        'listarVigentesSinRecordatorio',
        () =>
          lector.listarVigentesSinRecordatorio(
            { desde: AHORA, hasta: EN_8_DIAS, limite: 50 },
            undefined,
          ),
      ],
    ])('%s debería lanzar', async (op, fn) => {
      // Act & Assert
      await expect(fn()).rejects.toThrow(
        new RegExp(`LectorCitas\\.${op} requiere una transacción`),
      );
    });
  });

  describe('obtenerCita', () => {
    it('debería leer la cita del tenant, con el estado como texto', async () => {
      // Arrange
      tx.query.mockResolvedValue([filaCita()]);

      // Act
      const cita = await lector.obtenerCita(CITA, TENANT, comoTx());

      // Assert
      expect(sql()).toContain(`c."estado"::text AS "estado"`);
      expect(sql()).toContain(`WHERE c."id" = $1 AND c."tenant_id" = $2`);
      expect(parametros()).toEqual([CITA, TENANT]);
      expect(cita).toEqual({ ...filaCita(), vigente: true });
    });

    it.each([
      ['pendiente', true],
      ['confirmada', true],
      ['cancelada', false],
      ['asistio', false],
      ['no_asistio', false],
      ['ghosting', false],
    ])('estado %s → vigente %p (ADR-04)', async (estado, vigente) => {
      // Arrange
      tx.query.mockResolvedValue([filaCita(estado)]);

      // Act
      const cita = await lector.obtenerCita(CITA, TENANT, comoTx());

      // Assert
      expect(cita?.vigente).toBe(vigente);
    });

    it('debería devolver null si no existe en el tenant', async () => {
      // Act & Assert
      expect(await lector.obtenerCita(CITA, TENANT, comoTx())).toBeNull();
    });

    it('con un id que no es UUID debería devolver null sin consultar', async () => {
      // Act & Assert
      expect(await lector.obtenerCita('123', TENANT, comoTx())).toBeNull();
      expect(tx.query).not.toHaveBeenCalled();
    });
  });

  describe('obtenerDatosEnvio', () => {
    it('debería traer cita, paciente, profesional y organización en UNA consulta', async () => {
      // Arrange
      tx.query.mockResolvedValue([
        {
          ...filaCita('confirmada'),
          pacienteCorreo: 'ana@example.com',
          pacienteConsentimiento: true,
          profesionalNombre: 'Dra. Rojas',
          organizacionNombre: 'Clínica Demo',
        },
      ]);

      // Act
      const datos = await lector.obtenerDatosEnvio(CITA, TENANT, comoTx());

      // Assert
      expect(tx.query).toHaveBeenCalledTimes(1);
      expect(sql()).toContain(
        `JOIN "pacientes" p ON p."id" = c."paciente_id" AND p."tenant_id" = c."tenant_id"`,
      );
      expect(sql()).toContain(
        `JOIN "usuarios" u ON u."id" = c."usuario_id" AND u."tenant_id" = c."tenant_id"`,
      );
      expect(sql()).toContain(`JOIN "tenants" t ON t."id" = c."tenant_id"`);
      expect(sql()).toContain(`NULLIF(btrim(p."correo"), '')`);
      expect(datos).toEqual({
        cita: { ...filaCita('confirmada'), vigente: true },
        paciente: { correo: 'ana@example.com', consentimiento: true },
        profesional: { nombreCompleto: 'Dra. Rojas' },
        organizacion: { nombre: 'Clínica Demo' },
      });
    });

    it('debería devolver null si no existe y no consultar con un id inválido', async () => {
      // Act & Assert
      expect(await lector.obtenerDatosEnvio(CITA, TENANT, comoTx())).toBeNull();
      expect(await lector.obtenerDatosEnvio('x', TENANT, comoTx())).toBeNull();
      expect(tx.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('listarVigentesDeProfesionalDesde', () => {
    it('debería filtrar por tenant, profesional, inicio >= desde y vigentes', async () => {
      // Arrange
      tx.query.mockResolvedValue([filaCita()]);

      // Act
      const citas = await lector.listarVigentesDeProfesionalDesde(
        TENANT,
        USUARIO,
        AHORA,
        comoTx(),
      );

      // Assert
      expect(sql()).toContain(
        `WHERE c."tenant_id" = $1 AND c."usuario_id" = $2 AND c."inicio" >= $3 AND c."estado"::text = ANY($4::text[])`,
      );
      expect(parametros()).toEqual([
        TENANT,
        USUARIO,
        AHORA,
        ['pendiente', 'confirmada'],
      ]);
      expect(citas).toEqual([{ ...filaCita(), vigente: true }]);
    });
  });

  describe('listarVigentesSinRecordatorio (BARRIDO GLOBAL)', () => {
    it('debería cruzar citas × recordatorios con NOT EXISTS sobre el inicio actual', async () => {
      // Act
      await lector.listarVigentesSinRecordatorio(
        { desde: AHORA, hasta: EN_8_DIAS, limite: 50 },
        comoTx(),
      );

      // Assert
      expect(tx.query).toHaveBeenCalledTimes(1);
      expect(sql()).toContain(
        `NOT EXISTS ( SELECT 1 FROM "recordatorios" r WHERE r."cita_id" = c."id" AND r."inicio_cita" = c."inicio" )`,
      );
      expect(sql()).toContain(`c."inicio" >= $2 AND c."inicio" < $3`);
      expect(sql()).toContain(`ORDER BY c."inicio", c."id" LIMIT $4`);
      expect(sql()).not.toContain('$5');
      expect(parametros()).toEqual([
        ['pendiente', 'confirmada'],
        AHORA,
        EN_8_DIAS,
        50,
      ]);
    });

    it('no debería filtrar por tenant', async () => {
      // Act
      await lector.listarVigentesSinRecordatorio(
        { desde: AHORA, hasta: EN_8_DIAS, limite: 50 },
        comoTx(),
      );

      // Assert
      expect(sql()).not.toMatch(/WHERE[^;]*"tenant_id"/);
    });

    it('con cursor debería seguir después de (inicio, id)', async () => {
      // Act
      await lector.listarVigentesSinRecordatorio(
        {
          desde: AHORA,
          hasta: EN_8_DIAS,
          limite: 50,
          despuesDe: { inicio: INICIO, id: CITA },
        },
        comoTx(),
      );

      // Assert
      expect(sql()).toContain(
        `AND (c."inicio", c."id") > ($5::timestamptz, $6::uuid)`,
      );
      expect(parametros().slice(4)).toEqual([INICIO, CITA]);
    });

    it.each([0, -1, 1.5, NaN])(
      'debería rechazar limite = %p',
      async (limite) => {
        // Act & Assert
        await expect(
          lector.listarVigentesSinRecordatorio(
            { desde: AHORA, hasta: EN_8_DIAS, limite },
            comoTx(),
          ),
        ).rejects.toThrow(RangeError);
        expect(tx.query).not.toHaveBeenCalled();
      },
    );

    it('debería rechazar un rango invertido', async () => {
      // Act & Assert
      await expect(
        lector.listarVigentesSinRecordatorio(
          { desde: EN_8_DIAS, hasta: AHORA, limite: 10 },
          comoTx(),
        ),
      ).rejects.toThrow(RangeError);
    });
  });
});
