// electron-builder afterPack 훅 — macOS 빌드에 ad-hoc 코드서명(codesign -s -)을 적용한다.
// Apple Developer 인증서가 없으므로($99 미사용) 정식 서명·공증은 불가하지만, ad-hoc 서명을 해 두면
// 사용자가 '설정 ▸ 개인정보 보호 및 보안 ▸ 무시하고 열기'로 첫 실행을 허용할 수 있다.
// (완전 미서명 앱은 이 설정 목록에 아예 뜨지 않아 그 경로가 막힌다 — Apple Silicon 은 첫 실행 시
//  자동 ad-hoc 서명하지만, 여기서 빌드시 미리 서명해 두는 편이 확실하다.)
// Windows 등 다른 플랫폼 빌드에선 즉시 반환한다(codesign 은 macOS 전용).
const { execSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = context.packager.appInfo.productFilename; // "Yacht Dice"
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  execSync(`codesign --deep --force -s - "${appPath}"`, { stdio: 'inherit' });
};
