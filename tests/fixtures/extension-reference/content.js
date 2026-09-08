(() => {
  "use strict";

  window.addEventListener("load", () => {
    const K = window.AION2_CONFIG.KEYS;
    const phaseModel = window.KINOJO_UPDATER_PHASES;
    const phaseModelReady = !!(
      phaseModel
      && Array.isArray(phaseModel.phases)
      && phaseModel.phases.length === 7
      && Array.isArray(phaseModel.steps)
      && phaseModel.steps.length === 3
    );

    if (localStorage.getItem(K.AUTO_RECOVER) === null) {
      localStorage.setItem(K.AUTO_RECOVER, "true");
    }

    window.AION2_UI.createPanel();
    if (!phaseModelReady) {
      const message = "STEP 진행 모델을 불러오지 못했습니다. 확장프로그램을 다시 로드해주세요.";
      console.error("[KINOJO] updater phase model validation failed", {
        phaseCount: Array.isArray(phaseModel?.phases) ? phaseModel.phases.length : 0,
        stepCount: Array.isArray(phaseModel?.steps) ? phaseModel.steps.length : 0
      });
      if (typeof window.AION2_UI.notifyError === "function") {
        window.AION2_UI.notifyError(message);
      }
    }

    if (localStorage.getItem(K.RUNNING) === "true") {
      window.AION2_UPDATER.startServerProgressPolling_();
      window.AION2_UPDATER.captureServerDebugSnapshot_("poll");
    }
  });
})();
