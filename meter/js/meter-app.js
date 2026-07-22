/* KINOJO Meter web client
 * Statistics are calculated by Server Engine 50000. This file only requests
 * and renders server results. PASS KEY values are never persisted.
 */
(function () {
  'use strict';

  const classes = ['전체', '검성', '수호성', '살성', '궁성', '마도성', '정령성', '치유성', '호법성', '사격성', '기갑성', '음유성', '권성'];
  const $ = (id) => document.getElementById(id);
  let meterConfig = { demoFallback: false, edgeFunctionName: 'meter-ingest' };
  let edgeUrl = '';
  let publishableKey = '';

  const demo = {
    ok: true,
    isDemo: true,
    updatedAt: new Date().toISOString(),
    encounterCount: 1842,
    characterCount: 416,
    medianDps: 1120300,
    p90Dps: 1542800,
    buckets: [
      { bucketStart: 300000, bucketEnd: 349999, sampleCount: 118, medianDps: 742000, p90Dps: 983000 },
      { bucketStart: 350000, bucketEnd: 399999, sampleCount: 264, medianDps: 884000, p90Dps: 1176000 },
      { bucketStart: 400000, bucketEnd: 449999, sampleCount: 438, medianDps: 1038000, p90Dps: 1384000 },
      { bucketStart: 450000, bucketEnd: 499999, sampleCount: 517, medianDps: 1216000, p90Dps: 1623000 },
      { bucketStart: 500000, bucketEnd: 549999, sampleCount: 331, medianDps: 1398000, p90Dps: 1847000 },
      { bucketStart: 550000, bucketEnd: 599999, sampleCount: 174, medianDps: 1583000, p90Dps: 2079000 }
    ]
  };

  function formatDps(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) return '-';
    if (number >= 1000000) return (number / 1000000).toFixed(number >= 10000000 ? 1 : 2) + 'm';
    if (number >= 1000) return Math.round(number / 1000).toLocaleString('ko-KR') + 'k';
    return Math.round(number).toLocaleString('ko-KR');
  }

  function filterParams() {
    return {
      className: $('meterClass').value,
      bossName: $('meterBoss').value,
      bucketSize: Number($('meterBucket').value || 50000),
      days: Number($('meterDays').value || 30)
    };
  }

  async function readJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('설정 파일을 불러오지 못했습니다.');
    return response.json();
  }

  async function loadConfiguration() {
    const [local, site] = await Promise.all([
      readJson('/meter/meter-config.json?build=2026072201'),
      readJson('/config.json?meter=2026072201')
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

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
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

  async function loadStats() {
    $('meterBucketChart').innerHTML = '<div class="meter-loading">Server Engine 통계를 불러오는 중...</div>';
    hideMine();
    try {
      const data = await callMeter('stats', filterParams());
      $('meterNotice').innerHTML = '<strong>Server Engine</strong><span>완료·검증된 전투만 집계하고 있습니다.</span>';
      renderStats(data);
    } catch (error) {
      if (meterConfig.demoFallback) {
        $('meterNotice').innerHTML = '<strong>샘플 데이터</strong><span>50000 SQL 배포 또는 유효 표본 수집 전이라 UI 검증용 샘플을 표시합니다. 실제 순위가 아닙니다.</span>';
        renderStats(demo);
      } else {
        $('meterBucketChart').innerHTML = `<div class="meter-empty">${escapeHtml(error.message || '통계를 불러오지 못했습니다.')}</div>`;
      }
    }
  }

  function renderStats(data) {
    $('meterEncounterCount').textContent = Number(data.encounterCount || 0).toLocaleString('ko-KR');
    $('meterCharacterCount').textContent = Number(data.characterCount || 0).toLocaleString('ko-KR');
    $('meterMedianDps').textContent = formatDps(data.medianDps);
    $('meterP90Dps').textContent = formatDps(data.p90Dps);
    $('meterUpdatedAt').textContent = data.updatedAt ? new Date(data.updatedAt).toLocaleString('ko-KR') : '업데이트 완료';

    const rows = Array.isArray(data.buckets) ? data.buckets : [];
    const max = Math.max(1, ...rows.map((row) => Number(row.p90Dps || 0)));
    $('meterBucketChart').innerHTML = rows.length ? rows.map((row) => {
      const median = Math.max(3, Math.min(100, Number(row.medianDps || 0) / max * 100));
      const p90 = Math.max(3, Math.min(100, Number(row.p90Dps || 0) / max * 100));
      const bucket = Number(row.bucketStart || 0).toLocaleString('ko-KR');
      const count = Number(row.sampleCount || 0).toLocaleString('ko-KR');
      return `<div class="meter-bucket-row"><div class="meter-bucket-label"><strong>${bucket}~</strong><small>표본 ${count}전</small></div><div class="meter-bars"><div class="meter-bar"><i style="width:${median}%"></i><span>중앙 ${formatDps(row.medianDps)}</span></div><div class="meter-bar p90"><i style="width:${p90}%"></i><span>상위 10% ${formatDps(row.p90Dps)}</span></div></div></div>`;
    }).join('') : '<div class="meter-empty">선택한 조건에 공개 가능한 표본이 없습니다.</div>';
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
      $('meterMySample').textContent = '표본 ' + Number(result.sampleCount || 0).toLocaleString('ko-KR') + '전';
      $('meterMyDps').textContent = formatDps(result.myDps);
      $('meterMyMedian').textContent = formatDps(result.medianDps);
      const diff = Number(result.diffPercent || 0);
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
    $('meterClass').innerHTML = classes.map((name) => `<option value="${name === '전체' ? '' : name}">${name}</option>`).join('');
    $('meterClass').value = '';
    $('meterQueryBtn').addEventListener('click', loadStats);
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
    try { await loadConfiguration(); }
    catch (error) {
      $('meterNotice').innerHTML = `<strong>연결 설정 오류</strong><span>${escapeHtml(error.message || '설정을 불러오지 못했습니다.')}</span>`;
    }
    loadStats();
  });
})();
