export type HostSurface = 'jira:issuePanel' | 'jira:projectPage' | 'confluence:contentAction';

export interface AppRuntimeContext {
  isForge: boolean;
  surface: HostSurface;
  issueKey: string;
  projectKey: string;
  pageId: string;
}

type ForgeBridgeModule = typeof import('@forge/bridge');

let cachedBridgePromise: Promise<ForgeBridgeModule | null> | null = null;

function canAttemptForgeBridge(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // Forge Custom UI always renders inside a sandboxed host iframe.
    // Avoiding eager @forge/bridge import in top-level browser preview prevents
    // @forge/bridge's top-level bridge-connection throw outside Atlassian Cloud.
    return window.self !== window.top || Boolean((window as any).__bridge);
  } catch {
    // Cross-origin parent access throwing SecurityError confirms we are in an iframe!
    return true;
  }
}

async function getForgeBridge(): Promise<ForgeBridgeModule | null> {
  if (!canAttemptForgeBridge()) return null;
  if (!cachedBridgePromise) {
    cachedBridgePromise = import('@forge/bridge').catch(() => null);
  }
  return cachedBridgePromise;
}

export async function resolveHostContext(): Promise<AppRuntimeContext> {
  const bridge = await getForgeBridge();
  if (bridge) {
    try {
      const ctx: any = await bridge.view.getContext();
      const moduleType = String(ctx?.extension?.type ?? '');
      let surface: HostSurface = 'jira:issuePanel';
      if (moduleType.includes('projectPage')) {
        surface = 'jira:projectPage';
      } else if (moduleType.includes('contentAction') || ctx?.extension?.content?.id) {
        surface = 'confluence:contentAction';
      }
      return {
        isForge: true,
        surface,
        issueKey: ctx?.extension?.issue?.key ?? 'PAY-412',
        projectKey:
          ctx?.extension?.project?.key ??
          ctx?.extension?.issue?.key?.split('-')[0] ??
          'PAY',
        pageId: String(ctx?.extension?.content?.id ?? 'CONF-101')
      };
    } catch {
      // Fall through to local preview mode if Forge host bridge is absent
    }
  }

  const params = new URLSearchParams(window.location.search);
  const surfaceParam = params.get('surface');
  let surface: HostSurface = 'jira:projectPage';
  if (surfaceParam === 'issue') surface = 'jira:issuePanel';
  else if (surfaceParam === 'confluence') surface = 'confluence:contentAction';
  else if (surfaceParam === 'project') surface = 'jira:projectPage';

  return {
    isForge: false,
    surface,
    issueKey: params.get('issueKey') ?? 'PAY-412',
    projectKey: params.get('projectKey') ?? 'PAY',
    pageId: params.get('pageId') ?? 'CONF-101'
  };
}

export async function invokeBackend<T = any>(
  functionKey: string,
  payload: Record<string, any> = {}
): Promise<T> {
  const bridge = await getForgeBridge();
  if (bridge) {
    return (await bridge.invoke(functionKey, payload)) as T;
  }

  const response = await fetch(`/api/invoke/${encodeURIComponent(functionKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

export async function invokeRovoToolPreview<T = any>(
  toolKey: string,
  inputs: Record<string, any>
): Promise<T> {
  const response = await fetch(`/api/rovo/${encodeURIComponent(toolKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error ?? `Tool invocation failed (${response.status})`);
  }
  return data as T;
}
