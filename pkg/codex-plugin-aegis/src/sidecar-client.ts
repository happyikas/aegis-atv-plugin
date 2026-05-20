export interface SidecarResponse<T> {
  ok: boolean;
  data: T;
}

export interface SessionStartResponse {
  event_id?: string;
  session: {
    session_id: string;
  };
}

export interface UserPromptResponse {
  event_id?: string;
  prompt_hash?: string;
}

export interface ToolDecisionResponse {
  event_id?: string;
  verdict: "allow" | "require_approval" | "block";
  queued?: boolean;
  item?: {
    id: string;
  };
  evaluation?: {
    telemetry?: {
      telemetry_id?: string;
    };
    signals?: string[];
  };
}

export interface ToolResultResponse {
  event_id?: string;
  atv_lite?: {
    result?: {
      status?: string;
    };
  };
}

export interface PermissionRequestResponse {
  event_id?: string;
  queued?: boolean;
  item?: {
    id: string;
    status?: string;
  };
}

export interface StopResponse {
  event_id?: string;
  summary?: {
    status?: string;
  };
}

export interface AegisSidecarClient {
  startSession(payload: Record<string, unknown>): Promise<SessionStartResponse>;
  recordUserPrompt(payload: Record<string, unknown>): Promise<UserPromptResponse>;
  decideTool(payload: Record<string, unknown>): Promise<ToolDecisionResponse>;
  recordToolResult(payload: Record<string, unknown>): Promise<ToolResultResponse>;
  requestApproval(payload: Record<string, unknown>): Promise<PermissionRequestResponse>;
  stopSession(payload: Record<string, unknown>): Promise<StopResponse>;
}

async function postJson<T>(baseUrl: string, path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Aegis sidecar ${path} returned ${response.status}`);
  }

  const json = (await response.json()) as SidecarResponse<T>;
  if (!json.ok) {
    throw new Error(`Aegis sidecar ${path} returned a non-ok payload`);
  }

  return json.data;
}

export class HttpAegisSidecarClient implements AegisSidecarClient {
  constructor(private readonly baseUrl = process.env.AEGIS_SIDECAR_URL ?? "http://127.0.0.1:4187") {}

  startSession(payload: Record<string, unknown>) {
    return postJson<SessionStartResponse>(this.baseUrl, "/v1/sessions/start", payload);
  }

  recordUserPrompt(payload: Record<string, unknown>) {
    return postJson<UserPromptResponse>(this.baseUrl, "/v1/events/user-prompt", payload);
  }

  decideTool(payload: Record<string, unknown>) {
    return postJson<ToolDecisionResponse>(this.baseUrl, "/v1/tool/decision", payload);
  }

  recordToolResult(payload: Record<string, unknown>) {
    return postJson<ToolResultResponse>(this.baseUrl, "/v1/tool/result", payload);
  }

  requestApproval(payload: Record<string, unknown>) {
    return postJson<PermissionRequestResponse>(this.baseUrl, "/v1/events/permission-request", payload);
  }

  stopSession(payload: Record<string, unknown>) {
    return postJson<StopResponse>(this.baseUrl, "/v1/events/stop", payload);
  }
}
