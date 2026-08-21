/*
 * KINOJO shared range control
 * Modes: continuous, steps, thin, interval
 */
(function(root, factory){
  const api = factory(root);
  if(typeof module === 'object' && module.exports) module.exports = api;
  if(root) root.KinojoRangeControl = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root){
  'use strict';

  const ROOT_SELECTOR = '[data-kinojo-range]';
  const INPUT_SELECTOR = '[data-kinojo-range-input]';
  const OPTION_SELECTOR = '[data-kinojo-range-option]';
  const enhanced = new WeakSet();

  function finite(value, fallback = 0){
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max){
    return Math.min(max, Math.max(min, finite(value, min)));
  }

  function parseNumberList(value){
    if(Array.isArray(value)) return value.map(item => Number(item)).filter(Number.isFinite);
    return String(value || '').split(',').map(item => Number(item.trim())).filter(Number.isFinite);
  }

  function nearestStop(value, stops){
    const candidates = parseNumberList(stops);
    if(!candidates.length) return finite(value);
    const target = finite(value, candidates[0]);
    return candidates.reduce((nearest, item) => Math.abs(item - target) < Math.abs(nearest - target) ? item : nearest, candidates[0]);
  }

  function toPercent(value, min, max){
    const start = finite(min);
    const end = finite(max, start + 1);
    if(end <= start) return 0;
    return clamp(((finite(value, start) - start) / (end - start)) * 100, 0, 100);
  }

  function modeOf(control){
    return String(control?.dataset?.kinojoRangeMode || 'continuous').toLowerCase();
  }

  function inputsOf(control){
    return Array.from(control?.querySelectorAll?.(INPUT_SELECTOR) || []);
  }

  function stopsOf(control, input){
    const configured = parseNumberList(control?.dataset?.kinojoRangeStops);
    if(configured.length) return configured;
    const min = finite(input?.min);
    const max = finite(input?.max, min);
    const step = finite(input?.step, 1) || 1;
    const stops = [];
    for(let value = min; value <= max + step / 2 && stops.length < 101; value += step) stops.push(Number(value.toFixed(8)));
    return stops;
  }

  function labelsOf(control){
    return String(control?.dataset?.kinojoRangeLabels || '').split('|').map(item => item.trim());
  }

  function valueText(control, value, input){
    const unit = String(control?.dataset?.kinojoRangeUnit || '');
    if(modeOf(control) === 'steps'){
      const stops = stopsOf(control, input);
      const index = stops.indexOf(nearestStop(value, stops));
      const label = labelsOf(control)[index];
      if(label) return label;
    }
    return String(value) + unit;
  }

  function emit(control, type, state, source){
    if(typeof root.CustomEvent !== 'function') return;
    control.dispatchEvent(new root.CustomEvent(type, {
      bubbles: true,
      detail: Object.assign({source: source || 'api'}, state)
    }));
  }

  function setVisualState(control, from, to, min, max){
    control.style.setProperty('--kinojo-range-from', toPercent(from, min, max) + '%');
    control.style.setProperty('--kinojo-range-to', toPercent(to, min, max) + '%');
  }

  function syncOptions(control, value, input){
    const stops = stopsOf(control, input);
    const selected = nearestStop(value, stops);
    control.style.setProperty('--kinojo-range-stop-count', String(Math.max(stops.length, 1)));
    control.querySelectorAll(OPTION_SELECTOR).forEach(option => {
      const active = finite(option.dataset.kinojoRangeOption, selected) === selected;
      option.classList.toggle('is-active', active);
      option.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    input.setAttribute('aria-valuetext', valueText(control, selected, input));
  }

  function sync(control){
    if(!control) return null;
    const inputs = inputsOf(control);
    if(!inputs.length) return null;
    const mode = modeOf(control);
    control.dataset.kinojoRangeMode = mode;
    control.classList.toggle('kinojo-range--interval', mode === 'interval');
    control.classList.toggle('kinojo-range--steps', mode === 'steps');
    control.classList.toggle('kinojo-range--thin', mode === 'thin');

    if(mode === 'interval' && inputs.length > 1){
      const first = inputs.find(input => input.dataset.kinojoRangeHandle === 'from') || inputs[0];
      const second = inputs.find(input => input.dataset.kinojoRangeHandle === 'to') || inputs[1];
      const min = finite(first.min);
      const max = finite(first.max, finite(second.max, min + 1));
      const from = clamp(Math.min(finite(first.value, min), finite(second.value, max)), min, max);
      const to = clamp(Math.max(finite(first.value, min), finite(second.value, max)), min, max);
      first.value = String(from);
      second.value = String(to);
      first.setAttribute('aria-valuetext', valueText(control, from, first));
      second.setAttribute('aria-valuetext', valueText(control, to, second));
      setVisualState(control, from, to, min, max);
      const output = control.querySelector('[data-kinojo-range-output]');
      if(output) output.textContent = valueText(control, from, first) + '–' + valueText(control, to, second);
      return {mode, from, to, values: [from, to]};
    }

    const input = inputs[0];
    const min = finite(input.min);
    const max = finite(input.max, min + 1);
    const value = clamp(finite(input.value, min), min, max);
    input.value = String(value);
    setVisualState(control, min, value, min, max);
    if(mode === 'steps') syncOptions(control, value, input);
    else input.setAttribute('aria-valuetext', valueText(control, value, input));
    const output = control.querySelector('[data-kinojo-range-output]');
    if(output) output.textContent = valueText(control, value, input);
    return {mode, value, values: [value]};
  }

  function setValue(control, value, options = {}){
    const input = inputsOf(control)[0];
    if(!input) return null;
    input.value = String(value);
    if(modeOf(control) === 'steps' && options.snap !== false) input.value = String(nearestStop(value, stopsOf(control, input)));
    const state = sync(control);
    if(options.emit){
      emit(control, 'kinojo-range-input', state, options.source || 'api');
      emit(control, 'kinojo-range-change', state, options.source || 'api');
    }
    return state;
  }

  function setValues(control, from, to, options = {}){
    const inputs = inputsOf(control);
    if(inputs.length < 2) return null;
    const first = inputs.find(input => input.dataset.kinojoRangeHandle === 'from') || inputs[0];
    const second = inputs.find(input => input.dataset.kinojoRangeHandle === 'to') || inputs[1];
    first.value = String(from);
    second.value = String(to);
    const state = sync(control);
    if(options.emit){
      emit(control, 'kinojo-range-input', state, options.source || 'api');
      emit(control, 'kinojo-range-change', state, options.source || 'api');
    }
    return state;
  }

  function stepByKey(control, input, key){
    const stops = stopsOf(control, input);
    if(!stops.length) return false;
    const current = nearestStop(input.value, stops);
    let index = stops.indexOf(current);
    if(key === 'Home') index = 0;
    else if(key === 'End') index = stops.length - 1;
    else index = clamp(index + (key === 'ArrowRight' || key === 'ArrowUp' ? 1 : -1), 0, stops.length - 1);
    setValue(control, stops[index], {emit: true, source: 'keyboard'});
    return true;
  }

  function enhance(control){
    if(!control?.matches?.(ROOT_SELECTOR)) return null;
    if(enhanced.has(control)) return sync(control);
    enhanced.add(control);
    control.dataset.kinojoRangeEnhanced = 'true';

    control.addEventListener('input', event => {
      const input = event.target.closest?.(INPUT_SELECTOR);
      if(!input || !control.contains(input)) return;
      if(modeOf(control) === 'interval'){
        const inputs = inputsOf(control);
        const fromInput = inputs.find(item => item.dataset.kinojoRangeHandle === 'from') || inputs[0];
        const toInput = inputs.find(item => item.dataset.kinojoRangeHandle === 'to') || inputs[1];
        if(input === fromInput && finite(input.value) > finite(toInput.value)) input.value = toInput.value;
        if(input === toInput && finite(input.value) < finite(fromInput.value)) input.value = fromInput.value;
      }
      emit(control, 'kinojo-range-input', sync(control), 'pointer');
    });

    control.addEventListener('change', event => {
      const input = event.target.closest?.(INPUT_SELECTOR);
      if(!input || !control.contains(input)) return;
      if(modeOf(control) === 'steps'){
        control.classList.add('is-snapping');
        input.value = String(nearestStop(input.value, stopsOf(control, input)));
        root.setTimeout?.(() => control.classList.remove('is-snapping'), 180);
      }
      emit(control, 'kinojo-range-change', sync(control), 'pointer');
    });

    control.addEventListener('keydown', event => {
      const input = event.target.closest?.(INPUT_SELECTOR);
      if(!input || modeOf(control) !== 'steps') return;
      if(!['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      stepByKey(control, input, event.key);
    });

    control.addEventListener('click', event => {
      const option = event.target.closest?.(OPTION_SELECTOR);
      if(!option || !control.contains(option)) return;
      setValue(control, finite(option.dataset.kinojoRangeOption), {emit: true, source: 'option'});
      inputsOf(control)[0]?.focus?.();
    });

    return sync(control);
  }

  function enhanceAll(scope){
    const context = scope?.querySelectorAll ? scope : root.document;
    if(!context) return [];
    const controls = [];
    if(context.matches?.(ROOT_SELECTOR)) controls.push(context);
    controls.push(...context.querySelectorAll(ROOT_SELECTOR));
    return controls.map(enhance);
  }

  function observe(){
    if(!root.document) return;
    const start = () => {
      enhanceAll(root.document);
      if(typeof root.MutationObserver !== 'function') return;
      new root.MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
        if(node?.nodeType === 1) enhanceAll(node);
      }))).observe(root.document.documentElement, {childList: true, subtree: true});
    };
    if(root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, {once: true});
    else start();
  }

  const api = {enhance, enhanceAll, sync, setValue, setValues, nearestStop, parseNumberList, toPercent};
  observe();
  return Object.freeze(api);
});
