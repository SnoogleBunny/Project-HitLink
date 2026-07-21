-- Give the imported-record lookup index an explicit name below PostgreSQL's
-- 63-byte identifier limit. PostgreSQL truncated the historical 73-byte name.
ALTER INDEX "migration_imported_records_workspaceId_importedModel_importedRe" RENAME TO "migration_imported_records_workspace_model_record_idx";
