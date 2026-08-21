/*
 * KINOJO My Info image editor foundation
 * B-1 owns guide cards, the fixed guide frame, and reversible viewport transforms.
 * B-2 owns exact crop rendering, metadata-free WebP output, and resolution warnings.
 * Upload remains a B-3 responsibility.
 */
(function(root, factory){
  const api = factory(root);
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.KinojoMyInfoImageEditor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root){
  'use strict';

  const EDITOR_SELECTOR = '[data-kinojo-image-editor]';
  const SLOT_KEYS = Object.freeze(['PROFILE', 'FRONT', 'BACK', 'UPPER_BODY']);
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 3;
  const ROTATION_MIN = -180;
  const ROTATION_MAX = 180;
  let singleton = null;

  function finite(value, fallback = 0){
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max){
    return Math.min(max, Math.max(min, finite(value, min)));
  }

  function normalizeSlot(value, contract){
    const key = String(value || '').trim().toUpperCase();
    if(!SLOT_KEYS.includes(key) || !contract?.slots?.[key]) throw new TypeError('Unsupported My Info image slot: ' + key);
    return key;
  }

  function radians(degrees){
    return finite(degrees) * Math.PI / 180;
  }

  function coverScale(imageWidth, imageHeight, frameWidth, frameHeight, rotation = 0){
    const sourceWidth = Math.max(1, finite(imageWidth, 1));
    const sourceHeight = Math.max(1, finite(imageHeight, 1));
    const targetWidth = Math.max(1, finite(frameWidth, 1));
    const targetHeight = Math.max(1, finite(frameHeight, 1));
    const angle = radians(rotation);
    const cosine = Math.abs(Math.cos(angle));
    const sine = Math.abs(Math.sin(angle));
    const requiredSourceWidth = cosine * targetWidth + sine * targetHeight;
    const requiredSourceHeight = sine * targetWidth + cosine * targetHeight;
    return Math.max(requiredSourceWidth / sourceWidth, requiredSourceHeight / sourceHeight);
  }

  function clampTranslation(x, y, geometry){
    const rotation = finite(geometry?.rotation);
    const angle = radians(rotation);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const imageWidth = Math.max(1, finite(geometry?.imageWidth, 1));
    const imageHeight = Math.max(1, finite(geometry?.imageHeight, 1));
    const frameWidth = Math.max(1, finite(geometry?.frameWidth, 1));
    const frameHeight = Math.max(1, finite(geometry?.frameHeight, 1));
    const minimumScale = coverScale(imageWidth, imageHeight, frameWidth, frameHeight, rotation);
    const scale = Math.max(minimumScale, finite(geometry?.scale, minimumScale));

    // Work in the source image axes. This keeps every guide-frame corner inside
    // the source rectangle, including after a 90-degree or arbitrary rotation.
    const sourceAxisX = cosine * finite(x) + sine * finite(y);
    const sourceAxisY = -sine * finite(x) + cosine * finite(y);
    const frameExtentX = (Math.abs(cosine) * frameWidth + Math.abs(sine) * frameHeight) / 2;
    const frameExtentY = (Math.abs(sine) * frameWidth + Math.abs(cosine) * frameHeight) / 2;
    const allowanceX = Math.max(0, scale * imageWidth / 2 - frameExtentX);
    const allowanceY = Math.max(0, scale * imageHeight / 2 - frameExtentY);
    const clampedAxisX = clamp(sourceAxisX, -allowanceX, allowanceX);
    const clampedAxisY = clamp(sourceAxisY, -allowanceY, allowanceY);

    return Object.freeze({
      x: cosine * clampedAxisX - sine * clampedAxisY,
      y: sine * clampedAxisX + cosine * clampedAxisY,
      scale,
      minimumScale
    });
  }

  function outputMatrix(state, definition){
    const frameWidth = Math.max(1, finite(state?.frameWidth, 1));
    const frameHeight = Math.max(1, finite(state?.frameHeight, 1));
    const outputWidth = Math.max(1, finite(definition?.outputWidth, 1));
    const outputHeight = Math.max(1, finite(definition?.outputHeight, 1));
    const frameScaleX = outputWidth / frameWidth;
    const frameScaleY = outputHeight / frameHeight;
    const sourceScale = Math.max(0, finite(state?.scale));
    const angle = radians(state?.rotation);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return Object.freeze({
      a: frameScaleX * sourceScale * cosine,
      b: frameScaleY * sourceScale * sine,
      c: -frameScaleX * sourceScale * sine,
      d: frameScaleY * sourceScale * cosine,
      e: outputWidth / 2 + frameScaleX * finite(state?.x),
      f: outputHeight / 2 + frameScaleY * finite(state?.y),
      frameScaleX,
      frameScaleY,
      outputWidth,
      outputHeight
    });
  }

  function qualityReport(state, definition, outputContract = {}){
    const matrix = outputMatrix(state, definition);
    const sourceScale = Math.max(0.000001, finite(state?.scale, 0.000001));
    const outputPixelsPerSourcePixel = Math.max(matrix.frameScaleX * sourceScale, matrix.frameScaleY * sourceScale);
    const sourcePixelsPerOutputPixel = 1 / outputPixelsPerSourcePixel;
    const warning = outputContract.qualityWarning || {};
    const cautionBelow = Math.max(0.01, finite(warning.cautionBelowSourcePixelsPerOutputPixel, 1));
    const lowBelow = clamp(finite(warning.lowBelowSourcePixelsPerOutputPixel, 0.75), 0.01, cautionBelow);
    const thresholdEpsilon = 0.005;
    let level = 'GOOD';
    let title = '출력 해상도에 충분한 원본입니다.';
    let message = '현재 구도는 원본 픽셀을 확대하지 않고 결과 크기로 변환합니다.';
    if(sourcePixelsPerOutputPixel + thresholdEpsilon < lowBelow){
      level = 'LOW';
      title = '원본 해상도가 많이 부족합니다.';
      message = '현재 구도는 약 ' + Math.round(100 / sourcePixelsPerOutputPixel) + '% 확대 출력되어 선명도가 크게 떨어질 수 있습니다.';
    }else if(sourcePixelsPerOutputPixel + thresholdEpsilon < cautionBelow){
      level = 'CAUTION';
      title = '원본 해상도가 조금 부족합니다.';
      message = '현재 구도는 약 ' + Math.round(100 / sourcePixelsPerOutputPixel) + '% 확대 출력됩니다. 가능하면 더 큰 원본을 선택해 주세요.';
    }
    return Object.freeze({
      level,
      title,
      message,
      sourcePixelsPerOutputPixel: Number(sourcePixelsPerOutputPixel.toFixed(4)),
      outputPixelsPerSourcePixel: Number(outputPixelsPerSourcePixel.toFixed(4)),
      blocksExport: warning.blocksExport === true
    });
  }

  function contractOf(options){
    return options?.contract || root?.KinojoMyInfoImageContract || null;
  }

  function guideCard(slotValue, options = {}){
    const document = options.document || root?.document;
    const contract = contractOf(options);
    if(!document) throw new Error('A document is required to create a guide card.');
    const slot = normalizeSlot(slotValue, contract);
    const definition = contract.slots[slot];
    const card = document.createElement('article');
    card.className = 'kinojo-image-guide-card';
    card.dataset.kinojoImageGuideCard = slot;

    const preview = document.createElement('div');
    preview.className = 'kinojo-image-guide-card__preview';
    preview.style.aspectRatio = definition.aspectWidth + ' / ' + definition.aspectHeight;
    if(definition.guideAssetPath){
      const image = document.createElement('img');
      image.src = definition.guideAssetPath;
      image.alt = '';
      image.loading = 'lazy';
      preview.append(image);
    }else{
      preview.classList.add('kinojo-image-guide-card__preview--profile');
      preview.setAttribute('aria-hidden', 'true');
    }

    const copy = document.createElement('div');
    copy.className = 'kinojo-image-guide-card__copy';
    const title = document.createElement('strong');
    title.textContent = definition.label;
    const guidance = document.createElement('span');
    guidance.textContent = definition.preAttachGuide;
    const output = document.createElement('small');
    output.textContent = definition.outputWidth + '×' + definition.outputHeight + ' · ' + definition.aspectWidth + ':' + definition.aspectHeight;
    copy.append(title, guidance, output);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'kinojo-image-guide-card__action';
    action.dataset.kinojoImageGuideAction = slot;
    action.textContent = options.actionLabel || definition.label + ' 사진 선택';
    action.addEventListener('click', () => options.onSelect?.(slot, definition, card));
    const notice = document.createElement('p');
    notice.className = 'kinojo-image-guide-card__notice';
    notice.textContent = contract.commonCaptureNotice;
    card.append(preview, copy, notice, action);
    return card;
  }

  function renderGuideCards(container, options = {}){
    if(!container?.append) throw new TypeError('A guide-card container is required.');
    const contract = contractOf(options);
    const slots = options.slots || contract?.referenceSlotOrder || [];
    const cards = slots.map(slot => guideCard(slot, options));
    if(options.replace !== false) container.replaceChildren(...cards);
    else container.append(...cards);
    return cards;
  }

  function create(options = {}){
    const document = options.document || root?.document;
    const contract = contractOf(options);
    if(!document || !contract) throw new Error('KINOJO image contract and document are required.');

    let element = null;
    let frame = null;
    let sourceImage = null;
    let guideImage = null;
    let zoomControl = null;
    let zoomInput = null;
    let rotationControl = null;
    let rotationInput = null;
    let previousFocus = null;
    let objectUrl = '';
    let drag = null;
    let openOptions = {};
    let state = null;
    let sourceName = '';
    let openSequence = 0;

    function snapshot(){
      if(!state) return null;
      return Object.freeze({
        slot: state.slot,
        x: state.x,
        y: state.y,
        zoom: state.zoom,
        rotation: state.rotation,
        scale: state.scale,
        minimumScale: state.minimumScale,
        imageWidth: state.imageWidth,
        imageHeight: state.imageHeight,
        frameWidth: state.frameWidth,
        frameHeight: state.frameHeight,
        quality: qualityReport(state, contract.slots[state.slot], contract.output),
        outputReady: false,
        uploadConnected: false,
        previewOnly: true
      });
    }

    function emit(type, detail){
      if(typeof root?.CustomEvent !== 'function' || !element) return;
      element.dispatchEvent(new root.CustomEvent(type, {bubbles: true, detail}));
    }

    function releaseObjectUrl(){
      if(!objectUrl) return;
      root?.URL?.revokeObjectURL?.(objectUrl);
      objectUrl = '';
    }

    function updateFrameGeometry(){
      if(!state || !frame) return;
      const bounds = frame.getBoundingClientRect();
      state.frameWidth = Math.max(1, frame.clientWidth || bounds.width);
      state.frameHeight = Math.max(1, frame.clientHeight || bounds.height);
    }

    function updateQualityUi(report){
      const host = element?.querySelector?.('[data-kinojo-image-editor-quality]');
      if(!host || !report) return;
      host.dataset.state = report.level.toLowerCase();
      host.querySelector('[data-kinojo-image-editor-quality-title]').textContent = report.title;
      host.querySelector('[data-kinojo-image-editor-quality-message]').textContent = report.message;
    }

    function constrain(){
      if(!state) return null;
      updateFrameGeometry();
      const minimumScale = coverScale(state.imageWidth, state.imageHeight, state.frameWidth, state.frameHeight, state.rotation);
      const result = clampTranslation(state.x, state.y, {
        imageWidth: state.imageWidth,
        imageHeight: state.imageHeight,
        frameWidth: state.frameWidth,
        frameHeight: state.frameHeight,
        rotation: state.rotation,
        scale: minimumScale * state.zoom
      });
      state.x = result.x;
      state.y = result.y;
      state.scale = result.scale;
      state.minimumScale = result.minimumScale;
      return result;
    }

    function render(source = 'api'){
      if(!state || !sourceImage) return null;
      constrain();
      sourceImage.style.transform = 'translate(-50%, -50%) translate(' + state.x.toFixed(3) + 'px, ' + state.y.toFixed(3) + 'px) rotate(' + state.rotation.toFixed(3) + 'deg) scale(' + state.scale.toFixed(6) + ')';
      const next = snapshot();
      updateQualityUi(next.quality);
      emit('kinojo-my-info-editor-change', Object.assign({source}, next));
      openOptions.onChange?.(next, source);
      return next;
    }

    function syncControls(){
      if(!state) return;
      zoomInput.value = String(state.zoom);
      rotationInput.value = String(state.rotation);
      const ranges = root?.KinojoRangeControl;
      ranges?.sync?.(zoomControl);
      ranges?.sync?.(rotationControl);
    }

    function reset(source = 'reset'){
      if(!state) return null;
      state.x = 0;
      state.y = 0;
      state.zoom = 1;
      state.rotation = 0;
      syncControls();
      return render(source);
    }

    function setTransform(transform = {}, source = 'api'){
      if(!state) return null;
      if(Object.hasOwn(transform, 'x')) state.x = finite(transform.x, state.x);
      if(Object.hasOwn(transform, 'y')) state.y = finite(transform.y, state.y);
      if(Object.hasOwn(transform, 'zoom')) state.zoom = clamp(transform.zoom, ZOOM_MIN, ZOOM_MAX);
      if(Object.hasOwn(transform, 'rotation')) state.rotation = clamp(transform.rotation, ROTATION_MIN, ROTATION_MAX);
      syncControls();
      return render(source);
    }

    function setBusy(value){
      if(!element) return;
      const busy = value === true;
      element.setAttribute('aria-busy', busy ? 'true' : 'false');
      element.classList.toggle('is-exporting', busy);
      [zoomInput, rotationInput, element.querySelector('[data-kinojo-image-editor-reset]')].forEach(control => {
        if(control) control.disabled = busy;
      });
      const confirm = element.querySelector('[data-kinojo-image-editor-confirm]');
      if(confirm){
        confirm.disabled = busy;
        confirm.textContent = busy ? 'WebP 만드는 중…' : 'WebP 결과 만들기';
      }
    }

    function canvasToBlob(canvas, mimeType, quality){
      if(typeof canvas?.toBlob !== 'function') return Promise.reject(new Error('CANVAS_BLOB_NOT_SUPPORTED'));
      return new Promise((resolve, reject) => canvas.toBlob(blob => {
        if(!blob) return reject(new Error('IMAGE_ENCODE_FAILED'));
        if(String(blob.type || '').toLowerCase() !== String(mimeType || '').toLowerCase()) return reject(new Error('WEBP_NOT_SUPPORTED'));
        resolve(blob);
      }, mimeType, quality));
    }

    async function exportImage(){
      if(!state || !sourceImage?.complete || !sourceImage.naturalWidth) throw new Error('IMAGE_NOT_READY');
      render('export');
      const definition = contract.slots[state.slot];
      const output = contract.output;
      const canvas = document.createElement('canvas');
      canvas.width = definition.outputWidth;
      canvas.height = definition.outputHeight;
      const context = canvas.getContext('2d', {alpha: true});
      if(!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      const matrix = outputMatrix(state, definition);
      context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
      context.drawImage(sourceImage, -state.imageWidth / 2, -state.imageHeight / 2, state.imageWidth, state.imageHeight);
      const blob = await canvasToBlob(canvas, output.mimeType, output.quality);
      const quality = qualityReport(state, definition, output);
      const filename = 'kinojo-' + state.slot.toLowerCase().replace(/_/g, '-') + '.' + output.extension;
      const file = typeof root?.File === 'function'
        ? new root.File([blob], filename, {type: output.mimeType, lastModified: Date.now()})
        : null;
      return Object.freeze({
        slot: state.slot,
        blob,
        file,
        filename,
        mimeType: output.mimeType,
        extension: output.extension,
        width: definition.outputWidth,
        height: definition.outputHeight,
        quality,
        encodingQuality: output.quality,
        metadataStripped: output.stripMetadata === true,
        originalUploaded: false,
        sourceName,
        transform: snapshot(),
        outputReady: true,
        uploadConnected: false,
        previewOnly: false
      });
    }

    function focusable(){
      return Array.from(element?.querySelectorAll?.('button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])') || []);
    }

    function close(reason = 'cancel'){
      if(!element || element.hidden) return;
      openSequence += 1;
      element.hidden = true;
      document.body.classList.remove('kinojo-image-editor-open');
      setBusy(false);
      releaseObjectUrl();
      drag = null;
      const detail = Object.assign({reason}, snapshot() || {});
      emit('kinojo-my-info-editor-close', detail);
      openOptions.onClose?.(detail);
      previousFocus?.focus?.();
      previousFocus = null;
    }

    function ensureElement(){
      if(element) return element;
      element = document.createElement('div');
      element.className = 'kinojo-image-editor';
      element.dataset.kinojoImageEditor = 'dialog';
      element.hidden = true;
      element.innerHTML = [
        '<div class="kinojo-image-editor__backdrop" data-kinojo-image-editor-close></div>',
        '<section class="kinojo-image-editor__dialog" role="dialog" aria-modal="true" aria-labelledby="kinojo-image-editor-title" aria-describedby="kinojo-image-editor-guidance">',
        '  <header class="kinojo-image-editor__header">',
        '    <div><small>이미지 편집</small><h2 id="kinojo-image-editor-title" data-kinojo-image-editor-title></h2></div>',
        '    <button class="kinojo-image-editor__icon-button" type="button" aria-label="이미지 편집기 닫기" data-kinojo-image-editor-close>×</button>',
        '  </header>',
        '  <div class="kinojo-image-editor__body">',
        '    <div class="kinojo-image-editor__workspace">',
        '      <div class="kinojo-image-editor__frame" data-kinojo-image-editor-frame role="img">',
        '        <img class="kinojo-image-editor__source" data-kinojo-image-editor-source alt="">',
        '        <span class="kinojo-image-editor__grid" aria-hidden="true"></span>',
        '        <span class="kinojo-image-editor__profile-safe" aria-hidden="true"></span>',
        '        <img class="kinojo-image-editor__guide" data-kinojo-image-editor-guide alt="" aria-hidden="true">',
        '      </div>',
        '      <p class="kinojo-image-editor__drag-hint">사진을 드래그해 가이드 안에 맞춰 주세요.</p>',
        '    </div>',
        '    <aside class="kinojo-image-editor__panel">',
        '      <div class="kinojo-image-editor__capture">',
        '        <strong data-kinojo-image-editor-output></strong>',
        '        <p id="kinojo-image-editor-guidance" data-kinojo-image-editor-guidance></p>',
        '        <small data-kinojo-image-editor-notice></small>',
        '      </div>',
        '      <div class="kinojo-image-editor__quality" data-kinojo-image-editor-quality data-state="good" role="status" aria-live="polite">',
        '        <strong data-kinojo-image-editor-quality-title>원본 해상도를 확인하는 중입니다.</strong>',
        '        <span data-kinojo-image-editor-quality-message></span>',
        '      </div>',
        '      <label class="kinojo-image-editor__control-label" for="kinojo-image-editor-zoom">확대 <output data-kinojo-range-output></output></label>',
        '      <div class="kinojo-range" data-kinojo-range data-kinojo-range-mode="continuous" data-kinojo-range-unit="×" data-kinojo-image-editor-zoom>',
        '        <div class="kinojo-range__control"><input id="kinojo-image-editor-zoom" class="kinojo-range__input" data-kinojo-range-input type="range" min="1" max="3" step="0.01" value="1" aria-label="사진 확대"></div>',
        '      </div>',
        '      <label class="kinojo-image-editor__control-label" for="kinojo-image-editor-rotation">회전 <output data-kinojo-range-output></output></label>',
        '      <div class="kinojo-range kinojo-range--thin" data-kinojo-range data-kinojo-range-mode="thin" data-kinojo-range-unit="°" data-kinojo-image-editor-rotation>',
        '        <div class="kinojo-range__control"><input id="kinojo-image-editor-rotation" class="kinojo-range__input" data-kinojo-range-input type="range" min="-180" max="180" step="1" value="0" aria-label="사진 회전"></div>',
        '      </div>',
        '      <button class="kinojo-image-editor__reset" type="button" data-kinojo-image-editor-reset>원래 구도로 되돌리기</button>',
        '    </aside>',
        '  </div>',
        '  <footer class="kinojo-image-editor__footer">',
        '    <button class="kinojo-image-editor__button kinojo-image-editor__button--secondary" type="button" data-kinojo-image-editor-close>취소</button>',
        '    <button class="kinojo-image-editor__button kinojo-image-editor__button--primary" type="button" data-kinojo-image-editor-confirm>WebP 결과 만들기</button>',
        '  </footer>',
        '</section>'
      ].join('');
      document.body.append(element);

      frame = element.querySelector('[data-kinojo-image-editor-frame]');
      sourceImage = element.querySelector('[data-kinojo-image-editor-source]');
      guideImage = element.querySelector('[data-kinojo-image-editor-guide]');
      zoomControl = element.querySelector('[data-kinojo-image-editor-zoom]');
      zoomInput = zoomControl.querySelector('[data-kinojo-range-input]');
      rotationControl = element.querySelector('[data-kinojo-image-editor-rotation]');
      rotationInput = rotationControl.querySelector('[data-kinojo-range-input]');
      root?.KinojoRangeControl?.enhanceAll?.(element);

      element.addEventListener('click', async event => {
        if(event.target.closest?.('[data-kinojo-image-editor-close]')){
          close('cancel');
          return;
        }
        if(event.target.closest?.('[data-kinojo-image-editor-reset]')){
          reset();
          return;
        }
        if(event.target.closest?.('[data-kinojo-image-editor-confirm]')){
          const sequence = openSequence;
          setBusy(true);
          try{
            const result = await exportImage();
            if(sequence !== openSequence || element.hidden) return;
            emit('kinojo-my-info-editor-confirm', result);
            await openOptions.onConfirm?.(result);
            if(sequence === openSequence && !element.hidden) close('confirm');
          }catch(error){
            if(sequence !== openSequence || element.hidden) return;
            const host = element.querySelector('[data-kinojo-image-editor-quality]');
            if(host){
              host.dataset.state = 'error';
              host.querySelector('[data-kinojo-image-editor-quality-title]').textContent = 'WebP 결과를 만들지 못했습니다.';
              host.querySelector('[data-kinojo-image-editor-quality-message]').textContent = '브라우저의 이미지 변환 지원을 확인한 뒤 다시 시도해 주세요.';
            }
            emit('kinojo-my-info-editor-error', {code: String(error?.message || 'IMAGE_EXPORT_FAILED')});
            openOptions.onError?.(error);
          }finally{
            if(sequence === openSequence && !element.hidden) setBusy(false);
          }
        }
      });
      zoomControl.addEventListener('kinojo-range-input', event => setTransform({zoom: event.detail.value}, 'zoom'));
      rotationControl.addEventListener('kinojo-range-input', event => setTransform({rotation: event.detail.value}, 'rotation'));
      frame.addEventListener('pointerdown', event => {
        if(!state || event.button > 0) return;
        drag = {pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: state.x, y: state.y};
        frame.setPointerCapture?.(event.pointerId);
        frame.classList.add('is-dragging');
      });
      frame.addEventListener('pointermove', event => {
        if(!drag || drag.pointerId !== event.pointerId) return;
        setTransform({x: drag.x + event.clientX - drag.startX, y: drag.y + event.clientY - drag.startY}, 'drag');
      });
      const endDrag = event => {
        if(!drag || (event.pointerId != null && drag.pointerId !== event.pointerId)) return;
        frame.releasePointerCapture?.(drag.pointerId);
        frame.classList.remove('is-dragging');
        drag = null;
      };
      frame.addEventListener('pointerup', endDrag);
      frame.addEventListener('pointercancel', endDrag);
      frame.addEventListener('wheel', event => {
        if(!state) return;
        event.preventDefault();
        setTransform({zoom: state.zoom + (event.deltaY < 0 ? 0.08 : -0.08)}, 'wheel');
      }, {passive: false});
      element.addEventListener('keydown', event => {
        if(event.key === 'Escape'){
          event.preventDefault();
          close('escape');
          return;
        }
        if(event.key !== 'Tab') return;
        const items = focusable();
        if(!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
        else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
      });
      root?.addEventListener?.('resize', () => { if(element && !element.hidden) render('resize'); });
      return element;
    }

    function loadImage(url){
      return new Promise((resolve, reject) => {
        sourceImage.onload = () => resolve(sourceImage);
        sourceImage.onerror = () => reject(new Error('선택한 이미지를 불러올 수 없습니다.'));
        sourceImage.src = url;
      });
    }

    async function open(nextOptions = {}){
      ensureElement();
      const sequence = ++openSequence;
      const slot = normalizeSlot(nextOptions.slot, contract);
      const definition = contract.slots[slot];
      const sourceUrl = nextOptions.file
        ? root?.URL?.createObjectURL?.(nextOptions.file)
        : String(nextOptions.sourceUrl || '');
      if(!sourceUrl) throw new TypeError('A file or sourceUrl is required to open the image editor.');

      releaseObjectUrl();
      state = null;
      if(nextOptions.file) objectUrl = sourceUrl;
      openOptions = nextOptions;
      sourceName = String(nextOptions.file?.name || nextOptions.sourceName || 'browser-source').slice(0, 120);
      previousFocus = document.activeElement;
      element.hidden = false;
      setBusy(false);
      document.body.classList.add('kinojo-image-editor-open');
      element.querySelector('[data-kinojo-image-editor-title]').textContent = definition.label + ' 구도 맞추기';
      element.querySelector('[data-kinojo-image-editor-output]').textContent = '결과 기준 ' + definition.outputWidth + '×' + definition.outputHeight + ' · ' + definition.aspectWidth + ':' + definition.aspectHeight;
      element.querySelector('[data-kinojo-image-editor-guidance]').textContent = definition.preAttachGuide;
      element.querySelector('[data-kinojo-image-editor-notice]').textContent = contract.commonCaptureNotice;
      frame.style.aspectRatio = definition.aspectWidth + ' / ' + definition.aspectHeight;
      frame.dataset.kinojoImageEditorSlot = slot;
      frame.setAttribute('aria-label', definition.label + ' ' + definition.preAttachGuide);
      guideImage.hidden = !definition.guideAssetPath;
      guideImage.removeAttribute('src');
      if(definition.guideAssetPath) guideImage.src = definition.guideAssetPath;
      frame.classList.toggle('kinojo-image-editor__frame--profile', slot === 'PROFILE');

      try{
        await loadImage(sourceUrl);
        await new Promise(resolve => (root?.requestAnimationFrame || root?.setTimeout || setTimeout)(resolve));
        if(sequence !== openSequence || element.hidden) throw new Error('IMAGE_OPEN_CANCELLED');
        state = {
          slot,
          x: 0,
          y: 0,
          zoom: 1,
          rotation: 0,
          scale: 1,
          minimumScale: 1,
          imageWidth: sourceImage.naturalWidth,
          imageHeight: sourceImage.naturalHeight,
          frameWidth: 1,
          frameHeight: 1
        };
        reset('open');
        element.querySelector('[data-kinojo-image-editor-close]').focus();
        emit('kinojo-my-info-editor-open', snapshot());
        return snapshot();
      }catch(error){
        if(sequence === openSequence && !element.hidden) close('load-error');
        throw error;
      }
    }

    function destroy(){
      close('destroy');
      element?.remove();
      element = null;
      state = null;
    }

    return Object.freeze({open, close, reset, setTransform, exportImage, getState: snapshot, destroy, getElement: ensureElement});
  }

  function defaultEditor(options = {}){
    if(!singleton) singleton = create(options);
    return singleton;
  }

  const api = {
    create,
    open(options){ return defaultEditor(options).open(options); },
    close(reason){ return singleton?.close(reason); },
    getState(){ return singleton?.getState() || null; },
    exportImage(){
      if(!singleton) return Promise.reject(new Error('IMAGE_EDITOR_NOT_OPEN'));
      return singleton.exportImage();
    },
    guideCard,
    renderGuideCards,
    normalizeSlot,
    coverScale,
    clampTranslation,
    outputMatrix,
    qualityReport,
    constants: Object.freeze({EDITOR_SELECTOR, SLOT_KEYS, ZOOM_MIN, ZOOM_MAX, ROTATION_MIN, ROTATION_MAX})
  };
  return Object.freeze(api);
});
