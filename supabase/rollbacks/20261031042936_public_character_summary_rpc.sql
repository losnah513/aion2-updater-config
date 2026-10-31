-- Restore a previous WEB only while retaining SQL545's direct-table denial.
-- Keep this small getter until all callers have migrated to another explicit API.
do $$begin raise exception 'CHARACTER_SUMMARY_API_ROLLBACK_REQUIRES_CALLER_MIGRATION';end$$;
