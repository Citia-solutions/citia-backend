export class EmailYaRegistradoError extends Error {
  constructor(email: string) {
    super(`El email ${email} ya está registrado en este tenant`);
    this.name = 'EmailYaRegistradoError';
  }
}
