import { useEffect, useState } from 'react';

// 'beforeinstallprompt' 는 표준 lib.dom 에 아직 없어 직접 선언.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * 설치 가능 시(브라우저가 beforeinstallprompt 발화) 토바에 "앱 설치" 버튼을 노출한다.
 * 이미 설치되어 독립 창으로 실행 중이거나, 설치 프롬프트가 없으면 아무것도 렌더링하지 않는다.
 */
export function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // 기본 미니 인포바를 막고, 우리 버튼에서 직접 띄운다.
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !promptEvent) return null;

  const install = async () => {
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // 프롬프트는 1회용 — 결과와 무관하게 정리한다.
    if (outcome === 'accepted') setInstalled(true);
    setPromptEvent(null);
  };

  return (
    <button className="install-btn" onClick={install} aria-label="앱 설치">
      ⬇ 앱 설치
    </button>
  );
}
