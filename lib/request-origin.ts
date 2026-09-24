export function allowedRequestOrigin(req: Request, mode: string | undefined = process.env.NODE_ENV): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const source = new URL(origin);
    const target = new URL(req.url);
    if (source.origin !== origin) return false;
    if (source.origin === target.origin) return true;
    const local = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
    return (mode === 'development' || mode === 'test') &&
      local(source.hostname) && local(target.hostname) &&
      source.protocol === target.protocol && source.port === target.port;
  } catch { return false; }
}
