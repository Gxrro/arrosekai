function getBucket(env) {
  return env.PROJECT_GXRO_BUCKET || env.GXRO_BUCKET || env.R2_BUCKET;
}

export async function onRequestGet({ request, env }) {
  const bucket = getBucket(env);
  if (!bucket) return new Response("Missing R2 binding named PROJECT_GXRO_BUCKET.", { status: 500 });

  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  if (!/^(tracks|covers)\//.test(key)) {
    return new Response("Invalid file key.", { status: 400 });
  }

  const object = await bucket.get(key);
  if (!object) return new Response("File not found.", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=3600");

  return new Response(object.body, { headers });
}
