window.ArcanaApp = window.ArcanaApp || {};

/**
 * ARCANA Version Manager
 *
 * 버전/작업 순번 표기는 이 파일을 단일 기준으로 관리한다.
 * ZIP 순번을 올릴 때 아래 buildNo/buildCode/display만 함께 갱신한다.
 */
ArcanaApp.versionManager = {
  appVersion: 'ARC-0.3.03',
  buildDate: '20260615',
  buildNo: '02',
  buildCode: '260615_02',

  get display() {
    return `${this.appVersion} · ${this.buildCode}`;
  },

  get zipName() {
    return `arcana_${this.appVersion}_${this.buildDate}_${this.buildNo}.zip`;
  },

  apply() {
    const display = this.display;
    document.title = `아르카나 스킬 시뮬레이터 ${display}`;

    document.querySelectorAll('[data-arcana-version-label], .arcana-version').forEach((node) => {
      node.textContent = display;
    });
  }
};

ArcanaApp.version = ArcanaApp.versionManager.appVersion;
ArcanaApp.buildCode = ArcanaApp.versionManager.buildCode;
ArcanaApp.displayVersion = ArcanaApp.versionManager.display;

document.addEventListener('DOMContentLoaded', () => {
  ArcanaApp.versionManager.apply();
});
