-- Inkloom AI: Row Level Security (RLS) policies
-- Migration: 002_rls_policies.sql
--
-- IMPORTANT: this is a starter policy set for the early core tables only.
-- Campaigns, uploads, brand assets, research, and evaluation are not covered
-- here. It is not used by the local SQLite demo, which enforces access in the
-- FastAPI application layer. Review and extend these policies before any
-- production Supabase deployment.

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE approved_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_history_events ENABLE ROW LEVEL SECURITY;

-- Helpers live outside the exposed schema. Keeping them SECURITY DEFINER
-- avoids recursive RLS when policies need to read workspace membership.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.current_user_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT workspace_id
    FROM public.user_profiles
    WHERE id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.can_manage_workspace(target_workspace UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE id = (SELECT auth.uid())
          AND workspace_id = target_workspace
          AND role IN ('admin', 'reviewer')
    );
$$;

CREATE OR REPLACE FUNCTION private.can_administer_workspace(target_workspace UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_profiles
        WHERE id = (SELECT auth.uid())
          AND workspace_id = target_workspace
          AND role = 'admin'
    );
$$;

REVOKE ALL ON FUNCTION private.current_user_workspace_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_workspace(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_administer_workspace(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_user_workspace_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_workspace(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_administer_workspace(UUID) TO authenticated;

-- Workspaces and profiles
CREATE POLICY "Members can view their workspaces"
ON workspaces FOR SELECT
TO authenticated
USING (id IN (SELECT private.current_user_workspace_ids()));

CREATE POLICY "Members can view profiles in their workspace"
ON user_profiles FOR SELECT
TO authenticated
USING (workspace_id IN (SELECT private.current_user_workspace_ids()));

-- Brand rules
CREATE POLICY "Members can read brand rules in their workspace"
ON brand_rules FOR SELECT
TO authenticated
USING (workspace_id IN (SELECT private.current_user_workspace_ids()));

CREATE POLICY "Admins can manage brand rules"
ON brand_rules FOR ALL
TO authenticated
USING (private.can_administer_workspace(workspace_id))
WITH CHECK (private.can_administer_workspace(workspace_id));

-- Approved facts
CREATE POLICY "Members can read approved facts in their workspace"
ON approved_facts FOR SELECT
TO authenticated
USING (workspace_id IN (SELECT private.current_user_workspace_ids()));

CREATE POLICY "Admins can manage approved facts"
ON approved_facts FOR ALL
TO authenticated
USING (private.can_administer_workspace(workspace_id))
WITH CHECK (private.can_administer_workspace(workspace_id));

-- Content documents
CREATE POLICY "Members can read documents in their workspace"
ON content_documents FOR SELECT
TO authenticated
USING (workspace_id IN (SELECT private.current_user_workspace_ids()));

CREATE POLICY "Members can create documents in their workspace"
ON content_documents FOR INSERT
TO authenticated
WITH CHECK (workspace_id IN (SELECT private.current_user_workspace_ids()));

CREATE POLICY "Members can update documents in their workspace"
ON content_documents FOR UPDATE
TO authenticated
USING (workspace_id IN (SELECT private.current_user_workspace_ids()))
WITH CHECK (workspace_id IN (SELECT private.current_user_workspace_ids()));

-- Content versions (immutable after insert)
CREATE POLICY "Members can read versions in their workspace"
ON content_versions FOR SELECT
TO authenticated
USING (document_id IN (
    SELECT id FROM content_documents
    WHERE workspace_id IN (SELECT private.current_user_workspace_ids())
));

CREATE POLICY "Members can add versions to their workspace documents"
ON content_versions FOR INSERT
TO authenticated
WITH CHECK (document_id IN (
    SELECT id FROM content_documents
    WHERE workspace_id IN (SELECT private.current_user_workspace_ids())
));

-- Audit runs and findings
CREATE POLICY "Members can read audit runs in their workspace"
ON audit_runs FOR SELECT
TO authenticated
USING (document_id IN (
    SELECT id FROM content_documents
    WHERE workspace_id IN (SELECT private.current_user_workspace_ids())
));

CREATE POLICY "Members can create audit runs in their workspace"
ON audit_runs FOR INSERT
TO authenticated
WITH CHECK (document_id IN (
    SELECT id FROM content_documents
    WHERE workspace_id IN (SELECT private.current_user_workspace_ids())
));

CREATE POLICY "Members can read findings in their workspace"
ON audit_findings FOR SELECT
TO authenticated
USING (audit_run_id IN (
    SELECT r.id FROM audit_runs r
    JOIN content_documents d ON r.document_id = d.id
    WHERE d.workspace_id IN (SELECT private.current_user_workspace_ids())
));

CREATE POLICY "Members can add findings to their workspace runs"
ON audit_findings FOR INSERT
TO authenticated
WITH CHECK (audit_run_id IN (
    SELECT r.id FROM audit_runs r
    JOIN content_documents d ON r.document_id = d.id
    WHERE d.workspace_id IN (SELECT private.current_user_workspace_ids())
));

CREATE POLICY "Members can update findings in their workspace"
ON audit_findings FOR UPDATE
TO authenticated
USING (audit_run_id IN (
    SELECT r.id FROM audit_runs r
    JOIN content_documents d ON r.document_id = d.id
    WHERE d.workspace_id IN (SELECT private.current_user_workspace_ids())
))
WITH CHECK (audit_run_id IN (
    SELECT r.id FROM audit_runs r
    JOIN content_documents d ON r.document_id = d.id
    WHERE d.workspace_id IN (SELECT private.current_user_workspace_ids())
));

-- Review comments
CREATE POLICY "Members can read comments in their workspace"
ON review_comments FOR SELECT
TO authenticated
USING (document_id IN (
    SELECT id FROM content_documents
    WHERE workspace_id IN (SELECT private.current_user_workspace_ids())
));

CREATE POLICY "Members can post comments in their workspace"
ON review_comments FOR INSERT
TO authenticated
WITH CHECK (document_id IN (
    SELECT id FROM content_documents
    WHERE workspace_id IN (SELECT private.current_user_workspace_ids())
));

-- Approval decisions (reviewers and admins only)
CREATE POLICY "Members can read decisions in their workspace"
ON approval_decisions FOR SELECT
TO authenticated
USING (document_id IN (
    SELECT id FROM content_documents
    WHERE workspace_id IN (SELECT private.current_user_workspace_ids())
));

CREATE POLICY "Reviewers can record decisions in their workspace"
ON approval_decisions FOR INSERT
TO authenticated
WITH CHECK (
    private.can_manage_workspace((
        SELECT workspace_id FROM content_documents WHERE id = document_id
    ))
);

CREATE POLICY "Reviewers can update decisions in their workspace"
ON approval_decisions FOR UPDATE
TO authenticated
USING (
    private.can_manage_workspace((
        SELECT workspace_id FROM content_documents WHERE id = document_id
    ))
)
WITH CHECK (
    private.can_manage_workspace((
        SELECT workspace_id FROM content_documents WHERE id = document_id
    ))
);

-- Audit history
CREATE POLICY "Members can read history in their workspace"
ON audit_history_events FOR SELECT
TO authenticated
USING (document_id IN (
    SELECT id FROM content_documents
    WHERE workspace_id IN (SELECT private.current_user_workspace_ids())
));

CREATE POLICY "Members can append history in their workspace"
ON audit_history_events FOR INSERT
TO authenticated
WITH CHECK (document_id IN (
    SELECT id FROM content_documents
    WHERE workspace_id IN (SELECT private.current_user_workspace_ids())
));
