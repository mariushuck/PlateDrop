import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        // Signed URLs for the private `proofs` bucket are served from /sign/.
        pathname: "/storage/v1/object/sign/**",
      },
    ],
  },
};

export default nextConfig;
