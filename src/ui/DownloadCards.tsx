// 앱으로 받기 — PWA 설치 / 트레이 앱(Windows·macOS).
// 트레이 설치 파일은 GitHub Releases 의 고정 자산 이름으로 받는다(desktop/package.json 의 artifactName 과 일치).
import { InstallButton } from './InstallButton';

const RELEASES = 'https://github.com/khkim3115/NineMensMorris/releases';
const TRAY_EXE_URL = `${RELEASES}/latest/download/NineMensMorris-Tray-Setup.exe`;
const TRAY_DMG_URL = `${RELEASES}/latest/download/NineMensMorris-Tray.dmg`;

export function DownloadCards() {
  return (
    <section className="home-card">
      <h2>📥 앱으로 받기</h2>
      <div className="dl-grid">
        <div className="dl-item">
          <div className="dl-title">데스크탑 앱 (PWA)</div>
          <p className="dl-desc">
            브라우저에 설치하면 주소창 없는 독립 창으로 뜨고, 혼자 하기는 <b>인터넷 없이도</b> 돌아갑니다.
          </p>
          <InstallButton />
          <p className="dl-hint">
            버튼이 안 보이면 주소창 오른쪽의 설치(⊕) 아이콘이나 브라우저 메뉴 → “앱 설치”를 사용하세요.
          </p>
        </div>

        <div className="dl-item">
          <div className="dl-title">트레이 앱 (Windows)</div>
          <p className="dl-desc">시스템 트레이에 상주하는 작은 창. 항상 위·투명도 조절 지원.</p>
          <a className="dl-btn" href={TRAY_EXE_URL}>
            ⬇ 다운로드
          </a>
        </div>

        <div className="dl-item">
          <div className="dl-title">트레이 앱 (macOS)</div>
          <p className="dl-desc">메뉴 막대에 상주하는 .dmg 버전. Windows 판과 같은 기능입니다.</p>
          <a className="dl-btn" href={TRAY_DMG_URL}>
            ⬇ 다운로드
          </a>
          <p className="dl-hint">
            무료 배포라 코드 서명이 없어, 첫 실행만 <b>설정 ▸ 개인정보 보호 및 보안 ▸ 무시하고 열기</b>가 필요합니다.
          </p>
        </div>
      </div>
    </section>
  );
}
