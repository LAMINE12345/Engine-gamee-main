import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Le lint est-il activé au build exprès : `ignoreDuringBuilds: true` le
  // neutralisait, ce qui laissait les violations s'accumuler sans jamais
  // bloquer une livraison. Le lint est désormais à 0 erreur.
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  output: 'standalone',
  webpack: (config, {dev}) => {
    // HMR désactivé via la variable d'environnement DISABLE_HMR.
    // Le file watching est coupé pour éviter les clignotements pendant les
    // modifications.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
