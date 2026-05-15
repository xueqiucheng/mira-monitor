import type { DeployStatus } from "../types";
import { env } from "../env";

interface DeploymentMeta {
  commitHash?: string;
  commitMessage?: string;
  cliMessage?: string;
}

interface DeploymentNode {
  id: string;
  status: string;
  createdAt: string;
  service: { name: string };
  meta?: DeploymentMeta;
}

const CLI_MSG_RE = /^Deploy\s+\S+\s+(v?[\d.]+)\s+\(([a-f0-9]+)\)\s+by\s+(\S+)$/;

const extractCommit = (meta: DeploymentMeta | undefined): { sha: string | null; message: string | null } => {
  if (meta?.commitHash) {
    return { sha: meta.commitHash, message: meta.commitMessage?.split("\n")[0] ?? null };
  }
  if (meta?.cliMessage) {
    const m = meta.cliMessage.match(CLI_MSG_RE);
    if (m) return { sha: m[2], message: `${m[1]} by ${m[3]}` };
    return { sha: null, message: meta.cliMessage };
  }
  return { sha: null, message: null };
};

interface DeploymentsResponse {
  data?: { deployments?: { edges?: { node: DeploymentNode }[] } };
  errors?: { message: string }[];
}

const normalizeStatus = (s: string): DeployStatus["status"] => {
  const u = s.toUpperCase();
  if (
    u === "SUCCESS" ||
    u === "FAILED" ||
    u === "CRASHED" ||
    u === "BUILDING" ||
    u === "DEPLOYING"
  ) {
    return u as DeployStatus["status"];
  }
  return "UNKNOWN";
};

const QUERY = `query D($projectId: String!, $environmentId: String!) {
  deployments(input: { projectId: $projectId, environmentId: $environmentId }, first: 20) {
    edges {
      node {
        id
        status
        createdAt
        service { name }
        meta
      }
    }
  }
}`;

export const fetchRailwayDeployments = async (): Promise<DeployStatus[]> => {
  const { token, projectId, environmentId } = env.railway;
  if (!token || !projectId || !environmentId) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("https://backboard.railway.app/graphql/v2", {
      method: "POST",
      headers: {
        "Project-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { projectId, environmentId },
      }),
      signal: controller.signal,
      next: { revalidate: 30 },
    });
    if (!res.ok) throw new Error(`Railway API ${res.status}`);
    const data = (await res.json()) as DeploymentsResponse;
    if (data.errors?.length) throw new Error(data.errors[0].message);

    const edges = data.data?.deployments?.edges ?? [];
    const latestByService = new Map<string, DeployStatus>();
    for (const { node } of edges) {
      const service = node.service.name;
      if (latestByService.has(service)) continue;
      const { sha, message } = extractCommit(node.meta);
      latestByService.set(service, {
        service,
        status: normalizeStatus(node.status),
        commitSha: sha,
        commitMessage: message,
        deployedAt: node.createdAt,
      });
    }
    return [...latestByService.values()];
  } finally {
    clearTimeout(timer);
  }
};
