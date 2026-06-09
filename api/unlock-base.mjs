function json(payload, init = {}) {
  return Response.json(payload, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });
}

export async function POST(request) {
  const configuredPassword = process.env.BASE_EDIT_PASSWORD;
  if (!configuredPassword) {
    return json(
      {
        unlocked: false,
        error: "BASE_EDIT_PASSWORD is not configured."
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  if (body.password !== configuredPassword) {
    return json(
      {
        unlocked: false,
        error: "Incorrect password."
      },
      { status: 401 }
    );
  }

  return json({ unlocked: true });
}
