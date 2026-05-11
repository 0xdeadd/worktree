import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://git.clintphillips.dev/sitemap.xml",
    host: "https://git.clintphillips.dev",
  };
}
