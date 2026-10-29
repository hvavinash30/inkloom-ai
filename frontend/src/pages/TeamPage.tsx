import { useMemo } from 'react';
import {
  BadgeCheck,
  ClipboardCheck,
  FileText,
  MessageSquare,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { useAsync } from '../lib/router';
import { api } from '../services/api';
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  InfoCallout,
  LoadingBlock,
  PageHeader,
  StatCard,
  cn,
} from '../components/ui';
import { CAPABILITY_LABEL, ROLE_LABEL, formatDate, titleCase } from '../lib/format';
import type { Role } from '../types';

const ROLE_STYLE: Record<Role, string> = {
  creator: 'border-slate-200 bg-slate-50 text-slate-700',
  reviewer: 'border-blue-200 bg-blue-50 text-blue-800',
  admin: 'border-slate-800 bg-slate-900 text-white',
};

export function TeamPage() {
  const { data, loading, error, reload } = useAsync(() => api.getTeam(), []);

  const members = data?.members || [];
  const counts = useMemo(() => {
    return {
      creators: members.filter((member) => member.role === 'creator').length,
      reviewers: members.filter((member) => member.role === 'reviewer').length,
      admins: members.filter((member) => member.role === 'admin').length,
    };
  }, [members]);

  if (loading) {
    return (
      <div>
        <div className="mb-6 h-20 animate-pulse rounded-xl border border-slate-100 bg-white" />
        <LoadingBlock rows={4} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader eyebrow="Organization workspace" title="Team & roles" />
        <ErrorState message={error || 'Team members could not be loaded.'} retry={reload} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Organization workspace"
        title="Team & roles"
        description="Who can do what in this workspace, with capabilities enforced by the API on every request."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Members" value={members.length} hint="In this demo workspace" icon={Users} tone="brand" />
        <StatCard label="Creators" value={counts.creators} hint="Draft, check, and submit content" icon={FileText} />
        <StatCard label="Reviewers" value={counts.reviewers} hint="Inspect evidence and decide versions" icon={ClipboardCheck} />
        <StatCard label="Admins" value={counts.admins} hint="Govern rules, facts, and settings" icon={ShieldCheck} />
      </div>

      <div className="mt-5">
        <InfoCallout tone="warning" title="Demo identity, real server checks">
          {data.notice} The role switcher signs in as a different seeded demo account, and the API resolves the role
          and workspace from that stored session on each request. A production deployment must replace demo sign-in
          with real authentication and membership records.
        </InfoCallout>
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Members</h2>
            <p className="mt-0.5 text-xs text-slate-500">Stored profiles and their recorded activity counts.</p>
          </div>
          <Badge className="border-slate-200 bg-slate-50 text-slate-500">{members.length}</Badge>
        </div>
        {members.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Users} title="No members found" description="The demo workspace has no member profiles." />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {members.map((member) => (
              <div key={member.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar name={member.full_name} role={member.role} size="lg" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{member.full_name}</p>
                      <span
                        className={cn(
                          'rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                          ROLE_STYLE[member.role]
                        )}
                      >
                        {member.role_label || ROLE_LABEL[member.role]}
                      </span>
                      {member.is_demo ? (
                        <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-800">
                          Demo profile
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{member.title}</p>
                    <p className="mt-0.5 break-all text-[11px] text-slate-400">{member.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 sm:justify-end">
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5 text-slate-400" />
                    {member.stats.documents} content
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                    {member.stats.comments} comments
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <BadgeCheck className="h-3.5 w-3.5 text-slate-400" />
                    {member.stats.decisions} decisions
                  </span>
                  <span className="text-slate-400">Joined {formatDate(member.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-5">
        <div className="mb-3 flex items-center gap-2">
          <UserRoundCheck className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900">Role capability matrix</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {data.role_matrix.map((entry) => (
            <Card key={entry.role} className="flex flex-col p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    ROLE_STYLE[entry.role]
                  )}
                >
                  {entry.label}
                </span>
                <Badge className="border-slate-200 bg-slate-50 text-slate-500">{entry.capabilities.length}</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{entry.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {entry.capabilities.map((capability) => (
                  <span
                    key={capability}
                    className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600"
                  >
                    {CAPABILITY_LABEL[capability] || titleCase(capability)}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <p className="mt-5 text-[11px] leading-5 text-slate-400">
        This build does not support inviting, editing, or deactivating members. Those operations need a production
        identity provider and are intentionally not simulated.
      </p>
    </div>
  );
}
