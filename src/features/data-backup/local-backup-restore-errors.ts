export class LocalBackupSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalBackupSelectionError";
  }
}

export class LocalBackupReloadRequiredError extends Error {
  constructor() {
    super(
      "Die Daten wurden wiederhergestellt. Starte LUNA Shift vollständig neu, damit alle Ansichten aktualisiert werden.",
    );
    this.name = "LocalBackupReloadRequiredError";
  }
}

export class LocalBackupRestoreRecoveryError extends Error {
  constructor() {
    super(
      "Deine Daten wurden nicht ersetzt. Starte LUNA Shift vollständig neu, damit bestehende Erinnerungen erneut eingerichtet werden.",
    );
    this.name = "LocalBackupRestoreRecoveryError";
  }
}
