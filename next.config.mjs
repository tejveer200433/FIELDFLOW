/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: process.cwd(),
  images: { remotePatterns: [{ protocol: "https", hostname: "i.pravatar.cc" }] }
};

export default nextConfig;
