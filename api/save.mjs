function json(payload, init = {}) {
  return Response.json(payload, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });
}

export async function POST() {
  return json({
    ok: true,
    persistence: "browser",
    state: {
      version: 1,
      updatedAt: new Date().toISOString(),
      languages: {
        de: {},
        fr: {}
      }
    }
  });
}
