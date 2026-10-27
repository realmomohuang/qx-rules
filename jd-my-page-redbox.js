/*
 * 京东「我的」定向精简试用版 0.2.0 — 2026-10-28
 * Quantumult X script-response-body. 尚未在用户 iPhone 上验证。
 * 远程替换文件名：jd-my-page-redbox.js；现有 rewrite.conf 可继续引用同一地址。
 * 历史字段: https://github.com/fmz200/wool_scripts/blob/main/Scripts/jingdong/jingdong.js
 * Base64先例: https://github.com/zbsdsb/loon-adblock-plugins/blob/main/JD_remove_ads_v2.js
 * 无网络上传；日志仅包含结构信息、固定标签和未知模块ID的哈希。
 */
(function () {
  'use strict';
  var VERSION = '0.2.0';
  var OPTIONS = { removeRecommendations: true, notify: true };
  var PREFIX = '[JD-MINE ' + VERSION + '] ';
  var MARKERS = ['每日必领', '签到得京豆', '钱包', '京东服务', '互动游戏',
    '京东快递', '家电回收', '刮卡领京豆', '赚红包', '领大红包'];
  var KNOWN = ['bigSaleFloor', 'newBigSaleFloor', 'newWalletIdFloor',
    'iconToolFloor', 'keyToolsFloor', 'orderIdFloor', 'userinfo',
    'basefloorinfo', 'recommendfloor'];
  var PROTECTED = ['userinfo', 'orderIdFloor', 'keyToolsFloor', 'basefloorinfo'];
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var log = { version: VERSION, status: 'started', changed: [], containers: [] };
  var stateKey = 'jd_mine_' + VERSION;
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function object(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function knownId(id) {
    if (KNOWN.indexOf(id) !== -1) return id;
    if (typeof id !== 'string') return 'no-mId';
    var h = 2166136261;
    for (var i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'unknown-' + (h >>> 0).toString(16);
  }
  function readPref(k) {
    try { return typeof $prefs !== 'undefined' ? $prefs.valueForKey(k) : null; } catch (_) { return null; }
  }
  function writePref(k, v) {
    try { if (typeof $prefs !== 'undefined') $prefs.setValueForKey(v, k); } catch (_) {}
  }
  function notifyOnce(key, subtitle, message) {
    if (!OPTIONS.notify || typeof $notify !== 'function' || readPref(stateKey + key)) return;
    try { $notify('京东我的·试用规则', subtitle, message); writePref(stateKey + key, '1'); } catch (_) {}
  }
  function finish(result) {
    try {
      console.log(PREFIX + JSON.stringify(log));
      if (log.status === 'changed' || log.status === 'mine-no-target') writePref(stateKey + '_last_mine', JSON.stringify(log));
    } catch (_) {}
    $done(result);
  }
  function decode64(s) {
    var t = s.replace(/\s/g, '');
    if (!t || t.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(t)) throw new Error('encoding');
    var bytes = '', buffer = 0, bits = 0;
    for (var i = 0; i < t.length && t[i] !== '='; i++) {
      buffer = (buffer << 6) | B64.indexOf(t[i]); bits += 6;
      if (bits >= 8) { bits -= 8; bytes += String.fromCharCode((buffer >> bits) & 255); }
    }
    var escaped = '';
    for (var j = 0; j < bytes.length; j++) escaped += '%' + ('0' + bytes.charCodeAt(j).toString(16)).slice(-2);
    return decodeURIComponent(escaped);
  }
  function encode64(s) {
    var bytes = encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); });
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes.charCodeAt(i), b = bytes.charCodeAt(i + 1), c = bytes.charCodeAt(i + 2);
      out += B64[a >> 2] + B64[((a & 3) << 4) | (isNaN(b) ? 0 : b >> 4)];
      out += isNaN(b) ? '=' : B64[((b & 15) << 2) | (isNaN(c) ? 0 : c >> 6)];
      out += isNaN(c) ? '=' : B64[c & 63];
    }
    return out;
  }
  function parseBody(s) {
    try { return { obj: JSON.parse(s), format: 'json' }; } catch (_) {}
    return { obj: JSON.parse(decode64(s)), format: 'base64-json' };
  }
  function safeNumbers(root) {
    // JSON.parse cannot preserve 64-bit numeric IDs; leave that response untouched.
    var pending = [root];
    while (pending.length) {
      var value = pending.pop();
      if (typeof value === 'number') {
        if (!isFinite(value) || (Math.floor(value) === value && Math.abs(value) > 9007199254740991)) return false;
      } else if (value && typeof value === 'object') {
        Object.keys(value).forEach(function (key) { pending.push(value[key]); });
      }
    }
    return true;
  }
  function labels(node, exact) {
    var hit = [], count = 0;
    function walk(v, depth, key) {
      if (++count > 6000 || depth > 12) return;
      if (typeof v === 'string' && /(?:title|name|text|label|desc|subtitle|maintitle)/i.test(key)) {
        var text = v.replace(/\s/g, '');
        MARKERS.forEach(function (m) { if ((exact ? text === m : text.indexOf(m) !== -1) && hit.indexOf(m) === -1) hit.push(m); });
      } else if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) walk(v[i], depth + 1, key);
      } else if (object(v)) {
        Object.keys(v).forEach(function (k) { walk(v[k], depth + 1, k); });
      }
    }
    walk(node, 0, '');
    return hit;
  }
  function collect(root) {
    var result = [];
    // Known envelopes only, never arbitrary nested order/product arrays.
    function add(o, path) {
      if (!object(o)) return;
      if (Array.isArray(o.floors)) result.push({ parent: o, path: path + '.floors', floors: o.floors });
      if (object(o.others) && Array.isArray(o.others.floors)) result.push({ parent: o.others, path: path + '.others.floors', floors: o.others.floors });
    }
    add(root, '$'); add(root.data, '$.data'); add(root.result, '$.result');
    return result;
  }
  function protectedSubtree(root) {
    var pending = [root], seen = 0;
    while (pending.length) {
      if (++seen > 6000) return true;
      var node = pending.pop();
      if (!node || typeof node !== 'object') continue;
      if (PROTECTED.indexOf(node.mId) !== -1) return true;
      Object.keys(node).forEach(function (key) {
        if (node[key] && typeof node[key] === 'object') pending.push(node[key]);
      });
    }
    return false;
  }
  function reason(f, hits) {
    if (!object(f) || protectedSubtree(f)) return '';
    var headings = labels(f.data || f, true);
    if (f.mId === 'bigSaleFloor' || f.mId === 'newBigSaleFloor') return 'historical-promo-id';
    if (f.mId === 'newWalletIdFloor') return 'historical-wallet-id';
    if (OPTIONS.removeRecommendations && f.mId === 'recommendfloor') return 'historical-recommend-id';
    // iconToolFloor alone is insufficient proof; require current display labels.
    if (headings.indexOf('京东服务') !== -1 && headings.indexOf('互动游戏') !== -1) return 'three-column-labels';
    if (headings.indexOf('每日必领') !== -1 && hits.indexOf('签到得京豆') !== -1) return 'daily-claim-labels';
    return '';
  }
  try {
    var url = typeof $request !== 'undefined' ? $request.url || '' : '';
    if (!/^https:\/\/api\.m\.jd\.com\/client\.action(?:\?|$)/.test(url)) {
      log.status = 'out-of-scope'; return finish({});
    }
    notifyOnce('_hook', '脚本已运行', '打开京东“我的”。此提示只证明脚本运行，尚不代表模块已移除。');
    var body = typeof $response !== 'undefined' ? $response.body : null;
    if (typeof body !== 'string' || !body.length) { log.status = 'empty-body'; return finish({}); }
    log.length = body.length;
    if (body.length > 2000000) { log.status = 'body-too-large'; return finish({}); }
    var fidMatch = /[?&]functionId=([^&#]*)/.exec(url);
    var fid = fidMatch ? decodeURIComponent(fidMatch[1]) : '';
    log.function = fid === 'personinfoBusiness' ? 'personinfoBusiness' : (fid ? 'other' : 'not-in-url');
    if (fid && fid !== 'personinfoBusiness') { log.status = 'other-function'; return finish({}); }
    var parsed;
    try { parsed = parseBody(body); } catch (_) { log.status = 'unsupported-body'; return finish({}); }
    log.format = parsed.format;
    if (!object(parsed.obj)) { log.status = 'not-object'; return finish({}); }
    if (!safeNumbers(parsed.obj)) { log.status = 'unsafe-number-passthrough'; return finish({}); }
    var containers = collect(parsed.obj);
    var allIds = [];
    containers.forEach(function (c) { c.floors.forEach(function (f) { if (object(f)) allIds.push(f.mId); }); });
    var mine = fid === 'personinfoBusiness' ||
      (allIds.indexOf('userinfo') !== -1 && allIds.indexOf('orderIdFloor') !== -1);
    log.scope = fid === 'personinfoBusiness' ? 'function' : (mine ? 'userinfo-and-orders' : 'unconfirmed');
    if (!mine) {
      log.status = 'scope-unconfirmed';
      log.containers = containers.map(function (c) {
        return { path: c.path, count: c.floors.length, truncated: c.floors.length > 200,
          floors: c.floors.slice(0, 200).map(function (f, i) {
            return { index: i, id: object(f) ? knownId(f.mId) : 'non-object',
              labels: object(f) ? labels(f.data || f) : [], action: 'observe' };
          }) };
      });
      return finish({});
    }
    containers.forEach(function (c) {
      var inventory = { path: c.path, before: c.floors.length, floors: [] };
      var kept = [];
      c.floors.forEach(function (f, i) {
        if (!object(f)) { kept.push(f); return; }
        var hits = labels(f.data || f);
        var id = knownId(f.mId);
        var why = reason(f, hits);
        inventory.floors.push({ index: i, id: id, labels: hits, action: why ? 'remove' : 'keep' });
        if (why) { log.changed.push({ path: c.path + '[' + i + ']', id: id, reason: why }); return; }
        if (f.mId === 'basefloorinfo' && object(f.data) && own(f.data, 'floatLayer')) {
          delete f.data.floatLayer;
          log.changed.push({ path: c.path + '[' + i + '].data.floatLayer', reason: 'historical-float-field' });
        }
        kept.push(f);
      });
      c.parent.floors = kept;
      inventory.after = kept.length;
      log.containers.push(inventory);
    });
    if (!log.changed.length) {
      log.status = 'mine-no-target';
      notifyOnce('_no_target', '已识别“我的”，未找到目标字段', '请发送日志中带 JD-MINE 的记录，用于定位新版模块。');
      return finish({});
    }
    var result = JSON.stringify(parsed.obj);
    if (parsed.format === 'base64-json') result = encode64(result);
    log.status = 'changed';
    notifyOnce('_changed', '已改写 ' + log.changed.length + ' 处数据', '请查看两块卡片和红包浮窗是否消失；数据改写成功仍需核对界面。');
    finish({ body: result });
  } catch (_) {
    log.status = 'error-passthrough'; log.changed = [];
    finish({});
  }
}());
