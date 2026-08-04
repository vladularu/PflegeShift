export interface DatabasePromotionActions {
  cleanupLegacy: () => Promise<void> | void;
  cleanupTemporary: () => Promise<void> | void;
  moveTemporary: () => Promise<void> | void;
  prepareTemporary: () => Promise<void> | void;
  removeCurrent: () => Promise<void> | void;
  verifyCurrent: () => Promise<void> | void;
}

export async function promoteDatabaseCopy(actions: DatabasePromotionActions): Promise<void> {
  try {
    await actions.prepareTemporary();
    await actions.removeCurrent();
    await actions.moveTemporary();
    await actions.verifyCurrent();
    await actions.cleanupTemporary();
  } catch (error) {
    try {
      await actions.cleanupTemporary();
    } catch {
      // The next serialized attempt discards a leftover temporary copy.
    }
    throw error;
  }

  // Plaintext cleanup is deliberately outside the catch above. If it fails,
  // the already verified encrypted target is never removed or replaced again.
  await actions.cleanupLegacy();
}
