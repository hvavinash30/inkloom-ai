import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  ROLE_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
  setApiRole,
  setApiWorkspace,
} from '../services/api';
import type { Role, SessionPayload } from '../types';

function isRole(value: string | null): value is Role {
  return value === 'creator' || value === 'reviewer' || value === 'admin';
}

export interface AssistantSeed {
  documentId?: string;
  campaignId?: string;
  findingId?: string;
  pageContext?: string;
  prompt?: string;
}

interface SessionContextValue {
  session: SessionPayload | null;
  role: Role;
  setRole: (role: Role) => void;
  workspaceId: string | null;
  selectWorkspace: (workspaceId: string) => void;
  loading: boolean;
  error: string | null;
  reload: () => void;
  refreshWorkspaces: () => Promise<void>;
  can: (capability: string) => boolean;
  assistantOpen: boolean;
  assistantSeed: AssistantSeed;
  openAssistant: (seed?: AssistantSeed) => void;
  closeAssistant: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const stored = localStorage.getItem(ROLE_STORAGE_KEY);
  const storedWorkspace = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  const [role, setRoleState] = useState<Role>(isRole(stored) ? stored : 'creator');
  const [workspaceId, setWorkspaceId] = useState<string | null>(storedWorkspace || null);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantSeed, setAssistantSeed] = useState<AssistantSeed>({});

  useEffect(() => {
    let cancelled = false;
    setApiRole(role);
    setApiWorkspace(workspaceId);
    setLoading(true);
    setError(null);
    api
      .getSession()
      .then((payload) => {
        if (!cancelled) setSession(payload);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setSession(null);
        if (caught instanceof ApiError && caught.status === 404 && workspaceId) {
          localStorage.removeItem(WORKSPACE_STORAGE_KEY);
          setWorkspaceId(null);
          setApiWorkspace(null);
          setError(null);
          return;
        }
        setError(
          caught instanceof ApiError
            ? caught.detail
            : 'The demo session could not be loaded. Check that the API is running.'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, workspaceId, nonce]);

  const setRole = useCallback(
    (next: Role) => {
      localStorage.setItem(ROLE_STORAGE_KEY, next);
      if (next === role) return;
      setLoading(true);
      setRoleState(next);
    },
    [role]
  );

  const selectWorkspace = useCallback((nextWorkspaceId: string) => {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, nextWorkspaceId);
    setApiWorkspace(nextWorkspaceId);
    setLoading(true);
    setSession(null);
    setWorkspaceId(nextWorkspaceId);
  }, []);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  const refreshWorkspaces = useCallback(async () => {
    try {
      const workspaces = await api.listWorkspaces();
      setSession((current) => {
        if (!current) return current;
        const active =
          workspaces.find((item) => item.id === current.workspace.id) || current.workspace;
        return { ...current, workspace: active, workspaces };
      });
    } catch {
      // Keep the last loaded counts when the refresh cannot complete.
    }
  }, []);
  const can = useCallback(
    (capability: string) => Boolean(session?.capabilities.includes(capability)),
    [session]
  );
  const openAssistant = useCallback((seed?: AssistantSeed) => {
    setAssistantSeed(seed || {});
    setAssistantOpen(true);
  }, []);
  const closeAssistant = useCallback(() => setAssistantOpen(false), []);

  return (
    <SessionContext.Provider
      value={{
        session,
        role,
        setRole,
        workspaceId,
        selectWorkspace,
        loading,
        error,
        reload,
        refreshWorkspaces,
        can,
        assistantOpen,
        assistantSeed,
        openAssistant,
        closeAssistant,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
