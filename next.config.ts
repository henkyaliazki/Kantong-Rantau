import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir:process.env.AUTH_INTEGRATION_TEST==='1'?'.next-auth-test':'.next',
  async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'}]}];}
};

export default nextConfig;
