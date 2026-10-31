import "./globals.css";

export const metadata = {
  title: "Background Remove Studio — Free Online Image Tools",
  description: "Remove backgrounds, change backgrounds, resize and compress images for free. No sign-up required.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
