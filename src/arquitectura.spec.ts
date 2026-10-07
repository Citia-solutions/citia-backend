import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { preProcessFile } from 'typescript';

/**
 * ADR-02 §2 y §4 como test (US-03, Definición de Terminado): `domain/` y
 * `application/` no dependen del framework ni de la persistencia.
 *
 * Reemplaza el `grep` de ADR-02 §4, que NO detecta nada: su patrón
 * `from '@nestjs'` exige la comilla justo después de `@nestjs`, y todo import
 * real es `from '@nestjs/<paquete>'` (ver el último test). Aquí los
 * especificadores se leen con el preprocesador de TypeScript, que ignora
 * comentarios y textos y ve también `import type`, `export … from`,
 * `require()` e `import()` dinámico.
 *
 * Alcance: todo `.ts` (también los `*.spec.ts`) bajo `src/modules/<m>/domain`,
 * `src/modules/<m>/application`, `src/shared/domain` y `src/shared/application`.
 */

const RAIZ = __dirname;

/** Paquetes que ADR-02 §2 prohíbe en `domain/` y `application/`. */
const PAQUETES_PROHIBIDOS: readonly RegExp[] = [
  /^@nestjs\//,
  /^typeorm(\/|$)/,
  /^class-validator(\/|$)/,
  /^class-transformer(\/|$)/,
];

/** ADR-02 §2: ninguna de las dos capas importa adaptadores. */
const CARPETA_PROHIBIDA = /(^|\/)infrastructure(\/|$)/;

interface Violacion {
  archivo: string;
  importa: string;
}

/** Módulos que importa un fuente (sin comentarios ni textos). */
function especificadores(codigo: string): string[] {
  return preProcessFile(codigo, true, true).importedFiles.map(
    (f) => f.fileName,
  );
}

/** Especificadores que ADR-02 no permite en `domain/` ni `application/`. */
function prohibidos(codigo: string): string[] {
  return especificadores(codigo).filter(
    (m) =>
      PAQUETES_PROHIBIDOS.some((p) => p.test(m)) ||
      (m.startsWith('.') && CARPETA_PROHIBIDA.test(m)),
  );
}

function archivosTs(carpeta: string): string[] {
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) return archivosTs(ruta);
    return ruta.endsWith('.ts') ? [ruta] : [];
  });
}

/** Las carpetas `domain/` y `application/` de cada módulo y de `shared/`. */
function carpetasVigiladas(): string[] {
  const modulos = join(RAIZ, 'modules');
  const raices = [
    ...readdirSync(modulos).map((m) => join(modulos, m)),
    join(RAIZ, 'shared'),
  ];
  return raices.flatMap((r) =>
    ['domain', 'application']
      .map((capa) => join(r, capa))
      .filter((c) => existsSync(c)),
  );
}

describe('ADR-02: dependencias de domain/ y application/', () => {
  const carpetas = carpetasVigiladas();
  const archivos = carpetas.flatMap(archivosTs);

  it('debería revisar las capas de todos los módulos (el check no es vacío)', () => {
    // Assert — si una ruta cambia y no encuentra nada, el test no debe pasar en falso
    const nombres = carpetas.map((c) => relative(RAIZ, c).replace(/\\/g, '/'));
    expect(nombres).toEqual(
      expect.arrayContaining([
        'modules/cita/domain',
        'modules/cita/application',
        'modules/recordatorio/domain',
        'modules/recordatorio/application',
        'shared/domain',
        'shared/application',
      ]),
    );
    expect(archivos.length).toBeGreaterThan(50);
  });

  it('no debería importar @nestjs/*, typeorm, class-validator, class-transformer ni infrastructure/', () => {
    // Act
    const violaciones: Violacion[] = archivos.flatMap((archivo) =>
      prohibidos(readFileSync(archivo, 'utf8')).map((importa) => ({
        archivo: relative(RAIZ, archivo).replace(/\\/g, '/'),
        importa,
      })),
    );

    // Assert
    expect(violaciones).toEqual([]);
  });

  describe('el detector', () => {
    it.each([
      ["import { Injectable } from '@nestjs/common';", '@nestjs/common'],
      ['import type { EntityManager } from "typeorm";', 'typeorm'],
      ["export * from 'typeorm/browser';", 'typeorm/browser'],
      ["const { Logger } = require('@nestjs/common');", '@nestjs/common'],
      ["const v = await import('class-validator');", 'class-validator'],
      ["import { Type } from 'class-transformer';", 'class-transformer'],
      [
        "import { Repo } from '../infrastructure/persistence/repo';",
        '../infrastructure/persistence/repo',
      ],
      [
        "import { truncar } from '../../../shared/infrastructure/salida/x';",
        '../../../shared/infrastructure/salida/x',
      ],
    ])('debería marcar %s', (codigo, esperado) => {
      expect(prohibidos(codigo)).toEqual([esperado]);
    });

    it('no debería marcar comentarios, textos ni imports permitidos', () => {
      // Arrange
      const codigo = [
        "// import { Injectable } from '@nestjs/common';",
        "/* import { DataSource } from 'typeorm'; */",
        'const texto = "from \'@nestjs/common\'";',
        "import { createHash } from 'node:crypto';",
        "import { Cita } from '../domain/cita.entity';",
        "import { TransactionContext } from '../../../shared/application/transaction-runner';",
        "import { infraestructuraFalsa } from './infrastructure-like';",
      ].join('\n');

      // Assert
      expect(prohibidos(codigo)).toEqual([]);
    });

    it('el grep que propone ADR-02 §4 no detecta un import real de Nest (por eso este test)', () => {
      // Arrange — el patrón literal del ADR
      const grepDelAdr = /from 'typeorm'|from '@nestjs'/;
      const importReal = "import { Injectable } from '@nestjs/common';";

      // Assert
      expect(grepDelAdr.test(importReal)).toBe(false);
      expect(prohibidos(importReal)).toEqual(['@nestjs/common']);
    });
  });
});
