import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireShopMembership, requireShopPermission } from "@/server/auth/session";
import { createStorageAdmin, isShopLogoKey } from "@/server/supabase/storage";

const root = path.join(process.cwd(), ".private-uploads", "shop-logos");
function detect(buffer: Buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return { ext: "png", mime: "image/png" };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  try {
    await requireShopPermission(shopId, "canManageSettings");
    const form = await request.formData(); const file = form.get("logo");
    if (!(file instanceof File) || file.size < 1 || file.size > 1_048_576) return new NextResponse("Choose an image up to 1 MB.", { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer()); const detected = detect(bytes);
    if (!detected || file.type !== detected.mime) return new NextResponse("Only valid PNG, JPEG, and WebP images are accepted.", { status: 400 });
    try { const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata(); if (!metadata.width || !metadata.height || metadata.width * metadata.height > 40_000_000 || !["png", "jpeg", "webp"].includes(metadata.format ?? "")) return new NextResponse("The image is invalid or too large to decode.", { status: 400 }); }
    catch { return new NextResponse("The image is invalid or too large to decode.", { status: 400 }); }
    const key = `${shopId}/${randomUUID()}.${detected.ext}`;
    const { client, bucket } = createStorageAdmin();
    const { error: uploadError } = await client.storage.from(bucket).upload(key, bytes, { contentType: detected.mime, upsert: false });
    if (uploadError) throw uploadError;
    const old = await db.shopSettings.findUnique({ where: { shopId }, select: { logoKey: true } });
    try {
      await db.shopSettings.update({ where: { shopId }, data: { logoKey: key } });
    } catch (error) {
      await client.storage.from(bucket).remove([key]).catch(() => undefined);
      throw error;
    }
    if (old?.logoKey && isShopLogoKey(shopId, old.logoKey)) await client.storage.from(bucket).remove([old.logoKey]).catch(() => undefined);
    if (old?.logoKey && /^[a-f0-9-]+\.(png|jpg|webp)$/.test(old.logoKey)) await import("node:fs/promises").then(({ unlink }) => unlink(path.join(root, old.logoKey!)).catch(() => undefined));
    return NextResponse.redirect(new URL(`/dashboard/shops/${shopId}/settings`, request.url), 303);
  } catch { return new NextResponse("Upload unavailable.", { status: 403 }); }
}
export async function GET(_request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  try {
    await requireShopMembership(shopId);
    const settings = await db.shopSettings.findUnique({ where: { shopId }, select: { logoKey: true } });
    if (!settings?.logoKey) return new NextResponse(null, { status: 404 });
    let buffer: Buffer;
    let mime: string;
    if (isShopLogoKey(shopId, settings.logoKey)) {
      const { client, bucket } = createStorageAdmin();
      const { data, error } = await client.storage.from(bucket).download(settings.logoKey);
      if (error || !data) return new NextResponse(null, { status: 404 });
      buffer = Buffer.from(await data.arrayBuffer());
      mime = settings.logoKey.endsWith(".png") ? "image/png" : settings.logoKey.endsWith(".webp") ? "image/webp" : "image/jpeg";
    } else if (/^[a-f0-9-]+\.(png|jpg|webp)$/.test(settings.logoKey)) {
      buffer = await readFile(path.join(root, settings.logoKey));
      mime = settings.logoKey.endsWith(".png") ? "image/png" : settings.logoKey.endsWith(".webp") ? "image/webp" : "image/jpeg";
    } else {
      return new NextResponse(null, { status: 404 });
    }
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch { return new NextResponse(null, { status: 404 }); }
}
