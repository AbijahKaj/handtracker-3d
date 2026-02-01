/// <reference types="vite/client" />

declare module '@vercel/analytics/react' {
  interface AnalyticsProps {
    mode?: 'auto' | 'development' | 'production';
    debug?: boolean;
    beforeSend?: (event: unknown) => unknown | null;
  }
  export function Analytics(props?: AnalyticsProps): null;
}
