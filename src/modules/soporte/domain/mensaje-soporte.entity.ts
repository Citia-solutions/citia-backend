/**
 * Mensaje de un profesional a soporte (US-10, P7; ADR-15 §7).
 *
 * La fila de `mensajes_soporte` es a la vez el registro del mensaje y la fila
 * de trabajo de su correo (T8): nace `pendiente` en la transacción de la
 * petición y el job `soporte.envio` la envía.
 *
 * Los enums los usa también la persistencia, para sus CHECK. Si se agrega una
 * categoría o un estado, hay que cambiar también el CHECK de la tabla con una
 * migración nueva (`CHK_mensajes_soporte_categoria` /
 * `CHK_mensajes_soporte_estado_envio`, migración 1750000020000).
 *
 * **El texto nunca va a los logs** ni a los mensajes de error.
 */
import {
  PoliticaReintentoSalida,
  agotoIntentos,
  calcularEsperaReintentoMs,
  validarPoliticaReintentoSalida,
} from '../../../shared/application/politica-reintento-salida';
import { MensajeSoporteInvalidoError } from './exceptions/mensaje-soporte-invalido.error';
import { TransicionEnvioSoporteInvalidaError } from './exceptions/transicion-envio-soporte-invalida.error';
import { LARGO_MAXIMO_MENSAJE_SOPORTE } from './limites-soporte';

/** Categoría cerrada y opcional (T12); ausente → `otro`. */
export enum CategoriaSoporte {
  PROBLEMA = 'problema',
  CONSULTA = 'consulta',
  SUGERENCIA = 'sugerencia',
  OTRO = 'otro',
}

/** Estado del correo a soporte. `enviado` y `fallido` son finales. */
export enum EstadoEnvioSoporte {
  PENDIENTE = 'pendiente',
  ENVIADO = 'enviado',
  FALLIDO = 'fallido',
}

const CATEGORIAS: ReadonlySet<string> = new Set(
  Object.values(CategoriaSoporte),
);

/** Lo que llega de la petición (`POST /api/soporte/mensajes`). */
export interface CrearMensajeSoporteProps {
  tenantId: string;
  usuarioId: string;
  /** Ausente o `null` → `otro`. */
  categoria?: CategoriaSoporte | null;
  /** Se recortan solo los extremos; 1 a 2000 caracteres. */
  mensaje: string;
}

/** La fila guardada, con los nombres de dominio. Solo la usa el repositorio. */
export interface DatosMensajeSoporte {
  id: string;
  tenantId: string;
  usuarioId: string;
  categoria: CategoriaSoporte;
  mensaje: string;
  estadoEnvio: EstadoEnvioSoporte;
  intentos: number;
  proximoIntentoEn: Date;
  /** Solo un código (nombre del error o código del proveedor), nunca un mensaje. */
  ultimoError: string | null;
  /** `resend` o `registro`. */
  proveedor: string | null;
  proveedorMensajeId: string | null;
  /** Existe si y solo si el mensaje está `enviado` (CHECK de la tabla). */
  enviadoEn: Date | null;
  creadoEn: Date;
}

/**
 * Mensaje a soporte.
 *
 * - `crear` valida y normaliza lo que llega de la petición: nace `pendiente`,
 *   sin intentos. **`id`, `creadoEn` y `proximoIntentoEn` los pone la base al
 *   insertar** (`DEFAULT gen_random_uuid()` / `now()`): en un mensaje recién
 *   creado todavía no existen (como el `id` de `Cita`), y
 *   `MensajeSoporteRepository.insertar` devuelve el mensaje con ellos.
 * - `reconstituir` no valida: la fila ya pasó por `crear`, y el job no debe
 *   quedar trabado por una fila tocada a mano.
 * - El estado del envío es privado: solo lo mueven las transiciones del envío,
 *   siempre desde `pendiente` (si no, `TransicionEnvioSoporteInvalidaError`),
 *   y siempre con `enviado ⇔ enviadoEn` (CHECK `CHK_mensajes_soporte_enviado`).
 * - `intentos` cuenta los intentos de envío que terminaron en algo: el
 *   proveedor respondió (aceptado, transitorio, permanente) o falló algo
 *   propio. Como en los recordatorios, el envío aceptado también suma. NO
 *   suman `posponer` (cuota agotada) ni un rechazo de configuración (la fila
 *   no se toca). Como `enviado` y `fallido` son finales, antes de un fallo
 *   `intentos` es exactamente la cantidad de fallos previos: la política de
 *   reintento lo usa así.
 */
export class MensajeSoporte {
  private constructor(private readonly datos: DatosMensajeSoporte) {}

  /**
   * Mensaje nuevo, `pendiente`. Recorta el texto (solo los extremos) y exige
   * de 1 a 2000 caracteres. Cuenta unidades UTF-16 (`length`), como el
   * `MaxLength` del DTO: nunca son menos que los caracteres que cuenta el
   * `char_length` del CHECK, así que lo que pasa aquí pasa la base.
   *
   * @throws MensajeSoporteInvalidoError si el texto queda vacío, se pasa del
   *         largo o la categoría no es una de las cuatro.
   */
  static crear(props: CrearMensajeSoporteProps): MensajeSoporte {
    const datos = {
      tenantId: props.tenantId,
      usuarioId: props.usuarioId,
      categoria: validarCategoria(props.categoria),
      mensaje: normalizarTexto(props.mensaje),
      estadoEnvio: EstadoEnvioSoporte.PENDIENTE,
      intentos: 0,
      ultimoError: null,
      proveedor: null,
      proveedorMensajeId: null,
      enviadoEn: null,
    };
    // `id`, `creadoEn` y `proximoIntentoEn` los pone la base (ver la clase).
    return new MensajeSoporte(datos as DatosMensajeSoporte);
  }

  /** Desde la fila guardada, tal cual. Uso exclusivo del repositorio. */
  static reconstituir(datos: DatosMensajeSoporte): MensajeSoporte {
    return new MensajeSoporte({ ...datos });
  }

  /** `undefined` en un mensaje recién creado y aún sin insertar. */
  get id(): string {
    return this.datos.id;
  }

  get tenantId(): string {
    return this.datos.tenantId;
  }

  get usuarioId(): string {
    return this.datos.usuarioId;
  }

  get categoria(): CategoriaSoporte {
    return this.datos.categoria;
  }

  /** El texto. Nunca a los logs. */
  get mensaje(): string {
    return this.datos.mensaje;
  }

  get estadoEnvio(): EstadoEnvioSoporte {
    return this.datos.estadoEnvio;
  }

  get intentos(): number {
    return this.datos.intentos;
  }

  /** `undefined` en un mensaje recién creado: la base pone `now()` al insertar. */
  get proximoIntentoEn(): Date {
    return this.datos.proximoIntentoEn;
  }

  get ultimoError(): string | null {
    return this.datos.ultimoError;
  }

  get proveedor(): string | null {
    return this.datos.proveedor;
  }

  get proveedorMensajeId(): string | null {
    return this.datos.proveedorMensajeId;
  }

  get enviadoEn(): Date | null {
    return this.datos.enviadoEn;
  }

  /** `undefined` en un mensaje recién creado: la base pone `now()` al insertar. */
  get creadoEn(): Date {
    return this.datos.creadoEn;
  }

  /** `true` si ya tiene fila (vino de la base). */
  estaGuardado(): boolean {
    return this.datos.id !== undefined;
  }

  /** Sigue en la cola del envío: lo único desde lo que se puede transicionar. */
  estaPendiente(): boolean {
    return this.datos.estadoEnvio === EstadoEnvioSoporte.PENDIENTE;
  }

  // ---------------------------------------------------------------------------
  // Transiciones del envío (ADR-15 §7). Mutan el mensaje; quien las llama lo
  // persiste con `MensajeSoporteRepository.guardarEnvio` en la misma
  // transacción en que lo tomó.
  // ---------------------------------------------------------------------------

  /**
   * El proveedor aceptó el correo (`aceptado`, con su id) o ya lo había
   * aceptado con esta misma `Idempotency-Key` (`posible_duplicado`, sin id):
   * `enviado`, con `enviadoEn = ahora`. Suma el intento. Conserva
   * `ultimoError` (el último fallo antes del envío, como historial).
   */
  marcarEnviado(
    proveedor: string,
    proveedorMensajeId: string | null,
    ahora: Date,
  ): void {
    this.exigirPendiente('marcarEnviado');
    const enviadoEn = copiaDeFecha(ahora, 'marcarEnviado');
    this.datos.estadoEnvio = EstadoEnvioSoporte.ENVIADO;
    this.datos.enviadoEn = enviadoEn;
    this.datos.proveedor = proveedor;
    this.datos.proveedorMensajeId = proveedorMensajeId;
    this.datos.intentos += 1;
  }

  /**
   * Un fallo que se reintenta (error transitorio del proveedor, o un error
   * propio del envío): suma un intento y guarda el código. Si con este se
   * llegó a `politica.maxIntentos`, pasa a `fallido` (final); si no, el
   * próximo intento queda a `ahora + calcularEsperaReintentoMs(intentos
   * previos)`: 1, 2, 4… hasta 60 min con `POLITICA_REINTENTO_SOPORTE`.
   *
   * `aleatorio` (en [0, 1)) se inyecta en las pruebas; la variación solo
   * acorta la espera.
   */
  registrarFallo(
    codigo: string,
    ahora: Date,
    politica: PoliticaReintentoSalida,
    aleatorio: () => number = Math.random,
  ): void {
    this.exigirPendiente('registrarFallo');
    const instante = copiaDeFecha(ahora, 'registrarFallo');
    validarPoliticaReintentoSalida(politica);
    const previos = this.datos.intentos;
    this.datos.intentos = previos + 1;
    this.datos.ultimoError = codigoNoVacio(codigo);
    if (agotoIntentos(this.datos.intentos, politica)) {
      this.datos.estadoEnvio = EstadoEnvioSoporte.FALLIDO;
      return;
    }
    this.datos.proximoIntentoEn = new Date(
      instante.getTime() +
        calcularEsperaReintentoMs(previos, politica, aleatorio),
    );
  }

  /**
   * Otra vez más tarde SIN gastar un intento (`cuota_agotada` del proveedor):
   * solo mueve `proximoIntentoEn`.
   */
  posponer(hasta: Date): void {
    this.exigirPendiente('posponer');
    this.datos.proximoIntentoEn = copiaDeFecha(hasta, 'posponer');
  }

  /**
   * Rechazo definitivo del proveedor (`permanente`): `fallido` sin reintento,
   * con el código. Suma el intento.
   */
  marcarFallido(codigo: string): void {
    this.exigirPendiente('marcarFallido');
    this.datos.estadoEnvio = EstadoEnvioSoporte.FALLIDO;
    this.datos.ultimoError = codigoNoVacio(codigo);
    this.datos.intentos += 1;
  }

  private exigirPendiente(transicion: string): void {
    if (!this.estaPendiente()) {
      throw new TransicionEnvioSoporteInvalidaError(
        transicion,
        this.datos.estadoEnvio,
      );
    }
  }
}

/** Copia defensiva de una fecha válida (la entidad no comparte objetos). */
function copiaDeFecha(fecha: Date, transicion: string): Date {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) {
    throw new RangeError(`MensajeSoporte.${transicion}: fecha inválida`);
  }
  return new Date(fecha.getTime());
}

/** `ultimo_error` es un código, nunca vacío (la base lo trunca a 100). */
function codigoNoVacio(codigo: string): string {
  return typeof codigo === 'string' && codigo.trim() !== ''
    ? codigo.trim()
    : 'desconocido';
}

function validarCategoria(
  categoria: CategoriaSoporte | null | undefined,
): CategoriaSoporte {
  if (categoria === undefined || categoria === null) {
    return CategoriaSoporte.OTRO;
  }
  if (!CATEGORIAS.has(categoria)) {
    throw new MensajeSoporteInvalidoError(
      'categoria',
      'debe ser problema, consulta, sugerencia u otro',
    );
  }
  return categoria;
}

function normalizarTexto(mensaje: string): string {
  // Sobre `unknown`: el tipo ya lo exige, pero puede llegar sin él (un `as`).
  const valor: unknown = mensaje;
  if (typeof valor !== 'string') {
    throw new MensajeSoporteInvalidoError('mensaje', 'debe ser un texto');
  }
  const recortado = valor.trim();
  if (recortado === '') {
    throw new MensajeSoporteInvalidoError('mensaje', 'no puede estar vacío');
  }
  if (recortado.length > LARGO_MAXIMO_MENSAJE_SOPORTE) {
    throw new MensajeSoporteInvalidoError(
      'mensaje',
      `debe tener como máximo ${LARGO_MAXIMO_MENSAJE_SOPORTE} caracteres`,
    );
  }
  return recortado;
}
