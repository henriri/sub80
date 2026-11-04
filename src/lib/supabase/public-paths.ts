const publicPaths = ["/login", "/design"];

/** Routes reachable without a session. Everything else requires sign-in. */
export function isPublicPath(pathname: string): boolean {
  return publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
