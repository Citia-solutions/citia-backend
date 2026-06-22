export enum TipoTenant {
  CLINICA = 'CLINICA',
  INDEPENDIENTE = 'INDEPENDIENTE',
}

export class Tenant {
  id: string;
  nombre: string;
  tipo: TipoTenant;
  plan: string;
  creadoEn: Date;
}
