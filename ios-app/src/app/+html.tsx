import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

/** Web-only document. The iOS app does not use this file. */
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `html, body, #root { height: 100%; } body { margin: 0; background: #2a1240; overflow: hidden; } #root { display: flex; flex: 1; }`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
