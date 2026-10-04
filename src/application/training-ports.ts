import type {
  TrainingSnapshot,
  SavedTrainingProfile,
  SaveTrainingProfileInput,
  SavedShiftTraining,
  SaveShiftTrainingInput,
} from "@/domain/training-data";

export interface TrainingRepositoryPort {
  readonly loadSnapshot: () => Promise<TrainingSnapshot>;
  readonly saveProfile: (input: SaveTrainingProfileInput) => Promise<SavedTrainingProfile>;
  readonly saveShift: (input: SaveShiftTrainingInput) => Promise<SavedShiftTraining>;
}
