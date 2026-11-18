import type { MetadataRoute } from "next";
import {
  MANIFEST_BACKGROUND_COLOR,
  MANIFEST_THEME_COLOR,
} from "@/lib/design/manifest-theme";

/**
 * What Android needs to install sub80 to the home screen and launch it without
 * an address bar.
 *
 * NO SERVICE WORKER, deliberately, and none is needed for this: Chromium's
 * installability criteria are a manifest over HTTPS with `name` or
 * `short_name`, a 192 and a 512 icon, `start_url`, a qualifying `display`, and
 * no `prefer_related_applications`. Chrome dropped the service-worker
 * requirement for installing from the browser menu in Chrome 108 on mobile.
 * What a service worker would still buy is Chrome PROMOTING the install by
 * itself, which is not worth caching one athlete's health data to get -- see
 * the PWA note in CLAUDE.md.
 *
 * A plain object, not an async read: the route then prerenders, which matters
 * under `cacheComponents`. The colours are the derived token constants, because
 * a manifest has no cascade and cannot read a CSS variable.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "sub80",
    short_name: "sub80",
    description: "Half marathon training toward 1:20.",
    /*
     * `id` pins the app's identity. Without it the identity is the start_url,
     * so changing where the app opens would make Android treat it as a
     * different app and install a second icon beside the first.
     */
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: MANIFEST_THEME_COLOR,
    background_color: MANIFEST_BACKGROUND_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      /*
       * Separate, never `purpose: "any maskable"`. A launcher crops a maskable
       * icon to its own shape, so a single file claiming both gets the plain
       * artwork cropped into: one of the two always looks wrong.
       */
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    /*
     * Long-press the home-screen icon. The two things the athlete opens the app
     * to do: say what happened, or look at what is next.
     */
    shortcuts: [
      { name: "Log a run", short_name: "Log a run", url: "/runs/new" },
      { name: "Calendar", short_name: "Calendar", url: "/" },
    ],
  };
}
