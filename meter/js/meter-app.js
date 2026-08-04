/* KINOJO Meter WEB client
 *
 * Server Engine owns catalog data, filter relations, period windows,
 * power bands, publication policy and statistics. WEB only builds controls
 * from the catalog, sends canonical keys and renders returned values.
 * Meter does not create a page-specific PASS KEY store. Authentication uses the common KINOJO login modal.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const controlIds = [
    'meterClass', 'meterContent', 'meterDungeon', 'meterVariant',
    'meterBoss', 'meterPowerBand', 'meterPeriod', 'meterQueryBtn'
  ];

  let meterConfig = {
    edgeFunctionName: 'meter-ingest',
    releaseChannel: 'stable',
    webClientVersion: 'WEB_50015'
  };
  let desktopRelease = null;
  let meterOperation = null;
  let meterNotices = [];
  let consentDocument = null;
  let consentAccepted = false;
  let consentAcceptedAt = '';
  let edgeUrl = '';
  let publishableKey = '';
  let catalog = null;
  let catalogVersion = '';
  let latestStats = null;
  let statsView = 'power';
  let meterSessionToken = '';
  let meterSessionExpiresAt = '';
  let meterAccount = null;
  let meterCharacters = [];
  let selectedMeterCharacter = null;
  let meterAuthConnecting = false;
  let meterSessionExpiryTimer = 0;

  function formatDps(value) {
    if (value === null || value === undefined || value === '') return '-';
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    if (number >= 1000000) return (number / 1000000).toFixed(number >= 10000000 ? 1 : 2) + 'M';
    if (number >= 1000) return Math.round(number / 1000).toLocaleString('ko-KR') + 'K';
    return Math.round(number).toLocaleString('ko-KR');
  }

  function formatCount(value, emptyValue) {
    if (value === null || value === undefined || value === '') return emptyValue || '-';
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number).toLocaleString('ko-KR') : (emptyValue || '-');
  }

  function formatFileSize(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return '-';
    const formattedBytes = Math.trunc(bytes).toLocaleString('ko-KR');
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB (${formattedBytes} bytes)`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB (${formattedBytes} bytes)`;
    return `${formattedBytes} bytes`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function setControlsEnabled(enabled) {
    controlIds.forEach((id) => {
      const element = $(id);
      if (element) element.disabled = !enabled;
    });
  }

  function setOptions(selectId, placeholder, items, valueKey, labelBuilder, preferredValue) {
    const select = $(selectId);
    const previous = preferredValue !== undefined ? preferredValue : select.value;
    select.replaceChildren(new Option(placeholder, ''));

    items.forEach((item) => {
      const value = String(item[valueKey] || '');
      if (!value) return;
      select.add(new Option(String(labelBuilder(item) || value), value));
    });

    if (previous && Array.from(select.options).some((option) => option.value === previous)) {
      select.value = previous;
    } else {
      select.value = '';
    }
  }

  function catalogArrays() {
    const contentTypes = asArray(catalog && (catalog.contentTypes || catalog.contents));
    const periodTypes = asArray(catalog && (catalog.periodTypes || catalog.periods));
    return {
      classes: asArray(catalog && catalog.classes),
      contentTypes,
      difficulties: asArray(catalog && catalog.difficulties),
      dungeons: asArray(catalog && catalog.dungeons),
      bosses: asArray(catalog && catalog.bosses),
      variants: asArray(catalog && catalog.variants),
      variantBosses: asArray(catalog && catalog.variantBosses),
      powerBands: asArray(catalog && catalog.powerBands),
      periodTypes
    };
  }

  function findCatalogItem(listName, keyName, key) {
    if (!key) return null;
    return catalogArrays()[listName].find((row) => String(row[keyName] || '') === String(key)) || null;
  }

  function difficultyName(difficultyKey) {
    const item = findCatalogItem('difficulties', 'difficultyKey', difficultyKey);
    return item ? item.displayName : difficultyKey;
  }

  function dungeonName(dungeonKey) {
    const item = findCatalogItem('dungeons', 'dungeonKey', dungeonKey);
    return item ? item.dungeonName : dungeonKey;
  }

  function refreshDungeonOptions(resetChildren) {
    const data = catalogArrays();
    const contentKey = $('meterContent').value;
    const dungeons = data.dungeons.filter((item) => !contentKey || item.contentKey === contentKey);
    setOptions('meterDungeon', '전체 던전', dungeons, 'dungeonKey', (item) => item.dungeonName);

    if (resetChildren) {
      $('meterDungeon').value = '';
      $('meterVariant').value = '';
      $('meterBoss').value = '';
    }
    refreshVariantOptions(resetChildren);
    refreshBossOptions(resetChildren);
  }

  function refreshVariantOptions(resetBoss) {
    const data = catalogArrays();
    const dungeonKey = $('meterDungeon').value;
    const variants = dungeonKey
      ? data.variants.filter((item) => item.dungeonKey === dungeonKey)
      : [];

    setOptions(
      'meterVariant',
      dungeonKey ? '전체 난이도·단계' : '던전을 먼저 선택하세요',
      variants,
      'variantKey',
      (item) => difficultyName(item.difficultyKey)
    );
    $('meterVariant').disabled = !dungeonKey || variants.length === 0;

    if (resetBoss) {
      $('meterVariant').value = '';
      $('meterBoss').value = '';
    }
  }

  function refreshBossOptions(resetValue) {
    const data = catalogArrays();
    const contentKey = $('meterContent').value;
    const dungeonKey = $('meterDungeon').value;
    const variantKey = $('meterVariant').value;
    let allowedBossKeys = null;

    if (variantKey) {
      allowedBossKeys = new Set(
        data.variantBosses
          .filter((item) => item.variantKey === variantKey)
          .map((item) => item.bossKey)
      );
    }

    const dungeonKeysForContent = new Set(
      data.dungeons
        .filter((item) => !contentKey || item.contentKey === contentKey)
        .map((item) => item.dungeonKey)
    );

    const bosses = data.bosses.filter((item) => {
      if (allowedBossKeys && !allowedBossKeys.has(item.bossKey)) return false;
      if (dungeonKey && item.dungeonKey !== dungeonKey) return false;
      return dungeonKeysForContent.has(item.dungeonKey);
    });

    setOptions(
      'meterBoss',
      '전체 보스',
      bosses,
      'bossKey',
      (item) => dungeonKey ? item.bossName : `${dungeonName(item.dungeonKey)} · ${item.bossName}`
    );

    if (resetValue) $('meterBoss').value = '';
  }

  function renderCatalog(data) {
    catalog = data;
    catalogVersion = String(data.catalogVersion || '');
    const arrays = catalogArrays();

    if (!catalogVersion || arrays.classes.length === 0 || arrays.contentTypes.length === 0) {
      throw new Error('Server 카탈로그 응답이 완전하지 않습니다.');
    }

    setOptions('meterClass', '전체 클래스', arrays.classes, 'classKey', (item) => item.className, '');
    setOptions('meterContent', '전체 콘텐츠', arrays.contentTypes, 'contentKey', (item) => item.displayName, '');
    setOptions('meterPowerBand', '전체 전투력', arrays.powerBands, 'powerBandKey', (item) => item.displayName, '');
    setOptions('meterPeriod', '집계 기간 선택', arrays.periodTypes, 'periodKey', (item) => item.displayName, data.defaults && data.defaults.periodKey ? data.defaults.periodKey : 'WEEK');

    refreshDungeonOptions(true);
    setControlsEnabled(true);
    $('meterVariant').disabled = true;
    updatePolicyFootnote(data.statisticsPolicy);
  }

  function filterParams() {
    return {
      classKey: $('meterClass').value || null,
      contentKey: $('meterContent').value || null,
      dungeonKey: $('meterDungeon').value || null,
      variantKey: $('meterVariant').value || null,
      bossKey: $('meterBoss').value || null,
      powerBandKey: $('meterPowerBand').value || null,
      periodKey: $('meterPeriod').value || 'WEEK'
    };
  }

  async function readJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('설정 파일을 불러오지 못했습니다.');
    return response.json();
  }

  async function loadConfiguration() {
    const [local, site] = await Promise.all([
      readJson('/meter/meter-config.json?build=2026072403'),
      readJson('/config.json?meter=2026072403')
    ]);
    meterConfig = Object.assign(meterConfig, local || {});
    const supabase = site && site.supabase ? site.supabase : {};
    const base = String(supabase.url || '').replace(/\/$/, '');
    publishableKey = String(supabase.publishableKey || '');
    edgeUrl = base && publishableKey ? `${base}/functions/v1/${meterConfig.edgeFunctionName || 'meter-ingest'}` : '';
    if (!edgeUrl) throw new Error('KINOJO 서버 연결 설정이 없습니다.');
  }

  function safeReleaseUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      const valid = url.protocol === 'https:'
        && url.hostname.toLowerCase() === 'github.com'
        && /\/releases\/download\/[^/]+\/[^/]+$/i.test(url.pathname);
      return valid ? url.href : '';
    } catch {
      return '';
    }
  }

  function hasMeterAccess() {
    return Boolean(meterSessionToken);
  }

  function downloadEnabled() {
    return Boolean(meterOperation && meterOperation.downloadEnabled === true);
  }

  function renderDownloadAccess() {
    const loggedIn = hasMeterAccess();
    const direct = $('meterDirectDownload');
    const state = $('meterConsentState');

    direct.href = '#download';
    direct.classList.remove('is-maintenance');
    state.classList.remove('is-accepted', 'is-error');

    if (!meterOperation) {
      direct.textContent = '다운로드 상태 확인 중';
      direct.setAttribute('aria-disabled', 'true');
      state.textContent = 'Server 운영 상태를 확인하고 있습니다.';
      return;
    }

    if (!downloadEnabled()) {
      const resume = serverTime(meterOperation.resumeAt);
      direct.textContent = '점검 중';
      direct.setAttribute('aria-disabled', 'true');
      direct.classList.add('is-maintenance');
      state.textContent = resume ? `다운로드 점검 중 · ${resume} KST 재개 예정` : '현재 다운로드 점검 중입니다.';
      state.classList.add('is-error');
      $('meterDownloadNote').textContent = String(
        meterOperation.disabledMessage || '키노조 미터 다운로드를 점검하고 있습니다.'
      );
      return;
    }

    if (!desktopRelease) return;
    direct.removeAttribute('aria-disabled');

    if (loggedIn && consentAccepted) {
      direct.textContent = 'Windows 설치 파일 다운로드';
      state.textContent = consentAcceptedAt
        ? `필수 동의 확인 · ${serverTime(consentAcceptedAt)} KST`
        : '현재 버전의 필수 동의가 확인되었습니다.';
      state.classList.add('is-accepted');
      return;
    }

    if (loggedIn) {
      direct.textContent = '필수 동의 후 다운로드';
      state.textContent = '두 필수 항목에 동의해야 다운로드할 수 있습니다.';
      return;
    }

    direct.textContent = 'PASS KEY 로그인 후 다운로드';
    state.textContent = 'PASS KEY 로그인과 필수 동의가 필요합니다.';
  }

  function renderMeterAccessState() {
    const loggedIn = hasMeterAccess();
    const access = $('meterStatsAccess');
    const content = $('meterStatsContent');
    const lock = $('meterStatsLock');

    if (access) access.classList.toggle('is-locked', !loggedIn);
    if (content) {
      content.setAttribute('aria-hidden', String(!loggedIn));
      content.inert = !loggedIn;
    }
    if (lock) lock.hidden = loggedIn;
    renderDownloadAccess();
  }

  function safeConsentLink(value, allowedHost, fallback) {
    try {
      const url = new URL(String(value || '').trim());
      return url.protocol === 'https:' && url.hostname.toLowerCase() === allowedHost ? url.href : fallback;
    } catch {
      return fallback;
    }
  }

  function renderConsentList(id, items) {
    const list = $(id);
    list.replaceChildren();
    asArray(items).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = String(item || '');
      if (li.textContent) list.appendChild(li);
    });
    if (!list.children.length) {
      const li = document.createElement('li');
      li.textContent = 'Server에 등록된 항목이 없습니다.';
      list.appendChild(li);
    }
  }

  function renderConsentDocument(data) {
    if (!data || data.ok !== true || !String(data.documentVersion || '').trim()) {
      throw new Error(data && data.message ? data.message : '필수 동의 문서를 불러오지 못했습니다.');
    }
    consentDocument = data;
    $('meterConsentTitle').textContent = String(data.documentTitle || 'KINOJO Meter 필수 이용 동의');
    $('meterConsentVersion').textContent = `${data.documentVersion} · 시행 ${serverTime(data.effectiveAt) || '-' } KST`;
    $('meterConsentRiskText').textContent = String(data.serviceRiskText || '');
    $('meterConsentStatsText').textContent = String(data.statisticsText || '');
    $('meterConsentRetention').textContent = String(data.retentionText || '');
    $('meterConsentWithdrawal').textContent = String(data.withdrawalText || '');
    renderConsentList('meterConsentCollection', data.collectionItems);
    renderConsentList('meterConsentPurposes', data.usePurposes);
    $('meterConsentPolicyLink').href = safeConsentLink(
      data.aion2PolicyUrl,
      'www.plaync.com',
      'https://www.plaync.com/policy/operation/aion2'
    );
    const privacyFallback = $('meterConsentPrivacyLink').href;
    $('meterConsentPrivacyLink').href = safeConsentLink(data.privacyUrl, 'kinojo.info', privacyFallback);
  }

  async function loadConsentDocument() {
    const data = await callMeter('consentDocument', {});
    renderConsentDocument(data);
  }

  async function refreshConsentStatus() {
    consentAccepted = false;
    consentAcceptedAt = '';
    if (!meterSessionToken || !consentDocument) {
      renderDownloadAccess();
      return false;
    }
    try {
      const result = await callMeter('consentStatus', {
        sessionToken: meterSessionToken,
        documentVersion: consentDocument.documentVersion
      });
      consentAccepted = result.accepted === true;
      consentAcceptedAt = String(result.acceptedAt || '');
      renderDownloadAccess();
      return consentAccepted;
    } catch (error) {
      renderDownloadAccess();
      const state = $('meterConsentState');
      state.textContent = error.message || '동의 상태를 확인하지 못했습니다.';
      state.classList.add('is-error');
      return false;
    }
  }

  function updateConsentConfirmState() {
    $('meterConsentConfirmBtn').disabled = !consentDocument
      || !$('meterConsentRiskCheck').checked
      || !$('meterConsentStatsCheck').checked;
  }

  function openConsentModal() {
    if (!consentDocument) {
      $('meterConsentState').textContent = 'Server 동의 문서를 불러오지 못했습니다.';
      $('meterConsentState').classList.add('is-error');
      return;
    }
    $('meterConsentRiskCheck').checked = false;
    $('meterConsentStatsCheck').checked = false;
    $('meterConsentError').textContent = '';
    updateConsentConfirmState();
    $('meterConsentModal').hidden = false;
    document.body.classList.add('meter-consent-open');
    $('meterConsentRiskCheck').focus();
  }

  function closeConsentModal() {
    $('meterConsentModal').hidden = true;
    document.body.classList.remove('meter-consent-open');
  }

  async function authorizeAndDownload() {
    if (!meterSessionToken || !consentDocument || !desktopRelease || !downloadEnabled()) return;
    const direct = $('meterDirectDownload');
    let failureMessage = '';
    direct.setAttribute('aria-disabled', 'true');
    direct.textContent = 'Server 다운로드 승인 확인 중';
    try {
      const result = await callMeter('desktopDownloadAuthorization', {
        sessionToken: meterSessionToken,
        documentVersion: consentDocument.documentVersion,
        channel: String(meterConfig.releaseChannel || 'stable'),
        clientVersion: String(meterConfig.webClientVersion || 'WEB_50013')
      });
      const release = result && result.desktopUpdate && typeof result.desktopUpdate === 'object'
        ? result.desktopUpdate
        : null;
      if (result && result.operation && typeof result.operation === 'object') {
        meterOperation = result.operation;
      }
      const downloadUrl = release ? safeReleaseUrl(release.downloadUrl) : '';
      if (result.authorized !== true || !downloadUrl) {
        const denied = new Error(result.message || 'Server가 다운로드를 승인하지 않았습니다.');
        denied.code = String(result.code || 'DOWNLOAD_NOT_AUTHORIZED');
        throw denied;
      }
      window.location.assign(downloadUrl);
    } catch (error) {
      if (/동의|세션|PASS KEY/i.test(String(error.message || ''))) {
        consentAccepted = false;
        consentAcceptedAt = '';
      }
      failureMessage = error.message || '다운로드 승인을 확인하지 못했습니다.';
    } finally {
      renderDownloadAccess();
      if (failureMessage) {
        $('meterConsentState').textContent = failureMessage;
        $('meterConsentState').classList.add('is-error');
      }
    }
  }

  async function recordConsentAndDownload() {
    if (!meterSessionToken || !consentDocument) return;
    const button = $('meterConsentConfirmBtn');
    button.disabled = true;
    button.textContent = 'Server에 동의 기록 중';
    $('meterConsentError').textContent = '';
    try {
      const result = await callMeter('recordConsent', {
        sessionToken: meterSessionToken,
        documentVersion: consentDocument.documentVersion,
        serviceRiskAccepted: $('meterConsentRiskCheck').checked,
        statisticsAccepted: $('meterConsentStatsCheck').checked,
        clientSurface: 'WEB',
        clientVersion: String(meterConfig.webClientVersion || 'WEB_50013')
      });
      if (result.accepted !== true) throw new Error(result.message || '필수 동의를 기록하지 못했습니다.');
      consentAccepted = true;
      consentAcceptedAt = String(result.acceptedAt || '');
      closeConsentModal();
      renderDownloadAccess();
      await authorizeAndDownload();
    } catch (error) {
      $('meterConsentError').textContent = error.message || '필수 동의를 기록하지 못했습니다.';
    } finally {
      button.textContent = '동의하고 다운로드';
      updateConsentConfirmState();
    }
  }

  function requestDownload(event) {
    if (event) event.preventDefault();
    if (!downloadEnabled()) {
      renderDownloadAccess();
      return;
    }
    if (!desktopRelease) return;
    if (!meterSessionToken) {
      openCommonLoginForMine();
      return;
    }
    if (consentAccepted) {
      authorizeAndDownload();
      return;
    }
    openConsentModal();
  }

  function scheduleMeterSessionExpiry() {
    if (meterSessionExpiryTimer) window.clearTimeout(meterSessionExpiryTimer);
    meterSessionExpiryTimer = 0;
    const expiresAt = Date.parse(meterSessionExpiresAt);
    if (!Number.isFinite(expiresAt)) return;
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      logoutMine(true, false);
      return;
    }
    meterSessionExpiryTimer = window.setTimeout(
      () => logoutMine(true, false),
      Math.min(delay + 250, 2147483647)
    );
  }

  function setReleaseUnavailable(message) {
    desktopRelease = null;
    $('meterVersion').textContent = '배포 대기';
    $('meterInstallerSize').textContent = '-';
    $('meterDirectDownload').href = '#download';
    $('meterDirectDownload').textContent = '다운로드 준비 중';
    $('meterDirectDownload').setAttribute('aria-disabled', 'true');
    $('meterConsentState').textContent = '활성 릴리스가 등록될 때까지 다운로드할 수 없습니다.';
    $('meterConsentState').classList.remove('is-accepted');
    $('meterConsentState').classList.add('is-error');
    $('meterDownloadNote').textContent = message || 'Server에 활성 릴리스가 등록되지 않았습니다.';
    $('meterReleaseNote').textContent = '배포 정보는 Server Release Master에서 관리합니다.';
  }

  function renderDesktopRelease(data) {
    const release = data && data.desktopUpdate && typeof data.desktopUpdate === 'object'
      ? data.desktopUpdate
      : null;
    if (!data || data.releaseAvailable !== true || !release) {
      setReleaseUnavailable('현재 다운로드 가능한 활성 릴리스가 없습니다.');
      return;
    }

    const downloadUrl = safeReleaseUrl(release.downloadUrl);
    const version = String(release.version || '').trim();
    const sha256 = String(release.sha256 || '').trim().toUpperCase();
    const fileName = String(release.fileName || '').trim();
    if (!downloadUrl || !version || !/^[0-9A-F]{64}$/.test(sha256)) {
      throw new Error('Server 릴리스 정보가 다운로드 안전 기준을 충족하지 않습니다.');
    }

    $('meterVersion').textContent = version;
    $('meterInstallerSize').textContent = formatFileSize(release.fileSize);
    desktopRelease = { version, fileName, sha256 };
    $('meterDownloadNote').textContent = `${fileName || `KINOJO Meter ${version}`} · SHA-256 ${sha256}`;
    $('meterReleaseNote').textContent = String(release.releaseNote || 'Server에서 검증된 활성 릴리스입니다.');
    renderDownloadAccess();
  }

  async function loadDesktopRelease() {
    $('meterVersion').textContent = 'Server 확인 중';
    $('meterInstallerSize').textContent = 'Server 확인 중';
    $('meterDownloadNote').textContent = 'Server Release Master를 확인하고 있습니다.';
    $('meterReleaseNote').textContent = '최신 배포 메모를 불러오는 중입니다.';
    try {
      const data = await callMeter('desktopUpdate', {
        channel: String(meterConfig.releaseChannel || 'stable')
      });
      renderDesktopRelease(data);
    } catch (error) {
      setReleaseUnavailable(error.message || '다운로드 정보를 불러오지 못했습니다.');
    }
  }

  async function callMeter(action, payload) {
    if (!edgeUrl || !publishableKey) throw new Error('KINOJO 서버 연결이 준비되지 않았습니다.');
    const response = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(Object.assign({ action }, payload || {}))
    });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; }
    catch { data = { ok: false, message: raw || `HTTP ${response.status}` }; }
    if (!response.ok || data.ok === false) throw new Error(data.message || `HTTP ${response.status}`);
    return data;
  }

  function setSystemNotice(title, message, visible = true) {
    const root = $('meterSystemNotice');
    if (!root) return;
    root.hidden = !visible;
    root.innerHTML = `<strong>${escapeHtml(title || 'SERVER')}</strong><span>${escapeHtml(message || '')}</span>`;
  }

  function renderPublicConsole(data) {
    meterOperation = data && data.operation && typeof data.operation === 'object'
      ? data.operation
      : { downloadEnabled: false, disabledMessage: '다운로드 운영 상태를 확인하지 못했습니다.' };
    meterNotices = asArray(data && data.notices);
    const notice = meterNotices[0] || {
      noticeType: 'INFO',
      title: '키노조 미터 안내',
      content: '업데이트와 점검 안내는 이 영역에서 확인할 수 있습니다.',
      updatedAt: data && data.serverTime
    };
    const labels = { INFO: '안내', UPDATE: '업데이트', MAINTENANCE: '점검', WARNING: '주의' };
    const type = String(notice.noticeType || 'INFO').toUpperCase();
    $('meterNoticeType').textContent = labels[type] || '안내';
    $('meterNoticeType').dataset.tone = type;
    $('meterNoticeTitle').textContent = String(notice.title || '키노조 미터 안내');
    $('meterNoticeContent').textContent = String(notice.content || '');
    $('meterNoticeTime').textContent = serverTime(notice.updatedAt || notice.startsAt || data.serverTime)
      ? `${serverTime(notice.updatedAt || notice.startsAt || data.serverTime)} KST`
      : 'Server 공지';
    renderDownloadAccess();
  }

  async function loadPublicConsole() {
    const data = await callMeter('publicConsole', {
      channel: String(meterConfig.releaseChannel || 'stable')
    });
    renderPublicConsole(data);
  }

  async function loadCatalog() {
    setControlsEnabled(false);
    setSystemNotice('SERVER CATALOG', '클래스·콘텐츠·던전·보스 기준정보를 불러오는 중입니다.');
    const data = await callMeter('catalog', catalogVersion ? { catalogVersion } : {});
    renderCatalog(data);
    setSystemNotice('SERVER CATALOG', `${catalogVersion} 기준정보를 사용합니다.`, false);
  }

  function setStatsState(state, message) {
    const badge = $('meterStatsState');
    badge.className = '';
    if (state === 'PUBLISHED') {
      badge.textContent = '공개 완료';
      badge.classList.add('is-published');
    } else if (state === 'NO_DATA') {
      badge.textContent = '수집 대기';
      badge.classList.add('is-no-data');
    } else if (state === 'SUPPRESSED') {
      badge.textContent = '표본 집계 중';
      badge.classList.add('is-suppressed');
    } else if (state === 'ERROR') {
      badge.textContent = '조회 오류';
      badge.classList.add('is-error');
    } else if (state === 'LOADING') {
      badge.textContent = '조회 중';
      badge.classList.add('is-loading');
    } else {
      badge.textContent = '공개 대기';
      badge.classList.add('is-waiting');
    }
    $('meterStatsMessage').textContent = message || 'Server 공개 상태를 확인합니다.';
  }

  function resetSummary(encounterValue) {
    $('meterEncounterCount').textContent = encounterValue === undefined ? '-' : encounterValue;
    $('meterCharacterCount').textContent = '-';
    $('meterAverageDps').textContent = '-';
    $('meterOverallP90Dps').textContent = '-';
    $('meterClassP90Dps').textContent = '-';
    $('meterClassP90Note').textContent = '클래스 선택 시 표시';
  }

  function renderNoDataSummary() {
    $('meterEncounterCount').textContent = '0';
    $('meterCharacterCount').textContent = '대기';
    $('meterAverageDps').textContent = '대기';
    $('meterOverallP90Dps').textContent = '대기';
    $('meterClassP90Dps').textContent = '대기';
    $('meterClassP90Note').textContent = '전투 데이터 수집 대기';
  }

  function serverTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }

  function periodRangeText(data) {
    const period = data.period || {};
    const periodName = period.displayName || '집계 기간';
    const start = data.periodStart || period.startAt;
    const end = data.periodEnd || period.endAt || data.generatedAt;
    if (!start) return `${periodName} · ${serverTime(end) || '현재'} KST 기준`;
    return `${periodName} · ${serverTime(start)} ~ ${serverTime(end)} KST`;
  }

  function catalogLabel(type, key) {
    if (!key) return '';
    const maps = {
      classKey: ['classes', 'classKey', 'className'],
      contentKey: ['contentTypes', 'contentKey', 'displayName'],
      dungeonKey: ['dungeons', 'dungeonKey', 'dungeonName'],
      bossKey: ['bosses', 'bossKey', 'bossName'],
      powerBandKey: ['powerBands', 'powerBandKey', 'displayName'],
      periodKey: ['periodTypes', 'periodKey', 'displayName']
    };
    if (type === 'variantKey') {
      const variant = findCatalogItem('variants', 'variantKey', key);
      return variant ? difficultyName(variant.difficultyKey) : key;
    }
    const map = maps[type];
    if (!map) return key;
    const item = findCatalogItem(map[0], map[1], key);
    return item ? item[map[2]] : key;
  }

  function renderAppliedFilters(data) {
    const filters = data.appliedFilters || filterParams();
    const rows = [
      ['클래스', 'classKey', filters.classKey, '전체'],
      ['콘텐츠', 'contentKey', filters.contentKey, '전체'],
      ['던전', 'dungeonKey', filters.dungeonKey, '전체'],
      ['난이도', 'variantKey', filters.variantKey, '전체'],
      ['보스', 'bossKey', filters.bossKey, '전체'],
      ['전투력', 'powerBandKey', filters.powerBandKey, '전체'],
      ['기간', 'periodKey', filters.periodKey || 'WEEK', '주간']
    ];
    $('meterAppliedFilters').innerHTML = rows.map(([label, type, key, fallback]) => (
      `<span><b>${escapeHtml(label)}</b>${escapeHtml(key ? catalogLabel(type, key) : fallback)}</span>`
    )).join('');
    $('meterPeriodRange').textContent = periodRangeText(data);
  }

  function minimumPublicCount(data) {
    const policy = (data && data.statisticsPolicy) || (catalog && catalog.statisticsPolicy) || {};
    const value = Number(data && data.minimumEncounterCount !== undefined
      ? data.minimumEncounterCount
      : policy.minimumEncounterCount);
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
  }

  function updatePolicyFootnote(policySource) {
    const policy = policySource || (catalog && catalog.statisticsPolicy) || {};
    const minimum = Number(policy.minimumEncounterCount || 0);
    $('meterStatsFootnote').textContent = minimum > 0
      ? `선택 조건과 각 분류의 완료·검증 전투가 ${minimum.toLocaleString('ko-KR')}건 이상일 때만 통계를 표시합니다.`
      : '키노조 AI Engine 공개 기준을 충족한 분류만 표시합니다.';
  }

  async function loadStats() {
    if (!catalog) {
      $('meterBucketChart').innerHTML = '<div class="meter-empty">Server 카탈로그가 준비되지 않았습니다.</div>';
      return;
    }

    const button = $('meterQueryBtn');
    button.disabled = true;
    button.textContent = '조회 중...';
    latestStats = null;
    setStatsState('LOADING', '선택 조건의 공개 가능 여부를 Server에서 확인하고 있습니다.');
    resetSummary();
    $('meterAppliedFilters').innerHTML = '<span>Server 필터 확인 중</span>';
    $('meterPeriodRange').textContent = 'Server 집계 기간 확인 중';
    $('meterBucketChart').innerHTML = '<div class="meter-loading">키노조 AI Engine 통계를 불러오는 중...</div>';
    invalidateMineResult('통계 조건이 변경되었습니다. 현재 조건으로 다시 비교해 주세요.');

    try {
      const data = await callMeter('stats', filterParams());
      setSystemNotice('키노조 AI Engine', '선택한 기준으로 완료·검증 전투를 조회했습니다.', false);
      renderStats(data);
    } catch (error) {
      setStatsState('ERROR', error.message || '통계를 불러오지 못했습니다.');
      resetSummary();
      $('meterBucketChart').innerHTML = `<div class="meter-empty">${escapeHtml(error.message || '통계를 불러오지 못했습니다.')}</div>`;
    } finally {
      button.disabled = false;
      button.textContent = '통계 조회';
    }
  }

  function renderStats(data) {
    latestStats = data;
    renderAppliedFilters(data);
    updatePolicyFootnote(data.statisticsPolicy);
    $('meterUpdatedAt').textContent = data.generatedAt || data.updatedAt
      ? `${serverTime(data.generatedAt || data.updatedAt)} KST`
      : '업데이트 완료';

    if (data.hasPublicStats === false) {
      const noData = data.publicState === 'NO_DATA';
      if (noData) {
        renderNoDataSummary();
        setSystemNotice('전투 데이터 준비 중', '현재 참여 횟수는 0건이며 Server 연결은 정상입니다. 검증 완료 전투가 수집되면 자동으로 통계가 표시됩니다.');
      } else {
        resetSummary('비공개');
        setSystemNotice('공개 기준 집계 중', data.publicMessage || 'Server 공개 기준을 충족할 때까지 정확한 통계값을 보호합니다.');
      }
      setStatsState(data.publicState, data.publicMessage || 'Server 공개 기준을 충족하지 못했습니다.');
      renderBreakdown(data);
      return;
    }

    const participantCount = data.participantCharacterCount ?? data.characterCount;
    const filters = data.appliedFilters || filterParams();
    const selectedClassKey = filters.classKey || '';
    const selectedClassName = selectedClassKey ? catalogLabel('classKey', selectedClassKey) : '';
    const genericTop10Dps = data.top10PercentDps ?? data.top10Dps ?? data.p90Dps;
    const overallTop10Dps = data.overallTop10PercentDps
      ?? data.overallTop10Dps
      ?? data.overallP90Dps
      ?? (selectedClassKey ? null : genericTop10Dps);
    const selectedClassRow = selectedClassKey
      ? asArray(data.classBreakdown).find((row) => String(row.classKey || '') === String(selectedClassKey))
      : null;
    const classTop10Dps = data.classTop10PercentDps
      ?? data.classTop10Dps
      ?? data.classP90Dps
      ?? (selectedClassKey
        ? (selectedClassRow
          ? (selectedClassRow.top10PercentDps ?? selectedClassRow.top10Dps ?? selectedClassRow.p90Dps)
          : genericTop10Dps)
        : null);
    $('meterEncounterCount').textContent = formatCount(data.encounterCount);
    $('meterCharacterCount').textContent = formatCount(participantCount);
    $('meterAverageDps').textContent = formatDps(data.averageDps);
    $('meterOverallP90Dps').textContent = formatDps(overallTop10Dps);
    $('meterClassP90Dps').textContent = formatDps(classTop10Dps);
    $('meterClassP90Note').textContent = selectedClassName
      ? `${selectedClassName} 90 percentile`
      : '클래스 선택 시 표시';
    setStatsState('PUBLISHED', data.publicMessage || 'Server 공개 기준을 충족한 통계입니다.');
    setSystemNotice('키노조 AI Engine', '선택한 기준으로 완료·검증 전투를 조회했습니다.', false);
    renderBreakdown(data);
  }

  function renderBreakdown(data) {
    const isClassView = statsView === 'class';
    const rows = asArray(isClassView ? data.classBreakdown : data.powerBandBreakdown);
    $('meterChartTitle').textContent = isClassView ? '클래스별 DPS' : '전투력 구간별 DPS';
    $('meterChartAxisLabel').textContent = isClassView ? '클래스' : '전투력';

    if (data.hasPublicStats === false) {
      const minimum = minimumPublicCount(data);
      const message = data.publicMessage || (minimum ? `${minimum}건 이상 수집되면 공개합니다.` : '공개 가능한 표본이 없습니다.');
      const guide = data.publicState === 'NO_DATA'
        ? 'Server 연결은 정상입니다. 검증 완료 전투가 수집되면 이 영역에 자동으로 통계가 표시됩니다.'
        : '정확한 표본 수와 DPS 값은 공개 기준 미달 시 표시하지 않습니다.';
      $('meterBucketChart').innerHTML = `<div class="meter-empty"><strong>${escapeHtml(message)}</strong><span>${escapeHtml(guide)}</span></div>`;
      return;
    }

    if (!rows.length) {
      $('meterBucketChart').innerHTML = `<div class="meter-empty"><strong>${isClassView ? '클래스별' : '전투력 구간별'} 공개 표본이 없습니다.</strong><span>전체 조건은 공개됐지만 각 분류는 Server 공개 기준에 미달할 수 있습니다.</span></div>`;
      return;
    }

    const values = rows.flatMap((row) => [
      Number(row.averageDps || 0),
      Number(row.medianDps || 0),
      Number(row.top10PercentDps ?? row.top10Dps ?? row.p90Dps ?? 0)
    ]);
    const max = Math.max(1, ...values);

    $('meterBucketChart').innerHTML = rows.map((row) => {
      const averageDps = Number(row.averageDps || 0);
      const medianDps = Number(row.medianDps || 0);
      const top10Dps = Number(row.top10PercentDps ?? row.top10Dps ?? row.p90Dps ?? 0);
      const averageWidth = averageDps > 0 ? Math.max(3, Math.min(100, averageDps / max * 100)) : 0;
      const medianWidth = medianDps > 0 ? Math.max(3, Math.min(100, medianDps / max * 100)) : 0;
      const top10Width = top10Dps > 0 ? Math.max(3, Math.min(100, top10Dps / max * 100)) : 0;
      const label = isClassView
        ? (row.className || row.classKey || '미확인 클래스')
        : (row.displayName || row.powerBandKey || '미확인 구간');
      const encounterCount = formatCount(row.encounterCount, '0');
      const participantCount = formatCount(row.participantCharacterCount ?? row.characterCount, '0');
      return `<div class="meter-bucket-row">
        <div class="meter-bucket-label"><strong>${escapeHtml(label)}</strong><small>캐릭터 ${participantCount}명 · 전투 ${encounterCount}건</small></div>
        <div class="meter-bars">
          <div class="meter-bar average"><i style="width:${averageWidth}%"></i><span>평균 ${formatDps(averageDps)}</span></div>
          <div class="meter-bar median"><i style="width:${medianWidth}%"></i><span>중앙 ${formatDps(medianDps)}</span></div>
          <div class="meter-bar p90"><i style="width:${top10Width}%"></i><span>상위 10% ${formatDps(top10Dps)}</span></div>
        </div>
      </div>`;
    }).join('');
  }

  function setStatsView(nextView) {
    statsView = nextView === 'class' ? 'class' : 'power';
    const powerActive = statsView === 'power';
    $('meterViewPower').classList.toggle('is-active', powerActive);
    $('meterViewClass').classList.toggle('is-active', !powerActive);
    $('meterViewPower').setAttribute('aria-pressed', String(powerActive));
    $('meterViewClass').setAttribute('aria-pressed', String(!powerActive));
    if (latestStats) renderBreakdown(latestStats);
  }

  function formatPower(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.trunc(number).toLocaleString('ko-KR') : '미확인';
  }

  function observedParticipantMarkup(participant) {
    const server = participant.serverName || participant.serverId || '서버 미확인';
    const className = participant.className || '클래스 미확인';
    const power = formatPower(participant.pveCombatPower);
    const share = Number(participant.damageShare || 0);
    const profileResolved = Number(participant.meterCharacterId || 0) > 0;
    return `<li>
      <div class="meter-observed-participant-main">
        <strong>${escapeHtml(participant.characterName || '이름 미확인')}<small>[${escapeHtml(server)}]</small></strong>
        <span>${escapeHtml(className)} · 전투력 ${power}${profileResolved ? '' : ' · 프로필 확인 중'}</span>
      </div>
      <div class="meter-observed-participant-damage">
        <strong>${formatCount(participant.damage, '0')}</strong>
        <span>${Number.isFinite(share) ? share.toFixed(1) : '0.0'}% · DPS ${formatDps(participant.dps)}</span>
      </div>
    </li>`;
  }

  function observedRecordMarkup(record) {
    const participants = asArray(record.participants);
    const resolvedCount = participants.filter((row) => Number(row.meterCharacterId || 0) > 0).length;
    const completeness = Number(record.damageCompleteness || 0);
    const completenessLabel = Number.isFinite(completeness) && completeness > 0
      ? `${Math.min(100, Math.max(0, completeness * 100)).toFixed(1)}% 판독`
      : '판독률 계산 대기';
    const dungeon = record.dungeonName || record.dungeonKey || '던전 미확인';
    const difficulty = record.difficultyName || record.variantName || record.difficultyKey || record.variantKey || '난이도 미확인';
    const bossOrder = Number(record.bossOrder || 0) > 0 ? `${Math.trunc(Number(record.bossOrder))}보스 · ` : '';
    const occurred = serverTime(record.occurredAt);
    return `<article class="meter-observed-card">
      <header>
        <div><span>${escapeHtml(dungeon)} · ${escapeHtml(difficulty)}</span><h3>${bossOrder}${escapeHtml(record.bossName || '보스 미확인')}</h3></div>
        <b>공개 통계 제외</b>
      </header>
      <div class="meter-observed-summary">
        <div><span>판독 파티 피해</span><strong>${formatCount(record.partyTotalDamage, '0')}</strong></div>
        <div><span>전투 시간</span><strong>${Number(record.durationSeconds || 0).toFixed(1)}초</strong></div>
        <div><span>참가자 프로필</span><strong>${resolvedCount}/${participants.length}</strong></div>
        <div><span>Decoder 범위</span><strong>${completenessLabel}</strong></div>
      </div>
      <p>${occurred ? `${escapeHtml(occurred)} KST` : '수집 시각 미확인'} · ${escapeHtml(record.decoderType || 'Decoder 미확인')} ${escapeHtml(record.decoderVersion || '')}</p>
      <details>
        <summary>파티원별 판독 피해 보기</summary>
        <ul>${participants.length ? participants.map(observedParticipantMarkup).join('') : '<li class="meter-empty">판독된 참가자가 없습니다.</li>'}</ul>
      </details>
    </article>`;
  }

  function resetObserved(message) {
    const status = $('meterObservedStatus');
    const list = $('meterObservedList');
    if (status) status.textContent = message || 'PASS KEY 로그인 후 이 계정에서 업로드한 기록을 확인할 수 있습니다.';
    if (list) list.innerHTML = '<div class="meter-empty">아직 불러온 수집 기록이 없습니다.</div>';
  }

  async function loadRecentObserved() {
    const button = $('meterObservedRefreshBtn');
    if (!meterSessionToken) {
      resetObserved();
      return;
    }
    if (button) {
      button.disabled = true;
      button.textContent = '불러오는 중...';
    }
    $('meterObservedStatus').textContent = '이 계정에서 Server에 저장한 최근 실제 수집 기록을 확인하는 중입니다.';
    try {
      const result = await callMeter('recentObserved', { sessionToken: meterSessionToken, limit: 20 });
      const records = asArray(result.records);
      $('meterObservedList').innerHTML = records.length
        ? records.map(observedRecordMarkup).join('')
        : '<div class="meter-empty">아직 Server에 저장된 실제 수집 기록이 없습니다. Desktop 0.2.33 이상에서 보스 전투가 끝나면 여기에 표시됩니다.</div>';
      $('meterObservedStatus').textContent = records.length
        ? `최근 ${records.length.toLocaleString('ko-KR')}건 · 소유자 전용 · Decoder 검증 전 · 공개 통계 제외`
        : (result.message || '저장된 수집 기록이 없습니다.');
    } catch (error) {
      $('meterObservedStatus').textContent = error.message || '최근 수집 기록을 불러오지 못했습니다.';
      $('meterObservedList').innerHTML = '<div class="meter-empty">Server 연결 또는 Meter 세션을 확인해 주세요.</div>';
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = '새로고침';
      }
    }
  }

  function safeImageUrl(value) {
    const url = String(value || '').trim();
    return /^https:\/\//i.test(url) ? url : '';
  }

  function comparisonFilterParams() {
    return {
      contentKey: $('meterContent').value || null,
      dungeonKey: $('meterDungeon').value || null,
      variantKey: $('meterVariant').value || null,
      bossKey: $('meterBoss').value || null,
      periodKey: $('meterPeriod').value || 'WEEK'
    };
  }

  function myConditionText() {
    const filters = comparisonFilterParams();
    const parts = [
      filters.contentKey ? catalogLabel('contentKey', filters.contentKey) : '전체 콘텐츠',
      filters.dungeonKey ? catalogLabel('dungeonKey', filters.dungeonKey) : '전체 던전',
      filters.variantKey ? catalogLabel('variantKey', filters.variantKey) : '전체 난이도',
      filters.bossKey ? catalogLabel('bossKey', filters.bossKey) : '전체 보스',
      filters.periodKey ? catalogLabel('periodKey', filters.periodKey) : '주간'
    ];
    return `${parts.join(' · ')} · 클래스와 전투력은 선택 캐릭터 기록 기준`;
  }

  function setMyPanels(mode) {
    $('meterMyLogin').hidden = mode !== 'login';
    $('meterCharacterPicker').hidden = mode !== 'picker';
    $('meterMyWorkspace').hidden = mode !== 'workspace';
    $('meterMyLogoutBtn').hidden = mode === 'login';
  }

  function characterCardMarkup(character) {
    const image = safeImageUrl(character.profileImageUrl);
    const initial = escapeHtml(String(character.characterName || '?').slice(0, 1));
    const portrait = image
      ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" referrerpolicy="no-referrer"/>`
      : `<span>${initial}</span>`;
    return `<button class="meter-character-card" type="button" data-character-key="${escapeHtml(character.characterKey)}">
      <span class="meter-character-portrait">${portrait}</span>
      <span class="meter-character-copy">
        <span class="meter-character-name">${escapeHtml(character.characterName || '이름 미확인')}${character.isMain ? '<i>본캐</i>' : ''}</span>
        <span>${escapeHtml(character.serverName || character.serverId || '서버 미확인')} · ${escapeHtml(character.className || '클래스 미확인')}</span>
        <small>전투력 ${formatPower(character.pveCombatPower)}</small>
      </span>
      <b>선택</b>
    </button>`;
  }

  function renderCharacterPicker() {
    $('meterAccountName').textContent = meterAccount && meterAccount.mainCharacterName
      ? `${meterAccount.mainCharacterName} · ${meterAccount.roleLabel || meterAccount.role || 'Member'}`
      : 'KINOJO 계정';
    $('meterSessionExpiry').textContent = meterSessionExpiresAt
      ? `${serverTime(meterSessionExpiresAt)} KST까지`
      : '새로고침 시 자동 종료';
    $('meterCharacterList').innerHTML = meterCharacters.map(characterCardMarkup).join('');
    $('meterCharacterError').textContent = meterCharacters.length ? '' : '선택할 수 있는 활성 캐릭터가 없습니다.';
    $('meterCharacterList').querySelectorAll('[data-character-key]').forEach((button) => {
      button.addEventListener('click', () => selectMineCharacter(button.dataset.characterKey || ''));
    });
  }

  function renderSelectedCharacter() {
    const character = selectedMeterCharacter || {};
    const image = safeImageUrl(character.profileImageUrl);
    const initial = escapeHtml(String(character.characterName || '?').slice(0, 1));
    const portrait = image
      ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" referrerpolicy="no-referrer"/>`
      : `<span>${initial}</span>`;
    $('meterSelectedCharacter').innerHTML = `<span class="meter-character-portrait">${portrait}</span>
      <span><small>선택 캐릭터</small><strong>${escapeHtml(character.characterName || '이름 미확인')}</strong><b>${escapeHtml(character.serverName || character.serverId || '서버 미확인')} · ${escapeHtml(character.className || '클래스 미확인')} · 전투력 ${formatPower(character.pveCombatPower)}</b></span>`;
    $('meterMyConditionText').textContent = myConditionText();
  }

  function resetMineResult(message) {
    $('meterMyResult').hidden = true;
    $('meterMyStatus').textContent = message || '';
    $('meterMyTop').textContent = '상위 -%';
    $('meterMySample').textContent = '표본 확인 중';
    $('meterMyDps').textContent = '-';
    $('meterMyMedian').textContent = '-';
    $('meterMyDiff').textContent = '-';
    $('meterMyRecordMeta').textContent = '';
  }

  function invalidateMineResult(message) {
    if (!meterSessionToken || !selectedMeterCharacter) return;
    $('meterMyConditionText').textContent = myConditionText();
    resetMineResult(message || '조건이 변경되었습니다. 다시 비교해 주세요.');
  }

  function readStoredCommonAuth(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch (_error) { return null; }
  }

  function commonAuthState(detail) {
    const source = detail && typeof detail === 'object' ? detail : {};
    const auth = window.KinojoAuth || {};
    const storedSession = readStoredCommonAuth('kinojo_login_session_v1');
    const storedAccount = readStoredCommonAuth('kinojo_login_account_v1');
    const session = source.session || (typeof auth.getSession === 'function' ? auth.getSession() : null) || storedSession;
    const account = source.account || (typeof auth.getAccount === 'function' ? auth.getAccount() : null) || storedAccount;
    const passKey = String(
      (account && (account.passKey || account.passCode || account.pass_key || account.pass_code)) ||
      (session && (session.passKey || session.passCode || session.pass_key || session.pass_code)) || ''
    ).trim();
    return { session, account, passKey, loggedIn: Boolean(source.loggedIn || (session && session.token) || (storedSession && storedSession.token)) };
  }

  function renderCommonLoginState(detail) {
    const state = commonAuthState(detail);
    const button = $('meterOpenLoginBtn');
    const guide = $('meterLoginGuide');
    if (!button || !guide) return;
    if (state.loggedIn && state.passKey) {
      const name = state.account && (state.account.mainCharacterName || state.account.mainCharacter);
      button.textContent = meterAuthConnecting ? '계정 연결 중...' : '로그인 계정으로 연결';
      guide.textContent = name ? `${name} 계정으로 캐릭터 목록을 불러옵니다.` : '현재 로그인 계정으로 캐릭터 목록을 불러옵니다.';
    } else {
      button.textContent = 'PASS KEY 입력하기';
      guide.textContent = '기존 KINOJO 로그인 창에서 PASS KEY를 입력합니다.';
    }
    button.disabled = meterAuthConnecting;
  }

  async function loginMine(passKey, authDetail) {
    const button = $('meterOpenLoginBtn');
    const errorBox = $('meterPassError');
    if (meterAuthConnecting || meterSessionToken) return;
    errorBox.textContent = '';
    meterAuthConnecting = true;
    renderCommonLoginState(authDetail);

    try {
      if (!edgeUrl || !publishableKey) await loadConfiguration();
      const result = await callMeter('login', {
        passKey,
        clientVersion: String(meterConfig.webClientVersion || 'WEB_50011')
      });
      if (!result.sessionToken || !Array.isArray(result.characters) || result.characters.length === 0) {
        throw new Error(result.message || '계정에 연결된 활성 캐릭터가 없습니다.');
      }
      meterSessionToken = String(result.sessionToken);
      meterSessionExpiresAt = String(result.expiresAt || '');
      meterAccount = result.account || null;
      meterCharacters = result.characters;
      selectedMeterCharacter = null;
      scheduleMeterSessionExpiry();
      await refreshConsentStatus();
      renderMeterAccessState();
      renderCharacterPicker();
      setMyPanels('picker');
      await loadRecentObserved();
    } catch (error) {
      errorBox.textContent = error.message || 'KINOJO 로그인 계정을 Meter에 연결하지 못했습니다.';
    } finally {
      meterAuthConnecting = false;
      renderCommonLoginState(authDetail);
    }
  }

  async function connectMineFromCommonAuth(detail) {
    const state = commonAuthState(detail);
    if (!state.loggedIn || !state.passKey) {
      renderCommonLoginState(detail);
      return false;
    }
    await loginMine(state.passKey, detail);
    return Boolean(meterSessionToken);
  }

  async function openCommonLoginForMine() {
    $('meterPassError').textContent = '';
    const state = commonAuthState();
    if (state.loggedIn && state.passKey) {
      await connectMineFromCommonAuth({ loggedIn: true, session: state.session, account: state.account });
      return;
    }
    if (window.KinojoModal && typeof window.KinojoModal.openLogin === 'function') {
      window.KinojoModal.openLogin('미터기 다운로드와 전투 통계를 사용하려면 로그인해 주세요.', { context: 'meter' });
      return;
    }
    if (window.KinojoAuth && typeof window.KinojoAuth.openLoginModal === 'function') {
      window.KinojoAuth.openLoginModal('미터기 다운로드와 전투 통계를 사용하려면 로그인해 주세요.', { context: 'meter' });
      return;
    }
    $('meterPassError').textContent = '공통 로그인 모달을 불러오지 못했습니다.';
  }

  async function selectMineCharacter(characterKey) {
    if (!meterSessionToken || !characterKey) return;
    const buttons = Array.from($('meterCharacterList').querySelectorAll('button'));
    buttons.forEach((button) => { button.disabled = true; });
    $('meterCharacterError').textContent = '선택 캐릭터를 Server에서 확인하는 중입니다.';

    try {
      const result = await callMeter('selectCharacter', {
        sessionToken: meterSessionToken,
        characterKey
      });
      const source = meterCharacters.find((row) => row.characterKey === characterKey) || {};
      selectedMeterCharacter = Object.assign({}, source, result.selectedCharacter || {});
      renderSelectedCharacter();
      setMyPanels('workspace');
      resetMineResult('선택한 캐릭터의 최근 완료·검증 전투를 확인합니다.');
      await loadMineSession();
    } catch (error) {
      $('meterCharacterError').textContent = error.message || '캐릭터를 선택하지 못했습니다.';
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  function renderMineResult(result) {
    const hasPublicComparison = result.hasPublicComparison !== false;
    $('meterMyResult').hidden = false;
    $('meterMyDps').textContent = formatDps(result.myDps);
    $('meterMyResultLabel').textContent = result.bossName
      ? `${result.bossName} · ${result.powerBand && result.powerBand.displayName ? result.powerBand.displayName : '동일 전투력'}`
      : '동일 조건';

    if (hasPublicComparison) {
      $('meterMyTop').textContent = '상위 ' + Number(result.topPercent || 0).toFixed(1) + '%';
      $('meterMySample').textContent = '표본 ' + formatCount(result.encounterCount ?? result.sampleCount, '0') + '전';
      $('meterMyMedian').textContent = formatDps(result.medianDps);
      const diff = Number(result.diffFromMedianPercent ?? 0);
      $('meterMyDiff').textContent = (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
      $('meterMyStatus').textContent = result.message || '동일 조건 비교를 완료했습니다.';
    } else {
      const minimum = Number(result.minimumEncounterCount || 10);
      $('meterMyTop').textContent = '비교 공개 대기';
      $('meterMySample').textContent = `${minimum.toLocaleString('ko-KR')}전 이상 필요`;
      $('meterMyMedian').textContent = '-';
      $('meterMyDiff').textContent = '-';
      $('meterMyStatus').textContent = result.message || '동일 조건 공개 표본이 부족합니다.';
    }

    const occurred = serverTime(result.occurredAt);
    const dungeon = result.dungeonName || catalogLabel('dungeonKey', result.dungeonKey);
    const boss = result.bossName || catalogLabel('bossKey', result.bossKey);
    $('meterMyRecordMeta').textContent = [dungeon, boss, occurred ? `${occurred} KST` : ''].filter(Boolean).join(' · ');
  }

  async function loadMineSession() {
    if (!meterSessionToken || !selectedMeterCharacter) return;
    const button = $('meterMyCompareBtn');
    button.disabled = true;
    button.textContent = '비교 중...';
    resetMineResult('선택 캐릭터와 동일 조건의 Server 통계를 확인하는 중입니다.');

    try {
      const result = await callMeter('myComparison', Object.assign(
        { sessionToken: meterSessionToken },
        comparisonFilterParams()
      ));
      if (!result.hasRecord) {
        $('meterMyStatus').textContent = result.message || '선택 조건의 완료·검증 전투가 없습니다.';
        return;
      }
      if (result.selectedCharacter) {
        selectedMeterCharacter = Object.assign({}, selectedMeterCharacter, result.selectedCharacter);
        renderSelectedCharacter();
      }
      renderMineResult(result);
    } catch (error) {
      const message = error.message || '내 기록을 불러오지 못했습니다.';
      $('meterMyStatus').textContent = message;
      if (/세션|만료|PASS KEY/.test(message)) await logoutMine(true);
    } finally {
      button.disabled = false;
      button.textContent = '내 기록 비교';
    }
  }

  async function logoutMine(silent, clearCommonAuth) {
    const token = meterSessionToken;
    meterSessionToken = '';
    meterSessionExpiresAt = '';
    if (meterSessionExpiryTimer) window.clearTimeout(meterSessionExpiryTimer);
    meterSessionExpiryTimer = 0;
    meterAccount = null;
    meterCharacters = [];
    selectedMeterCharacter = null;
    consentAccepted = false;
    consentAcceptedAt = '';
    closeConsentModal();
    renderMeterAccessState();
    $('meterCharacterList').replaceChildren();
    $('meterPassError').textContent = '';
    $('meterCharacterError').textContent = '';
    resetMineResult('');
    resetObserved();
    setMyPanels('login');
    renderCommonLoginState();
    if (token) {
      try { await callMeter('logout', { sessionToken: token }); }
      catch (error) { if (!silent) $('meterPassError').textContent = error.message || 'Meter 세션 종료에 실패했습니다.'; }
    }
    if (clearCommonAuth && window.KinojoAuth && typeof window.KinojoAuth.clearSession === 'function') {
      window.KinojoAuth.clearSession();
    }
  }

  function logoutMineKeepalive() {
    if (!meterSessionToken || !edgeUrl || !publishableKey) return;
    const token = meterSessionToken;
    meterSessionToken = '';
    if (meterSessionExpiryTimer) window.clearTimeout(meterSessionExpiryTimer);
    meterSessionExpiryTimer = 0;
    fetch(edgeUrl, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${publishableKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ action: 'logout', sessionToken: token })
    }).catch(() => {});
  }

  function showCharacterPicker() {
    if (!meterSessionToken) return;
    selectedMeterCharacter = null;
    resetMineResult('');
    renderCharacterPicker();
    setMyPanels('picker');
  }

  function bind() {
    setControlsEnabled(false);
    renderCommonLoginState();
    renderMeterAccessState();
    $('meterContent').addEventListener('change', () => {
      refreshDungeonOptions(true);
      invalidateMineResult();
    });
    $('meterDungeon').addEventListener('change', () => {
      refreshVariantOptions(true);
      refreshBossOptions(true);
      invalidateMineResult();
    });
    $('meterVariant').addEventListener('change', () => {
      refreshBossOptions(true);
      invalidateMineResult();
    });
    ['meterBoss', 'meterPeriod'].forEach((id) => $(id).addEventListener('change', () => invalidateMineResult()));
    $('meterQueryBtn').addEventListener('click', loadStats);
    $('meterViewPower').addEventListener('click', () => setStatsView('power'));
    $('meterViewClass').addEventListener('click', () => setStatsView('class'));
    $('meterOpenLoginBtn').addEventListener('click', openCommonLoginForMine);
    $('meterStatsLoginBtn').addEventListener('click', openCommonLoginForMine);
    $('meterMyCompareBtn').addEventListener('click', loadMineSession);
    $('meterObservedRefreshBtn').addEventListener('click', loadRecentObserved);
    $('meterChangeCharacterBtn').addEventListener('click', showCharacterPicker);
    $('meterMyLogoutBtn').addEventListener('click', () => logoutMine(false, true));
    $('meterDirectDownload').addEventListener('click', requestDownload);
    $('meterConsentRiskCheck').addEventListener('change', updateConsentConfirmState);
    $('meterConsentStatsCheck').addEventListener('change', updateConsentConfirmState);
    $('meterConsentConfirmBtn').addEventListener('click', recordConsentAndDownload);
    document.querySelectorAll('[data-consent-close]').forEach((element) => {
      element.addEventListener('click', closeConsentModal);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !$('meterConsentModal').hidden) closeConsentModal();
    });
    window.addEventListener('kinojo:auth-changed', async (event) => {
      const detail = event.detail || {};
      renderCommonLoginState(detail);
      if (detail.loggedIn) {
        if (!meterSessionToken) await connectMineFromCommonAuth(detail);
      } else if (meterSessionToken) {
        await logoutMine(true, false);
      }
    });
    window.addEventListener('pagehide', logoutMineKeepalive);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bind();
    try {
      await loadConfiguration();
      await Promise.all([loadPublicConsole(), loadDesktopRelease(), loadConsentDocument(), loadCatalog()]);
      if (!meterSessionToken) await connectMineFromCommonAuth();
      if (meterSessionToken) await refreshConsentStatus();
      if (meterSessionToken) await loadRecentObserved();
      await loadStats();
    } catch (error) {
      setControlsEnabled(false);
      setStatsState('ERROR', error.message || 'Server 카탈로그를 불러오지 못했습니다.');
      resetSummary();
      setSystemNotice('연결 오류', error.message || 'Server 카탈로그를 불러오지 못했습니다.');
      $('meterBucketChart').innerHTML = '<div class="meter-empty">Server 기준정보 연결을 확인해 주세요.</div>';
    }
  });
})();
