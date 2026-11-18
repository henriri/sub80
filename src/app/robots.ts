import type { MetadataRoute } from "next";

/**
 * Nothing here is public.
 *
 * sub80 is one athlete's training log behind auth. A crawler would only ever
 * reach the login page, but a training app indexed under its owner's name is
 * not something to leave to chance, and the /design page is a full inventory
 * of the interface.
 *
 * Belt and braces with the `robots: { index: false }` metadata in the layout:
 * this asks a crawler not to FETCH, that one asks it not to INDEX what it
 * fetched anyway. Neither binds a crawler that ignores both, which is why the
 * real protection is row-level security and the auth proxy.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
