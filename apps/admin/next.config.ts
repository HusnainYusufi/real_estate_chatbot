import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for a lean production Docker image.
  output: 'standalone',
};

export default nextConfig;
