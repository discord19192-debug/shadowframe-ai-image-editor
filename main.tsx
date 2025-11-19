import { registerRootComponent } from 'expo';
import { ExpoRoot } from 'expo-router';

type RegisterableModule = Record<string, unknown>;

type ExpoModuleContext = {
  (key: string): RegisterableModule;
  keys: () => string[];
  resolve: (key: string) => string;
  id: string;
};

const modules = import.meta.glob<RegisterableModule>('./app/**/*.{js,jsx,ts,tsx}', {
  eager: true,
});

const context = Object.assign(
  (key: string) => {
    const module = modules[key];
    if (!module) {
      throw new Error(`Module not found: ${key}`);
    }
    return module;
  },
  {
    keys: () => Object.keys(modules),
    resolve: (key: string) => key,
    id: 'virtual-expo-router-context',
  }
) as ExpoModuleContext;

export function App() {
  return <ExpoRoot context={context} />;
}

registerRootComponent(App);
