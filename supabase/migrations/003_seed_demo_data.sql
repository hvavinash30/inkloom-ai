-- Inkloom AI: Starter seed for the fictional Acme Cloud demo workspace.
-- Migration: 003_seed_demo_data.sql
--
-- IMPORTANT
-- * This is a smaller starter seed for the early core tables only.
-- * It is not used by the local SQLite demo; the runtime seed in
--   backend/app/services/seed_service.py is authoritative and includes campaigns,
--   assets, uploads, research, evaluation, and version history.
-- * Every company, person, source, certification, and figure below is fictional.
--   No customer results or external benchmarks are represented as real.

-- 1. Insert Demo Workspace
INSERT INTO workspaces (id, name, slug, description)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Acme Cloud Technologies',
    'acme-cloud-technologies',
    'Fictional cloud platform workspace for brand governance demonstration. All records are demo data.'
) ON CONFLICT (id) DO NOTHING;

-- 2. Insert Demo User Profiles
INSERT INTO user_profiles (id, workspace_id, email, full_name, role)
VALUES
(
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'sarah.chen@acmecloud.demo',
    'Sarah Chen',
    'admin'
),
(
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    'alex.rivera@acmecloud.demo',
    'Alex Rivera',
    'reviewer'
),
(
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000001',
    'jordan.patel@acmecloud.demo',
    'Jordan Patel',
    'creator'
) ON CONFLICT (id) DO NOTHING;

-- 3. Approved Facts & Evidence (Knowledge Base)
-- Sources are explicitly fictional; values match the runtime demo seed.
INSERT INTO approved_facts (id, workspace_id, category, claim_statement, approved_value, source_reference, source_url)
VALUES
(
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    'Service Level & Availability',
    'Contractual uptime commitment for the enterprise plan',
    '99.9% monthly uptime SLA',
    'Demo Enterprise Master Service Agreement §7.1 (fictional source)',
    NULL
),
(
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000001',
    'Performance',
    'Analytics query benchmark against legacy on-premise',
    'Up to 3x faster analytics queries than legacy on-premise deployments',
    'Demo Benchmark Summary 2026 (fictional internal source)',
    NULL
),
(
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000001',
    'Security & Compliance',
    'Certifications recorded in the demo trust center',
    'SOC 2 Type II and ISO 27001 (demo certifications)',
    'Demo Trust Center, certifications page (fictional source)',
    NULL
),
(
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000001',
    'Pricing',
    'Current enterprise plan list price',
    'INR 12,999 per month per organization',
    'Demo FY26 Commercial Rate Card, row 3 (fictional source)',
    NULL
) ON CONFLICT (id) DO NOTHING;

-- 4. Brand Rules
INSERT INTO brand_rules (id, workspace_id, name, rule_type, description, pattern_or_phrase, replacement_or_guidance, severity, is_active)
VALUES
(
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000001',
    'No absolute uptime promises',
    'prohibited_phrase',
    'The approved contractual commitment is a 99.9% monthly SLA. Never promise 100% uptime in marketing copy.',
    '100% uptime',
    'Use the approved 99.9% monthly uptime SLA.',
    'critical',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000001',
    'Unsupported market-rank claims',
    'claim_restriction',
    'Rank and superlative claims such as #1 require a current, approved third-party source.',
    '#1',
    'Use a verified differentiator supported by an approved fact.',
    'high',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000203',
    '00000000-0000-0000-0000-000000000001',
    'Measured punctuation and tone',
    'tone_guideline',
    'Repeated exclamation marks undermine an enterprise tone.',
    '!!!',
    'Use a single period and a calm, factual tone.',
    'medium',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000204',
    '00000000-0000-0000-0000-000000000001',
    'Official product capitalization',
    'product_naming',
    'The official product name is two words in title case.',
    'AcmeCloud',
    'Acme Cloud',
    'medium',
    TRUE
),
(
    '00000000-0000-0000-0000-000000000205',
    '00000000-0000-0000-0000-000000000001',
    'No cheapest-platform positioning',
    'prohibited_phrase',
    'The brand positions on enterprise value and reliability, not lowest price.',
    'cheapest',
    'cost-effective for enterprise workloads',
    'high',
    TRUE
) ON CONFLICT (id) DO NOTHING;
