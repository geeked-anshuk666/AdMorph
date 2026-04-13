/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for Docker (produces server.js)
  output: "standalone",

  // Allow images from ad creative sources
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
