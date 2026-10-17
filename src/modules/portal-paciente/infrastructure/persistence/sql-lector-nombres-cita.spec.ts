import { EntityManager } from 'typeorm';

import { SqlLectorNombresCita } from './sql-lector-nombres-cita';

/**
 * Lector SQL SIN base de datos: se verifica el SQL, los parámetros y el mapeo.
 * El SQL real (JOIN con `tenants`, filtro por tenant) lo recorren
 * `test/portal-paciente.e2e-spec.ts` ("cada enlace muestra los nombres de SU
 * organización") y `integration/portal-paciente-concurrencia.integration.spec.ts`.
 */
describe('SqlLectorNombresCita', () => {
  const USUARIO = '05000000-0000-4000-8000-000000000001';
  const TENANT = '7e000000-0000-4000-8000-000000000001';

  let tx: { query: jest.Mock<Promise<unknown>, [string, unknown[]?]> };
  let lector: SqlLectorNombresCita;

  const comoTx = () => tx as unknown as EntityManager;
  const sql = (): string =>
    tx.query.mock.calls[0][0].replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    tx = {
      query: jest
        .fn<Promise<unknown>, [string, unknown[]?]>()
        .mockResolvedValue([]),
    };
    lector = new SqlLectorNombresCita();
  });

  it('debería lanzar sin transacción, sin consultar nada', async () => {
    // Act & Assert
    await expect(lector.leer(USUARIO, TENANT, undefined)).rejects.toThrow(
      'LectorNombresCita.leer requiere una transacción',
    );
    expect(tx.query).not.toHaveBeenCalled();
  });

  it('debería leer en UNA consulta, con el tx recibido, filtrando por usuario Y tenant', async () => {
    // Arrange
    tx.query.mockResolvedValue([
      { profesional: 'Dra. Ana Soto', organizacion: 'Clínica Sur' },
    ]);

    // Act
    const nombres = await lector.leer(USUARIO, TENANT, comoTx());

    // Assert
    expect(nombres).toEqual({
      profesional: 'Dra. Ana Soto',
      organizacion: 'Clínica Sur',
    });
    expect(tx.query).toHaveBeenCalledTimes(1);
    expect(tx.query.mock.calls[0][1]).toEqual([USUARIO, TENANT]);
    expect(sql()).toContain('JOIN "tenants" t ON t."id" = u."tenant_id"');
    expect(sql()).toContain('WHERE u."id" = $1 AND u."tenant_id" = $2');
  });

  it('solo lectura: ni escribe ni bloquea', async () => {
    // Act
    await lector.leer(USUARIO, TENANT, comoTx());

    // Assert
    expect(sql()).toMatch(/^SELECT /);
    expect(sql()).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|FOR UPDATE|FOR SHARE)\b/i,
    );
  });

  it('solo los dos nombres: aunque la fila traiga más columnas, no salen', async () => {
    // Arrange
    tx.query.mockResolvedValue([
      {
        profesional: 'Dra. Ana Soto',
        organizacion: 'Clínica Sur',
        email: 'ana@sur.cl',
      },
    ]);

    // Act
    const nombres = await lector.leer(USUARIO, TENANT, comoTx());

    // Assert
    expect(nombres).toEqual({
      profesional: 'Dra. Ana Soto',
      organizacion: 'Clínica Sur',
    });
  });

  it.each<[string, unknown]>([
    ['sin filas (usuario de otro tenant o inexistente)', []],
    ['un resultado que no es una lista', undefined],
  ])('debería devolver null %s', async (_caso, resultado) => {
    // Arrange
    tx.query.mockResolvedValue(resultado);

    // Act & Assert
    await expect(lector.leer(USUARIO, TENANT, comoTx())).resolves.toBeNull();
  });
});
