import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const localUploadDirectory = path.resolve(process.cwd(), "uploads");

type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

function getCloudinaryConfig(): CloudinaryConfig | undefined {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const setCount = [cloudName, apiKey, apiSecret].filter(Boolean).length;
  if (setCount === 0) return undefined;
  if (setCount !== 3) throw new Error("Cloudinary storage credentials are incomplete.");
  return { cloudName: cloudName!, apiKey: apiKey!, apiSecret: apiSecret! };
}

export function localImageFilename(url: string): string | undefined {
  const match = /^\/uploads\/([a-f0-9-]+\.(?:jpg|png|webp))$/i.exec(url);
  return match?.[1];
}

function cloudinaryPublicId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "cloudinary.com" && !parsed.hostname.endsWith(".cloudinary.com")) return undefined;
    const match = /\/image\/upload\/(?:v\d+\/)?(.+)$/.exec(parsed.pathname);
    const assetPath = match?.[1];
    if (!assetPath) return undefined;
    return decodeURIComponent(assetPath).replace(/\.[a-z0-9]+$/i, "");
  } catch {
    return undefined;
  }
}

export async function storeImage(buffer: Buffer, mimeType: string, folder: "items" | "campaigns"): Promise<string> {
  const config = getCloudinaryConfig();
  if (!config) {
    if (process.env.NODE_ENV === "production") throw new Error("Cloudinary storage is required in production.");
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
    const filename = `${randomUUID()}.${extension}`;
    await mkdir(localUploadDirectory, { recursive: true });
    await writeFile(path.join(localUploadDirectory, filename), buffer, { flag: "wx" });
    return `/uploads/${filename}`;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = `reusehub/${folder}/${randomUUID()}`;
  const signature = createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${config.apiSecret}`)
    .digest("hex");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType }), `${publicId.split("/").at(-1)}.${mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp"}`);
  form.append("api_key", config.apiKey);
  form.append("timestamp", timestamp);
  form.append("public_id", publicId);
  form.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`, { method: "POST", body: form });
  const payload = await response.json() as { secure_url?: unknown; error?: { message?: string } };
  if (!response.ok || typeof payload.secure_url !== "string") {
    throw new Error(payload.error?.message ?? "The image storage provider rejected the upload.");
  }
  return payload.secure_url;
}

export async function deleteStoredImage(url: string): Promise<void> {
  const filename = localImageFilename(url);
  if (filename) {
    await unlink(path.join(localUploadDirectory, filename)).catch(() => undefined);
    return;
  }

  const publicId = cloudinaryPublicId(url);
  const config = getCloudinaryConfig();
  if (!publicId || !config) return;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${config.apiSecret}`)
    .digest("hex");
  const form = new FormData();
  form.append("api_key", config.apiKey);
  form.append("timestamp", timestamp);
  form.append("public_id", publicId);
  form.append("signature", signature);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/destroy`, { method: "POST", body: form });
  if (!response.ok) throw new Error("The image storage provider could not remove the image.");
}
