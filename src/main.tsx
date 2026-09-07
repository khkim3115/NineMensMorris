import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { Home } from './ui/Home';
import { PwaStatus } from './ui/PwaStatus';
import { useAppStore } from './store/appStore';
import './index.css';

function Root() {
  const screen = useAppStore((s) => s.screen);
  return (
    <>
      {screen === 'solo' ? <App /> : <Home />}
      <PwaStatus />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
