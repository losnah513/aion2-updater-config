/* KINOJO Meter WEB client
 *
 * Server Engine owns catalog data, filter relations, period windows,
 * power bands, publication policy and statistics. WEB only builds controls
 * from the catalog, sends canonical keys and renders returned values.
 * PASS KEY values are never persisted.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const controlIds = [
    'meterClass', 'meterContent', 'meterDungeon', 'meterVariant',
    'meterBoss', 'meterPowerBand', 'meterPeriod', 'meterQueryBtn'
  ];

  let meterConfig = { edgeFunctionName: 'meter-ingest' };
  let edgeUrl = '';
  let publishableKey = '';
  let catalog = null;
  let catalogVersion = '';
  let latestStats = null;
  let statsView = 'power';

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
      readJson('/meter/meter-config.json?build=2026072203'),
      readJson('/config.json?meter=2026072203')
    ]);
    meterConfig = Object.assign(meterConfig, local || {});
    const supabase = site && site.supabase ? site.supabase : {};
    const base = String(supabase.url || '').replace(/\/$/, '');
    publishableKey = String(supabase.publishableKey || '');
    edgeUrl = base && publishableKey ? `${base}/functions/v1/${meterConfig.edgeFunctionName || 'meter-ingest'}` : '';
    if (!edgeUrl) throw new Error('KINOJO 서버 연결 설정이 없습니다.');

    if (meterConfig.version) $('meterVersion').textContent = meterConfig.version;
    if (meterConfig.installerSize) $('meterInstallerSize').textContent = meterConfig.installerSize;
    if (meterConfig.notice) $('meterNotice').innerHTML = `<strong>KINOJO METER</strong><span>${escapeHtml(meterConfig.notice)}</span>`;

    const downloadUrl = String(meterConfig.downloadUrl || '').trim();
    const releasePageUrl = String(meterConfig.releasePageUrl || '').trim();
    const targetUrl = downloadUrl || releasePageUrl;
    if (targetUrl) {
      $('meterDirectDownload').href = targetUrl;
      $('meterDirectDownload').textContent = downloadUrl ? 'Windows 테스트 버전 다운로드' : '릴리스 페이지 열기';
      $('meterDirectDownload').removeAttribute('aria-disabled');
      $('meterDownloadBtn').href = targetUrl;
      const sha = String(meterConfig.sha256 || '').trim();
      $('meterDownloadNote').textContent = sha ? `SHA-256 ${sha}` : '다운로드 파일의 게시된 체크섬을 확인해 주세요.';
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

  async function loadCatalog() {
    setControlsEnabled(false);
    $('meterNotice').innerHTML = '<strong>Server Catalog</strong><span>클래스·콘텐츠·던전·보스 기준정보를 불러오는 중입니다.</span>';
    const data = await callMeter('catalog', catalogVersion ? { catalogVersion } : {});
    renderCatalog(data);
    $('meterNotice').innerHTML = `<strong>Server Catalog</strong><span>${escapeHtml(catalogVersion)} 기준정보를 사용합니다.</span>`;
  }

  function setStatsState(state, message) {
    const badge = $('meterStatsState');
    badge.className = '';
    if (state === 'PUBLISHED') {
      badge.textContent = '공개 완료';
      badge.classList.add('is-published');
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
    $('meterMedianDps').textContent = '-';
    $('meterP90Dps').textContent = '-';
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
      ? `선택 조건과 각 분류의 유효 전투가 ${minimum.toLocaleString('ko-KR')}건 이상일 때만 Server 통계를 표시합니다.`
      : 'Server 공개 기준을 충족한 분류만 표시합니다.';
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
    $('meterBucketChart').innerHTML = '<div class="meter-loading">Server Engine 통계를 불러오는 중...</div>';
    hideMine();

    try {
      const data = await callMeter('stats', filterParams());
      $('meterNotice').innerHTML = '<strong>Server Engine</strong><span>선택한 Server 카탈로그 key로 완료·검증 전투를 조회했습니다.</span>';
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
      resetSummary(noData ? '0' : '비공개');
      setStatsState(data.publicState, data.publicMessage || 'Server 공개 기준을 충족하지 못했습니다.');
      renderBreakdown(data);
      return;
    }

    const participantCount = data.participantCharacterCount ?? data.characterCount;
    const top10Dps = data.top10PercentDps ?? data.top10Dps ?? data.p90Dps;
    $('meterEncounterCount').textContent = formatCount(data.encounterCount);
    $('meterCharacterCount').textContent = formatCount(participantCount);
    $('meterAverageDps').textContent = formatDps(data.averageDps);
    $('meterMedianDps').textContent = formatDps(data.medianDps);
    $('meterP90Dps').textContent = formatDps(top10Dps);
    setStatsState('PUBLISHED', data.publicMessage || 'Server 공개 기준을 충족한 통계입니다.');
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
      $('meterBucketChart').innerHTML = `<div class="meter-empty"><strong>${escapeHtml(message)}</strong><span>정확한 표본 수와 DPS 값은 공개 기준 미달 시 표시하지 않습니다.</span></div>`;
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

  async function loadMine(passKey) {
    const button = $('meterMyQueryBtn');
    const errorBox = $('meterPassError');
    errorBox.textContent = '';
    button.disabled = true;
    button.textContent = '조회 중...';

    try {
      const result = await callMeter('myComparison', Object.assign(filterParams(), { passKey }));
      if (!result.hasRecord) throw new Error(result.message || '비교할 유효 전투가 없습니다.');
      $('meterMyEmpty').hidden = true;
      $('meterMyResult').hidden = false;
      $('meterMyTop').textContent = '상위 ' + Number(result.topPercent || 0).toFixed(1) + '%';
      $('meterMySample').textContent = '표본 ' + formatCount(result.encounterCount ?? result.sampleCount, '0') + '전';
      $('meterMyDps').textContent = formatDps(result.myDps);
      $('meterMyMedian').textContent = formatDps(result.medianDps);
      const diff = Number(result.diffFromMedianPercent ?? result.diffPercent ?? 0);
      $('meterMyDiff').textContent = (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
    } catch (error) {
      errorBox.textContent = error.message || '내 기록을 불러오지 못했습니다.';
    } finally {
      $('meterPassKey').value = '';
      button.disabled = false;
      button.textContent = '내 기록 비교';
    }
  }

  function hideMine() {
    $('meterMyEmpty').hidden = false;
    $('meterMyResult').hidden = true;
    $('meterPassError').textContent = '';
    $('meterPassKey').value = '';
  }

  function bind() {
    setControlsEnabled(false);
    $('meterContent').addEventListener('change', () => refreshDungeonOptions(true));
    $('meterDungeon').addEventListener('change', () => {
      refreshVariantOptions(true);
      refreshBossOptions(true);
    });
    $('meterVariant').addEventListener('change', () => refreshBossOptions(true));
    $('meterQueryBtn').addEventListener('click', loadStats);
    $('meterViewPower').addEventListener('click', () => setStatsView('power'));
    $('meterViewClass').addEventListener('click', () => setStatsView('class'));
    $('meterPassForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const passKey = $('meterPassKey').value.trim();
      if (!passKey) {
        $('meterPassError').textContent = 'PASS KEY를 입력해 주세요.';
        return;
      }
      loadMine(passKey);
    });
    $('meterMyResetBtn').addEventListener('click', hideMine);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bind();
    try {
      await loadConfiguration();
      await loadCatalog();
      await loadStats();
    } catch (error) {
      setControlsEnabled(false);
      setStatsState('ERROR', error.message || 'Server 카탈로그를 불러오지 못했습니다.');
      resetSummary();
      $('meterNotice').innerHTML = `<strong>연결 오류</strong><span>${escapeHtml(error.message || 'Server 카탈로그를 불러오지 못했습니다.')}</span>`;
      $('meterBucketChart').innerHTML = '<div class="meter-empty">Server 기준정보 연결을 확인해 주세요.</div>';
    }
  });
})();
