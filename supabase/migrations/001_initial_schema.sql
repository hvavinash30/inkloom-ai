-- Inkloom AI: Initial PostgreSQL Schema Migration
-- Migration: 001_initial_schema.sql
--
-- IMPORTANT: starter schema for the early core tables only. The runtime
-- schema is defined by the SQLAlchemy models in backend/app/models. Campaigns,
-- campaign conflicts, uploads, brand assets, research, and evaluation are not
-- covered here. Do not treat this file as full runtime parity.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Workspaces / Organizations
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. User Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'creator' CHECK (role IN ('admin', 'reviewer', 'creator')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Brand Rules
CREATE TABLE IF NOT EXISTS brand_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('prohibited_phrase', 'required_terminology', 'tone_guideline', 'claim_restriction', 'product_naming')),
    description TEXT,
    pattern_or_phrase TEXT NOT NULL,
    replacement_or_guidance TEXT,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Approved Facts & Evidence (source-backed knowledge base)
CREATE TABLE IF NOT EXISTS approved_facts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    claim_statement TEXT NOT NULL,
    approved_value TEXT NOT NULL,
    source_reference VARCHAR(255) NOT NULL,
    source_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Content Documents
CREATE TABLE IF NOT EXISTS content_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('blog_post', 'social_media', 'press_release', 'landing_page', 'product_copy', 'ad_copy', 'email_campaign', 'other')),
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'audited', 'in_review', 'approved', 'rejected', 'changes_requested')),
    current_version_number INT NOT NULL DEFAULT 1,
    created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Content Versions (Immutable revisions)
CREATE TABLE IF NOT EXISTS content_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES content_documents(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    content_text TEXT NOT NULL,
    change_summary TEXT,
    created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_document_version UNIQUE(document_id, version_number)
);

-- 7. Audit Runs
CREATE TABLE IF NOT EXISTS audit_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES content_documents(id) ON DELETE CASCADE,
    version_id UUID NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
    overall_score INT NOT NULL DEFAULT 100,
    risk_level VARCHAR(20) NOT NULL DEFAULT 'clean' CHECK (risk_level IN ('clean', 'low', 'medium', 'high', 'critical')),
    total_findings INT NOT NULL DEFAULT 0,
    resolved_findings INT NOT NULL DEFAULT 0,
    model_used VARCHAR(100) NOT NULL DEFAULT 'hybrid-engine',
    execution_time_ms INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Audit Findings
CREATE TABLE IF NOT EXISTS audit_findings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_run_id UUID NOT NULL REFERENCES audit_runs(id) ON DELETE CASCADE,
    version_id UUID NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES brand_rules(id) ON DELETE SET NULL,
    fact_id UUID REFERENCES approved_facts(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    affected_text TEXT NOT NULL,
    start_index INT NOT NULL DEFAULT 0,
    end_index INT NOT NULL DEFAULT 0,
    explanation TEXT NOT NULL,
    supporting_evidence TEXT,
    source_reference VARCHAR(255),
    suggested_correction TEXT,
    confidence_score NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
    status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'edited', 'dismissed')),
    dismissal_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Review Comments
CREATE TABLE IF NOT EXISTS review_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES content_documents(id) ON DELETE CASCADE,
    version_id UUID NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    author_name VARCHAR(255) NOT NULL,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Approval Decisions
CREATE TABLE IF NOT EXISTS approval_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES content_documents(id) ON DELETE CASCADE,
    version_id UUID NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    reviewer_name VARCHAR(255) NOT NULL,
    decision VARCHAR(50) NOT NULL CHECK (decision IN ('approved', 'rejected', 'changes_requested')),
    feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Audit History Events
CREATE TABLE IF NOT EXISTS audit_history_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES content_documents(id) ON DELETE CASCADE,
    version_id UUID REFERENCES content_versions(id) ON DELETE SET NULL,
    user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    user_name VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_brand_rules_workspace ON brand_rules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_approved_facts_workspace ON approved_facts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_content_documents_workspace ON content_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_content_versions_document ON content_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_runs_document ON audit_runs(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_run ON audit_findings(audit_run_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_status ON audit_findings(status);
CREATE INDEX IF NOT EXISTS idx_audit_history_document ON audit_history_events(document_id);
