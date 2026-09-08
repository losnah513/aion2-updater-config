window.AION2_AUTH = {
  isSupabaseAuthEnabled_() {
    return !!(window.KINOJO_SUPABASE && ((window.KINOJO_SUPABASE.isEnabled && window.KINOJO_SUPABASE.isEnabled()) || (window.KINOJO_SUPABASE.isPreferred && window.KINOJO_SUPABASE.isPreferred())));
  },

  async authorizeWithSupabase_(mode, stopReason) {
    const C = window.AION2_CONFIG;
    const savedProfile = window.KINOJO_SUPABASE.readMemberProfile ? window.KINOJO_SUPABASE.readMemberProfile() : null;
    const savedFresh = savedProfile && savedProfile.verifiedAt && Date.now() - Number(savedProfile.verifiedAt) <= Number(C.STALE_RUN_LIMIT_MS || 12 * 60 * 60 * 1000);

    if (savedFresh && savedProfile.role) {
      C.CLIENT_ROLE = String(savedProfile.role || 'GUEST').toUpperCase();
      window.AION2_UI.pushLog(`PASS KEY 인증 유지됨 · ${savedProfile.mainCharacterName || savedProfile.roleLabel || savedProfile.role}`);
      return mode === 'resume'
        ? window.AION2_UI.showResumeConfirmModal(stopReason)
        : window.AION2_UI.showStartConfirmModal();
    }

    const passKey = await this.askPassKey_('키노조 PASS KEY를 입력하세요.');
    if (passKey === null) {
      window.AION2_UI.pushLog('PASS KEY 입력 취소');
      return false;
    }

    try {
      const profile = await window.KINOJO_SUPABASE.verifyPassKey(passKey);
      try {
        const runtimePassKey = window.KINOJO_SUPABASE.normalizePassKey ? window.KINOJO_SUPABASE.normalizePassKey(passKey) : String(passKey || '').trim();
        localStorage.setItem('KINOJO_RUNTIME_PASS_CODE', runtimePassKey);
      } catch (_e) {}
      window.KINOJO_SUPABASE.saveMemberProfile(profile);
      await this.setExtStore(C.KEYS.AUTH_FAIL, 0);
      await this.setExtStore(C.KEYS.AUTH_OK, true);
      await this.setExtStore('KINOJO_MEMBER_PROFILE', profile);
      await this.setExtStore(C.KEYS.CLIENT_ROLE, String(profile.role || 'GUEST').toUpperCase());
      await this.setExtStore(C.KEYS.AUTH_TIME, Date.now());
      C.CLIENT_ROLE = String(profile.role || 'GUEST').toUpperCase();
      window.AION2_UI.pushLog(`PASS KEY 인증 성공 · ${profile.mainCharacterName || profile.roleLabel || profile.role}`);
      return mode === 'resume'
        ? window.AION2_UI.showResumeConfirmModal(stopReason)
        : window.AION2_UI.showStartConfirmModal();
    } catch (err) {
      const failCount = Number(await this.getExtStore(C.KEYS.AUTH_FAIL) || 0) + 1;
      await this.setExtStore(C.KEYS.AUTH_FAIL, failCount);
      if (failCount >= C.MAX_PASSWORD_FAILS) {
        await this.setExtStore(C.KEYS.AUTH_LOCK, true);
        await this.setExtStore(C.KEYS.AUTH_OK, false);
        alert('PASS KEY를 5회 이상 잘못 입력했습니다.\n확장프로그램을 삭제 후 다시 설치하거나 관리자에게 문의하세요.');
        return false;
      }
      alert((window.KINOJO_SUPABASE.normalizeError ? window.KINOJO_SUPABASE.normalizeError(err) : String(err.message || err)) + `\n(${failCount}/${C.MAX_PASSWORD_FAILS})`);
      return false;
    }
  },

  async authorizeBeforeStart(config) {
    const C = window.AION2_CONFIG;
    const locked = await this.getExtStore(C.KEYS.AUTH_LOCK);
    if (locked === true) {
      alert("비밀번호 5회 이상 오류로 잠금 처리되었습니다.\n확장프로그램을 삭제 후 다시 설치해야 사용할 수 있습니다.");
      return false;
    }

    if (this.isSupabaseAuthEnabled_()) {
      return this.authorizeWithSupabase_("start");
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
    const savedAuthTime = Number(await this.getExtStore(C.KEYS.AUTH_TIME) || 0);
    const authFresh = savedAuthTime && Date.now() - savedAuthTime <= Number(C.STALE_RUN_LIMIT_MS || 12 * 60 * 60 * 1000);
    const savedHashAllowed = savedHash === testerHash || adminHashes.includes(savedHash);

    if (savedAuthOk === true && savedHashAllowed && savedVersion === C.EXT_VERSION && savedRole && authFresh) {
      window.AION2_CONFIG.CLIENT_ROLE = savedRole;
      window.AION2_UI.pushLog(`인증 유지됨 · ${savedRole}`);
      return window.AION2_UI.showStartConfirmModal();
    }

    const password = await this.askPassword_("조회 비밀번호를 입력하세요.");
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
    await this.setExtStore(C.KEYS.AUTH_TIME, Date.now());

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

    if (this.isSupabaseAuthEnabled_()) {
      return this.authorizeWithSupabase_("resume", stopReason);
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
    const savedAuthTime = Number(await this.getExtStore(C.KEYS.AUTH_TIME) || 0);
    const authFresh = savedAuthTime && Date.now() - savedAuthTime <= Number(C.STALE_RUN_LIMIT_MS || 12 * 60 * 60 * 1000);
    const savedHashAllowed = savedHash === testerHash || adminHashes.includes(savedHash);

    if (savedAuthOk === true && savedHashAllowed && savedVersion === C.EXT_VERSION && savedRole && authFresh) {
      window.AION2_CONFIG.CLIENT_ROLE = savedRole;
      window.AION2_UI.pushLog(`인증 유지됨 · ${savedRole}`);
      return window.AION2_UI.showResumeConfirmModal(stopReason);
    }

    const password = await this.askPassword_("조회 비밀번호를 입력하세요.");
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
    await this.setExtStore(C.KEYS.AUTH_TIME, Date.now());

    window.AION2_CONFIG.CLIENT_ROLE = role;
    window.AION2_UI.pushLog(`인증 성공 · ${role}`);

    return window.AION2_UI.showResumeConfirmModal(stopReason);
  },

  async askPassKey_(message) {
    if (window.AION2_UI && typeof window.AION2_UI.showPassKeyPromptModal === "function") {
      return window.AION2_UI.showPassKeyPromptModal(message);
    }
    if (window.AION2_UI && typeof window.AION2_UI.showPasswordPromptModal === "function") {
      return window.AION2_UI.showPasswordPromptModal(message);
    }
    return prompt(message);
  },

  async askPassword_(message) {
    if (window.AION2_UI && typeof window.AION2_UI.showPasswordPromptModal === "function") {
      return window.AION2_UI.showPasswordPromptModal(message);
    }

    return prompt(message);
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
