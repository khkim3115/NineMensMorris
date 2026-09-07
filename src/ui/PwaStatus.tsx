import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * 서비스 워커를 등록(단일)하고, 상태에 따라 하단 토스트를 보여준다.
 * - offlineReady: 오프라인 캐싱 완료 → 인터넷 없이 플레이 가능(잠시 후 자동 닫힘).
 * - needRefresh: 새 버전 배포됨 → "업데이트" 누르면 새 SW 적용 후 새로고침.
 */
export function PwaStatus() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  // 오프라인 준비 토스트는 잠시 보여준 뒤 자동으로 닫는다.
  useEffect(() => {
    if (!offlineReady) return;
    const t = window.setTimeout(() => setOfflineReady(false), 6000);
    return () => window.clearTimeout(t);
  }, [offlineReady, setOfflineReady]);

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="pwa-toast" role="status">
      {needRefresh ? (
        <>
          <span>새 버전이 준비됐어요.</span>
          <button className="pwa-toast-btn" onClick={() => void updateServiceWorker(true)}>
            업데이트
          </button>
          <button
            className="pwa-toast-close"
            onClick={() => setNeedRefresh(false)}
            aria-label="닫기"
          >
            ✕
          </button>
        </>
      ) : (
        <>
          <span>오프라인 플레이 준비 완료 — 작업표시줄에서 인터넷 없이 즐기세요.</span>
          <button
            className="pwa-toast-close"
            onClick={() => setOfflineReady(false)}
            aria-label="닫기"
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}
