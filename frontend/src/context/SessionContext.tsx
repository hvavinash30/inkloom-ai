import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError, setApiRole } from '../services/api';
import type { Role, SessionPayload } from '../types';

const ROLE_STORAGE_KEY = 'inkloom-demo-role';

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
  loading: boolean;
  error: string | null;
  reload: () => void;
  can: (capability: string) => boolean;
  assistantOpen: boolean;
  assistantSeed: AssistantSeed;
  openAssistant: (seed?: AssistantSeed) => void;
  closeAssistant: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const stored = localStorage.getItem(ROLE_STORAGE_KEY);
  const [role, setRoleState] = useState<Role>(isRole(stored) ? stored : 'creator');
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantSeed, setAssistantSeed] = useState<AssistantSeed>({});

  useEffect(() => {
    let cancelled = false;
    setApiRole(role);
    setLoading(true);
    setError(null);
    api
      .getSession()
      .then((payload) => {
        if (!cancelled) setSession(payload);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setSession(null);
          setError(
            caught instanceof ApiError
              ? caught.detail
              : 'The demo session could not be loaded. Check that the API is running.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, nonce]);

  const setRole = useCallback((next: Role) => {
    localStorage.setItem(ROLE_STORAGE_KEY, next);
    setRoleState(next);
  }, []);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
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
        loading,
        error,
        reload,
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
