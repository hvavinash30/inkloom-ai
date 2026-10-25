import {
  BarChart3,
  BadgeCheck,
  ClipboardCheck,
  FileText,
  FlaskConical,
  History,
  LayoutDashboard,
  Layers,
  Palette,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../types';
import type { Route } from './router';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  capability?: string;
  end?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const CONTENT_ITEMS: NavItem[] = [
  { label: 'Overview', path: '/', icon: LayoutDashboard, end: true },
  { label: 'Content', path: '/content', icon: FileText, capability: 'content.create' },
  {
    label: 'Review queue',
    path: '/reviews',
    icon: ClipboardCheck,
    capability: 'review.queue',
  },
  { label: 'Campaigns', path: '/campaigns', icon: Layers, capability: 'campaign.read' },
];

const GOVERNANCE_ITEMS: NavItem[] = [
  { label: 'Brand library', path: '/brand', icon: Palette, capability: 'brand.read' },
  { label: 'Policies', path: '/policies', icon: ShieldCheck, capability: 'brand.manage' },
  { label: 'Content history', path: '/history', icon: History, capability: 'content.create' },
  { label: 'Insights', path: '/insights', icon: BarChart3, capability: 'insights.read' },
];

const ORGANIZATION_ITEMS: NavItem[] = [
  { label: 'Research & validation', path: '/research', icon: FlaskConical, capability: 'research.manage' },
  { label: 'Evaluation', path: '/evaluation', icon: BadgeCheck, capability: 'evaluation.run' },
  { label: 'Team & roles', path: '/team', icon: Users, capability: 'org.manage' },
  { label: 'Settings', path: '/settings', icon: Settings, capability: 'org.manage' },
];

export function buildNavigation(capabilities: string[] | Set<string>): NavGroup[] {
  const caps = new Set(capabilities);
  const filter = (items: NavItem[]) =>
    items.filter((item) => !item.capability || caps.has(item.capability));
  return [
    { label: 'Workspace', items: filter(CONTENT_ITEMS) },
    { label: 'Governance', items: filter(GOVERNANCE_ITEMS) },
    { label: 'Organization', items: filter(ORGANIZATION_ITEMS) },
  ].filter((group) => group.items.length > 0);
}

export const ROLE_HOME: Record<Role, string> = {
  creator: '/',
  reviewer: '/',
  admin: '/',
};

export const ROLE_SCOPE: Record<Role, string> = {
  creator: 'Draft, check, and submit your content.',
  reviewer: 'Inspect evidence, comment, and decide on versions.',
  admin: 'Govern rules, facts, campaigns, and reporting.',
};

export function isItemActive(item: NavItem, route: Route): boolean {
  const path = item.path;
  if (path === '/') return route.key === 'dashboard';
  if (path === '/content') return route.key === 'content' || route.key === 'new-content' || route.key === 'document';
  if (path === '/reviews') return route.key === 'reviews';
  if (path === '/campaigns') return route.key === 'campaigns' || route.key === 'campaign';
  if (path === '/brand') return route.key === 'brand';
  if (path === '/policies') return route.key === 'policies';
  if (path === '/history') return route.key === 'history';
  if (path === '/insights') return route.key === 'insights';
  if (path === '/research') return route.key === 'research';
  if (path === '/evaluation') return route.key === 'evaluation';
  if (path === '/team') return route.key === 'team';
  if (path === '/settings') return route.key === 'settings';
  return false;
}

export function routeTitle(route: Route): string {
  switch (route.key) {
    case 'welcome':
      return 'Workspaces';
    case 'onboarding':
      return 'Create your brand';
    case 'dashboard':
      return 'Overview';
    case 'content':
      return 'Content';
    case 'new-content':
      return 'New content check';
    case 'document':
      return 'Content review';
    case 'reviews':
      return 'Review queue';
    case 'campaigns':
      return 'Campaigns';
    case 'campaign':
      return 'Campaign';
    case 'brand':
      return 'Brand library';
    case 'policies':
      return 'Policies & brand memory';
    case 'history':
      return 'Content history';
    case 'insights':
      return 'Governance insights';
    case 'research':
      return 'Research & validation';
    case 'evaluation':
      return 'Evaluation';
    case 'team':
      return 'Team & roles';
    case 'settings':
      return 'Organization settings';
    default:
      return 'Page not found';
  }
}

export function routeRequirement(route: Route): string | null {
  switch (route.key) {
    case 'document':
    case 'content':
    case 'history':
      return 'content.create';
    case 'new-content':
      return 'content.create';
    case 'reviews':
      return 'review.queue';
    case 'campaigns':
    case 'campaign':
      return 'campaign.read';
    case 'brand':
      return 'brand.read';
    case 'policies':
      return 'brand.manage';
    case 'insights':
      return 'insights.read';
    case 'research':
      return 'research.manage';
    case 'evaluation':
      return 'evaluation.run';
    case 'team':
    case 'settings':
      return 'org.manage';
    default:
      return null;
  }
}
