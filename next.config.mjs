/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: {
    "*": ["desktop-agent/src-tauri/target/**/*"]
  },
  images: { remotePatterns: [{ protocol: "https", hostname: "i.pravatar.cc" }] }
};

export default nextConfig;
