const FALLBACK_UPLOAD_PASSWORD = "december";

function getBucket(env) {
  return env.PROJECT_GXRO_BUCKET || env.GXRO_BUCKET || env.R2_BUCKET;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function text(message, status = 400) {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function cleanField(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return cleanField(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "track";
}

function publicTrack(track) {
  return {
    id: track.id,
    name: track.name,
    artist: track.artist || "",
    album: track.album || "",
    summary: track.summary || "",
    lyrics: track.lyrics || "",
    url: `/api/gxro/file?key=${encodeURIComponent(track.fileKey)}`,
    coverUrl: track.coverKey ? `/api/gxro/file?key=${encodeURIComponent(track.coverKey)}` : "",
    createdAt: track.createdAt || ""
  };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequestGet({ env }) {
  const bucket = getBucket(env);
  if (!bucket) return json([]);

  const list = await bucket.list({ prefix: "metadata/" });
  const tracks = [];

  await Promise.all(list.objects.map(async (object) => {
    const metadataObject = await bucket.get(object.key);
    if (!metadataObject) return;

    try {
      const track = await metadataObject.json();
      if (track && track.fileKey) tracks.push(publicTrack(track));
    } catch (error) {
      console.warn(`Could not parse ${object.key}`, error);
    }
  }));

  tracks.sort((a, b) => {
    return (a.createdAt || "").localeCompare(b.createdAt || "") || a.name.localeCompare(b.name);
  });

  return json(tracks);
}

export async function onRequestPost({ request, env }) {
  const bucket = getBucket(env);
  if (!bucket) return text("Missing R2 binding named PROJECT_GXRO_BUCKET.", 500);

  const formData = await request.formData();
  const uploadPassword = env.GXRO_UPLOAD_PASSWORD || FALLBACK_UPLOAD_PASSWORD;
  if (cleanField(formData.get("password")) !== uploadPassword) {
    return text("Incorrect upload password.", 401);
  }

  const mp3 = formData.get("mp3");
  if (!mp3 || typeof mp3.stream !== "function") {
    return text("Choose an MP3 file before publishing.", 400);
  }

  const originalName = cleanField(mp3.name).replace(/\.mp3$/i, "");
  const name = cleanField(formData.get("name")) || originalName || "Untitled Track";
  const id = `${Date.now()}-${slugify(name)}`;
  const fileKey = `tracks/${id}.mp3`;

  await bucket.put(fileKey, mp3.stream(), {
    httpMetadata: {
      contentType: mp3.type || "audio/mpeg",
      contentDisposition: `inline; filename="${slugify(name)}.mp3"`
    }
  });

  let coverKey = "";
  const cover = formData.get("cover");
  if (cover && typeof cover.stream === "function" && cover.size > 0) {
    const coverType = cover.type || "image/jpeg";
    const extension = coverType.includes("png") ? "png" : coverType.includes("webp") ? "webp" : "jpg";
    coverKey = `covers/${id}.${extension}`;
    await bucket.put(coverKey, cover.stream(), {
      httpMetadata: {
        contentType: coverType,
        contentDisposition: `inline; filename="${slugify(name)}.${extension}"`
      }
    });
  }

  const track = {
    id,
    name,
    artist: cleanField(formData.get("artist")),
    album: cleanField(formData.get("album")),
    summary: cleanField(formData.get("summary")),
    lyrics: cleanField(formData.get("lyrics")),
    fileKey,
    coverKey,
    createdAt: new Date().toISOString()
  };

  await bucket.put(`metadata/${id}.json`, JSON.stringify(track, null, 2), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8"
    }
  });

  return json(publicTrack(track), 201);
}
