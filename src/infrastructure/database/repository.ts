/**
 * Stable persistence boundary for application code.
 *
 * The implementation lives separately so consumers depend on one small public
 * module instead of its SQL and mapping details.
 */
export * from "@/infrastructure/database/repository-core";
