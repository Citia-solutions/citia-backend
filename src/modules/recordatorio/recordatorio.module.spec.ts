import { RegistroSuscriptores } from '../../shared/infrastructure/salida/registro-suscriptores';
import { ReconciliarRecordatoriosService } from './application/reconciliar-recordatorios.service';
import { SuscriptorRecordatorios } from './application/suscriptor-recordatorios';
import { RecordatorioModule } from './recordatorio.module';

describe('RecordatorioModule', () => {
  it('registra SuscriptorRecordatorios en el outbox al iniciar (una sola vez)', () => {
    // Arrange
    const registro = new RegistroSuscriptores();
    const suscriptor = new SuscriptorRecordatorios(
      {} as ReconciliarRecordatoriosService,
    );
    const modulo = new RecordatorioModule(registro, suscriptor);

    // Act
    modulo.onModuleInit();
    modulo.onModuleInit();

    // Assert
    expect(registro.todos()).toEqual([suscriptor]);
    expect(registro.suscriptoresDe('CitaCreada')).toEqual([suscriptor]);
    expect(
      registro.suscriptoresDe('ConfiguracionRecordatorioActualizada'),
    ).toEqual([suscriptor]);
    expect(registro.suscriptoresDe('SolicitudCitaAceptada')).toEqual([]);
  });
});
