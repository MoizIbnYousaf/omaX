import { lstat, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_IMAGE_HOSTS = new Set([
  "pbs.twimg.com",
  "abs.twimg.com",
  "video.twimg.com",
  "ton.twimg.com",
]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;
const IMAGE_TIMEOUT_MS = 10_000;
export const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

type FetchImage = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function demoAvatarRoot(): string {
  const stateRoot = process.env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
  return resolve(stateRoot, "omax", "demo-avatars");
}

function isInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !pathFromRoot.startsWith("/"));
}

export function isAllowedImageUrl(imageUrl: string): boolean {
  try {
    const parsed = new URL(imageUrl);
    if (parsed.protocol === "file:") {
      return process.env.OMAX_DEMO === "1";
    }
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      (parsed.port === "" || parsed.port === "443") &&
      ALLOWED_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

async function readDemoImage(parsed: URL): Promise<Buffer> {
  const sourcePath = fileURLToPath(parsed);
  const root = demoAvatarRoot();
  const [resolvedRoot, resolvedSource, sourceStat] = await Promise.all([
    realpath(root),
    realpath(sourcePath),
    lstat(sourcePath),
  ]);
  if (!sourceStat.isFile() || !isInside(resolvedRoot, resolvedSource)) {
    throw new Error("Demo image is outside the private avatar directory.");
  }
  const data = await readFile(resolvedSource);
  if (data.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image exceeds the download limit.");
  }
  return data;
}

async function readBoundedBody(response: Response): Promise<Buffer> {
  const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    throw new Error("Image exceeds the download limit.");
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType && !contentType.startsWith("image/") && contentType !== "application/octet-stream") {
    throw new Error("Image response has an unsupported content type.");
  }
  if (!response.body) {
    throw new Error("Image response has no body.");
  }

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error("Image exceeds the download limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export async function fetchImageBuffer(
  imageUrl: string,
  fetchImpl: FetchImage = globalThis.fetch,
): Promise<Buffer> {
  let current = new URL(imageUrl);
  if (current.protocol === "file:") {
    if (!isAllowedImageUrl(current.href)) {
      throw new Error("Local images are allowed only in demo mode.");
    }
    return readDemoImage(current);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      if (!isAllowedImageUrl(current.href)) {
        throw new Error("Image URL is outside the X media allowlist.");
      }
      const response = await fetchImpl(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/*" },
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirects === MAX_REDIRECTS) {
          throw new Error("Image redirected too many times.");
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new Error("Image redirect has no destination.");
        }
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) {
        throw new Error(`Image request failed with HTTP ${response.status}.`);
      }
      return await readBoundedBody(response);
    }
    throw new Error("Image redirected too many times.");
  } finally {
    clearTimeout(timer);
  }
}
