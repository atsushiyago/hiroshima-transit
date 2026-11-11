import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import 'cesium/Build/Cesium/Widgets/widgets.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'PLATEAU 交通空白地可視化・施策シミュレーション（広島県：広島市安佐南区・呉市宮原地区）',
  description: 'PLATEAU 3D都市モデルを用いた広島県内の傾斜地交通空白地可視化・施策シミュレーション（広島市安佐南区 毘沙門台・長楽寺周辺 / 呉市 宮原・両城・平原周辺）',
  verification: {
    google: 'lEwWrnQDGdebu0V7ZBAU0KxIAdoKAiuQqiS7jf22T88',
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
