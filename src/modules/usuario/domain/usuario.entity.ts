export enum RolUsuario {
  PROFESIONAL = 'PROFESIONAL',
  ADMINISTRADOR = 'ADMINISTRADOR',
}

export class Usuario {
  id: string;
  email: string;
  private _passwordHash: string;
  nombreCompleto: string;
  rol: RolUsuario;
  tenantId: string;
  creadoEn: Date;
  actualizadoEn: Date;

  get passwordHash(): string {
    return this._passwordHash;
  }

  set passwordHash(hash: string) {
    this._passwordHash = hash;
  }
}
