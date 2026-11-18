/**
 * The static files the install surface needs, fetched before there is a
 * session.
 *
 * Chrome requests a manifest WITHOUT cookies, so a redirect here is not an auth
 * problem the athlete can sign in past: Chrome gets the login page's HTML,
 * reports "Line: 1, column: 1, Syntax error" against the manifest, and refuses
 * the install. Keep this list in step with the matcher in `src/proxy.ts`, which
 * cannot import it.
 */
const publicFiles = ["/manifest.webmanifest", "/robots.txt", "/favicon.ico"];

/** Directories and routes reachable without a session, matched per segment. */
const publicPrefixes = ["/login", "/design", "/icons"];

/**
 * What the path actually reaches, so a traversal is judged by its destination
 * rather than by its spelling: `/icons/../runs` is `/runs` and stays private.
 *
 * Decodes first, because `%2e%2e` is a `..` the request router would resolve
 * and a plain string compare would not.
 */
function normalisePath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // A malformed escape is not a path worth guessing at. Treat it as private.
    return null;
  }

  const resolved: string[] = [];
  for (const segment of decoded.split("/")) {
    // Empty segments collapse repeated slashes and any trailing one.
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }

  return `/${resolved.join("/")}`;
}

/** Routes reachable without a session. Everything else requires sign-in. */
export function isPublicPath(pathname: string): boolean {
  const path = normalisePath(pathname);
  if (path === null) return false;

  if (publicFiles.includes(path)) return true;

  return publicPrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
