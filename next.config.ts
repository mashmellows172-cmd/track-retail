import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '10.103.10.126',
    '10.103.10.108',
    '10.0.0.0/8',
    '192.168.0.0/16',
    '172.16.0.0/12',
  ],
};

export default nextConfig;
