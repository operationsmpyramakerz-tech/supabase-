Projects Preparing v216 - Phase 4 SQL syntax hotfix

Issue: PostgreSQL 42601 near "s" at SQL line 292.
Cause: An unescaped apostrophe in the technical acceptance error message.
Fix: team's -> team''s (inside the SQL quoted string).

Files:
- The ZIP contains only EmptyCanvas/next-frontend/sql/2026-10-27-preparing-technical-phase4.sql.
- The standalone FIXED.sql is the same full migration for Supabase SQL Editor.

Steps:
1. Keep a verified database backup.
2. Execute the complete FIXED.sql in the Supabase SQL Editor (not only line 292).
3. Replace the SQL source file in the repo with the file from this ZIP; no JS changes needed.
4. Check the SQL Editor result for successful completion.
5. Only after success, try Open Technical in a test school on production.

Static review: old project and prior standalone SQL matched exactly; one string-escape change made; 5 PL/pgSQL function bodies scanned for balanced SQL quotes and transactional framing confirmed. No live database execution was performed.
