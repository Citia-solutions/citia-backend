import {
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common/enums/request-method.enum';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { METADATA_LIMITES_TASA } from '../../../shared/presentation/limitar-tasa.decorator';
import { SinCacheNiReferrerInterceptor } from '../../../shared/presentation/sin-cache-ni-referrer.interceptor';
import { EnlaceCitaNoValidoError } from '../../cita/application/enlace-cita-no-valido.error';
import { EstadoCita } from '../../cita/domain/cita.entity';
import { TransicionEstadoInvalidaError } from '../../cita/domain/exceptions/transicion-estado-invalida.error';
import { ReagendamientoYaSolicitadoError } from '../../solicitud/domain/reagendamiento-ya-solicitado.error';
import { AccionNoDisponibleError } from '../application/accion-no-disponible.error';
import { PortalPacienteService } from '../application/portal-paciente.service';
import { CancelarCitaPacienteDto } from './dto/cancelar-cita-paciente.dto';
import { PedirOtraHoraDto } from './dto/pedir-otra-hora.dto';
import { VistaCitaPacienteDto } from './dto/vista-cita-paciente.dto';
import {
  CUERPO_ACCION_NO_DISPONIBLE,
  CUERPO_ENLACE_NO_VALIDO,
  PortalPacienteController,
} from './portal-paciente.controller';

describe('PortalPacienteController', () => {
  const TOKEN = 't'.repeat(43);

  let portal: {
    ver: jest.Mock;
    confirmar: jest.Mock;
    cancelar: jest.Mock;
    pedirOtraHora: jest.Mock;
  };
  let controller: PortalPacienteController;

  const vista = new VistaCitaPacienteDto({
    inicio: '2026-10-20T13:00:00.000Z',
    zonaHoraria: 'America/Santiago',
    duracionMin: 45,
    estado: EstadoCita.PENDIENTE,
    profesional: 'Dra. Ana Soto',
    organizacion: 'Clínica Sur',
    accionesPermitidas: ['confirmar', 'cancelar', 'pedirOtraHora'],
    solicitudOtraHora: null,
  });

  beforeEach(() => {
    portal = {
      ver: jest.fn().mockResolvedValue(vista),
      confirmar: jest.fn().mockResolvedValue(vista),
      cancelar: jest.fn().mockResolvedValue(vista),
      pedirOtraHora: jest.fn().mockResolvedValue(vista),
    };
    controller = new PortalPacienteController(
      portal as unknown as PortalPacienteService,
    );
  });

  const handler = (nombre: keyof PortalPacienteController): object =>
    Object.getOwnPropertyDescriptor(PortalPacienteController.prototype, nombre)
      ?.value as object;

  /** Las cuatro rutas, con la llamada al servicio que les corresponde. */
  const rutas: [
    string,
    keyof typeof portal,
    (token: string | undefined) => Promise<unknown>,
  ][] = [
    ['ver', 'ver', (t) => controller.ver(t)],
    ['confirmar', 'confirmar', (t) => controller.confirmar(t)],
    ['cancelar', 'cancelar', (t) => controller.cancelar(t, {})],
    [
      'pedirOtraHora',
      'pedirOtraHora',
      (t) => controller.pedirOtraHora(t, { preferencia: 'tardes' }),
    ],
  ];

  // ---------------------------------------------------------------------------
  describe('rutas y metadatos', () => {
    it('debería montarse en publico/cita, SIN guard de JWT', () => {
      expect(Reflect.getMetadata(PATH_METADATA, PortalPacienteController)).toBe(
        'publico/cita',
      );
      expect(
        Reflect.getMetadata(GUARDS_METADATA, PortalPacienteController),
      ).toBeUndefined();
      for (const nombre of [
        'ver',
        'confirmar',
        'cancelar',
        'pedirOtraHora',
      ] as const) {
        expect(
          Reflect.getMetadata(GUARDS_METADATA, handler(nombre)),
        ).toBeUndefined();
      }
    });

    it.each<[keyof PortalPacienteController, RequestMethod, string, number]>([
      ['ver', RequestMethod.GET, '/', HttpStatus.OK],
      ['confirmar', RequestMethod.POST, 'confirmar', HttpStatus.OK],
      ['cancelar', RequestMethod.POST, 'cancelar', HttpStatus.OK],
      ['pedirOtraHora', RequestMethod.POST, 'otra-hora', HttpStatus.CREATED],
    ])('%s → método %s, ruta %s, éxito %s', (nombre, metodo, ruta, codigo) => {
      const h = handler(nombre);
      expect(Reflect.getMetadata(METHOD_METADATA, h)).toBe(metodo);
      expect(Reflect.getMetadata(PATH_METADATA, h)).toBe(ruta);
      if (metodo === RequestMethod.POST) {
        expect(Reflect.getMetadata(HTTP_CODE_METADATA, h)).toBe(codigo);
      }
    });

    it('debería limitar por IP en la clase y por enlace SOLO en los POST', () => {
      expect(
        Reflect.getMetadata(METADATA_LIMITES_TASA, PortalPacienteController),
      ).toEqual(['portalPorIp']);
      expect(
        Reflect.getMetadata(METADATA_LIMITES_TASA, handler('ver')),
      ).toBeUndefined();
      for (const nombre of [
        'confirmar',
        'cancelar',
        'pedirOtraHora',
      ] as const) {
        expect(
          Reflect.getMetadata(METADATA_LIMITES_TASA, handler(nombre)),
        ).toEqual(['portalPorEnlace']);
      }
    });

    it('debería poner no-store / no-referrer en todas sus respuestas (interceptor de clase)', () => {
      expect(
        Reflect.getMetadata(INTERCEPTORS_METADATA, PortalPacienteController),
      ).toEqual([SinCacheNiReferrerInterceptor]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('delegación', () => {
    it('ver: pasa el token de la cabecera tal cual', async () => {
      expect(await controller.ver(TOKEN)).toBe(vista);
      expect(portal.ver).toHaveBeenCalledWith(TOKEN);
    });

    it('ver: sin cabecera pasa undefined (el servicio responde el 404 uniforme)', async () => {
      await controller.ver(undefined);
      expect(portal.ver).toHaveBeenCalledWith(undefined);
    });

    it('confirmar', async () => {
      expect(await controller.confirmar(TOKEN)).toBe(vista);
      expect(portal.confirmar).toHaveBeenCalledWith(TOKEN);
    });

    it('cancelar: con y sin motivo', async () => {
      await controller.cancelar(TOKEN, { motivo: 'viaje' });
      await controller.cancelar(TOKEN, {});
      expect(portal.cancelar).toHaveBeenNthCalledWith(1, TOKEN, 'viaje');
      expect(portal.cancelar).toHaveBeenNthCalledWith(2, TOKEN, undefined);
    });

    it('pedirOtraHora: preferencia y motivo del cuerpo', async () => {
      expect(
        await controller.pedirOtraHora(TOKEN, {
          preferencia: 'tardes',
          motivo: 'trabajo',
        }),
      ).toBe(vista);
      expect(portal.pedirOtraHora).toHaveBeenCalledWith(TOKEN, {
        preferencia: 'tardes',
        motivo: 'trabajo',
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('errores con cuerpo fijo', () => {
    const capturar = async (p: Promise<unknown>): Promise<HttpException> => {
      try {
        await p;
      } catch (e) {
        return e as HttpException;
      }
      throw new Error('se esperaba un error');
    };

    describe.each(rutas)('%s', (_nombre, metodo, llamar) => {
      it('EnlaceCitaNoValidoError → 404 { statusCode, message } exacto, sin "error"', async () => {
        // Arrange
        portal[metodo].mockRejectedValue(new EnlaceCitaNoValidoError());

        // Act
        const error = await capturar(llamar(TOKEN));

        // Assert
        expect(error).toBeInstanceOf(NotFoundException);
        expect(error.getStatus()).toBe(404);
        expect(error.getResponse()).toEqual({
          statusCode: 404,
          message: 'Enlace no válido o vencido',
        });
      });

      it.each([
        ['AccionNoDisponibleError', new AccionNoDisponibleError()],
        [
          'TransicionEstadoInvalidaError',
          new TransicionEstadoInvalidaError(EstadoCita.CONFIRMADA, 'confirmar'),
        ],
        [
          'ReagendamientoYaSolicitadoError',
          new ReagendamientoYaSolicitadoError(),
        ],
      ])('%s → 409 { statusCode, message } exacto', async (_n, causa) => {
        // Arrange
        portal[metodo].mockRejectedValue(causa);

        // Act
        const error = await capturar(llamar(TOKEN));

        // Assert
        expect(error).toBeInstanceOf(ConflictException);
        expect(error.getResponse()).toEqual({
          statusCode: 409,
          message: 'Esta acción ya no está disponible',
        });
        // Nada del error de dominio (estado, evento) en el cuerpo
        expect(JSON.stringify(error.getResponse())).not.toMatch(
          /confirmada|Transición|solicitud/,
        );
      });

      it('cualquier otro error se propaga (Nest responde el 500 genérico)', async () => {
        // Arrange
        const inesperado = new Error('Integridad: algo con ids');
        portal[metodo].mockRejectedValue(inesperado);

        // Act & Assert
        await expect(llamar(TOKEN)).rejects.toBe(inesperado);
      });
    });

    it('los cuerpos fijos no se pueden alterar', () => {
      expect(Object.isFrozen(CUERPO_ENLACE_NO_VALIDO)).toBe(true);
      expect(Object.isFrozen(CUERPO_ACCION_NO_DISPONIBLE)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('DTOs (como el ValidationPipe global: transform + whitelist)', () => {
    const errores = async <T extends object>(
      clase: new () => T,
      cuerpo: Record<string, unknown>,
    ): Promise<Record<string, string[]>> => {
      const dto = plainToInstance(clase, cuerpo);
      const resultado = await validate(dto, { whitelist: true });
      return Object.fromEntries(
        resultado.map((e) => [e.property, Object.keys(e.constraints ?? {})]),
      );
    };

    describe('PedirOtraHoraDto', () => {
      it('acepta preferencia de 1 y de 300 caracteres y motivo opcional', async () => {
        expect(await errores(PedirOtraHoraDto, { preferencia: 'x' })).toEqual(
          {},
        );
        expect(
          await errores(PedirOtraHoraDto, {
            preferencia: 'x'.repeat(300),
            motivo: 'y'.repeat(300),
          }),
        ).toEqual({});
      });

      it.each<[string, Record<string, unknown>, string, string]>([
        ['sin preferencia', {}, 'preferencia', 'isNotEmpty'],
        ['preferencia vacía', { preferencia: '' }, 'preferencia', 'isNotEmpty'],
        [
          'preferencia solo con espacios',
          { preferencia: '    ' },
          'preferencia',
          'isNotEmpty',
        ],
        [
          'preferencia de 301',
          { preferencia: 'x'.repeat(301) },
          'preferencia',
          'maxLength',
        ],
        [
          'preferencia no texto',
          { preferencia: 42 },
          'preferencia',
          'isString',
        ],
        [
          'motivo de 301',
          { preferencia: 'x', motivo: 'y'.repeat(301) },
          'motivo',
          'maxLength',
        ],
      ])('rechaza %s', async (_caso, cuerpo, campo, regla) => {
        expect((await errores(PedirOtraHoraDto, cuerpo))[campo]).toContain(
          regla,
        );
      });

      it('recorta la preferencia y el motivo antes de validar', () => {
        const dto = plainToInstance(PedirOtraHoraDto, {
          preferencia: '  martes  ',
          motivo: ' viaje ',
        });
        expect(dto).toEqual({ preferencia: 'martes', motivo: 'viaje' });
      });

      it('cuenta el largo DESPUÉS de recortar', async () => {
        expect(
          await errores(PedirOtraHoraDto, {
            preferencia: `  ${'x'.repeat(300)}  `,
          }),
        ).toEqual({});
      });
    });

    describe('CancelarCitaPacienteDto', () => {
      it('acepta el cuerpo vacío y un motivo de 300', async () => {
        expect(await errores(CancelarCitaPacienteDto, {})).toEqual({});
        expect(
          await errores(CancelarCitaPacienteDto, { motivo: 'y'.repeat(300) }),
        ).toEqual({});
      });

      it('rechaza un motivo de 301 o que no es texto', async () => {
        expect(
          (await errores(CancelarCitaPacienteDto, { motivo: 'y'.repeat(301) }))
            .motivo,
        ).toContain('maxLength');
        expect(
          (await errores(CancelarCitaPacienteDto, { motivo: 7 })).motivo,
        ).toContain('isString');
      });
    });
  });
});
