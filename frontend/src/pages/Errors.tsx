import { Home, LockKeyhole, SearchX } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { navigate } from '../lib/router';
import { Button, Card, PageHeader } from '../components/ui';
import { ROLE_LABEL } from '../lib/format';

export function NotFoundPage({ path }: { path: string }) {
  return (
    <div>
      <PageHeader eyebrow="404" title="Page not found" description="This route does not exist in the Inkloom workspace." />
      <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-ink-500">
          <SearchX className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-sm font-semibold text-ink-900">Nothing is stored at this address</h2>
        <p className="mt-1 max-w-md break-all text-sm leading-6 text-ink-500">
          <span className="font-mono text-xs text-ink-700">{path}</span> may have been mistyped, or the content it
          pointed to was moved.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={() => navigate('/')}>
            <Home className="h-4 w-4" />
            Back to overview
          </Button>
          <Button variant="secondary" onClick={() => navigate('/content')}>
            Browse content
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function AccessDeniedPage({ requirement }: { requirement: string | null }) {
  const { session, role } = useSession();
  return (
    <div>
      <PageHeader eyebrow="Access control" title="This view is not available for your role" />
      <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <LockKeyhole className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-sm font-semibold text-ink-900">
          {ROLE_LABEL[role]} access does not include this workspace
        </h2>
        <p className="mt-1 max-w-md text-sm leading-6 text-ink-500">
          {requirement
            ? `This page requires the “${requirement}” permission. The server enforces the same rule, so switching the URL alone will not unlock the data.`
            : 'The current role cannot open this page. The server enforces the same permissions.'}
        </p>
        {session ? (
          <p className="mt-2 text-xs text-ink-500">
            Signed in as {session.active_user.full_name} · {ROLE_LABEL[role]} (demo role switcher)
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={() => navigate('/')}>
            <Home className="h-4 w-4" />
            Back to overview
          </Button>
          <Button variant="secondary" onClick={() => navigate('/content')}>
            Your content
          </Button>
        </div>
      </Card>
    </div>
  );
}
