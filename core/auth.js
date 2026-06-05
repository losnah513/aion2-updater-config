window.AION2_AUTH = {  async authorizeBeforeStart(config) {
    const C = window.AION2_CONFIG;
    const locked = await this.getExtStore(C.KEYS.AUTH_LOCK);
    if (locked === true) {
      alert("비밀번호 5회 이상 오류로 잠금 처리되었습니다.\n확장프로그램을 삭제 후 다시 설치해야 사용할 수 있습니다.");
      return false;
    }

    const testerHash = String(config.passwordHash || "").trim();
    const adminHashes = Array.isArray(config.adminPasswordHashes)
      ? config.adminPasswordHashes.map(v => String(v || "").trim()).filter(Boolean)
      : (config.adminPasswordHash ? [String(config.adminPasswordHash).trim()] : []);

    if (!testerHash) throw new Error("config.json에 passwordHash가 없습니다.");

    const savedAuthOk = await this.getExtStore(C.KEYS.AUTH_OK);
    const savedHash = await this.getExtStore("AION2_AUTH_HASH");
    const savedVersion = await this.getExtStore("AION2_AUTH_VERSION");
    const savedRole = await this.getExtStore("AION2_CLIENT_ROLE");

    if (savedAuthOk === true && savedHash && savedVersion === C.EXT_VERSION && savedRole) {
      window.AION2_CONFIG.CLIENT_ROLE = savedRole;
      window.AION2_UI.pushLog(`인증 유지됨 · ${savedRole}`);
      return window.AION2_UI.showStartConfirmModal();
    }

    const password = prompt("조회 비밀번호를 입력하세요.");
    if (password === null) {
      window.AION2_UI.pushLog("비밀번호 입력 취소");
      return false;
    }

    const inputHash = await this.sha256(password);

    let role = "";
    let matchedHash = "";

    if (inputHash === testerHash) {
      role = "tester";
      matchedHash = testerHash;
    } else if (adminHashes.includes(inputHash)) {
      role = "admin";
      matchedHash = inputHash;
    }

    if (!role) {
      const failCount = Number(await this.getExtStore(C.KEYS.AUTH_FAIL) || 0) + 1;
      await this.setExtStore(C.KEYS.AUTH_FAIL, failCount);

      if (failCount >= C.MAX_PASSWORD_FAILS) {
        await this.setExtStore(C.KEYS.AUTH_LOCK, true);
        await this.setExtStore(C.KEYS.AUTH_OK, false);
        alert("비밀번호를 5회 이상 잘못 입력했습니다.\n확장프로그램을 삭제 후 다시 설치해야 사용할 수 있습니다.");
        return false;
      }

      alert(`비밀번호를 잘못 입력했습니다. (${failCount}/${C.MAX_PASSWORD_FAILS})`);
      return false;
    }

    await this.setExtStore(C.KEYS.AUTH_FAIL, 0);
    await this.setExtStore(C.KEYS.AUTH_OK, true);
    await this.setExtStore("AION2_AUTH_HASH", matchedHash);
    await this.setExtStore("AION2_AUTH_VERSION", C.EXT_VERSION);
    await this.setExtStore("AION2_CLIENT_ROLE", role);

    window.AION2_CONFIG.CLIENT_ROLE = role;
    window.AION2_UI.pushLog(`인증 성공 · ${role}`);

    return window.AION2_UI.showStartConfirmModal();
  },  async authorizeBeforeResume(config, stopReason) {
    const C = window.AION2_CONFIG;
    const locked = await this.getExtStore(C.KEYS.AUTH_LOCK);

    if (locked === true) {
      alert("비밀번호 5회 이상 오류로 잠금 처리되었습니다.\n확장프로그램을 삭제 후 다시 설치해야 사용할 수 있습니다.");
      return false;
    }

    const testerHash = String(config.passwordHash || "").trim();
    const adminHashes = Array.isArray(config.adminPasswordHashes)
      ? config.adminPasswordHashes.map(v => String(v || "").trim()).filter(Boolean)
      : (config.adminPasswordHash ? [String(config.adminPasswordHash).trim()] : []);

    if (!testerHash) throw new Error("config.json에 passwordHash가 없습니다.");

    const savedAuthOk = await this.getExtStore(C.KEYS.AUTH_OK);
    const savedHash = await this.getExtStore("AION2_AUTH_HASH");
    const savedVersion = await this.getExtStore("AION2_AUTH_VERSION");
    const savedRole = await this.getExtStore("AION2_CLIENT_ROLE");

    if (savedAuthOk === true && savedHash && savedVersion === C.EXT_VERSION && savedRole) {
      window.AION2_CONFIG.CLIENT_ROLE = savedRole;
      window.AION2_UI.pushLog(`인증 유지됨 · ${savedRole}`);
      return window.AION2_UI.showResumeConfirmModal(stopReason);
    }

    const password = prompt("조회 비밀번호를 입력하세요.");
    if (password === null) {
      window.AION2_UI.pushLog("비밀번호 입력 취소");
      return false;
    }

    const inputHash = await this.sha256(password);

    let role = "";
    let matchedHash = "";

    if (inputHash === testerHash) {
      role = "tester";
      matchedHash = testerHash;
    } else if (adminHashes.includes(inputHash)) {
      role = "admin";
      matchedHash = inputHash;
    }

    if (!role) {
      alert("비밀번호를 잘못 입력했습니다.");
      return false;
    }

    await this.setExtStore(C.KEYS.AUTH_OK, true);
    await this.setExtStore("AION2_AUTH_HASH", matchedHash);
    await this.setExtStore("AION2_AUTH_VERSION", C.EXT_VERSION);
    await this.setExtStore("AION2_CLIENT_ROLE", role);

    window.AION2_CONFIG.CLIENT_ROLE = role;
    window.AION2_UI.pushLog(`인증 성공 · ${role}`);

    return window.AION2_UI.showResumeConfirmModal(stopReason);
  },

  async sha256(text) {
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  },

  getExtStore(key) {
    return new Promise(resolve => chrome.storage.local.get([key], result => resolve(result[key])));
  },

  setExtStore(key, value) {
    return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
  }
};