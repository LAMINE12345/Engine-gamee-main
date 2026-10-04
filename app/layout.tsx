import type {Metadata, Viewport} from 'next';
import { StudioErrorBoundary } from '../components/StudioErrorBoundary';
import './globals.css'; // Global styles

const DESCRIPTION =
  "Studio de création de jeux 3D Web Zero-Code basé sur Three.js avec physique Rapier.js 3D, architecture ECS, contrôleur de personnage ZQSD/FPS, système de logique à 3 niveaux (Behavior Cards, Visual Node Graph, Scripts Monaco) et synthétiseur audio.";

export const metadata: Metadata = {
  title: 'Aether 3D Engine',
  description: DESCRIPTION,
  applicationName: 'Aether 3D',
  manifest: '/manifest.webmanifest',
  icons: {
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Aether 3D',
  },
  openGraph: {
    title: 'Aether 3D Engine',
    description: DESCRIPTION,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aether 3D Engine',
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: '#07080c',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="fr">
      <body suppressHydrationWarning>
        {/* Sans cette frontière, une exception quelconque dans l'éditeur
            démontait tout l'arbre et ne laissait qu'un écran blanc — sans
            aucun moyen de récupérer la scène, pourtant autosauvée. */}
        <StudioErrorBoundary label="l'éditeur">{children}</StudioErrorBoundary>
      </body>
    </html>
  );
}
