const API = '/api';

async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e);
    throw new Error(msg || '網路連線失敗，請確認 /api 是否可連');
  }
}

function apiError(body: string, status: number): string {
  try {
    const d = JSON.parse(body) as { error?: string };
    if (d?.error) return d.error;
  } catch {
    /* ignore */
  }
  return body?.trim() || `HTTP ${status}`;
}

export async function getNamespaces(): Promise<string[]> {
  const r = await apiFetch(`${API}/namespaces`);
  const body = await r.text();
  if (!r.ok) throw new Error(apiError(body, r.status));
  const data = JSON.parse(body) as { namespaces?: string[] };
  return data.namespaces || [];
}

export async function getKServe(namespace: string) {
  const r = await fetch(`${API}/kserve/${encodeURIComponent(namespace)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createKServe(namespace: string, data: {
  name: string;
  storageUri?: string;
  modelFormat?: string;
  image?: string;
  cpu?: number | string;
  memory?: number | string;
  gpu?: number;
  minReplicas?: number;
}) {
  const r = await fetch(`${API}/kserve/${encodeURIComponent(namespace)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteKServe(namespace: string, name: string) {
  const r = await fetch(
    `${API}/kserve/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getTrainer(namespace: string) {
  const r = await fetch(`${API}/trainer/${encodeURIComponent(namespace)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteTrainJob(namespace: string, name: string) {
  const r = await fetch(
    `${API}/trainer/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getNotebooks(namespace: string) {
  const r = await fetch(`${API}/notebooks/${encodeURIComponent(namespace)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createNotebook(namespace: string, data: {
  name: string;
  image: string;
  cpu: number;
  memory: number;
  gpu?: number;
  gpuVendor?: string;
  workspaceVolume?: string;
}) {
  const r = await fetch(
    `${API}/notebooks/${encodeURIComponent(namespace)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteNotebook(namespace: string, name: string) {
  const r = await fetch(
    `${API}/notebooks/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getVolumes(namespace: string) {
  const r = await fetch(`${API}/volumes/${encodeURIComponent(namespace)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteVolume(namespace: string, name: string) {
  const r = await fetch(
    `${API}/volumes/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getProfiles() {
  const r = await apiFetch(`${API}/profiles`);
  const body = await r.text();
  if (!r.ok) throw new Error(body || `HTTP ${r.status}`);
  return JSON.parse(body) as { items?: { name: string }[] };
}

export async function getModelRegistryArtifacts() {
  const r = await fetch(`${API}/model-registry/artifacts`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
