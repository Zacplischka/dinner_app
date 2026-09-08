import type { NavigateOptions, To } from 'react-router';

// App uses BrowserRouter (Declarative mode), whose navigation returns void.
// React Router documents this augmentation for its shared navigate signature.
declare module 'react-router' {
  interface NavigateFunction {
    (to: To, options?: NavigateOptions): void;
    (delta: number): void;
  }
}
