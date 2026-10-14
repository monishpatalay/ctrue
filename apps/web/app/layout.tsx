import type { Metadata } from 'next';
import { Nav, Footer } from '@/components/brand';
import './globals.css';
export const metadata: Metadata = { title: 'Ctrue — Clarity, in the moment', description: 'A desktop companion for live transcription, screen understanding, and grounded technical answers.' };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
 return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><Nav />{children}<Footer /></body></html>;
}
