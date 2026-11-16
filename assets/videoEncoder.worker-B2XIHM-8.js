(function() {
	var n = (e, t) => () => (t || (e((t = { exports: {} }).exports, t), e = null), t.exports);
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	function c(e) {
		if (!e) throw new Error("Assertion failed.");
	}
	const l = Math.PI / 180, d = 180 / Math.PI, u = (e) => {
		const t = (e % 360 + 360) % 360;
		if (0 === t || 90 === t || 180 === t || 270 === t) return t;
		throw new Error(`Invalid rotation ${e}.`);
	}, h = [
		1,
		0,
		0,
		0,
		1,
		0,
		0,
		0,
		1
	], f = (e, t, r) => {
		const [i, a, , s, n] = e, o = Math.abs(i) * t + Math.abs(s) * r, c = Math.abs(a) * t + Math.abs(n) * r;
		return y(y(k(-t / 2, -r / 2), e), k(o / 2, c / 2));
	}, m = (e) => {
		const [t, r] = e;
		return u(ae(Math.atan2(r, p(e) ? -t : t) * d, 90));
	}, p = (e) => {
		const [t, r, , i, a] = e;
		return t * a - r * i < 0;
	}, g = (e) => {
		const t = e * l, r = Math.round(Math.cos(t)), i = Math.round(Math.sin(t));
		return [
			r,
			i,
			0,
			-i,
			r,
			0,
			0,
			0,
			1
		];
	}, k = (e, t) => [
		1,
		0,
		0,
		0,
		1,
		0,
		e,
		t,
		1
	], w = (e, t) => [
		e,
		0,
		0,
		0,
		t,
		0,
		0,
		0,
		1
	], y = (e, t) => {
		const r = new Array(9);
		for (let i = 0; i < 3; i++) for (let a = 0; a < 3; a++) r[3 * i + a] = e[3 * i] * t[a] + e[3 * i + 1] * t[3 + a] + e[3 * i + 2] * t[6 + a];
		return r;
	}, b = (e, t, r, i) => ({
		rotation: u(e + (t ? -r : r)),
		flip: t !== i
	}), T = (e) => e && e[e.length - 1], v = (e) => e >= 0 && e < 2 ** 32, S = (e) => {
		let t = 0;
		for (; 0 === e.readBits(1) && t < 32;) t++;
		if (t >= 32) throw new Error("Invalid exponential-Golomb code.");
		return (1 << t) - 1 + e.readBits(t);
	}, P = (e, t) => {
		const r = t + 1, i = Math.floor(Math.log2(r));
		e.writeBits(i, 0), e.writeBits(1, 1), e.writeBits(i, r - 2 ** i);
	}, x = (e) => {
		const t = S(e);
		return 1 & t ? t + 1 >> 1 : -(t >> 1);
	}, C = (e) => e.constructor === Uint8Array ? e : ArrayBuffer.isView(e) ? new Uint8Array(e.buffer, e.byteOffset, e.byteLength) : new Uint8Array(e), E = (e) => e.constructor === DataView ? e : ArrayBuffer.isView(e) ? new DataView(e.buffer, e.byteOffset, e.byteLength) : new DataView(e), _ = void 0 !== globalThis.TextEncoder ? globalThis.TextEncoder : class {
		constructor() {
			this.encoding = "utf-8";
		}
		encode(e = "") {
			const t = new Uint8Array(3 * e.length);
			let r = 0;
			for (let i = 0; i < e.length; i++) {
				let a = e.charCodeAt(i);
				if (a < 128) t[r++] = a;
				else if (a < 2048) t[r++] = 192 | a >> 6, t[r++] = 128 | 63 & a;
				else if (a < 55296 || a > 57343) t[r++] = 224 | a >> 12, t[r++] = 128 | a >> 6 & 63, t[r++] = 128 | 63 & a;
				else {
					const s = i + 1 < e.length ? e.charCodeAt(i + 1) : 0;
					a < 56320 && s >= 56320 && s <= 57343 ? (a = 65536 + (a - 55296 << 10) + (s - 56320), i++, t[r++] = 240 | a >> 18, t[r++] = 128 | a >> 12 & 63, t[r++] = 128 | a >> 6 & 63, t[r++] = 128 | 63 & a) : (t[r++] = 239, t[r++] = 191, t[r++] = 189);
				}
			}
			return t.slice(0, r);
		}
	}, I = void 0 !== globalThis.TextDecoder ? globalThis.TextDecoder : class {
		constructor(e = "utf-8") {
			const t = e.trim().toLowerCase();
			if ("utf-8" === t || "utf8" === t || "unicode-1-1-utf-8" === t) this.encoding = "utf-8";
			else if ("utf-16le" === t || "utf-16" === t) this.encoding = "utf-16le";
			else {
				if ("utf-16be" !== t) throw new RangeError(`The encoding label provided ('${e}') is invalid.`);
				this.encoding = "utf-16be";
			}
		}
		decode(e) {
			const t = e ? C(e) : new Uint8Array(0), r = [];
			if ("utf-8" === this.encoding) {
				let e = t.length >= 3 && 239 === t[0] && 187 === t[1] && 191 === t[2] ? 3 : 0;
				for (; e < t.length;) {
					const i = t[e];
					if (i < 128) {
						r.push(i), e++;
						continue;
					}
					let a, s;
					if (i >= 194 && i < 224) a = 1, s = 31 & i;
					else if (i >= 224 && i < 240) a = 2, s = 15 & i;
					else {
						if (!(i >= 240 && i < 245)) {
							r.push(65533), e++;
							continue;
						}
						a = 3, s = 7 & i;
					}
					let n = 224 === i ? 160 : 240 === i ? 144 : 128, o = 237 === i ? 159 : 244 === i ? 143 : 191, c = 1;
					for (; c <= a; c++) {
						const r = e + c < t.length ? t[e + c] : 0;
						if (r < n || r > o) break;
						s = s << 6 | 63 & r, n = 128, o = 191;
					}
					e += c, c <= a ? r.push(65533) : s >= 65536 ? (s -= 65536, r.push(55296 | s >> 10, 56320 | 1023 & s)) : r.push(s);
				}
			} else {
				const e = "utf-16le" === this.encoding, i = e ? 255 : 254, a = e ? 254 : 255;
				let s = t.length >= 2 && t[0] === i && t[1] === a ? 2 : 0;
				for (; s + 1 < t.length;) {
					const i = e ? t[s] | t[s + 1] << 8 : t[s] << 8 | t[s + 1];
					if (s += 2, i >= 55296 && i <= 56319) {
						const a = s + 1 < t.length ? e ? t[s] | t[s + 1] << 8 : t[s] << 8 | t[s + 1] : -1;
						a >= 56320 && a <= 57343 ? (r.push(i, a), s += 2) : r.push(65533);
					} else i >= 56320 && i <= 57343 ? r.push(65533) : r.push(i);
				}
				s < t.length && r.push(65533);
			}
			let i = "";
			for (let a = 0; a < r.length; a += 8192) i += String.fromCharCode(...r.slice(a, a + 8192));
			return i;
		}
	}, B = new I(), A = new _(), R = (e) => Object.fromEntries(Object.entries(e).map(([e, t]) => [t, e])), F = {
		bt709: 1,
		bt470bg: 5,
		smpte170m: 6,
		bt2020: 9,
		smpte432: 12
	}, M = R(F), D = {
		bt709: 1,
		smpte170m: 6,
		linear: 8,
		"iec61966-2-1": 13,
		pq: 16,
		hlg: 18
	}, O = R(D), z = {
		rgb: 0,
		bt709: 1,
		bt470bg: 5,
		smpte170m: 6,
		"bt2020-ncl": 9
	}, N = R(z), U = (e) => !!(e && e.primaries && e.transfer && e.matrix && void 0 !== e.fullRange), L = {
		primaries: void 0,
		transfer: void 0,
		matrix: void 0,
		fullRange: void 0
	}, W = (e) => e instanceof ArrayBuffer || "undefined" != typeof SharedArrayBuffer && e instanceof SharedArrayBuffer || ArrayBuffer.isView(e);
	var q = class {
		constructor() {
			this.currentPromise = Promise.resolve(), this.pending = 0;
		}
		async acquire() {
			let e;
			const t = new Promise((t) => {
				let r = !1;
				e = () => {
					r || (t(), this.pending--, r = !0);
				};
			}), r = this.currentPromise;
			return this.currentPromise = t, this.pending++, await r, e;
		}
	};
	const V = /^[0-9a-fA-F]+$/, H = (e) => [...e].map((e) => e.toString(16).padStart(2, "0")).join(""), j = (e) => (e = (e = (e = (e = (e = e >> 1 & 1431655765 | (1431655765 & e) << 1) >> 2 & 858993459 | (858993459 & e) << 2) >> 4 & 252645135 | (252645135 & e) << 4) >> 8 & 16711935 | (16711935 & e) << 8) >> 16 & 65535 | (65535 & e) << 16) >>> 0, $ = (e, t, r) => {
		let i = 0, a = e.length - 1, s = -1;
		for (; i <= a;) {
			const n = i + a >> 1, o = r(e[n]);
			o === t ? (s = n, a = n - 1) : o < t ? i = n + 1 : a = n - 1;
		}
		return s;
	}, K = (e, t, r) => {
		let i = 0, a = e.length - 1, s = -1;
		for (; i <= a;) {
			const n = i + (a - i + 1) / 2 | 0;
			r(e[n]) <= t ? (s = n, i = n + 1) : a = n - 1;
		}
		return s;
	}, X = (e, t, r) => {
		const i = K(e, r(t), r);
		e.splice(i + 1, 0, t);
	}, Q = () => {
		let e, t;
		return {
			promise: new Promise((r, i) => {
				e = r, t = i;
			}),
			resolve: e,
			reject: t
		};
	}, G = (e, t) => {
		const r = e.indexOf(t);
		-1 !== r && e.splice(r, 1);
	}, Y = (e, t) => {
		for (let r = e.length - 1; r >= 0; r--) if (t(e[r])) return e[r];
	}, Z = (e, t) => {
		for (let r = e.length - 1; r >= 0; r--) if (t(e[r])) return r;
		return -1;
	}, J = (e) => {
		throw new Error(`Unexpected value: ${e}`);
	}, ee = (e, t, r) => {
		const i = e.getUint8(t), a = e.getUint8(t + 1), s = e.getUint8(t + 2);
		return r ? i | a << 8 | s << 16 : i << 16 | a << 8 | s;
	}, te = (e, t, r, i) => {
		r >>>= 0, r &= 16777215, i ? (e.setUint8(t, 255 & r), e.setUint8(t + 1, r >>> 8 & 255), e.setUint8(t + 2, r >>> 16 & 255)) : (e.setUint8(t, r >>> 16 & 255), e.setUint8(t + 1, r >>> 8 & 255), e.setUint8(t + 2, 255 & r));
	}, re = (e, t, r) => Math.max(t, Math.min(r, e)), ie = (e) => {
		const t = Math.round(e);
		return Math.abs(e / t - 1) < 10 * Number.EPSILON ? t : e;
	}, ae = (e, t) => Math.round(e / t) * t, se = (e, t) => Math.round(e * t) / t, ne = (e, t) => Math.floor(e / t) * t, oe = (e, t) => Math.floor(e * t) / t, ce = (e) => {
		let t = 0;
		for (; 0 !== e;) e &= e - 1, t++;
		return t;
	}, le = /^[a-z]{3}$/, de = (e) => le.test(e), ue = 1e6 * (1 + Number.EPSILON), he = (e, t) => {
		const r = {
			...e,
			...t
		};
		if (e.headers || t.headers) {
			const i = e.headers ? fe(e.headers) : {}, a = t.headers ? fe(t.headers) : {}, s = { ...i };
			Object.entries(a).forEach(([e, t]) => {
				const r = Object.keys(s).find((t) => t.toLowerCase() === e.toLowerCase());
				r && delete s[r], s[e] = t;
			}), r.headers = s;
		}
		return r;
	}, fe = (e) => {
		if (e instanceof Headers) {
			const t = {};
			return e.forEach((e, r) => {
				t[r] = e;
			}), t;
		}
		if (Array.isArray(e)) {
			const t = {};
			return e.forEach(([e, r]) => {
				t[e] = r;
			}), t;
		}
		return e;
	}, me = async (e, t, r, i, a) => {
		let s = 0;
		for (;;) try {
			return await e(t, r);
		} catch (n) {
			if (a()) throw n;
			s++;
			const e = i(s, n, t);
			if (null === e) throw n;
			if (qe._error("Retrying failed fetch. Error:", n), !Number.isFinite(e) || e < 0) throw new TypeError("Retry delay must be a non-negative finite number.");
			if (e > 0 && await Oe(1e3 * e), a()) throw n;
		}
	};
	var pe = class {
		constructor() {
			this.currentPromise = Promise.resolve();
		}
		call(e) {
			return this.currentPromise = this.currentPromise.then(e);
		}
	};
	let ge = null;
	const ke = () => null !== ge ? ge : ge = !("undefined" == typeof navigator || !(navigator.vendor?.match(/apple/i) || /AppleWebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) || /\b(iPad|iPhone|iPod)\b/.test(navigator.userAgent)));
	let we = null;
	const ye = () => null !== we ? we : we = "undefined" != typeof navigator && navigator.userAgent?.includes("Firefox");
	let be = null;
	const Te = () => null !== be ? be : be = !("undefined" == typeof navigator || !navigator.vendor?.includes("Google Inc") && !/Chrome/.test(navigator.userAgent)), ve = (e) => void 0 === globalThis.isSecureContext || globalThis.isSecureContext ? `${e} is not available in this environment.` : `${e} is not available in this environment; this may be because this page is running in an insecure context. Try serving your page over HTTPS or use localhost.`, Se = (async () => {})().constructor, Pe = (e) => e instanceof Se || e instanceof Promise || "function" == typeof e?.then, xe = (e, t) => -1 !== e ? e : t, Ce = (e, t, r, i) => e <= i && r <= t, Ee = function* (e) {
		for (const t in e) {
			const r = e[t];
			void 0 !== r && (yield {
				key: t,
				value: r
			});
		}
	}, _e = (e) => {
		const t = atob(e), r = new Uint8Array(t.length);
		for (let i = 0; i < t.length; i++) r[i] = t.charCodeAt(i);
		return r;
	}, Ie = () => {
		Symbol.dispose ??= Symbol("Symbol.dispose");
	}, Be = (e) => "number" == typeof e && !Number.isNaN(e), Ae = (e, t) => {
		if (t.includes("://")) return t;
		if (e.includes("://")) {
			const t = e.indexOf("?");
			-1 !== t && (e = e.slice(0, t));
		}
		let r;
		if (t.startsWith("/")) {
			const i = e.indexOf("://");
			if (-1 === i) r = t;
			else {
				const a = e.indexOf("/", i + 3);
				r = -1 === a ? e + t : e.slice(0, a) + t;
			}
		} else {
			const i = e.lastIndexOf("/");
			r = -1 === i ? t : e.slice(0, i + 1) + t;
		}
		let i = "";
		const a = r.indexOf("://");
		if (-1 !== a) {
			const e = r.indexOf("/", a + 3);
			-1 !== e && (i = r.slice(0, e), r = r.slice(e));
		}
		const s = r.split("/"), n = [];
		for (const o of s) ".." === o ? n.pop() : "." !== o && n.push(o);
		return i + n.join("/");
	}, Re = (e, t) => {
		let r = 0;
		for (let i = 0; i < e.length; i++) t(e[i]) && r++;
		return r;
	}, Fe = (e, t) => {
		let r = -1, i = Infinity;
		for (let a = 0; a < e.length; a++) {
			const s = t(e[a]);
			s < i && (i = s, r = a);
		}
		return r;
	}, Me = (e) => {
		c(Number.isInteger(e.num)), c(Number.isInteger(e.den)), c(0 !== e.den);
		let t = Math.abs(e.num), r = Math.abs(e.den);
		for (; 0 !== r;) {
			const e = t % r;
			t = r, r = e;
		}
		const i = t || 1;
		return {
			num: e.num / i,
			den: e.den / i
		};
	}, De = (e, t) => {
		if ("object" != typeof e || !e) throw new TypeError(`${t} must be an object.`);
		if (!Number.isInteger(e.left) || e.left < 0) throw new TypeError(`${t}.left must be a non-negative integer.`);
		if (!Number.isInteger(e.top) || e.top < 0) throw new TypeError(`${t}.top must be a non-negative integer.`);
		if (!Number.isInteger(e.width) || e.width < 0) throw new TypeError(`${t}.width must be a non-negative integer.`);
		if (!Number.isInteger(e.height) || e.height < 0) throw new TypeError(`${t}.height must be a non-negative integer.`);
	}, Oe = (e) => new Promise((t) => setTimeout(t, e)), ze = (e) => Array.isArray(e) ? e : [e];
	var Ne = class {
		constructor() {
			this._listeners = /* @__PURE__ */ new Map();
		}
		on(e, t, r) {
			this._listeners.has(e) || this._listeners.set(e, /* @__PURE__ */ new Set());
			const i = {
				fn: t,
				once: r?.once ?? !1
			};
			return this._listeners.get(e).add(i), () => {
				this._listeners.get(e)?.delete(i);
			};
		}
		_emit(...e) {
			const [t, r] = e, i = this._listeners.get(t);
			if (i) for (const s of i) {
				try {
					s.fn(r);
				} catch (a) {}
				s.once && i.delete(s);
			}
		}
	};
	const Ue = (e) => 2 * Math.ceil(e / 2), Le = (e) => null !== e && "object" == typeof e && Object.getPrototypeOf(e) === Object.prototype && Object.values(e).every((e) => "string" == typeof e);
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var We;
	(function(e) {
		e[e.Silent = 0] = "Silent", e[e.Errors = 1] = "Errors", e[e.Warnings = 2] = "Warnings", e[e.Info = 3] = "Info";
	})(We || (We = {}));
	var qe = class e {
		constructor() {}
		static get level() {
			return e._level;
		}
		static set level(t) {
			if (t !== We.Silent && t !== We.Errors && t !== We.Warnings && t !== We.Info) throw new TypeError("Invalid log level. Use one of the values of the LogLevel enum.");
			e._level = t;
		}
		static get _emitter() {
			return e._emitterInstance ??= new Ne();
		}
		static on(t, r, i) {
			return e._emitter.on(t, r, i);
		}
		static _error(...t) {
			e._emitter._emit("error", t), e._level, We.Errors;
		}
		static _warn(...t) {
			e._emitter._emit("warn", t), e._level, We.Warnings;
		}
		static _info(...t) {
			e._emitter._emit("info", t), e._level, We.Info;
		}
	};
	qe._level = We.Info, qe._emitterInstance = null;
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var Ve = class {
		constructor(e, t) {
			if (this.data = e, this.mimeType = t, !(e instanceof Uint8Array)) throw new TypeError("data must be a Uint8Array.");
			if ("string" != typeof t) throw new TypeError("mimeType must be a string.");
		}
	}, He = class {
		constructor(e, t, r, i) {
			if (this.data = e, this.mimeType = t, this.name = r, this.description = i, !(e instanceof Uint8Array)) throw new TypeError("data must be a Uint8Array.");
			if (void 0 !== t && "string" != typeof t) throw new TypeError("mimeType, when provided, must be a string.");
			if (void 0 !== r && "string" != typeof r) throw new TypeError("name, when provided, must be a string.");
			if (void 0 !== i && "string" != typeof i) throw new TypeError("description, when provided, must be a string.");
		}
	};
	const je = (e) => {
		if (!e || "object" != typeof e) throw new TypeError("tags must be an object.");
		if (void 0 !== e.title && "string" != typeof e.title) throw new TypeError("tags.title, when provided, must be a string.");
		if (void 0 !== e.description && "string" != typeof e.description) throw new TypeError("tags.description, when provided, must be a string.");
		if (void 0 !== e.artist && "string" != typeof e.artist) throw new TypeError("tags.artist, when provided, must be a string.");
		if (void 0 !== e.album && "string" != typeof e.album) throw new TypeError("tags.album, when provided, must be a string.");
		if (void 0 !== e.albumArtist && "string" != typeof e.albumArtist) throw new TypeError("tags.albumArtist, when provided, must be a string.");
		if (void 0 !== e.trackNumber && (!Number.isInteger(e.trackNumber) || e.trackNumber <= 0)) throw new TypeError("tags.trackNumber, when provided, must be a positive integer.");
		if (void 0 !== e.tracksTotal && (!Number.isInteger(e.tracksTotal) || e.tracksTotal <= 0)) throw new TypeError("tags.tracksTotal, when provided, must be a positive integer.");
		if (void 0 !== e.discNumber && (!Number.isInteger(e.discNumber) || e.discNumber <= 0)) throw new TypeError("tags.discNumber, when provided, must be a positive integer.");
		if (void 0 !== e.discsTotal && (!Number.isInteger(e.discsTotal) || e.discsTotal <= 0)) throw new TypeError("tags.discsTotal, when provided, must be a positive integer.");
		if (void 0 !== e.genre && "string" != typeof e.genre) throw new TypeError("tags.genre, when provided, must be a string.");
		if (void 0 !== e.date && (!(e.date instanceof Date) || Number.isNaN(e.date.getTime()))) throw new TypeError("tags.date, when provided, must be a valid Date.");
		if (void 0 !== e.beatsPerMinute && (!Number.isInteger(e.beatsPerMinute) || e.beatsPerMinute <= 0)) throw new TypeError("tags.beatsPerMinute, when provided, must be a positive integer.");
		if (void 0 !== e.lyrics && "string" != typeof e.lyrics) throw new TypeError("tags.lyrics, when provided, must be a string.");
		if (void 0 !== e.images) {
			if (!Array.isArray(e.images)) throw new TypeError("tags.images, when provided, must be an array.");
			for (const t of e.images) {
				if (!t || "object" != typeof t) throw new TypeError("Each image in tags.images must be an object.");
				if (!(t.data instanceof Uint8Array)) throw new TypeError("Each image.data must be a Uint8Array.");
				if ("string" != typeof t.mimeType) throw new TypeError("Each image.mimeType must be a string.");
				if (![
					"coverFront",
					"coverBack",
					"unknown"
				].includes(t.kind)) throw new TypeError("Each image.kind must be 'coverFront', 'coverBack', or 'unknown'.");
			}
		}
		if (void 0 !== e.comment && "string" != typeof e.comment) throw new TypeError("tags.comment, when provided, must be a string.");
		if (void 0 !== e.raw) {
			if (!e.raw || "object" != typeof e.raw) throw new TypeError("tags.raw, when provided, must be an object.");
			for (const t of Object.values(e.raw)) if (!(null === t || "string" == typeof t || Array.isArray(t) && t.every((e) => "string" == typeof e) || t instanceof Uint8Array || t instanceof Ve || t instanceof He || Le(t))) throw new TypeError("Each value in tags.raw must be a string, string array, Uint8Array, RichImageData, AttachedFile, Record<string, string>, or null.");
		}
	}, $e = {
		default: !0,
		primary: !0,
		forced: !1,
		original: !1,
		commentary: !1,
		hearingImpaired: !1,
		visuallyImpaired: !1
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var Ke = class e {
		constructor(e) {
			this.bytes = e, this.pos = 0;
		}
		seekToByte(e) {
			this.pos = 8 * e;
		}
		readBit() {
			const e = Math.floor(this.pos / 8), t = this.bytes[e] ?? 0, r = 7 - (7 & this.pos), i = (t & 1 << r) >> r;
			return this.pos++, i;
		}
		readBits(e) {
			if (1 === e) return this.readBit();
			let t = 0;
			for (let r = 0; r < e; r++) t <<= 1, t |= this.readBit();
			return t;
		}
		writeBits(e, t) {
			const r = this.pos + e;
			for (let i = this.pos; i < r; i++) {
				const e = Math.floor(i / 8);
				let a = this.bytes[e];
				const s = 7 - (7 & i);
				a &= ~(1 << s), a |= (t & 1 << r - i - 1) >> r - i - 1 << s, this.bytes[e] = a;
			}
			this.pos = r;
		}
		copyBits(e, t) {
			let r = 0;
			for (; r < e - 7; r += 8) this.writeBits(8, t.readBits(8));
			const i = e - r;
			i > 0 && this.writeBits(i, t.readBits(i));
		}
		readAlignedByte() {
			if (this.pos % 8 != 0) throw new Error("Bitstream is not byte-aligned.");
			const e = this.pos / 8, t = this.bytes[e] ?? 0;
			return this.pos += 8, t;
		}
		skipBits(e) {
			this.pos += e;
		}
		getBitsLeft() {
			return 8 * this.bytes.length - this.pos;
		}
		clone() {
			const t = new e(this.bytes);
			return t.pos = this.pos, t;
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/ const Xe = [
		96e3,
		88200,
		64e3,
		48e3,
		44100,
		32e3,
		24e3,
		22050,
		16e3,
		12e3,
		11025,
		8e3,
		7350
	], Qe = [
		-1,
		1,
		2,
		3,
		4,
		5,
		6,
		8
	], Ge = (e) => {
		if (!e || e.byteLength < 2) throw new TypeError("AAC description must be at least 2 bytes long.");
		const t = new Ke(e), r = Ye(t), { frequencyIndex: i, sampleRate: a } = Ze(t), s = t.readBits(4);
		let n = null;
		s >= 1 && s <= 7 && (n = Qe[s]);
		let o = r, c = !1, l = a;
		if (5 === r || 29 === r) c = 29 === r, l = Ze(t).sampleRate, o = Ye(t), 22 === o && t.skipBits(4);
		else for (; t.getBitsLeft() > 15;) {
			const e = t.pos;
			if (695 === t.readBits(11)) {
				5 === Ye(t) && t.readBits(1) && (l = Ze(t).sampleRate, t.getBitsLeft() > 11 && 1352 === t.readBits(11) && (c = !!t.readBits(1)));
				break;
			}
			t.pos = e + 1;
		}
		return null !== n && n > 1 && (c = !1), {
			objectType: r,
			coreObjectType: o,
			frequencyIndex: i,
			channelConfiguration: s,
			outputSampleRate: l,
			outputNumberOfChannels: c && 1 === n ? 2 : n
		};
	}, Ye = (e) => {
		const t = e.readBits(5);
		return 31 === t ? 32 + e.readBits(6) : t;
	}, Ze = (e) => {
		const t = e.readBits(4);
		return 15 === t ? {
			frequencyIndex: t,
			sampleRate: e.readBits(24)
		} : {
			frequencyIndex: t,
			sampleRate: t < Xe.length ? Xe[t] : null
		};
	}, Je = (e) => {
		const t = 5 === e.objectType || 29 === e.objectType, r = 29 === e.objectType, i = t ? e.outputSampleRate / 2 : e.outputSampleRate, a = r ? 1 : e.outputNumberOfChannels, s = Qe.indexOf(a);
		if (-1 === s) throw new TypeError(`Unsupported number of channels: ${e.outputNumberOfChannels}`);
		let n = 16;
		e.objectType >= 32 && (n += 6), 15 === rt(i) && (n += 24), t && (n += 9, 15 === rt(e.outputSampleRate) && (n += 24));
		const o = Math.ceil(n / 8), c = new Uint8Array(o), l = new Ke(c);
		return et(l, e.objectType), tt(l, i), l.writeBits(4, s), t && (tt(l, e.outputSampleRate), et(l, 2)), l.writeBits(3, 0), c;
	}, et = (e, t) => {
		t < 32 ? e.writeBits(5, t) : (e.writeBits(5, 31), e.writeBits(6, t - 32));
	}, tt = (e, t) => {
		const r = rt(t);
		e.writeBits(4, r), 15 === r && e.writeBits(24, t);
	}, rt = (e) => {
		const t = Xe.indexOf(e);
		return -1 === t ? 15 : t;
	}, it = [
		48e3,
		44100,
		32e3
	], at = [
		24e3,
		22050,
		16e3
	], st = "Mediabunny v1.61.0";
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var nt, ot;
	(function(e) {
		e[e.NON_IDR_SLICE = 1] = "NON_IDR_SLICE", e[e.SLICE_DPA = 2] = "SLICE_DPA", e[e.SLICE_DPB = 3] = "SLICE_DPB", e[e.SLICE_DPC = 4] = "SLICE_DPC", e[e.IDR = 5] = "IDR", e[e.SEI = 6] = "SEI", e[e.SPS = 7] = "SPS", e[e.PPS = 8] = "PPS", e[e.AUD = 9] = "AUD", e[e.SPS_EXT = 13] = "SPS_EXT";
	})(nt || (nt = {})), function(e) {
		e[e.RASL_N = 8] = "RASL_N", e[e.RASL_R = 9] = "RASL_R", e[e.BLA_W_LP = 16] = "BLA_W_LP", e[e.RSV_IRAP_VCL23 = 23] = "RSV_IRAP_VCL23", e[e.VPS_NUT = 32] = "VPS_NUT", e[e.SPS_NUT = 33] = "SPS_NUT", e[e.PPS_NUT = 34] = "PPS_NUT", e[e.AUD_NUT = 35] = "AUD_NUT", e[e.PREFIX_SEI_NUT = 39] = "PREFIX_SEI_NUT", e[e.SUFFIX_SEI_NUT = 40] = "SUFFIX_SEI_NUT";
	}(ot || (ot = {}));
	const ct = function* (e) {
		let t = 0, r = -1;
		for (; t < e.length - 2;) {
			const i = e.indexOf(0, t);
			if (-1 === i || i >= e.length - 2) break;
			t = i;
			let a = 0;
			t + 3 < e.length && 0 === e[t + 1] && 0 === e[t + 2] && 1 === e[t + 3] ? a = 4 : 0 === e[t + 1] && 1 === e[t + 2] && (a = 3), 0 !== a ? (-1 !== r && t > r && (yield {
				offset: r,
				length: t - r
			}), r = t + a, t = r) : t++;
		}
		-1 !== r && r < e.length && (yield {
			offset: r,
			length: e.length - r
		});
	}, lt = function* (e, t) {
		let r = 0;
		const i = new DataView(e.buffer, e.byteOffset, e.byteLength);
		for (; r + t <= e.length;) {
			let e;
			1 === t ? e = i.getUint8(r) : 2 === t ? e = i.getUint16(r, !1) : 3 === t ? e = ee(i, r, !1) : (c(4 === t), e = i.getUint32(r, !1)), r += t, yield {
				offset: r,
				length: e
			}, r += e;
		}
	}, dt = (e, t) => t.description ? lt(e, 1 + (3 & C(t.description)[4])) : ct(e), ut = (e) => 31 & e, ht = (e) => {
		const t = [], r = e.length;
		for (let i = 0; i < r; i++) i + 2 < r && 0 === e[i] && 0 === e[i + 1] && 3 === e[i + 2] ? (t.push(0, 0), i += 2) : t.push(e[i]);
		return new Uint8Array(t);
	}, ft = new Uint8Array([
		0,
		0,
		0,
		1
	]), mt = (e) => {
		const t = e.reduce((e, t) => e + ft.byteLength + t.byteLength, 0), r = new Uint8Array(t);
		let i = 0;
		for (const a of e) r.set(ft, i), i += ft.byteLength, r.set(a, i), i += a.byteLength;
		return r;
	}, pt = (e, t) => {
		const r = e.reduce((e, r) => e + t + r.byteLength, 0), i = new Uint8Array(r);
		let a = 0;
		for (const s of e) {
			const e = new DataView(i.buffer, i.byteOffset, i.byteLength);
			switch (t) {
				case 1:
					e.setUint8(a, s.byteLength);
					break;
				case 2:
					e.setUint16(a, s.byteLength, !1);
					break;
				case 3:
					te(e, a, s.byteLength, !1);
					break;
				case 4: e.setUint32(a, s.byteLength, !1);
			}
			a += t, i.set(s, a), a += s.byteLength;
		}
		return i;
	}, gt = (e) => {
		try {
			const t = [], r = [], i = [];
			for (const o of ct(e)) {
				const a = e.subarray(o.offset, o.offset + o.length), s = ut(a[0]);
				s === nt.SPS ? t.push(a) : s === nt.PPS ? r.push(a) : s === nt.SPS_EXT && i.push(a);
			}
			if (0 === t.length) return null;
			if (0 === r.length) return null;
			const a = t[0], s = bt(a);
			c(null !== s);
			const n = 100 === s.profileIdc || 110 === s.profileIdc || 122 === s.profileIdc || 144 === s.profileIdc;
			return {
				configurationVersion: 1,
				avcProfileIndication: s.profileIdc,
				profileCompatibility: s.constraintFlags,
				avcLevelIndication: s.levelIdc,
				lengthSizeMinusOne: 3,
				sequenceParameterSets: t,
				pictureParameterSets: r,
				chromaFormat: n ? s.chromaFormatIdc : null,
				bitDepthLumaMinus8: n ? s.bitDepthLumaMinus8 : null,
				bitDepthChromaMinus8: n ? s.bitDepthChromaMinus8 : null,
				sequenceParameterSetExt: n ? i : null
			};
		} catch (t) {
			return qe._error("Error building AVC Decoder Configuration Record:", t), null;
		}
	}, kt = (e) => {
		const t = [];
		t.push(e.configurationVersion), t.push(e.avcProfileIndication), t.push(e.profileCompatibility), t.push(e.avcLevelIndication), t.push(252 | 3 & e.lengthSizeMinusOne), t.push(224 | 31 & e.sequenceParameterSets.length);
		for (const r of e.sequenceParameterSets) {
			const e = r.byteLength;
			t.push(e >> 8), t.push(255 & e);
			for (let i = 0; i < e; i++) t.push(r[i]);
		}
		t.push(e.pictureParameterSets.length);
		for (const r of e.pictureParameterSets) {
			const e = r.byteLength;
			t.push(e >> 8), t.push(255 & e);
			for (let i = 0; i < e; i++) t.push(r[i]);
		}
		if ((100 === e.avcProfileIndication || 110 === e.avcProfileIndication || 122 === e.avcProfileIndication || 144 === e.avcProfileIndication) && null !== e.chromaFormat) {
			c(null !== e.bitDepthLumaMinus8), c(null !== e.bitDepthChromaMinus8), c(null !== e.sequenceParameterSetExt), t.push(252 | 3 & e.chromaFormat), t.push(248 | 7 & e.bitDepthLumaMinus8), t.push(248 | 7 & e.bitDepthChromaMinus8), t.push(e.sequenceParameterSetExt.length);
			for (const r of e.sequenceParameterSetExt) {
				const e = r.byteLength;
				t.push(e >> 8), t.push(255 & e);
				for (let i = 0; i < e; i++) t.push(r[i]);
			}
		}
		return new Uint8Array(t);
	}, wt = (e) => {
		try {
			const t = E(e);
			let r = 0;
			const i = t.getUint8(r++), a = t.getUint8(r++), s = t.getUint8(r++), n = t.getUint8(r++), o = 3 & t.getUint8(r++), c = 31 & t.getUint8(r++), l = [];
			for (let f = 0; f < c; f++) {
				const i = t.getUint16(r, !1);
				r += 2, l.push(e.subarray(r, r + i)), r += i;
			}
			const d = t.getUint8(r++), u = [];
			for (let f = 0; f < d; f++) {
				const i = t.getUint16(r, !1);
				r += 2, u.push(e.subarray(r, r + i)), r += i;
			}
			const h = {
				configurationVersion: i,
				avcProfileIndication: a,
				profileCompatibility: s,
				avcLevelIndication: n,
				lengthSizeMinusOne: o,
				sequenceParameterSets: l,
				pictureParameterSets: u,
				chromaFormat: null,
				bitDepthLumaMinus8: null,
				bitDepthChromaMinus8: null,
				sequenceParameterSetExt: null
			};
			if ((100 === a || 110 === a || 122 === a || 144 === a) && r + 4 <= e.length) {
				const i = 3 & t.getUint8(r++), a = 7 & t.getUint8(r++), s = 7 & t.getUint8(r++), n = t.getUint8(r++);
				h.chromaFormat = i, h.bitDepthLumaMinus8 = a, h.bitDepthChromaMinus8 = s;
				const o = [];
				for (let c = 0; c < n; c++) {
					const i = t.getUint16(r, !1);
					r += 2, o.push(e.subarray(r, r + i)), r += i;
				}
				h.sequenceParameterSetExt = o;
			}
			return h;
		} catch (t) {
			return qe._error("Error deserializing AVC Decoder Configuration Record:", t), null;
		}
	}, yt = {
		1: {
			num: 1,
			den: 1
		},
		2: {
			num: 12,
			den: 11
		},
		3: {
			num: 10,
			den: 11
		},
		4: {
			num: 16,
			den: 11
		},
		5: {
			num: 40,
			den: 33
		},
		6: {
			num: 24,
			den: 11
		},
		7: {
			num: 20,
			den: 11
		},
		8: {
			num: 32,
			den: 11
		},
		9: {
			num: 80,
			den: 33
		},
		10: {
			num: 18,
			den: 11
		},
		11: {
			num: 15,
			den: 11
		},
		12: {
			num: 64,
			den: 33
		},
		13: {
			num: 160,
			den: 99
		},
		14: {
			num: 4,
			den: 3
		},
		15: {
			num: 3,
			den: 2
		},
		16: {
			num: 2,
			den: 1
		}
	}, bt = (e) => {
		try {
			const t = ht(e), r = new Ke(t);
			if (r.skipBits(1), r.skipBits(2), 7 !== r.readBits(5)) return null;
			const i = r.readAlignedByte(), a = r.readAlignedByte(), s = r.readAlignedByte();
			S(r);
			let n = 1, o = 0, l = 0, d = 0;
			if ((100 === i || 110 === i || 122 === i || 244 === i || 44 === i || 83 === i || 86 === i || 118 === i || 128 === i) && (n = S(r), 3 === n && (d = r.readBits(1)), o = S(r), l = S(r), r.skipBits(1), r.readBits(1))) {
				for (let e = 0; e < (3 !== n ? 8 : 12); e++) if (r.readBits(1)) {
					const t = e < 6 ? 16 : 64;
					let i = 8, a = 8;
					for (let e = 0; e < t; e++) {
						if (0 !== a) a = (i + x(r) + 256) % 256;
						i = 0 === a ? i : a;
					}
				}
			}
			S(r);
			const u = S(r);
			if (0 === u) S(r);
			else if (1 === u) {
				r.skipBits(1), x(r), x(r);
				const e = S(r);
				for (let t = 0; t < e; t++) x(r);
			}
			S(r), r.skipBits(1);
			const h = S(r), f = S(r), m = 16 * (h + 1), p = 16 * (f + 1);
			let g = m, k = p;
			const w = r.readBits(1);
			if (w || r.skipBits(1), r.skipBits(1), r.readBits(1)) {
				const e = S(r), t = S(r), i = S(r), a = S(r);
				let s, o;
				if (0 === (0 === d ? n : 0)) s = 1, o = 2 - w;
				else s = 3 === n ? 1 : 2, o = (1 === n ? 2 : 1) * (2 - w);
				g -= s * (e + t), k -= o * (i + a);
			}
			let y = 2, b = 2, v = 2, P = 0, C = {
				num: 1,
				den: 1
			}, E = null, _ = null, I = null, B = null;
			const A = r.pos;
			if (r.readBits(1)) {
				if (r.readBits(1)) {
					const e = r.readBits(8);
					if (255 === e) C = {
						num: r.readBits(16),
						den: r.readBits(16)
					};
					else {
						const t = yt[e];
						t && (C = t);
					}
				}
				r.readBits(1) && r.skipBits(1), r.readBits(1) && (r.skipBits(3), P = r.readBits(1), r.readBits(1) && (y = r.readBits(8), b = r.readBits(8), v = r.readBits(8))), r.readBits(1) && (S(r), S(r)), r.readBits(1) && (r.skipBits(32), r.skipBits(32), r.skipBits(1));
				const e = r.readBits(1);
				e && Tt(r);
				const t = r.readBits(1);
				t && Tt(r), (e || t) && r.skipBits(1), r.skipBits(1), I = r.pos, B = r.readBits(1), B && (r.skipBits(1), S(r), S(r), S(r), S(r), E = S(r), _ = S(r));
			}
			if (null === E) {
				c(null === _);
				if (44 !== i && 86 !== i && 100 !== i && 110 !== i && 122 !== i && 244 !== i || !(16 & a)) {
					const e = h + 1, t = (2 - w) * (f + 1), r = yr.find((e) => e.level >= s) ?? T(yr), i = Math.min(Math.floor(r.maxDpbMbs / (e * t)), 16);
					E = i, _ = i;
				} else E = 0, _ = 0;
			}
			return c(null !== _), {
				emulationUnpreventedBytes: t,
				profileIdc: i,
				constraintFlags: a,
				levelIdc: s,
				frameMbsOnlyFlag: w,
				chromaFormatIdc: n,
				bitDepthLumaMinus8: o,
				bitDepthChromaMinus8: l,
				codedWidth: m,
				codedHeight: p,
				displayWidth: g,
				displayHeight: k,
				pixelAspectRatio: C,
				colourPrimaries: y,
				matrixCoefficients: v,
				transferCharacteristics: b,
				fullRangeFlag: P,
				numReorderFrames: E,
				maxDecFrameBuffering: _,
				vuiParametersFlagBitOffset: A,
				bitstreamRestrictionFlagBitOffset: I,
				bitstreamRestrictionFlag: B
			};
		} catch (t) {
			return qe._error("Error parsing AVC SPS:", t), null;
		}
	}, Tt = (e) => {
		const t = S(e);
		e.skipBits(4), e.skipBits(4);
		for (let r = 0; r <= t; r++) S(e), S(e), e.skipBits(1);
		e.skipBits(5), e.skipBits(5), e.skipBits(5), e.skipBits(5);
	}, vt = (e) => {
		c(1 !== e.bitstreamRestrictionFlag);
		const t = new Uint8Array(e.emulationUnpreventedBytes.byteLength + 64), r = new Ke(e.emulationUnpreventedBytes), i = new Ke(t);
		null === e.bitstreamRestrictionFlag ? (i.copyBits(e.vuiParametersFlagBitOffset, r), i.writeBits(1, 1), i.writeBits(1, 0), i.writeBits(1, 0), i.writeBits(1, 0), i.writeBits(1, 0), i.writeBits(1, 0), i.writeBits(1, 0), i.writeBits(1, 0), i.writeBits(1, 0)) : (c(null !== e.bitstreamRestrictionFlagBitOffset), i.copyBits(e.bitstreamRestrictionFlagBitOffset, r)), i.writeBits(1, 1), i.writeBits(1, 1), P(i, 2), P(i, 1), P(i, 16), P(i, 16), P(i, e.numReorderFrames), P(i, e.maxDecFrameBuffering), i.writeBits(1, 1), i.writeBits((8 - i.pos % 8) % 8, 0);
		const a = i.pos / 8;
		return c(Number.isInteger(a)), ((e) => {
			const t = [];
			let r = 0;
			for (const i of e) 2 === r && i <= 3 && (t.push(3), r = 0), t.push(i), r = 0 === i ? r + 1 : 0;
			return new Uint8Array(t);
		})(t.subarray(0, a));
	}, St = (e, t) => t.description ? lt(e, 1 + (3 & C(t.description)[21])) : ct(e), Pt = (e) => e >> 1 & 63, xt = (e) => {
		try {
			const t = new Ke(ht(e));
			t.skipBits(16), t.readBits(4);
			const r = t.readBits(3), i = t.readBits(1), { general_profile_space: a, general_tier_flag: s, general_profile_idc: n, general_profile_compatibility_flags: o, general_constraint_indicator_flags: c, general_level_idc: l } = Et(t, r);
			S(t);
			const d = S(t);
			let u = 0;
			3 === d && (u = t.readBits(1));
			const h = S(t), f = S(t);
			let m = h, p = f;
			if (t.readBits(1)) {
				const e = S(t), r = S(t), i = S(t), a = S(t);
				let s = 1, n = 1;
				const o = 0 === u ? d : 0;
				1 === o ? (s = 2, n = 2) : 2 === o && (s = 2, n = 1), m -= (e + r) * s, p -= (i + a) * n;
			}
			const g = S(t), k = S(t);
			S(t);
			const w = t.readBits(1) ? 0 : r;
			let y = 0;
			for (let e = w; e <= r; e++) S(t), y = S(t), S(t);
			if (S(t), S(t), S(t), S(t), S(t), S(t), t.readBits(1) && t.readBits(1) && _t(t), t.skipBits(1), t.skipBits(1), t.readBits(1) && (t.skipBits(4), t.skipBits(4), S(t), S(t), t.skipBits(1)), It(t, S(t)), t.readBits(1)) {
				const e = S(t);
				for (let r = 0; r < e; r++) S(t), t.skipBits(1);
			}
			t.skipBits(1), t.skipBits(1);
			let b = 2, T = 2, v = 2, P = 0, x = 0, C = {
				num: 1,
				den: 1
			};
			if (t.readBits(1)) {
				const e = At(t, r);
				C = e.pixelAspectRatio, b = e.colourPrimaries, T = e.transferCharacteristics, v = e.matrixCoefficients, P = e.fullRangeFlag, x = e.minSpatialSegmentationIdc;
			}
			return {
				displayWidth: m,
				displayHeight: p,
				pixelAspectRatio: C,
				colourPrimaries: b,
				transferCharacteristics: T,
				matrixCoefficients: v,
				fullRangeFlag: P,
				maxDecFrameBuffering: y + 1,
				spsMaxSubLayersMinus1: r,
				spsTemporalIdNestingFlag: i,
				generalProfileSpace: a,
				generalTierFlag: s,
				generalProfileIdc: n,
				generalProfileCompatibilityFlags: o,
				generalConstraintIndicatorFlags: c,
				generalLevelIdc: l,
				chromaFormatIdc: d,
				bitDepthLumaMinus8: g,
				bitDepthChromaMinus8: k,
				minSpatialSegmentationIdc: x
			};
		} catch (t) {
			return qe._error("Error parsing HEVC SPS:", t), null;
		}
	}, Ct = (e) => {
		try {
			const t = [], r = [], i = [], a = [];
			for (const c of ct(e)) {
				const s = e.subarray(c.offset, c.offset + c.length), n = Pt(s[0]);
				n === ot.VPS_NUT ? t.push(s) : n === ot.SPS_NUT ? r.push(s) : n === ot.PPS_NUT ? i.push(s) : n !== ot.PREFIX_SEI_NUT && n !== ot.SUFFIX_SEI_NUT || a.push(s);
			}
			if (0 === r.length || 0 === i.length) return null;
			const s = xt(r[0]);
			if (!s) return null;
			let n = 0;
			if (i.length > 0) {
				const e = i[0], t = new Ke(ht(e));
				t.skipBits(16), S(t), S(t), t.skipBits(1), t.skipBits(1), t.skipBits(3), t.skipBits(1), t.skipBits(1), S(t), S(t), x(t), t.skipBits(1), t.skipBits(1), t.readBits(1) && S(t), x(t), x(t), t.skipBits(1), t.skipBits(1), t.skipBits(1), t.skipBits(1);
				const r = t.readBits(1), a = t.readBits(1);
				n = r || a ? r && !a ? 2 : !r && a ? 3 : 0 : 0;
			}
			const o = [
				...t.length ? [{
					arrayCompleteness: 1,
					nalUnitType: ot.VPS_NUT,
					nalUnits: t
				}] : [],
				...r.length ? [{
					arrayCompleteness: 1,
					nalUnitType: ot.SPS_NUT,
					nalUnits: r
				}] : [],
				...i.length ? [{
					arrayCompleteness: 1,
					nalUnitType: ot.PPS_NUT,
					nalUnits: i
				}] : [],
				...a.length ? [{
					arrayCompleteness: 1,
					nalUnitType: Pt(a[0][0]),
					nalUnits: a
				}] : []
			];
			return {
				configurationVersion: 1,
				generalProfileSpace: s.generalProfileSpace,
				generalTierFlag: s.generalTierFlag,
				generalProfileIdc: s.generalProfileIdc,
				generalProfileCompatibilityFlags: s.generalProfileCompatibilityFlags,
				generalConstraintIndicatorFlags: s.generalConstraintIndicatorFlags,
				generalLevelIdc: s.generalLevelIdc,
				minSpatialSegmentationIdc: s.minSpatialSegmentationIdc,
				parallelismType: n,
				chromaFormatIdc: s.chromaFormatIdc,
				bitDepthLumaMinus8: s.bitDepthLumaMinus8,
				bitDepthChromaMinus8: s.bitDepthChromaMinus8,
				avgFrameRate: 0,
				constantFrameRate: 0,
				numTemporalLayers: s.spsMaxSubLayersMinus1 + 1,
				temporalIdNested: s.spsTemporalIdNestingFlag,
				lengthSizeMinusOne: 3,
				arrays: o
			};
		} catch (t) {
			return qe._error("Error building HEVC Decoder Configuration Record:", t), null;
		}
	}, Et = (e, t) => {
		const r = e.readBits(2), i = e.readBits(1), a = e.readBits(5);
		let s = 0;
		for (let d = 0; d < 32; d++) s = s << 1 | e.readBits(1);
		const n = new Uint8Array(6);
		for (let d = 0; d < 6; d++) n[d] = e.readBits(8);
		const o = e.readBits(8), c = [], l = [];
		for (let d = 0; d < t; d++) c.push(e.readBits(1)), l.push(e.readBits(1));
		if (t > 0) for (let d = t; d < 8; d++) e.skipBits(2);
		for (let d = 0; d < t; d++) c[d] && e.skipBits(88), l[d] && e.skipBits(8);
		return {
			general_profile_space: r,
			general_tier_flag: i,
			general_profile_idc: a,
			general_profile_compatibility_flags: s,
			general_constraint_indicator_flags: n,
			general_level_idc: o
		};
	}, _t = (e) => {
		for (let t = 0; t < 4; t++) for (let r = 0; r < (3 === t ? 2 : 6); r++) if (e.readBits(1)) {
			const r = Math.min(64, 1 << 4 + (t << 1));
			t > 1 && x(e);
			for (let t = 0; t < r; t++) x(e);
		} else S(e);
	}, It = (e, t) => {
		const r = [];
		for (let i = 0; i < t; i++) r[i] = Bt(e, i, t, r);
	}, Bt = (e, t, r, i) => {
		let a = 0, s = 0, n = 0;
		if (0 !== t && (s = e.readBits(1)), s) {
			n = t === r ? t - (S(e) + 1) : t - 1, e.readBits(1), S(e);
			const s = i[n] ?? 0;
			for (let t = 0; t <= s; t++) e.readBits(1) || e.readBits(1);
			a = i[n];
		} else {
			const t = S(e), r = S(e);
			for (let i = 0; i < t; i++) S(e), e.readBits(1);
			for (let i = 0; i < r; i++) S(e), e.readBits(1);
			a = t + r;
		}
		return a;
	}, At = (e, t) => {
		let r = 2, i = 2, a = 2, s = 0, n = 0, o = {
			num: 1,
			den: 1
		};
		if (e.readBits(1)) {
			const t = e.readBits(8);
			if (255 === t) o = {
				num: e.readBits(16),
				den: e.readBits(16)
			};
			else {
				const e = yt[t];
				e && (o = e);
			}
		}
		return e.readBits(1) && e.readBits(1), e.readBits(1) && (e.readBits(3), s = e.readBits(1), e.readBits(1) && (r = e.readBits(8), i = e.readBits(8), a = e.readBits(8))), e.readBits(1) && (S(e), S(e)), e.readBits(1), e.readBits(1), e.readBits(1), e.readBits(1) && (S(e), S(e), S(e), S(e)), e.readBits(1) && (e.readBits(32), e.readBits(32), e.readBits(1) && S(e), e.readBits(1) && Rt(e, !0, t)), e.readBits(1) && (e.readBits(1), e.readBits(1), e.readBits(1), n = S(e), S(e), S(e), S(e), S(e)), {
			pixelAspectRatio: o,
			colourPrimaries: r,
			transferCharacteristics: i,
			matrixCoefficients: a,
			fullRangeFlag: s,
			minSpatialSegmentationIdc: n
		};
	}, Rt = (e, t, r) => {
		let i = !1, a = !1, s = !1;
		t && (i = 1 === e.readBits(1), a = 1 === e.readBits(1), (i || a) && (s = 1 === e.readBits(1), s && (e.readBits(8), e.readBits(5), e.readBits(1), e.readBits(5)), e.readBits(4), e.readBits(4), s && e.readBits(4), e.readBits(5), e.readBits(5), e.readBits(5)));
		for (let n = 0; n <= r; n++) {
			let t = !0;
			1 === e.readBits(1) || (t = 1 === e.readBits(1));
			let r = !1;
			t ? S(e) : r = 1 === e.readBits(1);
			let n = 1;
			r || (n = S(e) + 1), i && Ft(e, n, s), a && Ft(e, n, s);
		}
	}, Ft = (e, t, r) => {
		for (let i = 0; i < t; i++) S(e), S(e), r && (S(e), S(e)), e.readBits(1);
	};
	var Mt;
	(function(e) {
		e[e.audAllowed = 0] = "audAllowed", e[e.beforeFirstVcl = 1] = "beforeFirstVcl", e[e.afterFirstVcl = 2] = "afterFirstVcl", e[e.eoBitstreamAllowed = 3] = "eoBitstreamAllowed", e[e.noMoreDataAllowed = 4] = "noMoreDataAllowed";
	})(Mt || (Mt = {}));
	const Dt = (e, t) => {
		const r = /* @__PURE__ */ new Set();
		let i = Mt.audAllowed;
		for (const s of St(e, t)) {
			if (i === Mt.noMoreDataAllowed) {
				r.add(s.offset);
				continue;
			}
			const t = Pt(e[s.offset]);
			if (i === Mt.eoBitstreamAllowed && 37 !== t) {
				r.add(s.offset);
				continue;
			}
			let a = !1;
			35 === t ? i > Mt.audAllowed ? a = !0 : i = Mt.beforeFirstVcl : t <= 31 ? i > Mt.afterFirstVcl ? a = !0 : i = Mt.afterFirstVcl : 36 === t ? i !== Mt.afterFirstVcl ? a = !0 : i = Mt.eoBitstreamAllowed : 37 === t ? i < Mt.afterFirstVcl ? a = !0 : i = Mt.noMoreDataAllowed : 32 === t || 33 === t || 34 === t || 39 === t || t >= 41 && t <= 44 || t >= 48 && t <= 55 ? i > Mt.beforeFirstVcl ? a = !0 : i = Mt.beforeFirstVcl : (38 === t || 40 === t || t >= 45 && t <= 47 || t >= 56 && t <= 63) && i < Mt.afterFirstVcl && (a = !0), a && r.add(s.offset);
		}
		if (0 === r.size) return null;
		const a = [];
		for (const s of St(e, t)) r.has(s.offset) || a.push(e.subarray(s.offset, s.offset + s.length));
		return ((e, t) => t.description ? pt(e, 1 + (3 & C(t.description)[21])) : mt(e))(a, t);
	}, Ot = {
		1: {
			colourPrimaries: 5,
			transferCharacteristics: 6,
			matrixCoefficients: 5
		},
		2: {
			colourPrimaries: 1,
			transferCharacteristics: 1,
			matrixCoefficients: 1
		},
		3: {
			colourPrimaries: 6,
			transferCharacteristics: 6,
			matrixCoefficients: 6
		},
		4: {
			colourPrimaries: 7,
			transferCharacteristics: 7,
			matrixCoefficients: 7
		},
		5: {
			colourPrimaries: 9,
			transferCharacteristics: 14,
			matrixCoefficients: 9
		},
		7: {
			colourPrimaries: 1,
			transferCharacteristics: 13,
			matrixCoefficients: 0
		}
	}, zt = (e) => {
		const t = new Ke(e);
		if (2 !== t.readBits(2)) return null;
		const r = t.readBits(1), i = (t.readBits(1) << 1) + r;
		if (3 === i && t.skipBits(1), 1 === t.readBits(1)) return null;
		if (0 !== t.readBits(1)) return null;
		if (t.skipBits(2), 4817730 !== t.readBits(24)) return null;
		let a = 8;
		i >= 2 && (a = t.readBits(1) ? 12 : 10);
		const s = t.readBits(3);
		let n = 0, o = 0;
		if (7 !== s) if (o = t.readBits(1), 1 === i || 3 === i) {
			const e = t.readBits(1), r = t.readBits(1);
			n = e || r ? e && !r ? 2 : 1 : 3, t.skipBits(1);
		} else n = 1;
		else n = 3, o = 1;
		const c = (t.readBits(16) + 1) * (t.readBits(16) + 1);
		let l = T(Tr).level;
		for (const u of Tr) if (c <= u.maxPictureSize) {
			l = u.level;
			break;
		}
		const d = Ot[s];
		return {
			profile: i,
			level: l,
			bitDepth: a,
			chromaSubsampling: n,
			videoFullRangeFlag: o,
			colourPrimaries: d?.colourPrimaries ?? 2,
			transferCharacteristics: d?.transferCharacteristics ?? 2,
			matrixCoefficients: d?.matrixCoefficients ?? 2
		};
	}, Nt = function* (e) {
		const t = new Ke(e), r = () => {
			let e = 0;
			for (let r = 0; r < 8; r++) {
				const i = t.readAlignedByte();
				if (e += (127 & i) * 2 ** (7 * r), !(128 & i)) break;
				if (7 === r && 128 & i) return null;
			}
			return e > 2 ** 32 - 1 ? null : e;
		};
		for (; t.getBitsLeft() >= 8;) {
			t.skipBits(1);
			const i = t.readBits(4), a = t.readBits(1), s = t.readBits(1);
			let n;
			if (t.skipBits(1), a && t.skipBits(8), s) {
				const e = r();
				if (null === e) return;
				n = e;
			} else n = Math.floor(t.getBitsLeft() / 8);
			c(t.pos % 8 == 0), yield {
				type: i,
				data: e.subarray(t.pos / 8, t.pos / 8 + n)
			}, t.skipBits(8 * n);
		}
	}, Ut = (e) => {
		for (const { type: t, data: r } of Nt(e)) {
			if (1 !== t) continue;
			const e = new Ke(r), i = e.readBits(3);
			e.readBits(1);
			const a = e.readBits(1);
			let s = 0, n = 0, o = 0;
			if (a) s = e.readBits(5);
			else {
				let t = 0;
				if (e.readBits(1)) {
					if (e.skipBits(32), e.skipBits(32), e.readBits(1)) {
						let t = 0;
						for (; t < 32 && !e.readBits(1);) t++;
						t < 32 && e.skipBits(t);
					}
					t = e.readBits(1), t && (o = e.readBits(5), e.skipBits(32), e.skipBits(5), e.skipBits(5));
				}
				const r = e.readBits(1), i = e.readBits(5);
				for (let a = 0; a <= i; a++) {
					e.skipBits(12);
					const i = e.readBits(5);
					if (0 === a && (s = i), i > 7) {
						const t = e.readBits(1);
						0 === a && (n = t);
					}
					if (t && e.readBits(1)) {
						const t = o + 1;
						e.skipBits(t), e.skipBits(t), e.skipBits(1);
					}
					r && e.readBits(1) && e.skipBits(4);
				}
			}
			const c = e.readBits(4), l = e.readBits(4), d = c + 1;
			e.skipBits(d);
			const u = l + 1;
			e.skipBits(u);
			let h = 0;
			if (h = a ? 0 : e.readBits(1), h && (e.skipBits(4), e.skipBits(3)), e.skipBits(1), e.skipBits(1), e.skipBits(1), !a) {
				e.skipBits(1), e.skipBits(1), e.skipBits(1), e.skipBits(1);
				const t = e.readBits(1);
				t && (e.skipBits(1), e.skipBits(1));
				let r = 0;
				r = e.readBits(1) ? 2 : e.readBits(1), r > 0 && (e.readBits(1) || e.skipBits(1)), t && e.skipBits(3);
			}
			e.skipBits(1), e.skipBits(1), e.skipBits(1);
			const f = e.readBits(1);
			let m = 8;
			2 === i && f ? m = e.readBits(1) ? 12 : 10 : i <= 2 && (m = f ? 10 : 8);
			let p = 0;
			1 !== i && (p = e.readBits(1));
			let g = 2, k = 2, w = 2;
			e.readBits(1) && (g = e.readBits(8), k = e.readBits(8), w = e.readBits(8));
			let y = 0, b = 1, T = 1, v = 0;
			return p ? y = e.readBits(1) : 1 === g && 13 === k && 0 === w ? (y = 1, b = 0, T = 0) : (y = e.readBits(1), 0 === i ? (b = 1, T = 1) : 1 === i ? (b = 0, T = 0) : 12 === m ? (b = e.readBits(1), T = b ? e.readBits(1) : 0) : (b = 1, T = 0), b && T && (v = e.readBits(2))), {
				profile: i,
				level: s,
				tier: n,
				bitDepth: m,
				monochrome: p,
				chromaSubsamplingX: b,
				chromaSubsamplingY: T,
				chromaSamplePosition: v,
				videoFullRangeFlag: y,
				colourPrimaries: g,
				transferCharacteristics: k,
				matrixCoefficients: w
			};
		}
		return null;
	}, Lt = (e) => {
		if (e.length < 36) return null;
		const t = E(e);
		return 1768124518 !== t.getUint32(4) || t.getUint16(8) < 28 ? null : {
			fullRange: !1,
			colourPrimaries: t.getUint8(22),
			transferCharacteristics: t.getUint8(23),
			matrixCoefficients: t.getUint8(24)
		};
	}, Wt = (e) => {
		const t = E(e), r = t.getUint8(9), i = t.getUint16(10, !0), a = t.getUint32(12, !0), s = t.getInt16(16, !0), n = t.getUint8(18);
		let o = null;
		return n && (o = e.subarray(19, 21 + r)), {
			outputChannelCount: r,
			preSkip: i,
			inputSampleRate: a,
			outputGain: s,
			channelMappingFamily: n,
			channelMappingTable: o
		};
	}, qt = [
		480,
		960,
		1920,
		2880,
		480,
		960,
		1920,
		2880,
		480,
		960,
		1920,
		2880,
		480,
		960,
		480,
		960,
		120,
		240,
		480,
		960,
		120,
		240,
		480,
		960,
		120,
		240,
		480,
		960,
		120,
		240,
		480,
		960
	], Vt = (e) => {
		if (e.length < 7) throw new Error("Setup header is too short.");
		if (5 !== e[0]) throw new Error("Wrong packet type in Setup header.");
		if ("vorbis" !== String.fromCharCode(...e.slice(1, 7))) throw new Error("Invalid packet signature in Setup header.");
		const t = e.length, r = new Uint8Array(t);
		for (let d = 0; d < t; d++) r[d] = e[t - 1 - d];
		const i = new Ke(r);
		let a = 0;
		for (; i.getBitsLeft() > 97;) if (1 === i.readBits(1)) {
			a = i.pos;
			break;
		}
		if (0 === a) throw new Error("Invalid Setup header: framing bit not found.");
		let s = 0, n = !1, o = 0;
		for (; i.getBitsLeft() >= 97;) {
			const e = i.pos, t = i.readBits(8), r = i.readBits(16), a = i.readBits(16);
			if (t > 63 || 0 !== r || 0 !== a) {
				i.pos = e;
				break;
			}
			if (i.skipBits(1), s++, s > 64) break;
			i.clone().readBits(6) + 1 === s && (n = !0, o = s);
		}
		if (!n) throw new Error("Invalid Setup header: mode header not found.");
		if (o > 63) throw new Error(`Unsupported mode count: ${o}.`);
		const c = o;
		i.pos = 0, i.skipBits(a);
		const l = Array(c).fill(0);
		for (let d = c - 1; d >= 0; d--) i.skipBits(40), l[d] = i.readBits(1);
		return { modeBlockflags: l };
	}, Ht = (e, t, r) => {
		switch (e) {
			case "avc":
				for (const e of dt(r, t)) {
					const t = r[e.offset], i = ut(t);
					if (i >= nt.NON_IDR_SLICE && i <= nt.SLICE_DPC) return "delta";
					if (i === nt.IDR) return "key";
					if (i === nt.SEI && !Te()) {
						const t = ht(r.subarray(e.offset, e.offset + e.length));
						let i = 1;
						do {
							let e = 0;
							for (;;) {
								const r = t[i++];
								if (void 0 === r) break;
								if (e += r, r < 255) break;
							}
							let r = 0;
							for (;;) {
								const e = t[i++];
								if (void 0 === e) break;
								if (r += e, e < 255) break;
							}
							if (6 === e) {
								const e = new Ke(t);
								e.pos = 8 * i;
								const r = S(e), a = e.readBits(1);
								if (0 === r && 1 === a) return "key";
							}
							i += r;
						} while (i < t.length - 1);
					}
				}
				return "delta";
			case "hevc":
				for (const e of St(r, t)) {
					const t = Pt(r[e.offset]);
					if (t < ot.BLA_W_LP) return "delta";
					if (t <= ot.RSV_IRAP_VCL23) return "key";
				}
				return "delta";
			case "vp8": return 1 & r[0] ? "delta" : "key";
			case "vp9": {
				const e = new Ke(r);
				if (2 !== e.readBits(2)) return null;
				const t = e.readBits(1);
				return (e.readBits(1) << 1) + t === 3 && e.skipBits(1), e.readBits(1) ? null : 0 === e.readBits(1) ? "key" : "delta";
			}
			case "av1": {
				let e = !1;
				for (const { type: t, data: i } of Nt(r)) if (1 === t) {
					const t = new Ke(i);
					t.skipBits(4), e = !!t.readBits(1);
				} else if (3 === t || 6 === t || 7 === t) {
					if (e) return "key";
					const t = new Ke(i);
					return t.readBits(1) ? null : 0 === t.readBits(2) ? "key" : "delta";
				}
				return null;
			}
			case "prores": return "key";
			default: J(e), c(!1);
		}
	};
	var jt;
	(function(e) {
		e[e.STREAMINFO = 0] = "STREAMINFO", e[e.VORBIS_COMMENT = 4] = "VORBIS_COMMENT", e[e.PICTURE = 6] = "PICTURE";
	})(jt || (jt = {}));
	const $t = (e, t) => {
		const r = E(e);
		let i = 0;
		const a = r.getUint32(i, !0);
		i += 4;
		const s = B.decode(e.subarray(i, i + a));
		i += a, a > 0 && (t.raw ??= {}, t.raw.vendor ??= s);
		const n = r.getUint32(i, !0);
		i += 4;
		for (let o = 0; o < n; o++) {
			const a = r.getUint32(i, !0);
			i += 4;
			const s = B.decode(e.subarray(i, i + a));
			i += a;
			const n = s.indexOf("=");
			if (-1 === n) continue;
			const o = s.slice(0, n).toUpperCase(), c = s.slice(n + 1);
			switch (t.raw ??= {}, Array.isArray(t.raw[o]) ? t.raw[o] = [...t.raw[o], c] : "string" == typeof t.raw[o] ? t.raw[o] = [t.raw[o], c] : t.raw[o] ??= c, o) {
				case "TITLE":
					t.title ??= c;
					break;
				case "DESCRIPTION":
					t.description ??= c;
					break;
				case "ARTIST":
					t.artist ??= c;
					break;
				case "ALBUM":
					t.album ??= c;
					break;
				case "ALBUMARTIST":
					t.albumArtist ??= c;
					break;
				case "COMMENT":
					t.comment ??= c;
					break;
				case "LYRICS":
					t.lyrics ??= c;
					break;
				case "TRACKNUMBER":
					{
						const e = c.split("/"), r = Number.parseInt(e[0], 10), i = e[1] && Number.parseInt(e[1], 10);
						Number.isInteger(r) && r > 0 && (t.trackNumber ??= r), i && Number.isInteger(i) && i > 0 && (t.tracksTotal ??= i);
					}
					break;
				case "TRACKTOTAL":
					{
						const e = Number.parseInt(c, 10);
						Number.isInteger(e) && e > 0 && (t.tracksTotal ??= e);
					}
					break;
				case "DISCNUMBER":
					{
						const e = c.split("/"), r = Number.parseInt(e[0], 10), i = e[1] && Number.parseInt(e[1], 10);
						Number.isInteger(r) && r > 0 && (t.discNumber ??= r), i && Number.isInteger(i) && i > 0 && (t.discsTotal ??= i);
					}
					break;
				case "DISCTOTAL":
					{
						const e = Number.parseInt(c, 10);
						Number.isInteger(e) && e > 0 && (t.discsTotal ??= e);
					}
					break;
				case "DATE":
					{
						const e = new Date(c);
						Number.isNaN(e.getTime()) || (t.date ??= e);
					}
					break;
				case "BPM":
					{
						const e = Number.parseInt(c, 10);
						Number.isInteger(e) && e > 0 && (t.beatsPerMinute ??= e);
					}
					break;
				case "GENRE":
					t.genre ??= c;
					break;
				case "METADATA_BLOCK_PICTURE": {
					const e = _e(c), r = E(e), i = r.getUint32(0, !1), a = r.getUint32(4, !1), s = String.fromCharCode(...e.subarray(8, 8 + a)), n = r.getUint32(8 + a, !1), o = B.decode(e.subarray(12 + a, 12 + a + n)), l = r.getUint32(a + n + 28), d = e.subarray(a + n + 32, a + n + 32 + l);
					t.images ??= [], t.images.push({
						data: d,
						mimeType: s,
						kind: 3 === i ? "coverFront" : 4 === i ? "coverBack" : "unknown",
						name: void 0,
						description: o || void 0
					});
				}
			}
		}
	}, Kt = [
		2,
		1,
		2,
		3,
		3,
		4,
		4,
		5
	], Xt = (e) => {
		if (e.length < 7) return null;
		if (11 !== e[0] || 119 !== e[1]) return null;
		const t = new Ke(e);
		t.skipBits(16), t.skipBits(16);
		const r = t.readBits(2);
		if (3 === r) return null;
		const i = t.readBits(6), a = t.readBits(5);
		if (a > 8) return null;
		const s = t.readBits(3), n = t.readBits(3);
		return 1 & n && 1 !== n && t.skipBits(2), 4 & n && t.skipBits(2), 2 === n && t.skipBits(2), {
			fscod: r,
			bsid: a,
			bsmod: s,
			acmod: n,
			lfeon: t.readBits(1),
			bitRateCode: Math.floor(i / 2)
		};
	}, Qt = [
		128,
		138,
		192,
		128,
		140,
		192,
		160,
		174,
		240,
		160,
		176,
		240,
		192,
		208,
		288,
		192,
		210,
		288,
		224,
		242,
		336,
		224,
		244,
		336,
		256,
		278,
		384,
		256,
		280,
		384,
		320,
		348,
		480,
		320,
		350,
		480,
		384,
		416,
		576,
		384,
		418,
		576,
		448,
		486,
		672,
		448,
		488,
		672,
		512,
		556,
		768,
		512,
		558,
		768,
		640,
		696,
		960,
		640,
		698,
		960,
		768,
		834,
		1152,
		768,
		836,
		1152,
		896,
		974,
		1344,
		896,
		976,
		1344,
		1024,
		1114,
		1536,
		1024,
		1116,
		1536,
		1280,
		1392,
		1920,
		1280,
		1394,
		1920,
		1536,
		1670,
		2304,
		1536,
		1672,
		2304,
		1792,
		1950,
		2688,
		1792,
		1952,
		2688,
		2048,
		2228,
		3072,
		2048,
		2230,
		3072,
		2304,
		2506,
		3456,
		2304,
		2508,
		3456,
		2560,
		2786,
		3840,
		2560,
		2788,
		3840
	], Gt = (new Uint8Array([
		5,
		4,
		65,
		67,
		45,
		51
	]), new Uint8Array([
		5,
		4,
		69,
		65,
		67,
		51
	]), [
		1,
		2,
		3,
		6
	]), Yt = (e) => {
		if (e.length < 6) return null;
		if (11 !== e[0] || 119 !== e[1]) return null;
		const t = new Ke(e);
		t.skipBits(16);
		const r = t.readBits(2);
		if (t.skipBits(3), 0 !== r && 2 !== r) return null;
		const i = t.readBits(11), a = t.readBits(2);
		let s, n = 0;
		3 === a ? (n = t.readBits(2), s = 3) : s = t.readBits(2);
		const o = t.readBits(3), c = t.readBits(1), l = t.readBits(5);
		if (l < 11 || l > 16) return null;
		const d = Gt[s];
		let u;
		return u = a < 3 ? it[a] / 1e3 : at[n] / 1e3, {
			dataRate: Math.round((i + 1) * u / (16 * d)),
			substreams: [{
				fscod: a,
				fscod2: n,
				bsid: l,
				bsmod: 0,
				acmod: o,
				lfeon: c,
				numDepSub: 0,
				chanLoc: 0
			}]
		};
	}, Zt = (e) => {
		const t = e.substreams[0];
		return c(t), t.fscod < 3 ? it[t.fscod] : null !== t.fscod2 && t.fscod2 < 3 ? at[t.fscod2] : null;
	}, Jt = (e) => {
		const t = e.substreams[0];
		c(t);
		let r = Kt[t.acmod] + t.lfeon;
		if (t.numDepSub > 0) {
			const e = [
				2,
				2,
				1,
				1,
				2,
				2,
				2,
				1,
				1
			];
			for (let i = 0; i < 9; i++) t.chanLoc & 1 << 8 - i && (r += e[i]);
		}
		return r;
	}, er = [
		0,
		8e3,
		16e3,
		32e3,
		0,
		0,
		11025,
		22050,
		44100,
		0,
		0,
		12e3,
		24e3,
		48e3,
		96e3,
		192e3
	], tr = [
		32e3,
		56e3,
		64e3,
		96e3,
		112e3,
		128e3,
		192e3,
		224e3,
		256e3,
		32e4,
		384e3,
		448e3,
		512e3,
		576e3,
		64e4,
		768e3,
		96e4,
		1024e3,
		1152e3,
		128e4,
		1344e3,
		1408e3,
		1411200,
		1472e3,
		1536e3,
		192e4,
		2048e3,
		3072e3,
		384e4,
		0,
		0,
		0
	], rr = [
		16,
		16,
		20,
		20,
		0,
		24,
		24,
		0
	], ir = [
		1,
		2,
		2,
		2,
		2,
		3,
		3,
		4,
		4,
		5,
		6,
		6,
		6,
		7,
		8,
		8
	], ar = [
		1,
		2,
		2,
		2,
		2,
		3,
		18,
		19,
		6,
		7,
		518,
		323,
		83,
		519,
		582,
		535
	], sr = [
		32e3,
		44100,
		48e3,
		0
	], nr = [
		8e3,
		16e3,
		32e3,
		64e3,
		128e3,
		22050,
		44100,
		88200,
		176400,
		352800,
		12e3,
		24e3,
		48e3,
		96e3,
		192e3,
		384e3
	], or = [
		512,
		1024,
		2048,
		4096
	], cr = (e) => {
		const t = dr(e), r = E(e);
		let i = t ? 4 * Math.ceil(t.frameSize / 4) : 0, a = null;
		for (; i + 4 <= e.length && 1683496997 === r.getUint32(i);) {
			const t = ur(e.subarray(i));
			if (!t) break;
			a ??= t, i += t.frameSize;
		}
		if (t) return {
			frameSize: a ? i : t.frameSize,
			sampleRate: t.sampleRate,
			numberOfChannels: t.numberOfChannels,
			sampleCount: t.sampleCount,
			channelLayout: t.channelLayout,
			pcmResolution: t.pcmResolution,
			bitRate: t.bitRate,
			core: t,
			hasExtensions: null !== a
		};
		if (!a?.asset) return null;
		const { asset: s } = a;
		return {
			frameSize: i,
			sampleRate: s.sampleRate,
			numberOfChannels: s.numberOfChannels,
			sampleCount: s.sampleCount,
			channelLayout: s.channelLayout,
			pcmResolution: s.pcmResolution,
			bitRate: 0,
			core: null,
			hasExtensions: !0
		};
	}, lr = (e) => {
		const t = cr(e);
		return t?.core ? t.hasExtensions ? "dtsh" : "dtsc" : null;
	}, dr = (e) => {
		if (e.length < 18) return null;
		if (127 !== e[0] || 254 !== e[1] || 128 !== e[2] || 1 !== e[3]) return null;
		const t = new Ke(e);
		if (t.skipBits(32), t.skipBits(1), 31 !== t.readBits(5)) return null;
		const r = t.readBits(1), i = t.readBits(7) + 1;
		if (i % 8 != 0) return null;
		const a = t.readBits(14) + 1;
		if (a < 96) return null;
		const s = t.readBits(6);
		if (s >= ir.length) return null;
		const n = er[t.readBits(4)];
		if (0 === n) return null;
		const o = tr[t.readBits(5)];
		if (0 !== t.readBits(1)) return null;
		t.skipBits(4), t.skipBits(5);
		const c = t.readBits(2);
		if (3 === c) return null;
		t.skipBits(1), r && t.skipBits(16), t.skipBits(7);
		const l = rr[t.readBits(3)];
		if (0 === l) return null;
		const d = 0 !== c;
		return {
			frameSize: a,
			sampleRate: n,
			numberOfChannels: ir[s] + (d ? 1 : 0),
			sampleCount: 32 * i,
			channelLayout: ar[s] | (d ? 8 : 0),
			amode: s,
			lfePresent: d,
			bitRate: o,
			pcmResolution: l
		};
	}, ur = (e) => {
		if (e.length < 10) return null;
		if (100 !== e[0] || 88 !== e[1] || 32 !== e[2] || 37 !== e[3]) return null;
		const t = new Ke(e);
		t.skipBits(32), t.skipBits(8);
		const r = t.readBits(2), i = t.readBits(1), a = 8 + 4 * i, s = 16 + 4 * i;
		t.skipBits(a);
		const n = t.readBits(s) + 1, o = {
			frameSize: n,
			asset: null
		};
		if (!t.readBits(1)) return o;
		const c = sr[t.readBits(2)], l = 512 * (t.readBits(3) + 1);
		t.readBits(1) && t.skipBits(36);
		const d = t.readBits(3) + 1, u = t.readBits(3) + 1, h = [];
		for (let k = 0; k < d; k++) h.push(t.readBits(r + 1));
		for (const k of h) t.skipBits(8 * ce(k));
		if (t.readBits(1)) {
			t.skipBits(2);
			const e = t.readBits(2) + 1 << 2, r = t.readBits(2) + 1;
			t.skipBits(r * e);
		}
		for (let k = 0; k < u; k++) t.skipBits(s);
		t.skipBits(9), t.skipBits(3), t.readBits(1) && t.skipBits(4), t.readBits(1) && t.skipBits(24), t.readBits(1) && t.skipBits(8 * (t.readBits(10) + 1));
		const f = t.readBits(5) + 1, m = nr[t.readBits(4)], p = t.readBits(8) + 1;
		let g = 0;
		if (t.readBits(1) && (p > 2 && t.skipBits(1), p > 6 && t.skipBits(1), t.readBits(1))) {
			const e = t.readBits(2) + 1 << 2;
			g = t.readBits(e);
		}
		return 0 === c || t.getBitsLeft() < 0 ? o : {
			frameSize: n,
			asset: {
				sampleRate: m,
				numberOfChannels: p,
				sampleCount: Math.round(l * m / c),
				channelLayout: g,
				pcmResolution: f
			}
		};
	}, hr = (e) => {
		const t = new Uint8Array(20), r = E(t);
		r.setUint32(0, e.sampleRate), r.setUint32(4, e.bitRate), r.setUint32(8, e.bitRate), t[12] = e.pcmResolution;
		const i = e.core && !e.hasExtensions ? 1 : 0, a = new Ke(t);
		return a.seekToByte(13), a.writeBits(2, Math.max(or.indexOf(e.sampleCount), 0)), a.writeBits(5, i), a.writeBits(1, e.core?.lfePresent ? 1 : 0), a.writeBits(6, e.core?.amode ?? 0), a.writeBits(14, e.core ? e.core.frameSize - 1 : 0), a.writeBits(1, 0), a.writeBits(3, 0), a.writeBits(16, e.channelLayout), a.writeBits(1, 0), a.writeBits(1, 0), a.writeBits(1, 0), a.writeBits(5, 0), t;
	}, fr = (e) => ce(e) + ce(44646 & e), mr = [
		"avc",
		"hevc",
		"vp9",
		"av1",
		"vp8",
		"prores"
	], pr = [
		"pcm-s16",
		"pcm-s16be",
		"pcm-s24",
		"pcm-s24be",
		"pcm-s32",
		"pcm-s32be",
		"pcm-f32",
		"pcm-f32be",
		"pcm-f64",
		"pcm-f64be",
		"pcm-u8",
		"pcm-s8",
		"ulaw",
		"alaw"
	], gr = [
		"aac",
		"opus",
		"mp3",
		"vorbis",
		"flac",
		"ac3",
		"eac3",
		"dts"
	], kr = [...gr, ...pr], wr = ["webvtt"], yr = [
		{
			maxMacroblocks: 99,
			maxBitrate: 64e3,
			maxDpbMbs: 396,
			level: 10
		},
		{
			maxMacroblocks: 396,
			maxBitrate: 192e3,
			maxDpbMbs: 900,
			level: 11
		},
		{
			maxMacroblocks: 396,
			maxBitrate: 384e3,
			maxDpbMbs: 2376,
			level: 12
		},
		{
			maxMacroblocks: 396,
			maxBitrate: 768e3,
			maxDpbMbs: 2376,
			level: 13
		},
		{
			maxMacroblocks: 396,
			maxBitrate: 2e6,
			maxDpbMbs: 2376,
			level: 20
		},
		{
			maxMacroblocks: 792,
			maxBitrate: 4e6,
			maxDpbMbs: 4752,
			level: 21
		},
		{
			maxMacroblocks: 1620,
			maxBitrate: 4e6,
			maxDpbMbs: 8100,
			level: 22
		},
		{
			maxMacroblocks: 1620,
			maxBitrate: 1e7,
			maxDpbMbs: 8100,
			level: 30
		},
		{
			maxMacroblocks: 3600,
			maxBitrate: 14e6,
			maxDpbMbs: 18e3,
			level: 31
		},
		{
			maxMacroblocks: 5120,
			maxBitrate: 2e7,
			maxDpbMbs: 20480,
			level: 32
		},
		{
			maxMacroblocks: 8192,
			maxBitrate: 2e7,
			maxDpbMbs: 32768,
			level: 40
		},
		{
			maxMacroblocks: 8192,
			maxBitrate: 5e7,
			maxDpbMbs: 32768,
			level: 41
		},
		{
			maxMacroblocks: 8704,
			maxBitrate: 5e7,
			maxDpbMbs: 34816,
			level: 42
		},
		{
			maxMacroblocks: 22080,
			maxBitrate: 135e6,
			maxDpbMbs: 110400,
			level: 50
		},
		{
			maxMacroblocks: 36864,
			maxBitrate: 24e7,
			maxDpbMbs: 184320,
			level: 51
		},
		{
			maxMacroblocks: 36864,
			maxBitrate: 24e7,
			maxDpbMbs: 184320,
			level: 52
		},
		{
			maxMacroblocks: 139264,
			maxBitrate: 24e7,
			maxDpbMbs: 696320,
			level: 60
		},
		{
			maxMacroblocks: 139264,
			maxBitrate: 48e7,
			maxDpbMbs: 696320,
			level: 61
		},
		{
			maxMacroblocks: 139264,
			maxBitrate: 8e8,
			maxDpbMbs: 696320,
			level: 62
		}
	], br = [
		{
			maxPictureSize: 36864,
			maxBitrate: 128e3,
			tier: "L",
			level: 30
		},
		{
			maxPictureSize: 122880,
			maxBitrate: 15e5,
			tier: "L",
			level: 60
		},
		{
			maxPictureSize: 245760,
			maxBitrate: 3e6,
			tier: "L",
			level: 63
		},
		{
			maxPictureSize: 552960,
			maxBitrate: 6e6,
			tier: "L",
			level: 90
		},
		{
			maxPictureSize: 983040,
			maxBitrate: 1e7,
			tier: "L",
			level: 93
		},
		{
			maxPictureSize: 2228224,
			maxBitrate: 12e6,
			tier: "L",
			level: 120
		},
		{
			maxPictureSize: 2228224,
			maxBitrate: 3e7,
			tier: "H",
			level: 120
		},
		{
			maxPictureSize: 2228224,
			maxBitrate: 2e7,
			tier: "L",
			level: 123
		},
		{
			maxPictureSize: 2228224,
			maxBitrate: 5e7,
			tier: "H",
			level: 123
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 25e6,
			tier: "L",
			level: 150
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 1e8,
			tier: "H",
			level: 150
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 4e7,
			tier: "L",
			level: 153
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 16e7,
			tier: "H",
			level: 153
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 6e7,
			tier: "L",
			level: 156
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 24e7,
			tier: "H",
			level: 156
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 6e7,
			tier: "L",
			level: 180
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 24e7,
			tier: "H",
			level: 180
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 12e7,
			tier: "L",
			level: 183
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 48e7,
			tier: "H",
			level: 183
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 24e7,
			tier: "L",
			level: 186
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 8e8,
			tier: "H",
			level: 186
		}
	], Tr = [
		{
			maxPictureSize: 36864,
			maxBitrate: 2e5,
			level: 10
		},
		{
			maxPictureSize: 73728,
			maxBitrate: 8e5,
			level: 11
		},
		{
			maxPictureSize: 122880,
			maxBitrate: 18e5,
			level: 20
		},
		{
			maxPictureSize: 245760,
			maxBitrate: 36e5,
			level: 21
		},
		{
			maxPictureSize: 552960,
			maxBitrate: 72e5,
			level: 30
		},
		{
			maxPictureSize: 983040,
			maxBitrate: 12e6,
			level: 31
		},
		{
			maxPictureSize: 2228224,
			maxBitrate: 18e6,
			level: 40
		},
		{
			maxPictureSize: 2228224,
			maxBitrate: 3e7,
			level: 41
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 6e7,
			level: 50
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 12e7,
			level: 51
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 18e7,
			level: 52
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 18e7,
			level: 60
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 24e7,
			level: 61
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 48e7,
			level: 62
		}
	], vr = [
		{
			maxPictureSize: 147456,
			maxBitrate: 15e5,
			tier: "M",
			level: 0
		},
		{
			maxPictureSize: 278784,
			maxBitrate: 3e6,
			tier: "M",
			level: 1
		},
		{
			maxPictureSize: 665856,
			maxBitrate: 6e6,
			tier: "M",
			level: 4
		},
		{
			maxPictureSize: 1065024,
			maxBitrate: 1e7,
			tier: "M",
			level: 5
		},
		{
			maxPictureSize: 2359296,
			maxBitrate: 12e6,
			tier: "M",
			level: 8
		},
		{
			maxPictureSize: 2359296,
			maxBitrate: 3e7,
			tier: "H",
			level: 8
		},
		{
			maxPictureSize: 2359296,
			maxBitrate: 2e7,
			tier: "M",
			level: 9
		},
		{
			maxPictureSize: 2359296,
			maxBitrate: 5e7,
			tier: "H",
			level: 9
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 3e7,
			tier: "M",
			level: 12
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 1e8,
			tier: "H",
			level: 12
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 4e7,
			tier: "M",
			level: 13
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 16e7,
			tier: "H",
			level: 13
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 6e7,
			tier: "M",
			level: 14
		},
		{
			maxPictureSize: 8912896,
			maxBitrate: 24e7,
			tier: "H",
			level: 14
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 6e7,
			tier: "M",
			level: 15
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 24e7,
			tier: "H",
			level: 15
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 6e7,
			tier: "M",
			level: 16
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 24e7,
			tier: "H",
			level: 16
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 1e8,
			tier: "M",
			level: 17
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 48e7,
			tier: "H",
			level: 17
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 16e7,
			tier: "M",
			level: 18
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 8e8,
			tier: "H",
			level: 18
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 16e7,
			tier: "M",
			level: 19
		},
		{
			maxPictureSize: 35651584,
			maxBitrate: 8e8,
			tier: "H",
			level: 19
		}
	], Sr = [
		"ap4x",
		"ap4h",
		"apch",
		"apcn",
		"apcs",
		"apco"
	], Pr = [
		"dtsc",
		"dtsh",
		"dtsl",
		"dtse"
	], xr = [
		{
			fourCc: "apco",
			bitrate: 45e6,
			alpha: !1
		},
		{
			fourCc: "apcs",
			bitrate: 102e6,
			alpha: !1
		},
		{
			fourCc: "apcn",
			bitrate: 147e6,
			alpha: !1
		},
		{
			fourCc: "apch",
			bitrate: 22e7,
			alpha: !1
		},
		{
			fourCc: "ap4h",
			bitrate: 33e7,
			alpha: !0
		},
		{
			fourCc: "ap4x",
			bitrate: 5e8,
			alpha: !0
		}
	], Cr = (e, t, r, i, a) => {
		if ("avc" === e) {
			const e = 100, a = Math.ceil(t / 16) * Math.ceil(r / 16), s = yr.find((e) => a <= e.maxMacroblocks && i <= e.maxBitrate) ?? T(yr), n = s ? s.level : 0;
			return `avc1.${e.toString(16).padStart(2, "0")}00${n.toString(16).padStart(2, "0")}`;
		}
		if ("hevc" === e) {
			const e = "", a = 1, s = "6", n = t * r, o = br.find((e) => n <= e.maxPictureSize && i <= e.maxBitrate) ?? T(br);
			return `hev1.${e}${a}.${s}.${o.tier}${o.level}.B0`;
		}
		if ("vp8" === e) return "vp8";
		if ("vp9" === e) {
			const e = t * r;
			return `vp09.00.${(Tr.find((t) => e <= t.maxPictureSize && i <= t.maxBitrate) ?? T(Tr)).level.toString().padStart(2, "0")}.08`;
		}
		if ("av1" === e) {
			const e = 0, a = t * r, s = vr.find((e) => a <= e.maxPictureSize && i <= e.maxBitrate) ?? T(vr);
			return `av01.${e}.${s.level.toString().padStart(2, "0")}${s.tier}.08`;
		}
		if ("prores" === e) {
			const e = Math.pow(t * r / 2073600, .95), s = xr.filter((e) => e.alpha === a);
			let n = s[0].fourCc, o = Infinity;
			for (const { fourCc: t, bitrate: r } of s) {
				const a = Math.abs(r * e - i);
				a < o && (o = a, n = t);
			}
			return n;
		}
		throw J(e), /* @__PURE__ */ new TypeError(`Unhandled codec '${String(e)}'.`);
	}, Er = (e) => {
		const { codec: t, codecDescription: r, colorSpace: i, avcCodecInfo: a, hevcCodecInfo: s, vp9CodecInfo: n, av1CodecInfo: o, proresFormat: l } = e;
		if ("avc" === t) {
			if (c(null !== e.avcType), a) {
				const t = new Uint8Array([
					a.avcProfileIndication,
					a.profileCompatibility,
					a.avcLevelIndication
				]);
				return `avc${e.avcType}.${H(t)}`;
			}
			if (!r || r.byteLength < 4) throw new TypeError("AVC decoder description is not provided or is not at least 4 bytes long.");
			return `avc${e.avcType}.${H(r.subarray(1, 4))}`;
		}
		if ("hevc" === t) {
			let e, t, i, a, n, o;
			if (s) e = s.generalProfileSpace, t = s.generalProfileIdc, i = j(s.generalProfileCompatibilityFlags), a = s.generalTierFlag, n = s.generalLevelIdc, o = [...s.generalConstraintIndicatorFlags];
			else {
				if (!r || r.byteLength < 23) throw new TypeError("HEVC decoder description is not provided or is not at least 23 bytes long.");
				const s = E(r), c = s.getUint8(1);
				e = c >> 6 & 3, t = 31 & c, i = j(s.getUint32(2)), a = c >> 5 & 1, n = s.getUint8(12), o = [];
				for (let e = 0; e < 6; e++) o.push(s.getUint8(6 + e));
			}
			let c = "hev1.";
			for (c += [
				"",
				"A",
				"B",
				"C"
			][e] + t, c += ".", c += i.toString(16).toUpperCase(), c += ".", c += 0 === a ? "L" : "H", c += n; o.length > 0 && 0 === o[o.length - 1];) o.pop();
			return o.length > 0 && (c += ".", c += o.map((e) => e.toString(16).toUpperCase()).join(".")), c;
		}
		if ("vp8" === t) return "vp8";
		if ("vp9" === t) {
			if (!n) {
				const t = e.width * e.height;
				let r = T(Tr).level;
				for (const e of Tr) if (t <= e.maxPictureSize) {
					r = e.level;
					break;
				}
				return `vp09.00.${r.toString().padStart(2, "0")}.08`;
			}
			let t = `vp09.${n.profile.toString().padStart(2, "0")}.${n.level.toString().padStart(2, "0")}.${n.bitDepth.toString().padStart(2, "0")}.${n.chromaSubsampling.toString().padStart(2, "0")}`;
			return t += `.${n.colourPrimaries.toString().padStart(2, "0")}.${n.transferCharacteristics.toString().padStart(2, "0")}.${n.matrixCoefficients.toString().padStart(2, "0")}.${n.videoFullRangeFlag.toString().padStart(2, "0")}`, t.endsWith(".01.01.01.01.00") && (t = t.slice(0, -15)), t;
		}
		if ("av1" === t) {
			if (!o) {
				const t = e.width * e.height;
				let r = T(Tr).level;
				for (const e of Tr) if (t <= e.maxPictureSize) {
					r = e.level;
					break;
				}
				return `av01.0.${r.toString().padStart(2, "0")}M.08`;
			}
			const t = o.profile, r = o.level.toString().padStart(2, "0"), a = o.tier ? "H" : "M", s = o.bitDepth.toString().padStart(2, "0"), n = o.monochrome ? "1" : "0", c = 100 * o.chromaSubsamplingX + 10 * o.chromaSubsamplingY + 1 * (o.chromaSubsamplingX && o.chromaSubsamplingY ? o.chromaSamplePosition : 0), l = i?.primaries ? F[i.primaries] : 1, d = i?.transfer ? D[i.transfer] : 1, u = i?.matrix ? z[i.matrix] : 1, h = i?.fullRange ? 1 : 0;
			let f = `av01.${t}.${r}${a}.${s}`;
			return f += `.${n}.${c.toString().padStart(3, "0")}`, f += `.${l.toString().padStart(2, "0")}`, f += `.${d.toString().padStart(2, "0")}`, f += `.${u.toString().padStart(2, "0")}`, f += `.${h}`, f.endsWith(".0.110.01.01.01.0") && (f = f.slice(0, -17)), f;
		}
		if ("prores" === t) return l ?? "apch";
		throw null !== t && J(t), /* @__PURE__ */ new TypeError(`Unhandled codec '${t}'.`);
	}, _r = (e) => {
		switch (e.codec) {
			case "avc":
				{
					let t = e.avcCodecInfo?.sequenceParameterSets[0];
					if (!t && e.codecDescription && (t = wt(e.codecDescription)?.sequenceParameterSets[0]), t) {
						const e = bt(t);
						if (e) return {
							primaries: M[e.colourPrimaries],
							transfer: O[e.transferCharacteristics],
							matrix: N[e.matrixCoefficients],
							fullRange: !!e.fullRangeFlag
						};
					}
				}
				break;
			case "hevc":
				{
					let t = e.hevcCodecInfo?.arrays.find((e) => e.nalUnitType === ot.SPS_NUT)?.nalUnits[0];
					if (!t && e.codecDescription && (t = ((e) => {
						try {
							const t = E(e);
							let r = 0;
							const i = t.getUint8(r++), a = t.getUint8(r++), s = a >> 6 & 3, n = a >> 5 & 1, o = 31 & a, c = t.getUint32(r, !1);
							r += 4;
							const l = e.subarray(r, r + 6);
							r += 6;
							const d = t.getUint8(r++), u = (15 & t.getUint8(r++)) << 8 | t.getUint8(r++), h = 3 & t.getUint8(r++), f = 3 & t.getUint8(r++), m = 7 & t.getUint8(r++), p = 7 & t.getUint8(r++), g = t.getUint16(r, !1);
							r += 2;
							const k = t.getUint8(r++), w = k >> 6 & 3, y = k >> 3 & 7, b = k >> 2 & 1, T = 3 & k, v = t.getUint8(r++), S = [];
							for (let P = 0; P < v; P++) {
								const i = t.getUint8(r++), a = i >> 7 & 1, s = 63 & i, n = t.getUint16(r, !1);
								r += 2;
								const o = [];
								for (let c = 0; c < n; c++) {
									const i = t.getUint16(r, !1);
									r += 2, o.push(e.subarray(r, r + i)), r += i;
								}
								S.push({
									arrayCompleteness: a,
									nalUnitType: s,
									nalUnits: o
								});
							}
							return {
								configurationVersion: i,
								generalProfileSpace: s,
								generalTierFlag: n,
								generalProfileIdc: o,
								generalProfileCompatibilityFlags: c,
								generalConstraintIndicatorFlags: l,
								generalLevelIdc: d,
								minSpatialSegmentationIdc: u,
								parallelismType: h,
								chromaFormatIdc: f,
								bitDepthLumaMinus8: m,
								bitDepthChromaMinus8: p,
								avgFrameRate: g,
								constantFrameRate: w,
								numTemporalLayers: y,
								temporalIdNested: b,
								lengthSizeMinusOne: T,
								arrays: S
							};
						} catch (t) {
							return qe._error("Error deserializing HEVC Decoder Configuration Record:", t), null;
						}
					})(e.codecDescription)?.arrays.find((e) => e.nalUnitType === ot.SPS_NUT)?.nalUnits[0]), t) {
						const e = xt(t);
						if (e) return {
							primaries: M[e.colourPrimaries],
							transfer: O[e.transferCharacteristics],
							matrix: N[e.matrixCoefficients],
							fullRange: !!e.fullRangeFlag
						};
					}
				}
				break;
			case "vp8": break;
			case "vp9":
				if (e.vp9CodecInfo) return {
					primaries: M[e.vp9CodecInfo.colourPrimaries],
					transfer: O[e.vp9CodecInfo.transferCharacteristics],
					matrix: N[e.vp9CodecInfo.matrixCoefficients],
					fullRange: !!e.vp9CodecInfo.videoFullRangeFlag
				};
				break;
			case "av1":
				if (e.av1CodecInfo) return {
					primaries: M[e.av1CodecInfo.colourPrimaries],
					transfer: O[e.av1CodecInfo.transferCharacteristics],
					matrix: N[e.av1CodecInfo.matrixCoefficients],
					fullRange: !!e.av1CodecInfo.videoFullRangeFlag
				};
				break;
			case "prores": if (e.proresCodecInfo) return {
				primaries: M[e.proresCodecInfo.colourPrimaries],
				transfer: O[e.proresCodecInfo.transferCharacteristics],
				matrix: N[e.proresCodecInfo.matrixCoefficients],
				fullRange: e.proresCodecInfo.fullRange
			};
		}
		return {
			primaries: void 0,
			transfer: void 0,
			matrix: void 0,
			fullRange: void 0
		};
	}, Ir = (e, t, r) => {
		if ("aac" === e) return t >= 2 && r <= 24e3 ? "mp4a.40.29" : r <= 24e3 ? "mp4a.40.5" : "mp4a.40.2";
		if ("mp3" === e) return "mp3";
		if ("opus" === e) return "opus";
		if ("vorbis" === e) return "vorbis";
		if ("flac" === e) return "flac";
		if ("ac3" === e) return "ac-3";
		if ("eac3" === e) return "ec-3";
		if ("dts" === e) return "dtsc";
		if (pr.includes(e)) return e;
		throw new TypeError(`Unhandled codec '${e}'.`);
	}, Br = (e) => {
		const { codec: t, codecDescription: r, aacCodecInfo: i, dtsFormat: a } = e;
		if ("aac" === t) {
			if (!i) throw new TypeError("AAC codec info must be provided.");
			if (i.isMpeg2) return "mp4a.67";
			{
				let e;
				return e = null !== i.objectType ? i.objectType : Ge(r).objectType, `mp4a.40.${e}`;
			}
		}
		if ("mp3" === t) return "mp3";
		if ("opus" === t) return "opus";
		if ("vorbis" === t) return "vorbis";
		if ("flac" === t) return "flac";
		if ("ac3" === t) return "ac-3";
		if ("eac3" === t) return "ec-3";
		if ("dts" === t) return a ?? "dtsc";
		if (t && pr.includes(t)) return t;
		throw new TypeError(`Unhandled codec '${t}'.`);
	}, Ar = 48e3, Rr = /^pcm-([usf])(\d+)(be)?$/, Fr = (e) => {
		if (c(pr.includes(e)), "ulaw" === e) return {
			dataType: "ulaw",
			sampleSize: 1,
			littleEndian: !0,
			silentValue: 255
		};
		if ("alaw" === e) return {
			dataType: "alaw",
			sampleSize: 1,
			littleEndian: !0,
			silentValue: 213
		};
		const t = Rr.exec(e);
		let r;
		c(t), r = "u" === t[1] ? "unsigned" : "s" === t[1] ? "signed" : "float";
		return {
			dataType: r,
			sampleSize: Number(t[2]) / 8,
			littleEndian: "be" !== t[3],
			silentValue: "pcm-u8" === e ? 128 : 0
		};
	}, Mr = (e) => e.startsWith("avc1") || e.startsWith("avc3") ? "avc" : e.startsWith("hev1") || e.startsWith("hvc1") ? "hevc" : "vp8" === e ? "vp8" : e.startsWith("vp09") ? "vp9" : e.startsWith("av01") ? "av1" : Sr.includes(e) ? "prores" : "mp3" === e || "mp4a.69" === e || "mp4a.6B" === e || "mp4a.6b" === e || "mp4a.40.34" === e ? "mp3" : e.startsWith("mp4a.40.") || "mp4a.67" === e ? "aac" : "opus" === e || "Opus" === e ? "opus" : "vorbis" === e ? "vorbis" : "flac" === e ? "flac" : "ac-3" === e || "ac3" === e ? "ac3" : "ec-3" === e || "eac3" === e ? "eac3" : Pr.includes(e) ? "dts" : "ulaw" === e ? "ulaw" : "alaw" === e ? "alaw" : Rr.test(e) ? e : "webvtt" === e ? "webvtt" : null, Dr = [
		"avc1",
		"avc3",
		"hev1",
		"hvc1",
		"vp8",
		"vp09",
		"av01",
		...Sr
	], Or = /^(avc1|avc3)\.[0-9a-fA-F]{6}$/, zr = /^(hev1|hvc1)\.(?:[ABC]?\d+)\.[0-9a-fA-F]{1,8}\.[LH]\d+(?:\.[0-9a-fA-F]{1,2}){0,6}$/, Nr = /^vp09(?:\.\d{2}){3}(?:(?:\.\d{2}){5})?$/, Ur = /^av01\.\d\.\d{2}[MH]\.\d{2}(?:\.\d\.\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d)?$/, Lr = (e, t) => {
		if (!e) throw new TypeError("Video chunk metadata must be provided.");
		if ("object" != typeof e) throw new TypeError("Video chunk metadata must be an object.");
		if (!e.decoderConfig) throw new TypeError("Video chunk metadata must include a decoder configuration.");
		if ("object" != typeof e.decoderConfig) throw new TypeError("Video chunk metadata decoder configuration must be an object.");
		if ("string" != typeof e.decoderConfig.codec) throw new TypeError("Video chunk metadata decoder configuration must specify a codec string.");
		if (!Dr.some((t) => e.decoderConfig.codec.startsWith(t))) throw new TypeError("Video chunk metadata decoder configuration codec string must be a valid video codec string as specified in the Mediabunny Codec Registry.");
		if (!Number.isInteger(e.decoderConfig.codedWidth) || e.decoderConfig.codedWidth <= 0) throw new TypeError("Video chunk metadata decoder configuration must specify a valid codedWidth (positive integer).");
		if (!Number.isInteger(e.decoderConfig.codedHeight) || e.decoderConfig.codedHeight <= 0) throw new TypeError("Video chunk metadata decoder configuration must specify a valid codedHeight (positive integer).");
		if (void 0 !== e.decoderConfig.displayAspectWidth && (!Number.isInteger(e.decoderConfig.displayAspectWidth) || e.decoderConfig.displayAspectWidth <= 0)) throw new TypeError("Video chunk metadata decoder configuration displayAspectWidth, when defined, must be a positive integer.");
		if (void 0 !== e.decoderConfig.displayAspectHeight && (!Number.isInteger(e.decoderConfig.displayAspectHeight) || e.decoderConfig.displayAspectHeight <= 0)) throw new TypeError("Video chunk metadata decoder configuration displayAspectHeight, when defined, must be a positive integer.");
		if (void 0 !== e.decoderConfig.displayAspectWidth != (void 0 !== e.decoderConfig.displayAspectHeight)) throw new TypeError("Video chunk metadata decoder configuration must specify both displayAspectWidth and displayAspectHeight, or neither.");
		if (void 0 !== e.decoderConfig.description && !W(e.decoderConfig.description)) throw new TypeError("Video chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");
		if (void 0 !== e.decoderConfig.colorSpace) {
			const { colorSpace: t } = e.decoderConfig;
			if ("object" != typeof t) throw new TypeError("Video chunk metadata decoder configuration colorSpace, when provided, must be an object.");
			const r = Object.keys(F);
			if (null != t.primaries && !r.includes(t.primaries)) throw new TypeError(`Video chunk metadata decoder configuration colorSpace primaries, when defined, must be one of ${r.join(", ")}.`);
			const i = Object.keys(D);
			if (null != t.transfer && !i.includes(t.transfer)) throw new TypeError(`Video chunk metadata decoder configuration colorSpace transfer, when defined, must be one of ${i.join(", ")}.`);
			const a = Object.keys(z);
			if (null != t.matrix && !a.includes(t.matrix)) throw new TypeError(`Video chunk metadata decoder configuration colorSpace matrix, when defined, must be one of ${a.join(", ")}.`);
			if (null != t.fullRange && "boolean" != typeof t.fullRange) throw new TypeError("Video chunk metadata decoder configuration colorSpace fullRange, when defined, must be a boolean.");
		}
		if (e.decoderConfig.codec.startsWith("avc1") || e.decoderConfig.codec.startsWith("avc3")) {
			if (!Or.test(e.decoderConfig.codec)) throw new TypeError("Video chunk metadata decoder configuration codec string for AVC must be a valid AVC codec string as specified in Section 3.4 of RFC 6381.");
		} else if (e.decoderConfig.codec.startsWith("hev1") || e.decoderConfig.codec.startsWith("hvc1")) {
			if (!zr.test(e.decoderConfig.codec)) throw new TypeError("Video chunk metadata decoder configuration codec string for HEVC must be a valid HEVC codec string as specified in Section E.3 of ISO 14496-15.");
		} else if (e.decoderConfig.codec.startsWith("vp8")) {
			if ("vp8" !== e.decoderConfig.codec) throw new TypeError("Video chunk metadata decoder configuration codec string for VP8 must be \"vp8\".");
		} else if (e.decoderConfig.codec.startsWith("vp09")) {
			if (!Nr.test(e.decoderConfig.codec)) throw new TypeError("Video chunk metadata decoder configuration codec string for VP9 must be a valid VP9 codec string as specified in Section \"Codecs Parameter String\" of https://www.webmproject.org/vp9/mp4/.");
		} else if (e.decoderConfig.codec.startsWith("av01")) {
			if (!Ur.test(e.decoderConfig.codec)) throw new TypeError("Video chunk metadata decoder configuration codec string for AV1 must be a valid AV1 codec string as specified in Section \"Codecs Parameter String\" of https://aomediacodec.github.io/av1-isobmff/.");
		} else if (Sr.some((t) => e.decoderConfig.codec.startsWith(t)) && !Sr.some((t) => e.decoderConfig.codec === t)) throw new TypeError(`Video chunk metadata decoder configuration codec string for ProRes must be one of the valid ProRes four-character codes: ${Sr.join(", ")}.`);
		if (null !== t && Mr(e.decoderConfig.codec) !== t) throw new TypeError(`Video chunk metadata decoder configuration codec string '${e.decoderConfig.codec}' does not fit to the track codec '${t}'.`);
	}, Wr = [
		"mp4a",
		"mp3",
		"opus",
		"vorbis",
		"flac",
		"ulaw",
		"alaw",
		"pcm",
		"ac-3",
		"ec-3",
		"dts"
	], qr = (e, t) => {
		if (!e) throw new TypeError("Audio chunk metadata must be provided.");
		if ("object" != typeof e) throw new TypeError("Audio chunk metadata must be an object.");
		if (!e.decoderConfig) throw new TypeError("Audio chunk metadata must include a decoder configuration.");
		if ("object" != typeof e.decoderConfig) throw new TypeError("Audio chunk metadata decoder configuration must be an object.");
		if ("string" != typeof e.decoderConfig.codec) throw new TypeError("Audio chunk metadata decoder configuration must specify a codec string.");
		if (!Wr.some((t) => e.decoderConfig.codec.startsWith(t))) throw new TypeError("Audio chunk metadata decoder configuration codec string must be a valid audio codec string as specified in the Mediabunny Codec Registry.");
		if (!Number.isInteger(e.decoderConfig.sampleRate) || e.decoderConfig.sampleRate <= 0) throw new TypeError("Audio chunk metadata decoder configuration must specify a valid sampleRate (positive integer).");
		if (!Number.isInteger(e.decoderConfig.numberOfChannels) || e.decoderConfig.numberOfChannels <= 0) throw new TypeError("Audio chunk metadata decoder configuration must specify a valid numberOfChannels (positive integer).");
		if (void 0 !== e.decoderConfig.description && !W(e.decoderConfig.description)) throw new TypeError("Audio chunk metadata decoder configuration description, when defined, must be an ArrayBuffer or an ArrayBuffer view.");
		if (e.decoderConfig.codec.startsWith("mp4a") && "mp4a.69" !== e.decoderConfig.codec && "mp4a.6B" !== e.decoderConfig.codec && "mp4a.6b" !== e.decoderConfig.codec) {
			if (![
				"mp4a.40.2",
				"mp4a.40.02",
				"mp4a.40.5",
				"mp4a.40.05",
				"mp4a.40.29",
				"mp4a.67"
			].includes(e.decoderConfig.codec)) throw new TypeError("Audio chunk metadata decoder configuration codec string for AAC must be a valid AAC codec string as specified in https://www.w3.org/TR/webcodecs-aac-codec-registration/.");
		} else if (e.decoderConfig.codec.startsWith("mp3") || e.decoderConfig.codec.startsWith("mp4a")) {
			if ("mp3" !== e.decoderConfig.codec && "mp4a.69" !== e.decoderConfig.codec && "mp4a.6B" !== e.decoderConfig.codec && "mp4a.6b" !== e.decoderConfig.codec) throw new TypeError("Audio chunk metadata decoder configuration codec string for MP3 must be \"mp3\", \"mp4a.69\" or \"mp4a.6B\".");
		} else if (e.decoderConfig.codec.startsWith("opus")) {
			if ("opus" !== e.decoderConfig.codec) throw new TypeError("Audio chunk metadata decoder configuration codec string for Opus must be \"opus\".");
			if (e.decoderConfig.description && e.decoderConfig.description.byteLength < 18) throw new TypeError("Audio chunk metadata decoder configuration description, when specified, is expected to be an Identification Header as specified in Section 5.1 of RFC 7845.");
		} else if (e.decoderConfig.codec.startsWith("vorbis")) {
			if ("vorbis" !== e.decoderConfig.codec) throw new TypeError("Audio chunk metadata decoder configuration codec string for Vorbis must be \"vorbis\".");
			if (!e.decoderConfig.description) throw new TypeError("Audio chunk metadata decoder configuration for Vorbis must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-vorbis-codec-registration/.");
		} else if (e.decoderConfig.codec.startsWith("flac")) {
			if ("flac" !== e.decoderConfig.codec) throw new TypeError("Audio chunk metadata decoder configuration codec string for FLAC must be \"flac\".");
			if (!e.decoderConfig.description || e.decoderConfig.description.byteLength < 42) throw new TypeError("Audio chunk metadata decoder configuration for FLAC must include a description, which is expected to adhere to the format described in https://www.w3.org/TR/webcodecs-flac-codec-registration/.");
		} else if (e.decoderConfig.codec.startsWith("ac-3") || e.decoderConfig.codec.startsWith("ac3")) {
			if ("ac-3" !== e.decoderConfig.codec) throw new TypeError("Audio chunk metadata decoder configuration codec string for AC-3 must be \"ac-3\".");
		} else if (e.decoderConfig.codec.startsWith("ec-3") || e.decoderConfig.codec.startsWith("eac3")) {
			if ("ec-3" !== e.decoderConfig.codec) throw new TypeError("Audio chunk metadata decoder configuration codec string for EC-3 must be \"ec-3\".");
		} else if (e.decoderConfig.codec.startsWith("dts")) {
			if (!Pr.includes(e.decoderConfig.codec)) throw new TypeError(`Audio chunk metadata decoder configuration codec string for DTS must be one of the following four-character codes: ${Pr.join(", ")}.`);
		} else if ((e.decoderConfig.codec.startsWith("pcm") || e.decoderConfig.codec.startsWith("ulaw") || e.decoderConfig.codec.startsWith("alaw")) && !pr.includes(e.decoderConfig.codec)) throw new TypeError(`Audio chunk metadata decoder configuration codec string for PCM must be one of the supported PCM codecs (${pr.join(", ")}).`);
		if (null !== t && Mr(e.decoderConfig.codec) !== t) throw new TypeError(`Audio chunk metadata decoder configuration codec string '${e.decoderConfig.codec}' does not fit to the track codec '${t}'.`);
	}, Vr = [
		44100,
		48e3,
		32e3
	], Hr = [
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		32,
		40,
		48,
		56,
		64,
		80,
		96,
		112,
		128,
		160,
		192,
		224,
		256,
		320,
		-1,
		-1,
		32,
		48,
		56,
		64,
		80,
		96,
		112,
		128,
		160,
		192,
		224,
		256,
		320,
		384,
		-1,
		-1,
		32,
		64,
		96,
		128,
		160,
		192,
		224,
		256,
		288,
		320,
		352,
		384,
		416,
		448,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		-1,
		8,
		16,
		24,
		32,
		40,
		48,
		56,
		64,
		80,
		96,
		112,
		128,
		144,
		160,
		-1,
		-1,
		8,
		16,
		24,
		32,
		40,
		48,
		56,
		64,
		80,
		96,
		112,
		128,
		144,
		160,
		-1,
		-1,
		32,
		48,
		56,
		64,
		80,
		96,
		112,
		128,
		144,
		160,
		176,
		192,
		224,
		256,
		-1
	], jr = (e, t) => 3 === e ? 3 === t ? 21 : 36 : 3 === t ? 13 : 21, $r = (e, t) => {
		const r = e >>> 24, i = e >>> 16 & 255, a = e >>> 8 & 255, s = 255 & e;
		if (255 !== r && 255 !== i && 255 !== a && 255 !== s) return {
			header: null,
			bytesAdvanced: 4
		};
		if (255 !== r) return {
			header: null,
			bytesAdvanced: 1
		};
		if (224 & ~i) return {
			header: null,
			bytesAdvanced: 1
		};
		let n = 0, o = 0;
		16 & i ? n = 8 & i ? 0 : 1 : (n = 1, o = 1);
		const c = i >> 3 & 3, l = i >> 1 & 3, d = (a >> 2 & 3) % 3, u = s >> 6 & 3, h = s >> 4 & 3, f = s >> 3 & 1, m = s >> 2 & 1, p = 3 & s, g = Hr[16 * n * 4 + 16 * l + (a >> 4 & 15)];
		if (-1 === g) return {
			header: null,
			bytesAdvanced: 1
		};
		const k = 1e3 * g, w = Vr[d] >> n + o, y = ((e, t, r, i, a) => 0 === t ? 0 : 1 === t ? Math.floor(144 * r / (i << e)) + a : 2 === t ? Math.floor(144 * r / i) + a : 4 * (Math.floor(12 * r / i) + a))(n, l, k, w, a >> 1 & 1);
		if (null !== t && t < y) return {
			header: null,
			bytesAdvanced: 1
		};
		let b;
		return b = 3 === c ? 3 === l ? 384 : 1152 : 3 === l ? 384 : 2 === l ? 1152 : 576, {
			header: {
				totalSize: y,
				mpegVersionId: c,
				lowSamplingFrequency: n,
				layer: l,
				bitrate: k,
				frequencyIndex: d,
				sampleRate: w,
				channel: u,
				modeExtension: h,
				copyright: f,
				original: m,
				emphasis: p,
				audioSamplesInFrame: b
			},
			bytesAdvanced: 1
		};
	}, Kr = (e) => {
		let t = 2130706432, r = 0;
		for (; 0 !== t;) r >>= 1, r |= e & t, t >>= 8;
		return r;
	};
	var Xr;
	(function(e) {
		e[e.FrameCount = 1] = "FrameCount", e[e.FileSize = 2] = "FileSize", e[e.Toc = 4] = "Toc";
	})(Xr || (Xr = {}));
	const Qr = (e) => 3 === e ? 1 : 2;
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/ var Gr = class {
		constructor(e) {
			this.input = e;
		}
		dispose() {}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/ const Yr = new Uint8Array(0);
	var Zr = class e {
		constructor(e, t, r, i, a = -1, s, n) {
			if (this.data = e, this.type = t, this.timestamp = r, this.duration = i, this.sequenceNumber = a, e === Yr && void 0 === s) throw new Error("Internal error: byteLength must be explicitly provided when constructing metadata-only packets.");
			if (void 0 === s && (s = e.byteLength), !(e instanceof Uint8Array)) throw new TypeError("data must be a Uint8Array.");
			if ("key" !== t && "delta" !== t) throw new TypeError("type must be either \"key\" or \"delta\".");
			if (!Number.isFinite(r)) throw new TypeError("timestamp must be a number.");
			if (!Number.isFinite(i) || i < 0) throw new TypeError("duration must be a non-negative number.");
			if (!Number.isFinite(a)) throw new TypeError("sequenceNumber must be a number.");
			if (!Number.isInteger(s) || s < 0) throw new TypeError("byteLength must be a non-negative integer.");
			if (void 0 !== n && ("object" != typeof n || !n)) throw new TypeError("sideData, when provided, must be an object.");
			if (void 0 !== n?.alpha && !(n.alpha instanceof Uint8Array)) throw new TypeError("sideData.alpha, when provided, must be a Uint8Array.");
			if (void 0 !== n?.alphaByteLength && (!Number.isInteger(n.alphaByteLength) || n.alphaByteLength < 0)) throw new TypeError("sideData.alphaByteLength, when provided, must be a non-negative integer.");
			this.byteLength = s, this.sideData = n ?? {}, this.sideData.alpha && void 0 === this.sideData.alphaByteLength && (this.sideData.alphaByteLength = this.sideData.alpha.byteLength);
		}
		get isMetadataOnly() {
			return this.data === Yr;
		}
		get microsecondTimestamp() {
			return Math.trunc(ue * this.timestamp);
		}
		get microsecondDuration() {
			return Math.trunc(ue * this.duration);
		}
		toEncodedVideoChunk() {
			if (this.isMetadataOnly) throw new TypeError("Metadata-only packets cannot be converted to a video chunk.");
			if ("undefined" == typeof EncodedVideoChunk) throw new Error("EncodedVideoChunk is not available in this environment.");
			return new EncodedVideoChunk({
				data: this.data,
				type: this.type,
				timestamp: this.microsecondTimestamp,
				duration: this.microsecondDuration
			});
		}
		alphaToEncodedVideoChunk(e = this.type) {
			if (!this.sideData.alpha) throw new TypeError("This packet does not contain alpha side data.");
			if (this.isMetadataOnly) throw new TypeError("Metadata-only packets cannot be converted to a video chunk.");
			if ("undefined" == typeof EncodedVideoChunk) throw new Error("EncodedVideoChunk is not available in this environment.");
			return new EncodedVideoChunk({
				data: this.sideData.alpha,
				type: e,
				timestamp: this.microsecondTimestamp,
				duration: this.microsecondDuration
			});
		}
		toEncodedAudioChunk() {
			if (this.isMetadataOnly) throw new TypeError("Metadata-only packets cannot be converted to an audio chunk.");
			if ("undefined" == typeof EncodedAudioChunk) throw new Error("EncodedAudioChunk is not available in this environment.");
			return new EncodedAudioChunk({
				data: this.data,
				type: this.type,
				timestamp: this.microsecondTimestamp,
				duration: this.microsecondDuration
			});
		}
		static fromEncodedChunk(t, r) {
			if (!(t instanceof EncodedVideoChunk || t instanceof EncodedAudioChunk)) throw new TypeError("chunk must be an EncodedVideoChunk or EncodedAudioChunk.");
			const i = new Uint8Array(t.byteLength);
			return t.copyTo(i), new e(i, t.type, t.timestamp / 1e6, (t.duration ?? 0) / 1e6, void 0, void 0, r);
		}
		clone(t) {
			if (void 0 !== t && ("object" != typeof t || null === t)) throw new TypeError("options, when provided, must be an object.");
			if (void 0 !== t?.data && !(t.data instanceof Uint8Array)) throw new TypeError("options.data, when provided, must be a Uint8Array.");
			if (void 0 !== t?.type && "key" !== t.type && "delta" !== t.type) throw new TypeError("options.type, when provided, must be either \"key\" or \"delta\".");
			if (void 0 !== t?.timestamp && !Number.isFinite(t.timestamp)) throw new TypeError("options.timestamp, when provided, must be a number.");
			if (void 0 !== t?.duration && !Number.isFinite(t.duration)) throw new TypeError("options.duration, when provided, must be a number.");
			if (void 0 !== t?.sequenceNumber && !Number.isFinite(t.sequenceNumber)) throw new TypeError("options.sequenceNumber, when provided, must be a number.");
			if (void 0 !== t?.sideData && ("object" != typeof t.sideData || null === t.sideData)) throw new TypeError("options.sideData, when provided, must be an object.");
			return new e(t?.data ?? this.data, t?.type ?? this.type, t?.timestamp ?? this.timestamp, t?.duration ?? this.duration, t?.sequenceNumber ?? this.sequenceNumber, this.byteLength, t?.sideData ?? this.sideData);
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/ const Jr = (e) => {
		let t = (e.hasVideo ? "video/" : e.hasAudio ? "audio/" : "application/") + (e.isQuickTime ? "quicktime" : "mp4");
		if (e.codecStrings.length > 0) t += `; codecs="${[...new Set(e.codecStrings)].join(", ")}"`;
		return t;
	}, ei = (e) => {
		const t = E(e);
		let r = 0;
		const i = t.getUint8(r);
		r += 1, r += 3;
		const a = H(e.subarray(r, r + 16));
		r += 16;
		let s = null;
		if (i > 0) {
			const i = t.getUint32(r);
			if (r += 4, i > 0) {
				s = [];
				for (let t = 0; t < i; t++) s.push(H(e.subarray(r, r + 16))), r += 16;
			}
		}
		const n = t.getUint32(r);
		return r += 4, {
			systemId: a,
			keyIds: s,
			data: e.slice(r, r + n)
		};
	}, ti = (e, t) => e.systemId === t.systemId && ((e, t) => {
		if (e.length !== t.length) return !1;
		for (let r = 0; r < e.length; r++) if (e[r] !== t[r]) return !1;
		return !0;
	})(e.data, t.data), ri = (e) => {
		let t = Yo(e);
		const r = nc(e, 4);
		let i = 8;
		1 === t && (t = tc(e), i = 16);
		const a = t - i;
		return a < 0 ? null : {
			name: r,
			totalSize: t,
			headerSize: i,
			contentSize: a
		};
	}, ii = (e) => Jo(e) / 65536, ai = (e) => Jo(e) / 1073741824, si = (e) => {
		let t = 0;
		for (let r = 0; r < 4; r++) {
			t <<= 7;
			const r = jo(e);
			if (t |= 127 & r, !(128 & r)) break;
		}
		return t;
	}, ni = (e) => {
		let t = Ko(e);
		return e.skip(2), t = Math.min(t, e.remainingLength), B.decode(Ho(e, t));
	}, oi = (e) => {
		const t = ri(e);
		if (!t || "data" !== t.name) return null;
		if (e.remainingLength < 8) return null;
		const r = Yo(e);
		e.skip(4);
		const i = Ho(e, t.contentSize - 8);
		switch (r) {
			case 1: return B.decode(i);
			case 2: return new I("utf-16be").decode(i);
			case 13: return new Ve(i, "image/jpeg");
			case 14: return new Ve(i, "image/png");
			case 27: return new Ve(i, "image/bmp");
			default: return i;
		}
	}, ci = new Uint32Array(256), li = new Uint32Array(256), di = new Uint32Array(256), ui = new Uint32Array(256), hi = new Uint32Array(256), fi = new Uint32Array(256), mi = new Uint32Array(10);
	let pi = !1;
	var gi = class {
		constructor() {
			this.roundkey = new Uint32Array(44), this.iv = new Uint32Array(16 / Uint32Array.BYTES_PER_ELEMENT), this.in = new Uint8Array(16), this.out = new Uint8Array(16), this.inView = new DataView(this.in.buffer), this.outView = new DataView(this.out.buffer);
		}
		init({ key: e, iv: t }) {
			c(16 === e.byteLength), c(16 === t.byteLength), pi || (() => {
				const e = new Uint8Array(256), t = new Uint8Array(256), r = new Uint8Array(256);
				for (let s = 0, n = 1; s < 256; s++) r[s] = n, t[n] = s, n = n ^ n << 1 ^ (128 & n ? 283 : 0);
				const i = (e, i) => e && i ? r[(t[e] + t[i]) % 255] : 0;
				e[0] = 99;
				for (let s = 1; s < 256; s++) {
					const i = r[255 - t[s]];
					let a = i ^ i << 1 ^ i << 2 ^ i << 3 ^ i << 4;
					a = a >>> 8 ^ 255 & a ^ 99, e[s] = a;
				}
				for (let s = 0; s < 256; s++) {
					const t = e[s], r = e.indexOf(s);
					ci[s] = t << 24 | t << 16 | t << 8 | t, fi[s] = r << 24 | r << 16 | r << 8 | r;
					const a = i(r, 14) << 24 | i(r, 9) << 16 | i(r, 13) << 8 | i(r, 11);
					li[s] = a, di[s] = a >>> 8 | a << 24, ui[s] = a >>> 16 | a << 16, hi[s] = a >>> 24 | a << 8;
				}
				let a = 1;
				for (let s = 0; s < 10; s++) mi[s] = a << 24, a = a << 1 ^ (128 & a ? 283 : 0);
				pi = !0;
			})();
			const r = new DataView(e.buffer, e.byteOffset, e.byteLength), i = new DataView(t.buffer, t.byteOffset, t.byteLength);
			this.roundkey[0] = r.getUint32(0, !1), this.roundkey[1] = r.getUint32(4, !1), this.roundkey[2] = r.getUint32(8, !1), this.roundkey[3] = r.getUint32(12, !1), this.iv[0] = i.getUint32(0, !1), this.iv[1] = i.getUint32(4, !1), this.iv[2] = i.getUint32(8, !1), this.iv[3] = i.getUint32(12, !1);
			for (let a = 4; a < 44; a += 4) {
				const e = this.roundkey[a - 1];
				this.roundkey[a] = this.roundkey[a - 4] ^ 4278190080 & ci[e >>> 16 & 255] ^ 16711680 & ci[e >>> 8 & 255] ^ 65280 & ci[e >>> 0 & 255] ^ 255 & ci[e >>> 24 & 255] ^ mi[a / 4 - 1], this.roundkey[a + 1] = this.roundkey[a - 3] ^ this.roundkey[a], this.roundkey[a + 2] = this.roundkey[a - 2] ^ this.roundkey[a + 1], this.roundkey[a + 3] = this.roundkey[a - 1] ^ this.roundkey[a + 2];
			}
			for (let a = 0, s = 40; a < s; a += 4, s -= 4) for (let e = 0; e < 4; e++) {
				const t = this.roundkey[a + e];
				this.roundkey[a + e] = this.roundkey[s + e], this.roundkey[s + e] = t;
			}
			for (let a = 4; a < 40; a += 4) for (let e = 0; e < 4; e++) {
				const t = this.roundkey[a + e];
				this.roundkey[a + e] = li[255 & ci[t >>> 24 & 255]] ^ di[255 & ci[t >>> 16 & 255]] ^ ui[255 & ci[t >>> 8 & 255]] ^ hi[255 & ci[t >>> 0 & 255]];
			}
		}
		decrypt() {
			let e = this.inView.getUint32(0, !1) ^ this.roundkey[0], t = this.inView.getUint32(4, !1) ^ this.roundkey[1], r = this.inView.getUint32(8, !1) ^ this.roundkey[2], i = this.inView.getUint32(12, !1) ^ this.roundkey[3];
			const a = this.inView.getUint32(0, !1), s = this.inView.getUint32(4, !1), n = this.inView.getUint32(8, !1), o = this.inView.getUint32(12, !1);
			let c, l, d, u;
			for (let g = 1; g < 10; g++) {
				const a = 4 * g;
				c = li[e >>> 24] ^ di[i >>> 16 & 255] ^ ui[r >>> 8 & 255] ^ hi[255 & t] ^ this.roundkey[a], l = li[t >>> 24] ^ di[e >>> 16 & 255] ^ ui[i >>> 8 & 255] ^ hi[255 & r] ^ this.roundkey[a + 1], d = li[r >>> 24] ^ di[t >>> 16 & 255] ^ ui[e >>> 8 & 255] ^ hi[255 & i] ^ this.roundkey[a + 2], u = li[i >>> 24] ^ di[r >>> 16 & 255] ^ ui[t >>> 8 & 255] ^ hi[255 & e] ^ this.roundkey[a + 3], e = c, t = l, r = d, i = u;
			}
			const h = 4278190080 & fi[e >>> 24 & 255] ^ 16711680 & fi[i >>> 16 & 255] ^ 65280 & fi[r >>> 8 & 255] ^ 255 & fi[t >>> 0 & 255] ^ this.roundkey[40], f = 4278190080 & fi[t >>> 24 & 255] ^ 16711680 & fi[e >>> 16 & 255] ^ 65280 & fi[i >>> 8 & 255] ^ 255 & fi[r >>> 0 & 255] ^ this.roundkey[41], m = 4278190080 & fi[r >>> 24 & 255] ^ 16711680 & fi[t >>> 16 & 255] ^ 65280 & fi[e >>> 8 & 255] ^ 255 & fi[i >>> 0 & 255] ^ this.roundkey[42], p = 4278190080 & fi[i >>> 24 & 255] ^ 16711680 & fi[r >>> 16 & 255] ^ 65280 & fi[t >>> 8 & 255] ^ 255 & fi[e >>> 0 & 255] ^ this.roundkey[43];
			this.outView.setUint32(0, h ^ this.iv[0], !1), this.outView.setUint32(4, f ^ this.iv[1], !1), this.outView.setUint32(8, m ^ this.iv[2], !1), this.outView.setUint32(12, p ^ this.iv[3], !1), this.iv[0] = a, this.iv[1] = s, this.iv[2] = n, this.iv[3] = o;
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var ki = class e extends Gr {
		constructor(e) {
			super(e), this.moovSlice = null, this.currentTrack = null, this.tracks = [], this.metadataPromise = null, this.movieTimescale = -1, this.movieDurationInTimescale = -1, this.movieMatrix = h, this.isQuickTime = !1, this.metadataTags = {}, this.currentMetadataKeys = null, this.isFragmented = !1, this.fragmentTrackDefaults = [], this.psshBoxes = [], this.currentFragment = null, this.lastReadFragment = null, this.decryptionKeyCache = /* @__PURE__ */ new Map(), this.reader = e._reader;
		}
		async getTrackBackings() {
			return await this.readMetadata(), this.tracks.map((e) => e.trackBacking);
		}
		async getMimeType() {
			await this.readMetadata();
			const e = await this.getTrackBackings(), t = await Promise.all(e.map((e) => e.getDecoderConfig().then((e) => e?.codec ?? null)));
			return Jr({
				isQuickTime: this.isQuickTime,
				hasVideo: this.tracks.some((e) => "video" === e.info?.type),
				hasAudio: this.tracks.some((e) => "audio" === e.info?.type),
				codecStrings: t.filter(Boolean)
			});
		}
		async getMetadataTags() {
			return await this.readMetadata(), this.metadataTags;
		}
		readMetadata() {
			return this.metadataPromise ??= (async () => {
				let e = 0, t = !1, r = !1;
				for (;;) {
					let i = this.reader.requestSliceRange(e, 8, 16);
					if (Pe(i) && (i = await i), !i) break;
					const a = e, s = ri(i);
					if (!s) break;
					if ("ftyp" === s.name || "styp" === s.name) {
						const e = nc(i, 4);
						this.isQuickTime = "qt  " === e;
					} else {
						if ("moov" === s.name) {
							let e = this.reader.requestSlice(i.filePos, s.contentSize);
							if (Pe(e) && (e = await e), !e) break;
							this.moovSlice = e, this.readContiguousBoxes(this.moovSlice);
							for (const t of this.tracks) {
								const e = t.editListPreviousSegmentDurations / this.movieTimescale;
								t.editListOffset -= Math.round(e * t.timescale);
							}
							t = this.isFragmented && null !== this.reader.fileSize && this.reader.fileSize > a + s.totalSize, r = !0;
							break;
						}
						if ("moof" === s.name) {
							if (!this.input._initInput) throw new Error("\"moof\" box encountered with no \"moov\" box present; this file is likely a Segment as described in ISO/IEC 14496-12 Section 8.16. A separate init file that contains a \"moov\" box is required to read this file, please provide it using InputOptions.initInput.");
							await this.copyMetadataFromInitInput(this.input._initInput), t = !1, r = !0;
							break;
						}
					}
					e = a + s.totalSize;
				}
				if (!r && this.input._initInput && await this.copyMetadataFromInitInput(this.input._initInput), t) {
					c(null !== this.reader.fileSize);
					let e = this.reader.requestSlice(this.reader.fileSize - 4, 4);
					Pe(e) && (e = await e), c(e);
					const t = Yo(e), r = this.reader.fileSize - t;
					if (r >= 0 && r <= this.reader.fileSize - 16) {
						let e = this.reader.requestSliceRange(r, 8, 16);
						if (Pe(e) && (e = await e), e) {
							const t = ri(e);
							if (t && "mfra" === t.name) {
								let r = this.reader.requestSlice(e.filePos, t.contentSize);
								Pe(r) && (r = await r), r && this.readContiguousBoxes(r);
							}
						}
					}
				}
			})();
		}
		async copyMetadataFromInitInput(t) {
			const r = await t._getDemuxer();
			if (r.constructor !== e) throw new Error("Init input must match the input's format.");
			await r.readMetadata(), this.movieTimescale = r.movieTimescale, this.movieDurationInTimescale = r.movieDurationInTimescale, this.movieMatrix = r.movieMatrix, this.metadataTags = r.metadataTags, this.isFragmented = !0, this.fragmentTrackDefaults = r.fragmentTrackDefaults, this.psshBoxes = r.psshBoxes;
			for (const e of r.tracks) {
				const t = {
					id: e.id,
					demuxer: this,
					trackBacking: null,
					disposition: e.disposition,
					timescale: e.timescale,
					durationInMediaTimescale: e.durationInMediaTimescale,
					durationInMovieTimescale: e.durationInMovieTimescale,
					matrix: e.matrix,
					internalCodecId: e.internalCodecId,
					name: e.name,
					languageCode: e.languageCode,
					sampleTableByteOffset: null,
					sampleTable: null,
					fragmentLookupTable: [],
					currentFragmentState: null,
					fragmentPositionCache: [],
					editListPreviousSegmentDurations: e.editListPreviousSegmentDurations,
					editListOffset: e.editListOffset,
					encryptionInfo: e.encryptionInfo,
					encryptionAuxInfo: null,
					frmaCodecString: null,
					maxBitrate: e.maxBitrate,
					avgBitrate: e.avgBitrate,
					info: e.info
				};
				e.trackBacking && (c(t.info), "video" === t.info.type && -1 !== t.info.width ? (t.trackBacking = new yi(t), this.tracks.push(t)) : "audio" === t.info.type && -1 !== t.info.numberOfChannels && (t.trackBacking = new bi(t), this.tracks.push(t)));
			}
		}
		getSampleTableForTrack(e) {
			if (e.sampleTable) return e.sampleTable;
			const t = {
				sampleTimingEntries: [],
				sampleCompositionTimeOffsets: [],
				sampleSizes: [],
				keySampleIndices: null,
				chunkOffsets: [],
				sampleToChunk: [],
				presentationTimestamps: null,
				presentationTimestampIndexMap: null
			};
			if (e.sampleTable = t, null === e.sampleTableByteOffset) return t;
			c(this.moovSlice);
			const r = this.moovSlice.slice(e.sampleTableByteOffset);
			if (this.currentTrack = e, this.traverseBox(r), this.currentTrack = null, "audio" === e.info?.type && e.info.codec && pr.includes(e.info.codec) && 0 === t.sampleCompositionTimeOffsets.length) {
				c("audio" === e.info?.type);
				const r = Fr(e.info.codec), i = [], a = [];
				for (let s = 0; s < t.sampleToChunk.length; s++) {
					const n = t.sampleToChunk[s], o = t.sampleToChunk[s + 1], c = (o ? o.startChunkIndex : t.chunkOffsets.length) - n.startChunkIndex;
					for (let s = 0; s < c; s++) {
						const o = n.startSampleIndex + s * n.samplesPerChunk, c = o + n.samplesPerChunk, l = K(t.sampleTimingEntries, o, (e) => e.startIndex), d = t.sampleTimingEntries[l], u = K(t.sampleTimingEntries, c, (e) => e.startIndex), h = t.sampleTimingEntries[u], f = d.startDecodeTimestamp + (o - d.startIndex) * d.delta, m = h.startDecodeTimestamp + (c - h.startIndex) * h.delta - f, p = T(i);
						p && p.delta === m ? p.count++ : i.push({
							startIndex: n.startChunkIndex + s,
							startDecodeTimestamp: f,
							count: 1,
							delta: m
						});
						const g = n.samplesPerChunk * r.sampleSize * e.info.numberOfChannels;
						a.push(g);
					}
					n.startSampleIndex = n.startChunkIndex, n.samplesPerChunk = 1;
				}
				t.sampleTimingEntries = i, t.sampleSizes = a;
			}
			if (t.sampleCompositionTimeOffsets.length > 0) {
				t.presentationTimestamps = [];
				for (const e of t.sampleTimingEntries) for (let r = 0; r < e.count; r++) t.presentationTimestamps.push({
					presentationTimestamp: e.startDecodeTimestamp + r * e.delta,
					sampleIndex: e.startIndex + r
				});
				for (const e of t.sampleCompositionTimeOffsets) for (let r = 0; r < e.count; r++) {
					const i = e.startIndex + r, a = t.presentationTimestamps[i];
					a && (a.presentationTimestamp += e.offset);
				}
				t.presentationTimestamps.sort((e, t) => e.presentationTimestamp - t.presentationTimestamp), t.presentationTimestampIndexMap = Array(t.presentationTimestamps.length).fill(-1);
				for (let e = 0; e < t.presentationTimestamps.length; e++) t.presentationTimestampIndexMap[t.presentationTimestamps[e].sampleIndex] = e;
			}
			return t;
		}
		async readFragment(e) {
			if (this.lastReadFragment?.moofOffset === e) return this.lastReadFragment;
			let t = this.reader.requestSliceRange(e, 8, 16);
			Pe(t) && (t = await t), c(t);
			const r = ri(t);
			c("moof" === r?.name);
			let i = this.reader.requestSlice(e, r.totalSize);
			Pe(i) && (i = await i), c(i), this.traverseBox(i);
			const a = this.lastReadFragment;
			c(a && a.moofOffset === e);
			for (const [, s] of a.trackData) {
				const e = s.track, { fragmentPositionCache: t } = e;
				if (!s.startTimestampIsFinal) {
					const r = e.fragmentLookupTable.find((e) => e.moofOffset === a.moofOffset);
					if (r) xi(s, r.timestamp);
					else {
						const e = K(t, a.moofOffset - 1, (e) => e.moofOffset);
						if (-1 !== e) {
							const r = t[e];
							xi(s, r.endTimestamp);
						}
					}
					s.startTimestampIsFinal = !0;
				}
				const r = K(t, s.startTimestamp, (e) => e.startTimestamp);
				if (-1 !== r && t[r].moofOffset === a.moofOffset || t.splice(r + 1, 0, {
					moofOffset: a.moofOffset,
					startTimestamp: s.startTimestamp,
					endTimestamp: s.endTimestamp
				}), s.encryptionAuxInfo && e.encryptionInfo) {
					const t = await Ii(this.reader, e.encryptionInfo, s.encryptionAuxInfo);
					for (let e = 0; e < Math.min(s.samples.length, t.length); e++) {
						const r = t[e];
						s.samples[e].encryption = r;
					}
				}
			}
			return a;
		}
		readContiguousBoxes(e) {
			const t = e.filePos;
			for (; e.filePos - t <= e.length - 8 && this.traverseBox(e););
		}
		*iterateContiguousBoxes(e) {
			const t = e.filePos;
			for (; e.filePos - t <= e.length - 8;) {
				const t = e.filePos, r = ri(e);
				if (!r) break;
				yield {
					boxInfo: r,
					slice: e
				}, e.filePos = t + r.totalSize;
			}
		}
		traverseBox(e) {
			const t = e.filePos, r = ri(e);
			if (!r) return !1;
			const i = e.filePos, a = t + r.totalSize;
			switch (r.name) {
				case "mdia":
				case "minf":
				case "dinf":
				case "mfra":
				case "edts":
				case "sinf":
				case "schi":
				case "wave":
					this.readContiguousBoxes(e.slice(i, r.contentSize));
					break;
				case "mvhd":
					{
						const t = jo(e);
						e.skip(3), 1 === t ? (e.skip(16), this.movieTimescale = Yo(e), this.movieDurationInTimescale = tc(e)) : (e.skip(8), this.movieTimescale = Yo(e), this.movieDurationInTimescale = Yo(e)), e.skip(16), this.movieMatrix = Ci(e);
					}
					break;
				case "trak":
					{
						const t = {
							id: -1,
							demuxer: this,
							trackBacking: null,
							disposition: {
								...$e,
								primary: !1
							},
							info: null,
							timescale: -1,
							durationInMovieTimescale: -1,
							durationInMediaTimescale: -1,
							matrix: h,
							internalCodecId: null,
							name: null,
							languageCode: "und",
							sampleTableByteOffset: -1,
							sampleTable: null,
							fragmentLookupTable: [],
							currentFragmentState: null,
							fragmentPositionCache: [],
							editListPreviousSegmentDurations: 0,
							editListOffset: 0,
							encryptionInfo: null,
							encryptionAuxInfo: null,
							frmaCodecString: null,
							maxBitrate: null,
							avgBitrate: null
						};
						this.currentTrack = t, this.readContiguousBoxes(e.slice(i, r.contentSize)), -1 !== t.id && -1 !== t.timescale && null !== t.info && ("video" === t.info.type && -1 !== t.info.width ? (t.trackBacking = new yi(t), this.tracks.push(t)) : "audio" === t.info.type && -1 !== t.info.numberOfChannels && (t.trackBacking = new bi(t), this.tracks.push(t))), this.currentTrack = null;
					}
					break;
				case "tkhd":
					{
						const t = this.currentTrack;
						if (!t) break;
						const r = jo(e), i = !!(1 & Xo(e));
						if (t.disposition.default = i, 0 === r) e.skip(8), t.id = Yo(e), e.skip(4), t.durationInMovieTimescale = Yo(e);
						else {
							if (1 !== r) throw new Error(`Incorrect track header version ${r}.`);
							e.skip(16), t.id = Yo(e), e.skip(4), t.durationInMovieTimescale = tc(e);
						}
						e.skip(16), t.matrix = y(Ci(e), this.movieMatrix);
					}
					break;
				case "elst":
					{
						const t = this.currentTrack;
						if (!t) break;
						const r = jo(e);
						e.skip(3);
						let i = !1, a = 0;
						const s = Yo(e);
						for (let n = 0; n < s; n++) {
							const s = 1 === r ? tc(e) : Yo(e), n = 1 === r ? rc(e) : Jo(e), o = ii(e);
							if (i) {
								qe._warn("Unsupported edit list: multiple edits are not currently supported. Only using first edit.");
								break;
							}
							if (-1 !== n) {
								if (1 !== o) {
									qe._warn("Unsupported edit list entry: media rate must be 1.");
									break;
								}
								t.editListPreviousSegmentDurations = a, t.editListOffset = n, i = !0;
							} else a += s;
						}
					}
					break;
				case "mdhd":
					{
						const t = this.currentTrack;
						if (!t) break;
						const r = jo(e);
						e.skip(3), 0 === r ? (e.skip(8), t.timescale = Yo(e), t.durationInMediaTimescale = Yo(e)) : 1 === r && (e.skip(16), t.timescale = Yo(e), t.durationInMediaTimescale = tc(e));
						let i = Ko(e);
						if (i > 0) {
							t.languageCode = "";
							for (let e = 0; e < 3; e++) t.languageCode = String.fromCharCode(96 + (31 & i)) + t.languageCode, i >>= 5;
							de(t.languageCode) || (t.languageCode = "und");
						}
					}
					break;
				case "hdlr":
					{
						const t = this.currentTrack;
						if (!t) break;
						e.skip(8);
						const r = nc(e, 4);
						"vide" === r ? t.info = {
							type: "video",
							width: -1,
							height: -1,
							squarePixelWidth: -1,
							squarePixelHeight: -1,
							codec: null,
							codecDescription: null,
							colorSpace: { ...L },
							avcType: null,
							avcCodecInfo: null,
							hevcCodecInfo: null,
							vp9CodecInfo: null,
							av1CodecInfo: null,
							proresCodecInfo: null,
							proresFormat: null
						} : "soun" === r && (t.info = {
							type: "audio",
							numberOfChannels: -1,
							sampleRate: -1,
							codec: null,
							codecDescription: null,
							aacCodecInfo: null,
							dtsFormat: null,
							pcmLittleEndian: !1,
							pcmSampleSize: null
						});
					}
					break;
				case "stbl":
					{
						const a = this.currentTrack;
						if (!a) break;
						a.sampleTableByteOffset = t, this.readContiguousBoxes(e.slice(i, r.contentSize));
					}
					break;
				case "stsd":
					{
						const t = this.currentTrack;
						if (!t) break;
						if (null === t.info || t.sampleTable) break;
						const r = jo(e);
						e.skip(3);
						const i = Yo(e);
						for (let a = 0; a < i; a++) {
							const i = e.filePos, a = ri(e);
							if (!a) break;
							t.internalCodecId = a.name;
							const s = a.name.toLowerCase();
							if ("video" === t.info.type) {
								e.skip(24), t.info.width = Ko(e), t.info.height = Ko(e), t.info.squarePixelWidth = t.info.width, t.info.squarePixelHeight = t.info.height, e.skip(50), t.frmaCodecString = null, this.readContiguousBoxes(e.slice(e.filePos, i + a.totalSize - e.filePos));
								const r = "encv" === s ? t.frmaCodecString : s;
								t.frmaCodecString = null, "avc1" === r || "avc3" === r ? (t.info.codec = "avc", t.info.avcType = "avc1" === r ? 1 : 3) : "hvc1" === r || "hev1" === r ? t.info.codec = "hevc" : "vp08" === r ? t.info.codec = "vp8" : "vp09" === r ? t.info.codec = "vp9" : "av01" === r ? t.info.codec = "av1" : Sr.includes(s) ? (t.info.codec = "prores", t.info.proresFormat = s) : null === r ? qe._warn("Unknown encrypted video codec due to missing frma box.") : qe._warn(`Unsupported video codec (sample entry type '${a.name}').`);
							} else {
								e.skip(8);
								const n = Ko(e);
								e.skip(6);
								let o = Ko(e), c = Ko(e);
								e.skip(4);
								let l = Yo(e) / 65536, d = null;
								0 === r && n > 0 && (1 === n ? (e.skip(4), c = 8 * Yo(e), e.skip(8)) : 2 === n && (e.skip(4), l = sc(e), o = Yo(e), e.skip(4), c = Yo(e), d = Yo(e), e.skip(8))), t.info.numberOfChannels = o, t.info.sampleRate = l, t.frmaCodecString = null, this.readContiguousBoxes(e.slice(e.filePos, i + a.totalSize - e.filePos));
								const u = "enca" === s ? t.frmaCodecString : s;
								if (t.frmaCodecString = null, "mp4a" === u);
								else if ("opus" === u) t.info.codec = "opus", t.info.sampleRate = Ar;
								else if ("flac" === u) t.info.codec = "flac";
								else if ("ulaw" === u) t.info.codec = "ulaw";
								else if ("alaw" === u) t.info.codec = "alaw";
								else if ("ac-3" === u) t.info.codec = "ac3";
								else if ("ec-3" === u) t.info.codec = "eac3";
								else if (Pr.includes(u)) t.info.codec = "dts", t.info.dtsFormat = u;
								else if ("twos" === u) 8 === c ? t.info.codec = "pcm-s8" : 16 === c ? t.info.codec = t.info.pcmLittleEndian ? "pcm-s16" : "pcm-s16be" : (qe._warn(`Unsupported sample size ${c} for codec 'twos'.`), t.info.codec = null);
								else if ("sowt" === u) 8 === c ? t.info.codec = "pcm-s8" : 16 === c ? t.info.codec = "pcm-s16" : (qe._warn(`Unsupported sample size ${c} for codec 'sowt'.`), t.info.codec = null);
								else if ("raw " === u) t.info.codec = "pcm-u8";
								else if ("in24" === u) t.info.codec = t.info.pcmLittleEndian ? "pcm-s24" : "pcm-s24be";
								else if ("in32" === u) t.info.codec = t.info.pcmLittleEndian ? "pcm-s32" : "pcm-s32be";
								else if ("fl32" === u) t.info.codec = t.info.pcmLittleEndian ? "pcm-f32" : "pcm-f32be";
								else if ("fl64" === u) t.info.codec = t.info.pcmLittleEndian ? "pcm-f64" : "pcm-f64be";
								else if ("ipcm" === u) {
									const e = t.info.pcmSampleSize;
									t.info.pcmLittleEndian ? 16 === e ? t.info.codec = "pcm-s16" : 24 === e ? t.info.codec = "pcm-s24" : 32 === e ? t.info.codec = "pcm-s32" : (qe._warn(`Invalid ipcm sample size ${e}.`), t.info.codec = null) : 16 === e ? t.info.codec = "pcm-s16be" : 24 === e ? t.info.codec = "pcm-s24be" : 32 === e ? t.info.codec = "pcm-s32be" : (qe._warn(`Invalid ipcm sample size ${e}.`), t.info.codec = null);
								} else if ("fpcm" === u) {
									const e = t.info.pcmSampleSize;
									t.info.pcmLittleEndian ? 32 === e ? t.info.codec = "pcm-f32" : 64 === e ? t.info.codec = "pcm-f64" : (qe._warn(`Invalid fpcm sample size ${e}.`), t.info.codec = null) : 32 === e ? t.info.codec = "pcm-f32be" : 64 === e ? t.info.codec = "pcm-f64be" : (qe._warn(`Invalid fpcm sample size ${e}.`), t.info.codec = null);
								} else if ("lpcm" === u && null !== d) {
									const e = c + 7 >> 3, r = Boolean(1 & d), i = Boolean(2 & d), a = 4 & d ? -1 : 0;
									c > 0 && c <= 64 && (r ? 32 === c && (t.info.codec = i ? "pcm-f32be" : "pcm-f32") : a & 1 << e - 1 ? 1 === e ? t.info.codec = "pcm-s8" : 2 === e ? t.info.codec = i ? "pcm-s16be" : "pcm-s16" : 3 === e ? t.info.codec = i ? "pcm-s24be" : "pcm-s24" : 4 === e && (t.info.codec = i ? "pcm-s32be" : "pcm-s32") : 1 === e && (t.info.codec = "pcm-u8")), null === t.info.codec && qe._warn("Unsupported PCM format.");
								} else null === u ? qe._warn("Unknown encrypted audio codec due to missing frma box.") : qe._warn(`Unsupported audio codec (sample entry type '${a.name}').`);
							}
							e.filePos = i + a.totalSize;
						}
					}
					break;
				case "frma":
					{
						const t = this.currentTrack;
						if (!t) break;
						t.frmaCodecString = nc(e, 4).toLowerCase();
					}
					break;
				case "schm":
					{
						const t = this.currentTrack;
						if (!t) break;
						e.skip(4);
						const r = nc(e, 4);
						"cenc" === r || "cens" === r || "cbcs" === r ? t.encryptionInfo = {
							scheme: r,
							defaultKid: null,
							defaultIsProtected: null,
							defaultPerSampleIvSize: null,
							defaultConstantIv: null,
							defaultCryptByteBlock: null,
							defaultSkipByteBlock: null
						} : qe._warn(`Unsupported encryption scheme '${r}'.`);
					}
					break;
				case "tenc":
					{
						const t = this.currentTrack;
						if (!t || !t.encryptionInfo) break;
						const r = jo(e);
						e.skip(3), e.skip(1);
						const i = jo(e);
						if (r > 0 ? (t.encryptionInfo.defaultCryptByteBlock = i >> 4, t.encryptionInfo.defaultSkipByteBlock = 15 & i) : (t.encryptionInfo.defaultCryptByteBlock = 0, t.encryptionInfo.defaultSkipByteBlock = 0), t.encryptionInfo.defaultIsProtected = 0 !== jo(e), t.encryptionInfo.defaultPerSampleIvSize = jo(e), t.encryptionInfo.defaultKid = H(Ho(e, 16)), t.encryptionInfo.defaultIsProtected && 0 === t.encryptionInfo.defaultPerSampleIvSize) {
							const r = jo(e), i = new Uint8Array(16);
							i.set(Ho(e, r), 0), t.encryptionInfo.defaultConstantIv = i;
						}
					}
					break;
				case "avcC":
					{
						const t = this.currentTrack;
						if (!t) break;
						if (c(t.info), 0 === r.contentSize) break;
						t.info.codecDescription = Ho(e, r.contentSize);
					}
					break;
				case "hvcC":
					{
						const t = this.currentTrack;
						if (!t) break;
						if (c(t.info), 0 === r.contentSize) break;
						t.info.codecDescription = Ho(e, r.contentSize);
					}
					break;
				case "vpcC":
					{
						const t = this.currentTrack;
						if (!t) break;
						c("video" === t.info?.type), e.skip(4);
						const r = jo(e), i = jo(e), a = jo(e), s = a >> 4, n = a >> 1 & 7, o = 1 & a, l = jo(e), d = jo(e), u = jo(e);
						t.info.vp9CodecInfo = {
							profile: r,
							level: i,
							bitDepth: s,
							chromaSubsampling: n,
							videoFullRangeFlag: o,
							colourPrimaries: l,
							transferCharacteristics: d,
							matrixCoefficients: u
						};
					}
					break;
				case "av1C":
					{
						const t = this.currentTrack;
						if (!t) break;
						c("video" === t.info?.type), e.skip(1);
						const i = jo(e), a = i >> 5, s = 31 & i, n = jo(e), o = n >> 7, l = n >> 6 & 1, d = n >> 4 & 1, u = n >> 3 & 1, h = n >> 2 & 1, f = 3 & n, m = 2 === a && l ? n >> 5 & 1 ? 12 : 10 : l ? 10 : 8;
						e.skip(1);
						const p = Ut(Ho(e, r.contentSize - 4));
						t.info.av1CodecInfo = {
							profile: a,
							level: s,
							tier: o,
							bitDepth: m,
							monochrome: d,
							chromaSubsamplingX: u,
							chromaSubsamplingY: h,
							chromaSamplePosition: f,
							videoFullRangeFlag: p?.videoFullRangeFlag ?? 0,
							colourPrimaries: p?.colourPrimaries ?? 2,
							transferCharacteristics: p?.transferCharacteristics ?? 2,
							matrixCoefficients: p?.matrixCoefficients ?? 2
						};
					}
					break;
				case "colr":
					{
						const t = this.currentTrack;
						if (!t) break;
						c("video" === t.info?.type);
						const r = nc(e, 4);
						if ("nclx" !== r && "nclc" !== r) break;
						const i = Ko(e), a = Ko(e), s = Ko(e);
						let n;
						"nclx" === r && (n = Boolean(128 & jo(e))), t.info.colorSpace = {
							primaries: M[i],
							transfer: O[a],
							matrix: N[s],
							fullRange: n
						};
					}
					break;
				case "pasp":
					{
						const t = this.currentTrack;
						if (!t) break;
						c("video" === t.info?.type);
						const r = Yo(e), i = Yo(e);
						r > 0 && i > 0 && (r > i ? t.info.squarePixelWidth = Math.round(t.info.width * r / i) : t.info.squarePixelHeight = Math.round(t.info.height * i / r));
					}
					break;
				case "btrt":
					{
						const t = this.currentTrack;
						if (!t) break;
						e.skip(4);
						const r = Yo(e), i = Yo(e);
						t.maxBitrate = r > 0 ? r : null, t.avgBitrate = i > 0 ? i : null;
					}
					break;
				case "esds":
					{
						const t = this.currentTrack;
						if (!t || "audio" !== t.info?.type) break;
						e.skip(4), c(3 === jo(e)), si(e), e.skip(2);
						const r = jo(e), i = !!(64 & r), a = !!(32 & r);
						if (128 & r && e.skip(2), i) {
							const t = jo(e);
							e.skip(t);
						}
						a && e.skip(2), c(4 === jo(e));
						const s = si(e), n = e.filePos, o = jo(e);
						if (64 === o || 103 === o ? (t.info.codec = "aac", t.info.aacCodecInfo = {
							isMpeg2: 103 === o,
							objectType: null
						}) : 105 === o || 107 === o ? t.info.codec = "mp3" : 221 === o ? t.info.codec = "vorbis" : 169 === o ? t.info.codec = "dts" : qe._warn(`Unsupported audio codec (objectTypeIndication ${o}) - discarding track.`), e.skip(12), s > e.filePos - n) {
							c(5 === jo(e));
							const r = si(e);
							if (t.info.codecDescription = Ho(e, r), "aac" === t.info.codec) {
								const e = Ge(t.info.codecDescription);
								null !== e.outputNumberOfChannels && (t.info.numberOfChannels = e.outputNumberOfChannels), null !== e.outputSampleRate && (t.info.sampleRate = e.outputSampleRate);
							}
						}
					}
					break;
				case "enda":
					{
						const t = this.currentTrack;
						if (!t) break;
						c("audio" === t.info?.type), t.info.pcmLittleEndian = !!(255 & Ko(e));
					}
					break;
				case "pcmC":
					{
						const t = this.currentTrack;
						if (!t) break;
						c("audio" === t.info?.type), e.skip(4);
						const r = jo(e);
						t.info.pcmLittleEndian = Boolean(1 & r), t.info.pcmSampleSize = jo(e);
					}
					break;
				case "dOps":
					{
						const t = this.currentTrack;
						if (!t) break;
						c("audio" === t.info?.type), e.skip(1);
						const r = jo(e), i = Ko(e), a = Yo(e), s = Qo(e), n = jo(e);
						let o;
						o = 0 !== n ? Ho(e, 2 + r) : new Uint8Array(0);
						const l = new Uint8Array(19 + o.byteLength), d = new DataView(l.buffer);
						d.setUint32(0, 1332770163, !1), d.setUint32(4, 1214603620, !1), d.setUint8(8, 1), d.setUint8(9, r), d.setUint16(10, i, !0), d.setUint32(12, a, !0), d.setInt16(16, s, !0), d.setUint8(18, n), l.set(o, 19), t.info.codecDescription = l, t.info.numberOfChannels = r;
					}
					break;
				case "dfLa":
					{
						const t = this.currentTrack;
						if (!t) break;
						c("audio" === t.info?.type), e.skip(4);
						const r = 127, i = 128, s = e.filePos;
						for (; e.filePos < a;) {
							const a = jo(e), s = Xo(e);
							if ((a & r) === jt.STREAMINFO) {
								e.skip(10);
								const r = Yo(e), i = r >>> 12, a = 1 + (r >> 9 & 7);
								t.info.sampleRate = i, t.info.numberOfChannels = a, e.skip(20);
							} else e.skip(s);
							if (a & i) break;
						}
						const n = e.filePos;
						e.filePos = s;
						const o = Ho(e, n - s), l = new Uint8Array(4 + o.byteLength);
						new DataView(l.buffer).setUint32(0, 1716281667, !1), l.set(o, 4), t.info.codecDescription = l;
					}
					break;
				case "dac3":
					{
						const t = this.currentTrack;
						if (!t) break;
						c("audio" === t.info?.type);
						const r = new Ke(Ho(e, 3)), i = r.readBits(2);
						r.skipBits(8);
						const a = r.readBits(3), s = r.readBits(1);
						i < 3 && (t.info.sampleRate = it[i]), t.info.numberOfChannels = Kt[a] + s;
					}
					break;
				case "dec3":
					{
						const t = this.currentTrack;
						if (!t) break;
						c("audio" === t.info?.type);
						const i = ((e) => {
							if (e.length < 2) return null;
							const t = new Ke(e), r = t.readBits(13), i = t.readBits(3), a = [];
							for (let s = 0; s <= i && !(Math.ceil(t.pos / 8) + 3 > e.length); s++) {
								const e = t.readBits(2), r = t.readBits(5);
								t.skipBits(1), t.skipBits(1);
								const i = t.readBits(3), s = t.readBits(3), n = t.readBits(1);
								t.skipBits(3);
								const o = t.readBits(4);
								let c = 0;
								o > 0 ? c = t.readBits(9) : t.skipBits(1), a.push({
									fscod: e,
									fscod2: null,
									bsid: r,
									bsmod: i,
									acmod: s,
									lfeon: n,
									numDepSub: o,
									chanLoc: c
								});
							}
							return 0 === a.length ? null : {
								dataRate: r,
								substreams: a
							};
						})(Ho(e, r.contentSize));
						if (!i) {
							qe._warn("Invalid dec3 box contents, ignoring.");
							break;
						}
						const a = Zt(i);
						null !== a && (t.info.sampleRate = a), t.info.numberOfChannels = Jt(i);
					}
					break;
				case "ddts":
					{
						const t = this.currentTrack;
						if (!t) break;
						c("audio" === t.info?.type);
						const i = ((e) => {
							if (e.length < 20) return null;
							const t = E(e), r = t.getUint32(0);
							if (0 === r) return null;
							const i = new Ke(e);
							i.seekToByte(13);
							const a = i.readBits(2);
							i.skipBits(5);
							const s = i.readBits(1), n = i.readBits(6);
							i.skipBits(14), i.skipBits(1), i.skipBits(3);
							const o = i.readBits(16);
							let c = null;
							return 0 !== o ? c = fr(o) : n < ir.length && (c = ir[n] + s), {
								sampleRate: r,
								maxBitrate: t.getUint32(4),
								avgBitrate: t.getUint32(8),
								pcmSampleDepth: e[12],
								sampleCount: or[a],
								channelLayout: o,
								numberOfChannels: c
							};
						})(Ho(e, Math.min(r.contentSize, 20)));
						if (!i) {
							qe._warn("Invalid ddts box contents, ignoring.");
							break;
						}
						t.info.sampleRate = i.sampleRate, null !== i.numberOfChannels && (t.info.numberOfChannels = i.numberOfChannels);
					}
					break;
				case "stts":
					{
						const t = this.currentTrack;
						if (!t) break;
						if (!t.sampleTable) break;
						e.skip(4);
						const r = Yo(e);
						let i = 0, a = 0;
						for (let s = 0; s < r; s++) {
							const r = Yo(e), s = Yo(e);
							t.sampleTable.sampleTimingEntries.push({
								startIndex: i,
								startDecodeTimestamp: a,
								count: r,
								delta: s
							}), i += r, a += r * s;
						}
					}
					break;
				case "ctts":
					{
						const t = this.currentTrack;
						if (!t) break;
						if (!t.sampleTable) break;
						e.skip(4);
						const r = Yo(e);
						let i = 0;
						for (let a = 0; a < r; a++) {
							const r = Yo(e), a = Jo(e);
							t.sampleTable.sampleCompositionTimeOffsets.push({
								startIndex: i,
								count: r,
								offset: a
							}), i += r;
						}
					}
					break;
				case "stsz":
					{
						const t = this.currentTrack;
						if (!t) break;
						if (!t.sampleTable) break;
						e.skip(4);
						const r = Yo(e), i = Yo(e);
						if (0 === r) for (let a = 0; a < i; a++) {
							const r = Yo(e);
							t.sampleTable.sampleSizes.push(r);
						}
						else t.sampleTable.sampleSizes.push(r);
					}
					break;
				case "stz2":
					{
						const t = this.currentTrack;
						if (!t) break;
						if (!t.sampleTable) break;
						e.skip(4), e.skip(3);
						const r = jo(e), i = Yo(e), a = new Ke(Ho(e, Math.ceil(i * r / 8)));
						for (let e = 0; e < i; e++) {
							const e = a.readBits(r);
							t.sampleTable.sampleSizes.push(e);
						}
					}
					break;
				case "stss":
					{
						const t = this.currentTrack;
						if (!t) break;
						if (!t.sampleTable) break;
						e.skip(4), t.sampleTable.keySampleIndices = [];
						const r = Yo(e);
						for (let i = 0; i < r; i++) {
							const r = Yo(e) - 1;
							t.sampleTable.keySampleIndices.push(r);
						}
						0 !== t.sampleTable.keySampleIndices[0] && t.sampleTable.keySampleIndices.unshift(0);
					}
					break;
				case "stsc":
					{
						const t = this.currentTrack;
						if (!t) break;
						if (!t.sampleTable) break;
						e.skip(4);
						const r = Yo(e);
						for (let a = 0; a < r; a++) {
							const r = Yo(e) - 1, i = Yo(e), a = Yo(e);
							t.sampleTable.sampleToChunk.push({
								startSampleIndex: -1,
								startChunkIndex: r,
								samplesPerChunk: i,
								sampleDescriptionIndex: a
							});
						}
						let i = 0;
						for (let e = 0; e < t.sampleTable.sampleToChunk.length; e++) if (t.sampleTable.sampleToChunk[e].startSampleIndex = i, e < t.sampleTable.sampleToChunk.length - 1) i += (t.sampleTable.sampleToChunk[e + 1].startChunkIndex - t.sampleTable.sampleToChunk[e].startChunkIndex) * t.sampleTable.sampleToChunk[e].samplesPerChunk;
					}
					break;
				case "stco":
					{
						const t = this.currentTrack;
						if (!t) break;
						if (!t.sampleTable) break;
						e.skip(4);
						const r = Yo(e);
						for (let i = 0; i < r; i++) {
							const r = Yo(e);
							t.sampleTable.chunkOffsets.push(r);
						}
					}
					break;
				case "co64":
					{
						const t = this.currentTrack;
						if (!t) break;
						if (!t.sampleTable) break;
						e.skip(4);
						const r = Yo(e);
						for (let i = 0; i < r; i++) {
							const r = tc(e);
							t.sampleTable.chunkOffsets.push(r);
						}
					}
					break;
				case "mvex":
					this.isFragmented = !0, this.readContiguousBoxes(e.slice(i, r.contentSize));
					break;
				case "mehd":
					{
						const t = jo(e);
						e.skip(3);
						const r = 1 === t ? tc(e) : Yo(e);
						this.movieDurationInTimescale = r;
					}
					break;
				case "trex":
					{
						e.skip(4);
						const t = Yo(e), r = Yo(e), i = Yo(e), a = Yo(e), s = Yo(e);
						this.fragmentTrackDefaults.push({
							trackId: t,
							defaultSampleDescriptionIndex: r,
							defaultSampleDuration: i,
							defaultSampleSize: a,
							defaultSampleFlags: s
						});
					}
					break;
				case "tfra":
					{
						const t = jo(e);
						e.skip(3);
						const r = Yo(e), i = this.tracks.find((e) => e.id === r);
						if (!i) break;
						const a = Yo(e), s = (12 & a) >> 2, n = 3 & a, o = [
							jo,
							Ko,
							Xo,
							Yo
						], c = o[(48 & a) >> 4], l = o[s], d = o[n], u = Yo(e);
						for (let h = 0; h < u; h++) {
							const r = 1 === t ? tc(e) : Yo(e), a = 1 === t ? tc(e) : Yo(e);
							c(e), l(e), d(e), i.fragmentLookupTable.push({
								timestamp: r,
								moofOffset: a
							});
						}
						i.fragmentLookupTable.sort((e, t) => e.timestamp - t.timestamp);
						for (let e = 0; e < i.fragmentLookupTable.length - 1; e++) {
							const t = i.fragmentLookupTable[e], r = i.fragmentLookupTable[e + 1];
							t.timestamp === r.timestamp && (i.fragmentLookupTable.splice(e + 1, 1), e--);
						}
					}
					break;
				case "moof":
					this.currentFragment = {
						moofOffset: t,
						moofSize: r.totalSize,
						implicitBaseDataOffset: t,
						trackData: /* @__PURE__ */ new Map(),
						psshBoxes: []
					}, this.readContiguousBoxes(e.slice(i, r.contentSize)), this.lastReadFragment = this.currentFragment, this.currentFragment = null;
					break;
				case "traf":
					if (c(this.currentFragment), this.readContiguousBoxes(e.slice(i, r.contentSize)), this.currentTrack) {
						const e = this.currentFragment.trackData.get(this.currentTrack.id);
						e: if (e) {
							if (0 === e.samples.length) {
								this.currentFragment.trackData.delete(this.currentTrack.id);
								break e;
							}
							e.presentationTimestamps = e.samples.map((e, t) => ({
								presentationTimestamp: e.presentationTimestamp,
								sampleIndex: t
							})).sort((e, t) => e.presentationTimestamp - t.presentationTimestamp);
							for (let a = 0; a < e.presentationTimestamps.length; a++) {
								const t = e.presentationTimestamps[a], r = e.samples[t.sampleIndex];
								null === e.firstKeyFrameTimestamp && r.isKeyFrame && (e.firstKeyFrameTimestamp = r.presentationTimestamp), a < e.presentationTimestamps.length - 1 && (r.duration = e.presentationTimestamps[a + 1].presentationTimestamp - t.presentationTimestamp);
							}
							const t = e.samples[e.presentationTimestamps[0].sampleIndex], r = e.samples[T(e.presentationTimestamps).sampleIndex];
							e.startTimestamp = t.presentationTimestamp, e.endTimestamp = r.presentationTimestamp + r.duration;
							const { currentFragmentState: i } = this.currentTrack;
							c(i), null !== i.startTimestamp && (xi(e, i.startTimestamp), e.startTimestampIsFinal = !0), i.encryptionAuxInfo && !e.samples[0].encryption && (e.encryptionAuxInfo = i.encryptionAuxInfo);
						}
						this.currentTrack.currentFragmentState = null, this.currentTrack = null;
					}
					break;
				case "pssh":
					{
						if (this.input._formatOptions.isobmff?._suppressPsshParsing) break;
						const t = ei(Ho(e, r.contentSize));
						this.currentFragment ? this.currentFragment.psshBoxes.push(t) : this.currentTrack || this.psshBoxes.push(t);
					}
					break;
				case "tfhd":
					{
						c(this.currentFragment), e.skip(1);
						const t = Xo(e), r = Boolean(1 & t), i = Boolean(2 & t), a = Boolean(8 & t), s = Boolean(16 & t), n = Boolean(32 & t), o = Boolean(65536 & t), l = Boolean(131072 & t), d = Yo(e), u = this.tracks.find((e) => e.id === d);
						if (!u) break;
						const h = this.fragmentTrackDefaults.find((e) => e.trackId === d);
						this.currentTrack = u, u.currentFragmentState = {
							baseDataOffset: this.currentFragment.implicitBaseDataOffset,
							sampleDescriptionIndex: h?.defaultSampleDescriptionIndex ?? null,
							defaultSampleDuration: h?.defaultSampleDuration ?? null,
							defaultSampleSize: h?.defaultSampleSize ?? null,
							defaultSampleFlags: h?.defaultSampleFlags ?? null,
							startTimestamp: null,
							encryptionAuxInfo: null
						}, r ? u.currentFragmentState.baseDataOffset = tc(e) : l && (u.currentFragmentState.baseDataOffset = this.currentFragment.moofOffset), i && (u.currentFragmentState.sampleDescriptionIndex = Yo(e)), a && (u.currentFragmentState.defaultSampleDuration = Yo(e)), s && (u.currentFragmentState.defaultSampleSize = Yo(e)), n && (u.currentFragmentState.defaultSampleFlags = Yo(e)), o && (u.currentFragmentState.defaultSampleDuration = 0);
					}
					break;
				case "tfdt":
					{
						const t = this.currentTrack;
						if (!t) break;
						c(t.currentFragmentState);
						const r = jo(e);
						e.skip(3);
						const i = 0 === r ? Yo(e) : tc(e);
						t.currentFragmentState.startTimestamp = i;
					}
					break;
				case "trun":
					{
						const t = this.currentTrack;
						if (!t) break;
						c(this.currentFragment), c(t.currentFragmentState);
						const r = jo(e), i = Xo(e), a = Boolean(1 & i), s = Boolean(4 & i), n = Boolean(256 & i), o = Boolean(512 & i), l = Boolean(1024 & i), d = Boolean(2048 & i), u = Yo(e);
						let h = null;
						a && (h = Jo(e));
						let f, m = null;
						s && (m = Yo(e)), this.currentFragment.trackData.has(t.id) ? (f = this.currentFragment.trackData.get(t.id), null !== h && (f.currentOffset = t.currentFragmentState.baseDataOffset + h)) : (f = {
							track: t,
							currentTimestamp: 0,
							currentOffset: t.currentFragmentState.baseDataOffset + (h ?? 0),
							startTimestamp: 0,
							endTimestamp: 0,
							firstKeyFrameTimestamp: null,
							samples: [],
							presentationTimestamps: [],
							startTimestampIsFinal: !1,
							encryptionAuxInfo: null
						}, this.currentFragment.trackData.set(t.id, f));
						for (let p = 0; p < u; p++) {
							let i, a, s;
							n ? i = Yo(e) : (c(null !== t.currentFragmentState.defaultSampleDuration), i = t.currentFragmentState.defaultSampleDuration), o ? a = Yo(e) : (c(null !== t.currentFragmentState.defaultSampleSize), a = t.currentFragmentState.defaultSampleSize), l ? s = Yo(e) : (c(null !== t.currentFragmentState.defaultSampleFlags), s = t.currentFragmentState.defaultSampleFlags), 0 === p && null !== m && (s = m);
							let u = 0;
							d && (u = 0 === r ? Yo(e) : Jo(e));
							const h = !(65536 & s);
							f.samples.push({
								presentationTimestamp: f.currentTimestamp + u,
								duration: i,
								byteOffset: f.currentOffset,
								byteSize: a,
								isKeyFrame: h,
								encryption: null
							}), f.currentOffset += a, f.currentTimestamp += i;
						}
						this.currentFragment.implicitBaseDataOffset = f.currentOffset;
					}
					break;
				case "saiz":
					{
						const t = this.currentTrack;
						if (!t || !t.encryptionInfo) break;
						if (e.skip(1), 1 & Xo(e)) {
							const r = nc(e, 4), i = Yo(e);
							if (r !== t.encryptionInfo.scheme || 0 !== i) break;
						}
						const r = jo(e), i = Yo(e);
						let a = null;
						0 === r && i > 0 && (a = Ho(e, i));
						const s = _i(t);
						s.defaultSampleInfoSize = r, s.sampleSizes = a, s.sampleCount = i;
					}
					break;
				case "saio":
					{
						const t = this.currentTrack;
						if (!t || !t.encryptionInfo) break;
						const r = jo(e);
						if (1 & Xo(e)) {
							const r = nc(e, 4), i = Yo(e);
							if (r !== t.encryptionInfo.scheme || 0 !== i) break;
						}
						const i = Yo(e);
						if (0 === i) break;
						i > 1 && qe._warn("Multiple saio entries are not supported; using the first offset only.");
						let a = 0 === r ? Yo(e) : Number(tc(e));
						this.currentFragment && (a += this.currentFragment.moofOffset);
						_i(t).offset = a;
					}
					break;
				case "senc":
					{
						const t = this.currentTrack;
						if (!t || !t.encryptionInfo) break;
						c(this.currentFragment);
						const r = this.currentFragment.trackData.get(t.id);
						if (!r) break;
						e.skip(1);
						const i = Xo(e), a = Boolean(2 & i), s = Yo(e), n = t.encryptionInfo.defaultPerSampleIvSize;
						c(null !== n);
						for (let o = 0; o < Math.min(s, r.samples.length); o++) {
							const i = new Uint8Array(16);
							n > 0 ? i.set(Ho(e, n), 0) : i.set(t.encryptionInfo.defaultConstantIv, 0);
							let s = null;
							if (a) {
								const t = Ko(e);
								s = [];
								for (let r = 0; r < t; r++) {
									const t = Ko(e), r = Yo(e);
									s.push({
										clearLen: t,
										protectedLen: r
									});
								}
							}
							r.samples[o].encryption = {
								iv: i,
								subsamples: s
							};
						}
					}
					break;
				case "udta":
					{
						const t = this.iterateContiguousBoxes(e.slice(i, r.contentSize));
						for (const { boxInfo: e, slice: r } of t) {
							if ("meta" !== e.name && !this.currentTrack) {
								const t = r.filePos;
								this.metadataTags.raw ??= {}, "©" === e.name[0] ? this.metadataTags.raw[e.name] ??= ni(r) : this.metadataTags.raw[e.name] ??= Ho(r, e.contentSize), r.filePos = t;
							}
							switch (e.name) {
								case "meta":
									r.skip(-e.headerSize), this.traverseBox(r);
									break;
								case "©nam":
								case "name":
									this.currentTrack ? this.currentTrack.name = B.decode(Ho(r, e.contentSize)) : this.metadataTags.title ??= ni(r);
									break;
								case "©des":
									this.currentTrack || (this.metadataTags.description ??= ni(r));
									break;
								case "©ART":
									this.currentTrack || (this.metadataTags.artist ??= ni(r));
									break;
								case "©alb":
									this.currentTrack || (this.metadataTags.album ??= ni(r));
									break;
								case "albr":
									this.currentTrack || (this.metadataTags.albumArtist ??= ni(r));
									break;
								case "©gen":
									this.currentTrack || (this.metadataTags.genre ??= ni(r));
									break;
								case "©day":
									if (!this.currentTrack) {
										const e = new Date(ni(r));
										Number.isNaN(e.getTime()) || (this.metadataTags.date ??= e);
									}
									break;
								case "©cmt":
									this.currentTrack || (this.metadataTags.comment ??= ni(r));
									break;
								case "©lyr": this.currentTrack || (this.metadataTags.lyrics ??= ni(r));
							}
						}
					}
					break;
				case "meta":
					{
						if (this.currentTrack) break;
						const t = 0 !== Yo(e);
						this.currentMetadataKeys = /* @__PURE__ */ new Map(), t ? this.readContiguousBoxes(e.slice(i, r.contentSize)) : this.readContiguousBoxes(e.slice(i + 4, r.contentSize - 4)), this.currentMetadataKeys = null;
					}
					break;
				case "keys":
					{
						if (!this.currentMetadataKeys) break;
						e.skip(4);
						const t = Yo(e);
						for (let r = 0; r < t; r++) {
							const t = Yo(e);
							e.skip(4);
							const i = B.decode(Ho(e, t - 8));
							this.currentMetadataKeys.set(r + 1, i);
						}
					}
					break;
				case "ilst": {
					if (!this.currentMetadataKeys) break;
					const t = this.iterateContiguousBoxes(e.slice(i, r.contentSize));
					for (const { boxInfo: e, slice: r } of t) {
						let t = e.name;
						const i = (t.charCodeAt(0) << 24) + (t.charCodeAt(1) << 16) + (t.charCodeAt(2) << 8) + t.charCodeAt(3);
						this.currentMetadataKeys.has(i) && (t = this.currentMetadataKeys.get(i));
						const a = oi(r);
						switch (this.metadataTags.raw ??= {}, this.metadataTags.raw[t] ??= a, t) {
							case "©nam":
							case "titl":
							case "com.apple.quicktime.title":
							case "title":
								"string" == typeof a && (this.metadataTags.title ??= a);
								break;
							case "©des":
							case "desc":
							case "dscp":
							case "com.apple.quicktime.description":
							case "description":
								"string" == typeof a && (this.metadataTags.description ??= a);
								break;
							case "©ART":
							case "com.apple.quicktime.artist":
							case "artist":
								"string" == typeof a && (this.metadataTags.artist ??= a);
								break;
							case "©alb":
							case "albm":
							case "com.apple.quicktime.album":
							case "album":
								"string" == typeof a && (this.metadataTags.album ??= a);
								break;
							case "aART":
							case "album_artist":
								"string" == typeof a && (this.metadataTags.albumArtist ??= a);
								break;
							case "©cmt":
							case "com.apple.quicktime.comment":
							case "comment":
								"string" == typeof a && (this.metadataTags.comment ??= a);
								break;
							case "©gen":
							case "gnre":
							case "com.apple.quicktime.genre":
							case "genre":
								"string" == typeof a && (this.metadataTags.genre ??= a);
								break;
							case "©lyr":
							case "lyrics":
								"string" == typeof a && (this.metadataTags.lyrics ??= a);
								break;
							case "©day":
							case "rldt":
							case "com.apple.quicktime.creationdate":
							case "date":
								if ("string" == typeof a) {
									const e = new Date(a);
									Number.isNaN(e.getTime()) || (this.metadataTags.date ??= e);
								}
								break;
							case "tmpo":
								if (a instanceof Uint8Array && a.length >= 2) {
									const e = E(a).getInt16(0, !1);
									e > 0 && (this.metadataTags.beatsPerMinute ??= e);
								}
								break;
							case "covr":
							case "com.apple.quicktime.artwork":
								a instanceof Ve ? (this.metadataTags.images ??= [], this.metadataTags.images.push({
									data: a.data,
									kind: "coverFront",
									mimeType: a.mimeType
								})) : a instanceof Uint8Array && (this.metadataTags.images ??= [], this.metadataTags.images.push({
									data: a,
									kind: "coverFront",
									mimeType: "image/*"
								}));
								break;
							case "track":
								if ("string" == typeof a) {
									const e = a.split("/"), t = Number.parseInt(e[0], 10), r = e[1] && Number.parseInt(e[1], 10);
									Number.isInteger(t) && t > 0 && (this.metadataTags.trackNumber ??= t), r && Number.isInteger(r) && r > 0 && (this.metadataTags.tracksTotal ??= r);
								}
								break;
							case "trkn":
								if (a instanceof Uint8Array && a.length >= 6) {
									const e = E(a), t = e.getUint16(2, !1), r = e.getUint16(4, !1);
									t > 0 && (this.metadataTags.trackNumber ??= t), r > 0 && (this.metadataTags.tracksTotal ??= r);
								}
								break;
							case "disc":
							case "disk": if (a instanceof Uint8Array && a.length >= 6) {
								const e = E(a), t = e.getUint16(2, !1), r = e.getUint16(4, !1);
								t > 0 && (this.metadataTags.discNumber ??= t), r > 0 && (this.metadataTags.discsTotal ??= r);
							}
						}
					}
				}
			}
			return e.filePos = a, !0;
		}
	}, wi = class {
		constructor(e) {
			this.internalTrack = e, this.packetToSampleIndex = /* @__PURE__ */ new WeakMap(), this.packetToFragmentLocation = /* @__PURE__ */ new WeakMap();
		}
		getId() {
			return this.internalTrack.id;
		}
		getNumber() {
			const e = this.internalTrack.demuxer, t = this.internalTrack.trackBacking.getType();
			let r = 0;
			for (const i of e.tracks) if (i.trackBacking.getType() === t && r++, i === this.internalTrack) break;
			return r;
		}
		getCodec() {
			throw new Error("Not implemented on base class.");
		}
		getInternalCodecId() {
			return this.internalTrack.internalCodecId;
		}
		getName() {
			return this.internalTrack.name;
		}
		getLanguageCode() {
			return this.internalTrack.languageCode;
		}
		getTimeResolution() {
			return this.internalTrack.timescale;
		}
		isRelativeToUnixEpoch() {
			return !1;
		}
		getUnixTimeForTimestamp() {
			return null;
		}
		getDisposition() {
			return this.internalTrack.disposition;
		}
		getPairingMask() {
			return 1n;
		}
		getBitrate() {
			return this.internalTrack.maxBitrate;
		}
		getAverageBitrate() {
			return this.internalTrack.avgBitrate;
		}
		async getDurationFromMetadata() {
			const e = this.internalTrack;
			return e.durationInMediaTimescale <= 0 ? null : (c(e.trackBacking), ((await e.trackBacking.getFirstPacket({ metadataOnly: !0 }))?.timestamp ?? 0) + e.durationInMediaTimescale / e.timescale);
		}
		async getLiveRefreshInterval() {
			return null;
		}
		async getFirstPacket(e) {
			const t = await this.fetchPacketForSampleIndex(0, e);
			return t || !this.internalTrack.demuxer.isFragmented ? t : this.performFragmentedLookup(null, (e) => e.trackData.get(this.internalTrack.id) ? {
				sampleIndex: 0,
				correctSampleFound: !0
			} : {
				sampleIndex: -1,
				correctSampleFound: !1
			}, -Infinity, Infinity, e);
		}
		mapTimestampIntoTimescale(e) {
			return ie(e * this.internalTrack.timescale) + this.internalTrack.editListOffset;
		}
		async getPacket(e, t) {
			const r = this.mapTimestampIntoTimescale(e), i = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack), a = Ti(i, r), s = await this.fetchPacketForSampleIndex(a, t);
			return Ei(i) && this.internalTrack.demuxer.isFragmented ? this.performFragmentedLookup(null, (e) => {
				const t = e.trackData.get(this.internalTrack.id);
				if (!t) return {
					sampleIndex: -1,
					correctSampleFound: !1
				};
				const i = K(t.presentationTimestamps, r, (e) => e.presentationTimestamp);
				return {
					sampleIndex: -1 !== i ? t.presentationTimestamps[i].sampleIndex : -1,
					correctSampleFound: -1 !== i && r < t.endTimestamp
				};
			}, r, r, t) : s;
		}
		async getNextPacket(e, t) {
			const r = this.packetToSampleIndex.get(e);
			if (void 0 !== r) return this.fetchPacketForSampleIndex(r + 1, t);
			const i = this.packetToFragmentLocation.get(e);
			if (void 0 === i) throw new Error("Packet was not created from this track.");
			return this.performFragmentedLookup(i.fragment, (e) => {
				if (e === i.fragment) {
					const t = e.trackData.get(this.internalTrack.id);
					if (i.sampleIndex + 1 < t.samples.length) return {
						sampleIndex: i.sampleIndex + 1,
						correctSampleFound: !0
					};
				} else if (e.trackData.get(this.internalTrack.id)) return {
					sampleIndex: 0,
					correctSampleFound: !0
				};
				return {
					sampleIndex: -1,
					correctSampleFound: !1
				};
			}, -Infinity, Infinity, t);
		}
		async getKeyPacket(e, t) {
			const r = this.mapTimestampIntoTimescale(e), i = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack), a = vi(i, r), s = await this.fetchPacketForSampleIndex(a, t);
			return Ei(i) && this.internalTrack.demuxer.isFragmented ? this.performFragmentedLookup(null, (e) => {
				const t = e.trackData.get(this.internalTrack.id);
				if (!t) return {
					sampleIndex: -1,
					correctSampleFound: !1
				};
				const i = Z(t.presentationTimestamps, (e) => t.samples[e.sampleIndex].isKeyFrame && e.presentationTimestamp <= r);
				return {
					sampleIndex: -1 !== i ? t.presentationTimestamps[i].sampleIndex : -1,
					correctSampleFound: -1 !== i && r < t.endTimestamp
				};
			}, r, r, t) : s;
		}
		async getNextKeyPacket(e, t) {
			const r = this.packetToSampleIndex.get(e);
			if (void 0 !== r) {
				const e = Pi(this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack), r);
				return this.fetchPacketForSampleIndex(e, t);
			}
			const i = this.packetToFragmentLocation.get(e);
			if (void 0 === i) throw new Error("Packet was not created from this track.");
			return this.performFragmentedLookup(i.fragment, (e) => {
				if (e === i.fragment) {
					const t = e.trackData.get(this.internalTrack.id).samples.findIndex((e, t) => e.isKeyFrame && t > i.sampleIndex);
					if (-1 !== t) return {
						sampleIndex: t,
						correctSampleFound: !0
					};
				} else {
					const t = e.trackData.get(this.internalTrack.id);
					if (t && null !== t.firstKeyFrameTimestamp) {
						const e = t.samples.findIndex((e) => e.isKeyFrame);
						return c(-1 !== e), {
							sampleIndex: e,
							correctSampleFound: !0
						};
					}
				}
				return {
					sampleIndex: -1,
					correctSampleFound: !1
				};
			}, -Infinity, Infinity, t);
		}
		async fetchPacketForSampleIndex(e, t) {
			if (-1 === e) return null;
			const r = Si(this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack), e);
			if (!r) return null;
			let i;
			if (t.metadataOnly) i = Yr;
			else {
				let t = this.internalTrack.demuxer.reader.requestSlice(r.sampleOffset, r.sampleSize);
				if (Pe(t) && (t = await t), !t) return null;
				if (i = Ho(t, r.sampleSize), this.internalTrack.encryptionInfo) {
					let t = null;
					if (this.internalTrack.encryptionAuxInfo) {
						const r = await Ii(this.internalTrack.demuxer.reader, this.internalTrack.encryptionInfo, this.internalTrack.encryptionAuxInfo);
						e < r.length && (t = r[e]);
					}
					t ??= Bi(this.internalTrack.encryptionInfo), t && (i = await Ai(this.internalTrack, t, i, null));
				}
			}
			const a = (r.presentationTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale, s = r.duration / this.internalTrack.timescale, n = new Zr(i, r.isKeyFrame ? "key" : "delta", a, s, e, r.sampleSize);
			return this.packetToSampleIndex.set(n, e), n;
		}
		async fetchPacketInFragment(e, t, r) {
			if (-1 === t) return null;
			const i = e.trackData.get(this.internalTrack.id).samples[t];
			let a;
			if (c(i), r.metadataOnly) a = Yr;
			else {
				let t = this.internalTrack.demuxer.reader.requestSlice(i.byteOffset, i.byteSize);
				if (Pe(t) && (t = await t), !t) return null;
				if (a = Ho(t, i.byteSize), this.internalTrack.encryptionInfo) {
					const t = i.encryption ?? Bi(this.internalTrack.encryptionInfo);
					t && (a = await Ai(this.internalTrack, t, a, e));
				}
			}
			const s = (i.presentationTimestamp - this.internalTrack.editListOffset) / this.internalTrack.timescale, n = i.duration / this.internalTrack.timescale, o = new Zr(a, i.isKeyFrame ? "key" : "delta", s, n, e.moofOffset + t, i.byteSize);
			return this.packetToFragmentLocation.set(o, {
				fragment: e,
				sampleIndex: t
			}), o;
		}
		async performFragmentedLookup(e, t, r, i, a) {
			const s = this.internalTrack.demuxer;
			let n = null, o = null, l = -1;
			if (e) {
				const { sampleIndex: r, correctSampleFound: i } = t(e);
				if (i) return this.fetchPacketInFragment(e, r, a);
				-1 !== r && (o = e, l = r);
			}
			const d = K(this.internalTrack.fragmentLookupTable, r, (e) => e.timestamp), u = -1 !== d ? this.internalTrack.fragmentLookupTable[d] : null, h = K(this.internalTrack.fragmentPositionCache, r, (e) => e.startTimestamp), f = -1 !== h ? this.internalTrack.fragmentPositionCache[h] : null, m = Math.max(u?.moofOffset ?? 0, f?.moofOffset ?? 0) || null;
			let p;
			for (e ? null === m || e.moofOffset >= m ? (p = e.moofOffset + e.moofSize, n = e) : p = m : p = m ?? 0;;) {
				if (n) {
					const e = n.trackData.get(this.internalTrack.id);
					if (e && e.startTimestamp > i) break;
				}
				let e = s.reader.requestSliceRange(p, 8, 16);
				if (Pe(e) && (e = await e), !e) break;
				const r = p, c = ri(e);
				if (!c) break;
				if ("moof" === c.name) {
					n = await s.readFragment(r);
					const { sampleIndex: e, correctSampleFound: i } = t(n);
					if (i) return this.fetchPacketInFragment(n, e, a);
					-1 !== e && (o = n, l = e);
				}
				p = r + c.totalSize;
			}
			if (u && (!o || o.moofOffset < u.moofOffset)) {
				const e = this.internalTrack.fragmentLookupTable[d - 1];
				c(!e || e.timestamp < u.timestamp);
				const r = e?.timestamp ?? -Infinity;
				return this.performFragmentedLookup(null, t, r, i, a);
			}
			return o ? this.fetchPacketInFragment(o, l, a) : null;
		}
	}, yi = class extends wi {
		constructor(e) {
			super(e), this.decoderConfigPromise = null;
		}
		getType() {
			return "video";
		}
		getCodec() {
			return this.internalTrack.info.codec;
		}
		getCodedWidth() {
			return this.internalTrack.info.width;
		}
		getCodedHeight() {
			return this.internalTrack.info.height;
		}
		getSquarePixelWidth() {
			return this.internalTrack.info.squarePixelWidth;
		}
		getSquarePixelHeight() {
			return this.internalTrack.info.squarePixelHeight;
		}
		getTransformationMatrix() {
			return [...this.internalTrack.matrix];
		}
		async getColorSpace() {
			const e = await this.getDecoderConfig();
			return e ? {
				primaries: e.colorSpace?.primaries,
				transfer: e.colorSpace?.transfer,
				matrix: e.colorSpace?.matrix,
				fullRange: e.colorSpace?.fullRange
			} : this.internalTrack.info.colorSpace;
		}
		async canBeTransparent() {
			return "prores" === this.internalTrack.info.codec && ("ap4h" === this.internalTrack.info.proresFormat || "ap4x" === this.internalTrack.info.proresFormat);
		}
		async getDecoderConfig() {
			return this.internalTrack.info.codec ? this.decoderConfigPromise ??= (async () => {
				if ("avc" !== this.internalTrack.info.codec || this.internalTrack.info.codecDescription) if ("hevc" !== this.internalTrack.info.codec || this.internalTrack.info.codecDescription) if ("vp9" !== this.internalTrack.info.codec || this.internalTrack.info.vp9CodecInfo && (2 !== (e = this.internalTrack.info.vp9CodecInfo).colourPrimaries || 2 !== e.transferCharacteristics || 2 !== e.matrixCoefficients)) if ("av1" !== this.internalTrack.info.codec || this.internalTrack.info.av1CodecInfo && ((e) => 2 !== e.colourPrimaries || 2 !== e.transferCharacteristics || 2 !== e.matrixCoefficients)(this.internalTrack.info.av1CodecInfo)) {
					if ("prores" === this.internalTrack.info.codec && !this.internalTrack.info.proresCodecInfo) {
						const e = await this.getFirstPacket({});
						this.internalTrack.info.proresCodecInfo = e && Lt(e.data);
					}
				} else {
					const e = await this.getFirstPacket({}), t = e && Ut(e.data);
					t && (this.internalTrack.info.av1CodecInfo = t);
				}
				else {
					const e = await this.getFirstPacket({}), t = e && zt(e.data);
					t && (this.internalTrack.info.vp9CodecInfo = {
						...this.internalTrack.info.vp9CodecInfo ?? t,
						videoFullRangeFlag: t.videoFullRangeFlag,
						colourPrimaries: t.colourPrimaries,
						transferCharacteristics: t.transferCharacteristics,
						matrixCoefficients: t.matrixCoefficients
					});
				}
				else {
					const e = await this.getFirstPacket({});
					this.internalTrack.info.hevcCodecInfo = e && Ct(e.data);
				}
				else {
					const e = await this.getFirstPacket({});
					this.internalTrack.info.avcCodecInfo = e && gt(e.data);
				}
				var e;
				if (!U(this.internalTrack.info.colorSpace)) {
					const e = _r(this.internalTrack.info);
					this.internalTrack.info.colorSpace.primaries ??= e.primaries, this.internalTrack.info.colorSpace.transfer ??= e.transfer, this.internalTrack.info.colorSpace.matrix ??= e.matrix, this.internalTrack.info.colorSpace.fullRange ??= e.fullRange;
				}
				const t = {
					codec: Er(this.internalTrack.info),
					codedWidth: this.internalTrack.info.width,
					codedHeight: this.internalTrack.info.height,
					description: this.internalTrack.info.codecDescription ?? void 0,
					colorSpace: this.internalTrack.info.colorSpace
				};
				return this.internalTrack.info.width === this.internalTrack.info.squarePixelWidth && this.internalTrack.info.height === this.internalTrack.info.squarePixelHeight || (t.displayAspectWidth = this.internalTrack.info.squarePixelWidth, t.displayAspectHeight = this.internalTrack.info.squarePixelHeight), t;
			})() : null;
		}
	}, bi = class extends wi {
		constructor(e) {
			super(e), this.decoderConfigPromise = null;
		}
		getType() {
			return "audio";
		}
		getCodec() {
			return this.internalTrack.info.codec;
		}
		getNumberOfChannels() {
			return this.internalTrack.info.numberOfChannels;
		}
		getSampleRate() {
			return this.internalTrack.info.sampleRate;
		}
		async getDecoderConfig() {
			return this.internalTrack.info.codec ? this.decoderConfigPromise ??= (async () => {
				if ("dts" === this.internalTrack.info.codec && !this.internalTrack.info.dtsFormat) {
					const e = await this.getFirstPacket({});
					this.internalTrack.info.dtsFormat = e && lr(e.data);
				}
				return {
					codec: Br(this.internalTrack.info),
					numberOfChannels: this.internalTrack.info.numberOfChannels,
					sampleRate: this.internalTrack.info.sampleRate,
					description: this.internalTrack.info.codecDescription ?? void 0
				};
			})() : null;
		}
	};
	const Ti = (e, t) => {
		if (e.presentationTimestamps) {
			const r = K(e.presentationTimestamps, t, (e) => e.presentationTimestamp);
			return -1 === r ? -1 : e.presentationTimestamps[r].sampleIndex;
		}
		{
			const r = K(e.sampleTimingEntries, t, (e) => e.startDecodeTimestamp);
			if (-1 === r) return -1;
			const i = e.sampleTimingEntries[r];
			return i.startIndex + Math.min(Math.floor((t - i.startDecodeTimestamp) / i.delta), i.count - 1);
		}
	}, vi = (e, t) => {
		if (!e.keySampleIndices) return Ti(e, t);
		if (e.presentationTimestamps) {
			const r = K(e.presentationTimestamps, t, (e) => e.presentationTimestamp);
			if (-1 === r) return -1;
			for (let t = r; t >= 0; t--) {
				const r = e.presentationTimestamps[t].sampleIndex;
				if (-1 !== $(e.keySampleIndices, r, (e) => e)) return r;
			}
			return -1;
		}
		{
			const r = Ti(e, t), i = K(e.keySampleIndices, r, (e) => e);
			return e.keySampleIndices[i] ?? -1;
		}
	}, Si = (e, t) => {
		const r = K(e.sampleTimingEntries, t, (e) => e.startIndex), i = e.sampleTimingEntries[r];
		if (!i || i.startIndex + i.count <= t) return null;
		let a = i.startDecodeTimestamp + (t - i.startIndex) * i.delta;
		const s = K(e.sampleCompositionTimeOffsets, t, (e) => e.startIndex), n = e.sampleCompositionTimeOffsets[s];
		n && t - n.startIndex < n.count && (a += n.offset);
		const o = e.sampleSizes[Math.min(t, e.sampleSizes.length - 1)], l = K(e.sampleToChunk, t, (e) => e.startSampleIndex), d = e.sampleToChunk[l];
		c(d);
		const u = d.startChunkIndex + Math.floor((t - d.startSampleIndex) / d.samplesPerChunk), h = e.chunkOffsets[u], f = d.startSampleIndex + (u - d.startChunkIndex) * d.samplesPerChunk;
		let m = 0, p = h;
		if (1 === e.sampleSizes.length) p += o * (t - f), m += o * d.samplesPerChunk;
		else for (let c = f; c < f + d.samplesPerChunk; c++) {
			const r = e.sampleSizes[c];
			c < t && (p += r), m += r;
		}
		let g = i.delta;
		if (e.presentationTimestamps) {
			const r = e.presentationTimestampIndexMap[t];
			c(void 0 !== r), r < e.presentationTimestamps.length - 1 && (g = e.presentationTimestamps[r + 1].presentationTimestamp - a);
		}
		return {
			presentationTimestamp: a,
			duration: g,
			sampleOffset: p,
			sampleSize: o,
			chunkOffset: h,
			chunkSize: m,
			isKeyFrame: !e.keySampleIndices || -1 !== $(e.keySampleIndices, t, (e) => e)
		};
	}, Pi = (e, t) => {
		if (!e.keySampleIndices) return t + 1;
		const r = K(e.keySampleIndices, t, (e) => e);
		return e.keySampleIndices[r + 1] ?? -1;
	}, xi = (e, t) => {
		e.startTimestamp += t, e.endTimestamp += t;
		for (const r of e.samples) r.presentationTimestamp += t;
		for (const r of e.presentationTimestamps) r.presentationTimestamp += t;
	}, Ci = (e) => [
		ii(e),
		ii(e),
		ai(e),
		ii(e),
		ii(e),
		ai(e),
		ii(e),
		ii(e),
		ai(e)
	], Ei = (e) => 0 === e.sampleSizes.length, _i = (e) => e.currentFragmentState ? e.currentFragmentState.encryptionAuxInfo ??= {
		defaultSampleInfoSize: 0,
		sampleSizes: null,
		sampleCount: 0,
		offset: null,
		resolved: null
	} : e.encryptionAuxInfo ??= {
		defaultSampleInfoSize: 0,
		sampleSizes: null,
		sampleCount: 0,
		offset: null,
		resolved: null
	}, Ii = async (e, t, r) => {
		if (r.resolved) return r.resolved;
		if (null === r.offset || 0 === r.sampleCount) throw new Error("Incomplete saiz/saio info; cannot resolve encryption data.");
		let i = 0;
		if (r.defaultSampleInfoSize > 0) i = r.defaultSampleInfoSize * r.sampleCount;
		else {
			c(r.sampleSizes);
			for (let e = 0; e < r.sampleCount; e++) i += r.sampleSizes[e];
		}
		let a = e.requestSlice(r.offset, i);
		if (Pe(a) && (a = await a), !a) throw new Error("Failed to read auxiliary encryption info.");
		const s = t.defaultPerSampleIvSize;
		c(null !== s);
		const n = [];
		for (let o = 0; o < r.sampleCount; o++) {
			const e = r.defaultSampleInfoSize > 0 ? r.defaultSampleInfoSize : r.sampleSizes[o], i = new Uint8Array(16);
			s > 0 ? i.set(Ho(a, s), 0) : i.set(t.defaultConstantIv, 0);
			let c = null;
			if (e > s) {
				const e = Ko(a);
				c = [];
				for (let t = 0; t < e; t++) {
					const e = Ko(a), t = Yo(a);
					c.push({
						clearLen: e,
						protectedLen: t
					});
				}
			}
			n.push({
				iv: i,
				subsamples: c
			});
		}
		return r.resolved = n, n;
	}, Bi = (e) => e.defaultConstantIv ? {
		iv: e.defaultConstantIv,
		subsamples: null
	} : null, Ai = async (e, t, r, i) => {
		c(e.encryptionInfo);
		const a = e.encryptionInfo;
		c(null !== a.defaultKid);
		const s = a.defaultKid;
		let n;
		const o = e.demuxer.decryptionKeyCache.get(s);
		if (o) n = await o;
		else {
			if (!e.demuxer.input._formatOptions.isobmff?.resolveKeyId) throw new Error("Encrypted media samples encountered. To decrypt them, please provide a callback for InputOptions.formatOptions.isobmff.resolveKeyId.");
			const t = (async () => {
				let t = e.demuxer.psshBoxes;
				if (i) {
					t = [...t, ...i.psshBoxes].filter((e) => null === e.keyIds || e.keyIds.includes(s));
					for (let e = 0; e < t.length - 1; e++) for (let r = e + 1; r < t.length; r++) ti(t[e], t[r]) && (t.splice(r, 1), r--);
				}
				const r = await e.demuxer.input._formatOptions.isobmff.resolveKeyId({
					keyId: s,
					psshBoxes: t
				});
				if (!("string" == typeof r && 32 === r.length && V.test(r) || r instanceof Uint8Array && 16 === r.byteLength)) throw new TypeError("resolveKeyId must return a 32-character hex string or a 16-byte Uint8Array containing the decryption key.");
				return r instanceof Uint8Array ? r : ((e) => {
					c(e.length % 2 == 0);
					const t = new Uint8Array(e.length / 2);
					for (let r = 0; r < e.length; r += 2) t[r / 2] = parseInt(e.slice(r, r + 2), 16);
					return t;
				})(r);
			})();
			e.demuxer.decryptionKeyCache.set(s, t), n = await t;
		}
		return "cenc" === a.scheme || "cens" === a.scheme ? Ri(n, a, t, r) : Fi(n, a, t, r);
	}, Ri = async (e, t, r, i) => {
		const a = new Uint8Array(16);
		a.set(r.iv, 0);
		const s = await crypto.subtle.importKey("raw", e, { name: "AES-CTR" }, !1, ["decrypt"]), n = async (e) => {
			const t = await crypto.subtle.decrypt({
				name: "AES-CTR",
				counter: a,
				length: 64
			}, s, e);
			return new Uint8Array(t);
		};
		if (!r.subsamples) return n(i);
		c(null !== t.defaultCryptByteBlock && null !== t.defaultSkipByteBlock);
		const o = Mi(r.subsamples, t.defaultCryptByteBlock, t.defaultSkipByteBlock);
		let l = 0;
		for (const c of o) for (const e of c.perSubsample) l += e.length;
		const d = new Uint8Array(l);
		let u = 0;
		for (const c of o) for (const e of c.perSubsample) d.set(i.subarray(e.offset, e.offset + e.length), u), u += e.length;
		const h = await n(d), f = new Uint8Array(i);
		let m = 0;
		for (const c of o) for (const e of c.perSubsample) f.set(h.subarray(m, m + e.length), e.offset), m += e.length;
		return f;
	}, Fi = (e, t, r, i) => {
		const a = new gi();
		a.init({
			key: e,
			iv: r.iv
		});
		const s = t.defaultCryptByteBlock, n = t.defaultSkipByteBlock;
		if (c(null !== s && null !== n), !r.subsamples) {
			const e = new Uint8Array(i), t = Math.floor(i.length / 16);
			for (let r = 0; r < t; r++) {
				const t = 16 * r;
				a.in.set(i.subarray(t, t + 16)), a.decrypt(), e.set(a.out, t);
			}
			return e;
		}
		if (0 === s && 0 === n) throw new Error("cbcs with subsamples requires pattern encryption.");
		const o = new Uint8Array(i), l = Mi(r.subsamples, s, n), d = new DataView(r.iv.buffer, r.iv.byteOffset, 16);
		for (const c of l) {
			a.iv[0] = d.getUint32(0, !1), a.iv[1] = d.getUint32(4, !1), a.iv[2] = d.getUint32(8, !1), a.iv[3] = d.getUint32(12, !1);
			for (const e of c.perSubsample) {
				const t = e.length / 16;
				for (let r = 0; r < t; r++) {
					const t = e.offset + 16 * r;
					a.in.set(i.subarray(t, t + 16)), a.decrypt(), o.set(a.out, t);
				}
			}
		}
		return o;
	}, Mi = (e, t, r) => {
		const i = [], a = 0 !== t || 0 !== r;
		let s = 0;
		for (const n of e) {
			s += n.clearLen;
			const e = [];
			if (a) {
				let i = n.protectedLen, a = s;
				for (; i > 0 && !(i < 16 * t);) {
					const s = 16 * t;
					e.push({
						offset: a,
						length: s
					}), a += s, i -= s;
					const n = Math.min(16 * r, i);
					a += n, i -= n;
				}
				s += n.protectedLen;
			} else n.protectedLen > 0 && e.push({
				offset: s,
				length: n.protectedLen
			}), s += n.protectedLen;
			i.push({ perSubsample: e });
		}
		return i;
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var Di;
	(function(e) {
		e[e.EBML = 440786851] = "EBML", e[e.EBMLVersion = 17030] = "EBMLVersion", e[e.EBMLReadVersion = 17143] = "EBMLReadVersion", e[e.EBMLMaxIDLength = 17138] = "EBMLMaxIDLength", e[e.EBMLMaxSizeLength = 17139] = "EBMLMaxSizeLength", e[e.DocType = 17026] = "DocType", e[e.DocTypeVersion = 17031] = "DocTypeVersion", e[e.DocTypeReadVersion = 17029] = "DocTypeReadVersion", e[e.Void = 236] = "Void", e[e.Segment = 408125543] = "Segment", e[e.SeekHead = 290298740] = "SeekHead", e[e.Seek = 19899] = "Seek", e[e.SeekID = 21419] = "SeekID", e[e.SeekPosition = 21420] = "SeekPosition", e[e.Duration = 17545] = "Duration", e[e.Info = 357149030] = "Info", e[e.TimestampScale = 2807729] = "TimestampScale", e[e.MuxingApp = 19840] = "MuxingApp", e[e.WritingApp = 22337] = "WritingApp", e[e.Tracks = 374648427] = "Tracks", e[e.TrackEntry = 174] = "TrackEntry", e[e.TrackNumber = 215] = "TrackNumber", e[e.TrackUID = 29637] = "TrackUID", e[e.TrackType = 131] = "TrackType", e[e.FlagEnabled = 185] = "FlagEnabled", e[e.FlagDefault = 136] = "FlagDefault", e[e.FlagForced = 21930] = "FlagForced", e[e.FlagOriginal = 21934] = "FlagOriginal", e[e.FlagHearingImpaired = 21931] = "FlagHearingImpaired", e[e.FlagVisualImpaired = 21932] = "FlagVisualImpaired", e[e.FlagCommentary = 21935] = "FlagCommentary", e[e.FlagLacing = 156] = "FlagLacing", e[e.Name = 21358] = "Name", e[e.Language = 2274716] = "Language", e[e.LanguageBCP47 = 2274717] = "LanguageBCP47", e[e.CodecID = 134] = "CodecID", e[e.CodecPrivate = 25506] = "CodecPrivate", e[e.CodecDelay = 22186] = "CodecDelay", e[e.SeekPreRoll = 22203] = "SeekPreRoll", e[e.DefaultDuration = 2352003] = "DefaultDuration", e[e.Video = 224] = "Video", e[e.PixelWidth = 176] = "PixelWidth", e[e.PixelHeight = 186] = "PixelHeight", e[e.DisplayWidth = 21680] = "DisplayWidth", e[e.DisplayHeight = 21690] = "DisplayHeight", e[e.DisplayUnit = 21682] = "DisplayUnit", e[e.AlphaMode = 21440] = "AlphaMode", e[e.Audio = 225] = "Audio", e[e.SamplingFrequency = 181] = "SamplingFrequency", e[e.Channels = 159] = "Channels", e[e.BitDepth = 25188] = "BitDepth", e[e.SimpleBlock = 163] = "SimpleBlock", e[e.BlockGroup = 160] = "BlockGroup", e[e.Block = 161] = "Block", e[e.BlockAdditions = 30113] = "BlockAdditions", e[e.BlockMore = 166] = "BlockMore", e[e.BlockAdditional = 165] = "BlockAdditional", e[e.BlockAddID = 238] = "BlockAddID", e[e.BlockDuration = 155] = "BlockDuration", e[e.ReferenceBlock = 251] = "ReferenceBlock", e[e.Cluster = 524531317] = "Cluster", e[e.Timestamp = 231] = "Timestamp", e[e.Cues = 475249515] = "Cues", e[e.CuePoint = 187] = "CuePoint", e[e.CueTime = 179] = "CueTime", e[e.CueTrackPositions = 183] = "CueTrackPositions", e[e.CueTrack = 247] = "CueTrack", e[e.CueClusterPosition = 241] = "CueClusterPosition", e[e.Colour = 21936] = "Colour", e[e.MatrixCoefficients = 21937] = "MatrixCoefficients", e[e.TransferCharacteristics = 21946] = "TransferCharacteristics", e[e.Primaries = 21947] = "Primaries", e[e.Range = 21945] = "Range", e[e.Projection = 30320] = "Projection", e[e.ProjectionType = 30321] = "ProjectionType", e[e.ProjectionPoseYaw = 30323] = "ProjectionPoseYaw", e[e.ProjectionPosePitch = 30324] = "ProjectionPosePitch", e[e.ProjectionPoseRoll = 30325] = "ProjectionPoseRoll", e[e.Attachments = 423732329] = "Attachments", e[e.AttachedFile = 24999] = "AttachedFile", e[e.FileDescription = 18046] = "FileDescription", e[e.FileName = 18030] = "FileName", e[e.FileMediaType = 18016] = "FileMediaType", e[e.FileData = 18012] = "FileData", e[e.FileUID = 18094] = "FileUID", e[e.Chapters = 272869232] = "Chapters", e[e.Tags = 307544935] = "Tags", e[e.Tag = 29555] = "Tag", e[e.Targets = 25536] = "Targets", e[e.TargetTypeValue = 26826] = "TargetTypeValue", e[e.TargetType = 25546] = "TargetType", e[e.TagTrackUID = 25541] = "TagTrackUID", e[e.TagEditionUID = 25545] = "TagEditionUID", e[e.TagChapterUID = 25540] = "TagChapterUID", e[e.TagAttachmentUID = 25542] = "TagAttachmentUID", e[e.SimpleTag = 26568] = "SimpleTag", e[e.TagName = 17827] = "TagName", e[e.TagLanguage = 17530] = "TagLanguage", e[e.TagString = 17543] = "TagString", e[e.TagBinary = 17541] = "TagBinary", e[e.ContentEncodings = 28032] = "ContentEncodings", e[e.ContentEncoding = 25152] = "ContentEncoding", e[e.ContentEncodingOrder = 20529] = "ContentEncodingOrder", e[e.ContentEncodingScope = 20530] = "ContentEncodingScope", e[e.ContentCompression = 20532] = "ContentCompression", e[e.ContentCompAlgo = 16980] = "ContentCompAlgo", e[e.ContentCompSettings = 16981] = "ContentCompSettings", e[e.ContentEncryption = 20533] = "ContentEncryption";
	})(Di || (Di = {}));
	const Oi = [Di.EBML, Di.Segment], zi = [
		Di.SeekHead,
		Di.Info,
		Di.Cluster,
		Di.Tracks,
		Di.Cues,
		Di.Attachments,
		Di.Chapters,
		Di.Tags
	], Ni = [...Oi, ...zi], Ui = (e) => {
		if (e.remainingLength < 1) return null;
		const t = jo(e);
		if (e.skip(-1), 0 === t) return null;
		let r = 1, i = 128;
		for (; 0 === (t & i);) r++, i >>= 1;
		return e.remainingLength < r ? null : r;
	}, Li = (e) => {
		if (e.remainingLength < 1) return null;
		const t = jo(e);
		if (0 === t) return null;
		let r = 1, i = 128;
		for (; 0 === (t & i);) r++, i >>= 1;
		if (e.remainingLength < r - 1) return null;
		let a = t & i - 1;
		for (let s = 1; s < r; s++) a *= 256, a += jo(e);
		return a;
	}, Wi = (e, t) => {
		if (t < 1 || t > 8) throw new Error("Bad unsigned int size " + t);
		let r = 0;
		for (let i = 0; i < t; i++) r *= 256, r += jo(e);
		return r;
	}, qi = (e) => {
		const t = Ui(e);
		return null === t || e.remainingLength < t ? null : Wi(e, t);
	}, Vi = (e) => {
		if (e.remainingLength < 1) return null;
		if (255 === jo(e)) return;
		e.skip(-1);
		const t = Li(e);
		return null === t ? null : 72057594037927940 !== t ? t : void 0;
	}, Hi = (e) => {
		c(e.remainingLength >= 2);
		const t = qi(e);
		if (null === t) return null;
		const r = Vi(e);
		return null === r ? null : {
			id: t,
			size: r
		};
	}, ji = (e, t) => {
		const r = Ho(e, t);
		let i = 0;
		for (; i < t && 0 !== r[i];) i += 1;
		return String.fromCharCode(...r.subarray(0, i));
	}, $i = (e, t) => {
		const r = Ho(e, t);
		let i = 0;
		for (; i < t && 0 !== r[i];) i += 1;
		return B.decode(r.subarray(0, i));
	}, Ki = (e, t) => {
		if (0 === t) return 0;
		if (4 !== t && 8 !== t) throw new Error("Bad float size " + t);
		return 4 === t ? ac(e) : sc(e);
	}, Xi = async (e, t, r, i) => {
		const a = new Set(r);
		let s = t;
		for (; null === i || s < i;) {
			let t = e.requestSliceRange(s, 2, 16);
			if (Pe(t) && (t = await t), !t) break;
			const r = Hi(t);
			if (!r) break;
			if (a.has(r.id)) return {
				pos: s,
				found: !0
			};
			da(r.size), s = t.filePos + r.size;
		}
		return {
			pos: null !== i && i > s ? i : s,
			found: !1
		};
	}, Qi = async (e, t, r, i) => {
		const a = new Set(r);
		let s = t;
		for (; s < i;) {
			let t = e.requestSliceRange(s, 0, Math.min(65536, i - s));
			if (Pe(t) && (t = await t), !t) break;
			if (t.length < 8) break;
			for (let e = 0; e < t.length - 8; e++) {
				t.filePos = s;
				const e = qi(t);
				if (null !== e && a.has(e)) return s;
				s++;
			}
		}
		return null;
	}, Gi = "V_MPEG4/ISO/AVC", Yi = "V_MPEGH/ISO/HEVC", Zi = "V_VP8", Ji = "V_VP9", ea = "V_AV1", ta = "V_PRORES", ra = "A_AAC", ia = "A_MPEG/L3", aa = "A_OPUS", sa = "A_VORBIS", na = "A_FLAC", oa = "A_AC3", ca = "A_EAC3", la = "A_DTS";
	function da(e) {
		if (void 0 === e) throw new Error("Undefined element size is used in a place where it is not supported.");
	}
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var ua, ha, fa;
	(function(e) {
		e[e.None = 0] = "None", e[e.Xiph = 1] = "Xiph", e[e.FixedSize = 2] = "FixedSize", e[e.Ebml = 3] = "Ebml";
	})(ua || (ua = {})), function(e) {
		e[e.Block = 1] = "Block", e[e.Private = 2] = "Private", e[e.Next = 4] = "Next";
	}(ha || (ha = {})), function(e) {
		e[e.Zlib = 0] = "Zlib", e[e.Bzlib = 1] = "Bzlib", e[e.lzo1x = 2] = "lzo1x", e[e.HeaderStripping = 3] = "HeaderStripping";
	}(fa || (fa = {}));
	const ma = [
		{
			id: Di.SeekHead,
			flag: "seekHeadSeen"
		},
		{
			id: Di.Info,
			flag: "infoSeen"
		},
		{
			id: Di.Tracks,
			flag: "tracksSeen"
		},
		{
			id: Di.Cues,
			flag: "cuesSeen"
		}
	], pa = 10485760;
	var ga = class extends Gr {
		constructor(e) {
			super(e), this.readMetadataPromise = null, this.segments = [], this.currentSegment = null, this.currentTrack = null, this.currentCluster = null, this.currentBlock = null, this.currentBlockAdditional = null, this.currentCueTime = null, this.currentDecodingInstruction = null, this.currentTagTargetIsMovie = !0, this.currentSimpleTagName = null, this.currentAttachedFile = null, this.isWebM = !1, this.reader = e._reader;
		}
		async getTrackBackings() {
			return await this.readMetadata(), this.segments.flatMap((e) => e.tracks.map((e) => e.trackBacking));
		}
		async getMimeType() {
			await this.readMetadata();
			const e = await this.getTrackBackings(), t = await Promise.all(e.map((e) => e.getDecoderConfig().then((e) => e?.codec ?? null)));
			return ((e) => {
				let t = (e.hasVideo ? "video/" : e.hasAudio ? "audio/" : "application/") + (e.isWebM ? "webm" : "x-matroska");
				e.codecStrings.length > 0 && (t += `; codecs="${[...new Set(e.codecStrings.filter(Boolean))].join(", ")}"`);
				return t;
			})({
				isWebM: this.isWebM,
				hasVideo: this.segments.some((e) => e.tracks.some((e) => "video" === e.info?.type)),
				hasAudio: this.segments.some((e) => e.tracks.some((e) => "audio" === e.info?.type)),
				codecStrings: t.filter(Boolean)
			});
		}
		async getMetadataTags() {
			await this.readMetadata();
			for (const t of this.segments) t.metadataTagsCollected || (null !== this.reader.fileSize && await this.loadSegmentMetadata(t), t.metadataTagsCollected = !0);
			let e = {};
			for (const t of this.segments) e = {
				...e,
				...t.metadataTags
			};
			return e;
		}
		readMetadata() {
			return this.readMetadataPromise ??= (async () => {
				let e = 0;
				for (;;) {
					let t = this.reader.requestSliceRange(e, 2, 16);
					if (Pe(t) && (t = await t), !t) break;
					const r = Hi(t);
					if (!r) break;
					const i = r.id;
					let a = r.size;
					const s = t.filePos;
					if (i === Di.EBML) {
						da(a);
						let e = this.reader.requestSlice(s, a);
						if (Pe(e) && (e = await e), !e) break;
						this.readContiguousElements(e);
					} else if (i === Di.Segment) {
						if (await this.readSegment(s, a), void 0 === a) break;
						if (null === this.reader.fileSize) break;
					} else if (i === Di.Cluster) {
						if (null === this.reader.fileSize) break;
						void 0 === a && (a = (await Xi(this.reader, s, Ni, this.reader.fileSize)).pos - s);
						const e = T(this.segments);
						e && (e.elementEndPos = s + a);
					}
					da(a), e = s + a;
				}
			})();
		}
		async readSegment(e, t) {
			this.currentSegment = {
				seekHeadSeen: !1,
				infoSeen: !1,
				tracksSeen: !1,
				cuesSeen: !1,
				tagsSeen: !1,
				attachmentsSeen: !1,
				timestampScale: -1,
				timestampFactor: -1,
				duration: -1,
				seekEntries: [],
				tracks: [],
				cuePoints: [],
				dataStartPos: e,
				elementEndPos: void 0 === t ? null : e + t,
				clusterSeekStartPos: e,
				lastReadCluster: null,
				metadataTags: {},
				metadataTagsCollected: !1
			}, this.segments.push(this.currentSegment);
			let r = e;
			const i = /* @__PURE__ */ new Set();
			for (; null === this.currentSegment.elementEndPos || r < this.currentSegment.elementEndPos;) {
				let t = this.reader.requestSliceRange(r, 2, 16);
				if (Pe(t) && (t = await t), !t) break;
				const a = r, s = Hi(t);
				if (!s || !zi.includes(s.id) && s.id !== Di.Void) {
					const e = await Qi(this.reader, a, zi, Math.min(this.currentSegment.elementEndPos ?? Infinity, a + pa));
					if (e) {
						r = e;
						continue;
					}
					break;
				}
				const { id: n, size: o } = s, c = t.filePos, l = ma.findIndex((e) => e.id === n);
				if (-1 !== l) {
					const t = ma[l].flag;
					this.currentSegment[t] = !0, n === Di.SeekHead && i.add(a - e), da(o);
					let r = this.reader.requestSlice(c, o);
					Pe(r) && (r = await r), r && this.readContiguousElements(r);
				} else if (n === Di.Tags || n === Di.Attachments) {
					n === Di.Tags ? this.currentSegment.tagsSeen = !0 : this.currentSegment.attachmentsSeen = !0, da(o);
					let e = this.reader.requestSlice(c, o);
					Pe(e) && (e = await e), e && this.readContiguousElements(e);
				} else if (n === Di.Cluster) {
					this.currentSegment.clusterSeekStartPos = a;
					break;
				}
				if (void 0 === o) break;
				r = c + o;
			}
			if (null !== this.reader.fileSize) for (;;) {
				const t = this.currentSegment.seekEntries.find((e) => e.id === Di.SeekHead && !i.has(e.segmentPosition));
				if (!t) break;
				i.add(t.segmentPosition);
				let r = this.reader.requestSliceRange(e + t.segmentPosition, 2, 16);
				if (Pe(r) && (r = await r), !r) continue;
				const a = Hi(r);
				if (!a || a.id !== Di.SeekHead) continue;
				const { size: s } = a;
				da(s);
				let n = this.reader.requestSlice(r.filePos, s);
				Pe(n) && (n = await n), n && this.readContiguousElements(n);
			}
			if (this.currentSegment.seekEntries.sort((e, t) => e.segmentPosition - t.segmentPosition), null !== this.reader.fileSize) for (const o of this.currentSegment.seekEntries) {
				const t = ma.find((e) => e.id === o.id);
				if (!t) continue;
				if (this.currentSegment[t.flag]) continue;
				let r = this.reader.requestSliceRange(e + o.segmentPosition, 2, 16);
				if (Pe(r) && (r = await r), !r) continue;
				const i = Hi(r);
				if (!i) continue;
				const { id: a, size: s } = i;
				if (a !== t.id) continue;
				da(s), this.currentSegment[t.flag] = !0;
				let n = this.reader.requestSlice(r.filePos, s);
				Pe(n) && (n = await n), n && this.readContiguousElements(n);
			}
			-1 === this.currentSegment.timestampScale && (this.currentSegment.timestampScale = 1e6, this.currentSegment.timestampFactor = 1e3);
			for (const o of this.currentSegment.tracks) null !== o.defaultDurationNs && (o.defaultDuration = this.currentSegment.timestampFactor * o.defaultDurationNs / 1e9);
			const a = new Map(this.currentSegment.tracks.map((e) => [e.id, e]));
			for (const o of this.currentSegment.cuePoints) {
				const e = a.get(o.trackId);
				e && e.cuePoints.push(o);
			}
			for (const o of this.currentSegment.tracks) {
				o.cuePoints.sort((e, t) => e.time - t.time);
				for (let e = 0; e < o.cuePoints.length - 1; e++) {
					const t = o.cuePoints[e], r = o.cuePoints[e + 1];
					t.time === r.time && (o.cuePoints.splice(e + 1, 1), e--);
				}
			}
			let s = null, n = -Infinity;
			for (const o of this.currentSegment.tracks) o.cuePoints.length > n && (n = o.cuePoints.length, s = o);
			for (const o of this.currentSegment.tracks) 0 === o.cuePoints.length && (o.cuePoints = s.cuePoints);
			this.currentSegment = null;
		}
		async readCluster(e, t) {
			if (t.lastReadCluster?.elementStartPos === e) return t.lastReadCluster;
			let r = this.reader.requestSliceRange(e, 2, 16);
			Pe(r) && (r = await r), c(r);
			const i = e, a = Hi(r);
			c(a);
			c(a.id === Di.Cluster);
			let s = a.size;
			const n = r.filePos;
			void 0 === s && (s = (await Xi(this.reader, n, Ni, t.elementEndPos)).pos - n);
			let o = this.reader.requestSlice(n, s);
			Pe(o) && (o = await o);
			const l = {
				segment: t,
				elementStartPos: i,
				elementEndPos: n + s,
				dataStartPos: n,
				timestamp: -1,
				trackData: /* @__PURE__ */ new Map()
			};
			this.currentCluster = l, o && (l.elementEndPos = this.readContiguousElements(o, Ni));
			for (const [, d] of l.trackData) {
				const e = d.track;
				c(d.blocks.length > 0);
				let t = !1;
				for (let i = 0; i < d.blocks.length; i++) {
					const e = d.blocks[i];
					e.timestamp += l.timestamp, t ||= e.lacing !== ua.None;
				}
				d.presentationTimestamps = d.blocks.map((e, t) => ({
					timestamp: e.timestamp,
					blockIndex: t
				})).sort((e, t) => e.timestamp - t.timestamp);
				for (let i = 0; i < d.presentationTimestamps.length; i++) {
					const t = d.presentationTimestamps[i], r = d.blocks[t.blockIndex];
					null === d.firstKeyFrameTimestamp && r.isKeyFrame && (d.firstKeyFrameTimestamp = r.timestamp), i < d.presentationTimestamps.length - 1 ? r.duration = d.presentationTimestamps[i + 1].timestamp - r.timestamp : 0 === r.duration && null != e.defaultDuration && r.lacing === ua.None && (r.duration = e.defaultDuration);
				}
				t && (this.expandLacedBlocks(d.blocks, e), d.presentationTimestamps = d.blocks.map((e, t) => ({
					timestamp: e.timestamp,
					blockIndex: t
				})).sort((e, t) => e.timestamp - t.timestamp));
				const r = d.blocks[d.presentationTimestamps[0].blockIndex], a = d.blocks[T(d.presentationTimestamps).blockIndex];
				d.startTimestamp = r.timestamp, d.endTimestamp = a.timestamp + a.duration;
				const s = K(e.clusterPositionCache, d.startTimestamp, (e) => e.startTimestamp);
				-1 !== s && e.clusterPositionCache[s].elementStartPos === i || e.clusterPositionCache.splice(s + 1, 0, {
					elementStartPos: l.elementStartPos,
					startTimestamp: d.startTimestamp
				});
			}
			return t.lastReadCluster = l, l;
		}
		getTrackDataInCluster(e, t) {
			let r = e.trackData.get(t);
			if (!r) {
				const i = e.segment.tracks.find((e) => e.id === t);
				if (!i) return null;
				r = {
					track: i,
					startTimestamp: 0,
					endTimestamp: 0,
					firstKeyFrameTimestamp: null,
					blocks: [],
					presentationTimestamps: []
				}, e.trackData.set(t, r);
			}
			return r;
		}
		expandLacedBlocks(e, t) {
			for (let r = 0; r < e.length; r++) {
				const i = e[r];
				if (i.lacing === ua.None) continue;
				i.decoded || (i.data = this.decodeBlockData(t, i.data), i.decoded = !0);
				const a = qo.tempFromBytes(i.data), s = [], n = jo(a) + 1;
				switch (i.lacing) {
					case ua.Xiph:
						{
							let e = 0;
							for (let t = 0; t < n - 1; t++) {
								let t = 0;
								for (; a.bufferPos < a.length;) {
									const r = jo(a);
									if (t += r, r < 255) {
										s.push(t), e += t;
										break;
									}
								}
							}
							s.push(a.length - (a.bufferPos + e));
						}
						break;
					case ua.FixedSize:
						{
							const e = a.length - 1, t = Math.floor(e / n);
							for (let r = 0; r < n; r++) s.push(t);
						}
						break;
					case ua.Ebml:
						{
							const e = Li(a);
							c(null !== e);
							let t = e;
							s.push(t);
							let r = t;
							for (let i = 1; i < n - 1; i++) {
								const e = a.bufferPos, i = Li(a);
								c(null !== i);
								t += i - ((1 << 7 * (a.bufferPos - e) - 1) - 1), s.push(t), r += t;
							}
							s.push(a.length - (a.bufferPos + r));
						}
						break;
					default: c(!1);
				}
				c(s.length === n), e.splice(r, 1);
				const o = i.duration || n * (t.defaultDuration ?? 0);
				for (let t = 0; t < n; t++) {
					const c = s[t], l = Ho(a, c), d = i.timestamp + o * t / n, u = o / n;
					e.splice(r + t, 0, {
						timestamp: d,
						duration: u,
						isKeyFrame: i.isKeyFrame,
						data: l,
						lacing: ua.None,
						decoded: !0,
						postProcessed: !1,
						mainAdditional: i.mainAdditional
					});
				}
				r += n, r--;
			}
		}
		async loadSegmentMetadata(e) {
			for (const t of e.seekEntries) {
				if (t.id !== Di.Tags || e.tagsSeen) {
					if (t.id !== Di.Attachments || e.attachmentsSeen) continue;
				}
				let r = this.reader.requestSliceRange(e.dataStartPos + t.segmentPosition, 2, 16);
				if (Pe(r) && (r = await r), !r) continue;
				const i = Hi(r);
				if (!i || i.id !== t.id) continue;
				const { size: a } = i;
				da(a), c(!this.currentSegment), this.currentSegment = e;
				let s = this.reader.requestSlice(r.filePos, a);
				Pe(s) && (s = await s), s && this.readContiguousElements(s), this.currentSegment = null, t.id === Di.Tags ? e.tagsSeen = !0 : t.id === Di.Attachments && (e.attachmentsSeen = !0);
			}
		}
		readContiguousElements(e, t) {
			for (; e.remainingLength >= 2;) {
				const r = e.filePos;
				if (!this.traverseElement(e, t)) return r;
			}
			return e.filePos;
		}
		traverseElement(e, t) {
			const r = Hi(e);
			if (!r) return !1;
			if (t && t.includes(r.id)) return !1;
			const { id: i, size: a } = r, s = e.filePos;
			switch (da(a), i) {
				case Di.DocType:
					this.isWebM = "webm" === ji(e, a);
					break;
				case Di.Seek:
					{
						if (!this.currentSegment) break;
						const t = {
							id: -1,
							segmentPosition: -1
						};
						this.currentSegment.seekEntries.push(t), this.readContiguousElements(e.slice(s, a)), -1 !== t.id && -1 !== t.segmentPosition || this.currentSegment.seekEntries.pop();
					}
					break;
				case Di.SeekID:
					{
						const t = this.currentSegment?.seekEntries[this.currentSegment.seekEntries.length - 1];
						if (!t) break;
						t.id = Wi(e, a);
					}
					break;
				case Di.SeekPosition:
					{
						const t = this.currentSegment?.seekEntries[this.currentSegment.seekEntries.length - 1];
						if (!t) break;
						t.segmentPosition = Wi(e, a);
					}
					break;
				case Di.TimestampScale:
					if (!this.currentSegment) break;
					this.currentSegment.timestampScale = Wi(e, a), this.currentSegment.timestampFactor = 1e9 / this.currentSegment.timestampScale;
					break;
				case Di.Duration:
					if (!this.currentSegment) break;
					this.currentSegment.duration = Ki(e, a);
					break;
				case Di.TrackEntry:
					if (!this.currentSegment) break;
					if (this.currentTrack = {
						id: -1,
						segment: this.currentSegment,
						demuxer: this,
						clusterPositionCache: [],
						cuePoints: [],
						disposition: {
							...$e,
							primary: !1
						},
						trackBacking: null,
						codecId: null,
						codecPrivate: null,
						defaultDuration: null,
						defaultDurationNs: null,
						name: null,
						languageCode: "eng",
						hasLanguageBcp47: !1,
						decodingInstructions: [],
						info: null
					}, this.readContiguousElements(e.slice(s, a)), !this.currentTrack) break;
					if (this.currentTrack.decodingInstructions.some((e) => "decompress" !== e.data?.type || e.scope !== ha.Block || e.data.algorithm !== fa.HeaderStripping) && (qe._warn(`Track #${this.currentTrack.id} has an unsupported content encoding; dropping.`), this.currentTrack = null), this.currentTrack && -1 !== this.currentTrack.id && this.currentTrack.codecId && this.currentTrack.info) {
						const e = this.currentTrack.codecId.indexOf("/"), t = -1 === e ? this.currentTrack.codecId : this.currentTrack.codecId.slice(0, e);
						if ("video" === this.currentTrack.info.type && -1 !== this.currentTrack.info.width && -1 !== this.currentTrack.info.height) {
							if (this.currentTrack.info.squarePixelWidth = this.currentTrack.info.width, this.currentTrack.info.squarePixelHeight = this.currentTrack.info.height, null !== this.currentTrack.info.displayWidth && null !== this.currentTrack.info.displayHeight) {
								const e = this.currentTrack.info.displayWidth * this.currentTrack.info.height, t = this.currentTrack.info.displayHeight * this.currentTrack.info.width;
								e > 0 && t > 0 && (e > t ? this.currentTrack.info.squarePixelWidth = Math.round(this.currentTrack.info.width * e / t) : this.currentTrack.info.squarePixelHeight = Math.round(this.currentTrack.info.height * t / e));
							}
							if (this.currentTrack.codecId === Gi) this.currentTrack.info.codec = "avc", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
							else if (this.currentTrack.codecId === Yi) this.currentTrack.info.codec = "hevc", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate;
							else if (t === Zi) this.currentTrack.info.codec = "vp8";
							else if (t === Ji) this.currentTrack.info.codec = "vp9";
							else if (t === ea) this.currentTrack.info.codec = "av1";
							else if (t === ta) {
								const e = this.currentTrack.codecPrivate ? B.decode(this.currentTrack.codecPrivate) : "";
								Sr.includes(e) && (this.currentTrack.info.codec = "prores", this.currentTrack.info.proresFormat = e);
							}
							const e = this.currentTrack;
							this.currentTrack.trackBacking = new wa(e), this.currentSegment.tracks.push(this.currentTrack);
						} else if ("audio" === this.currentTrack.info.type) {
							t === ra ? (this.currentTrack.info.codec = "aac", this.currentTrack.info.aacCodecInfo = {
								isMpeg2: this.currentTrack.codecId.includes("MPEG2"),
								objectType: null
							}, this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : this.currentTrack.codecId === ia ? this.currentTrack.info.codec = "mp3" : t === aa ? (this.currentTrack.info.codec = "opus", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate, this.currentTrack.info.sampleRate = Ar) : t === sa ? (this.currentTrack.info.codec = "vorbis", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : t === na ? (this.currentTrack.info.codec = "flac", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : t === oa ? (this.currentTrack.info.codec = "ac3", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : t === ca ? (this.currentTrack.info.codec = "eac3", this.currentTrack.info.codecDescription = this.currentTrack.codecPrivate) : t === la ? (this.currentTrack.info.codec = "dts", "A_DTS/EXPRESS" === this.currentTrack.codecId ? this.currentTrack.info.dtsFormat = "dtse" : "A_DTS/LOSSLESS" === this.currentTrack.codecId && (this.currentTrack.info.dtsFormat = "dtsl")) : "A_PCM/INT/LIT" === this.currentTrack.codecId ? 8 === this.currentTrack.info.bitDepth ? this.currentTrack.info.codec = "pcm-u8" : 16 === this.currentTrack.info.bitDepth ? this.currentTrack.info.codec = "pcm-s16" : 24 === this.currentTrack.info.bitDepth ? this.currentTrack.info.codec = "pcm-s24" : 32 === this.currentTrack.info.bitDepth && (this.currentTrack.info.codec = "pcm-s32") : "A_PCM/INT/BIG" === this.currentTrack.codecId ? 8 === this.currentTrack.info.bitDepth ? this.currentTrack.info.codec = "pcm-u8" : 16 === this.currentTrack.info.bitDepth ? this.currentTrack.info.codec = "pcm-s16be" : 24 === this.currentTrack.info.bitDepth ? this.currentTrack.info.codec = "pcm-s24be" : 32 === this.currentTrack.info.bitDepth && (this.currentTrack.info.codec = "pcm-s32be") : "A_PCM/FLOAT/IEEE" === this.currentTrack.codecId && (32 === this.currentTrack.info.bitDepth ? this.currentTrack.info.codec = "pcm-f32" : 64 === this.currentTrack.info.bitDepth && (this.currentTrack.info.codec = "pcm-f64"));
							const e = this.currentTrack;
							this.currentTrack.trackBacking = new ya(e), this.currentSegment.tracks.push(this.currentTrack);
						}
					}
					this.currentTrack = null;
					break;
				case Di.TrackNumber:
					if (!this.currentTrack) break;
					this.currentTrack.id = Wi(e, a);
					break;
				case Di.TrackType:
					{
						if (!this.currentTrack) break;
						const t = Wi(e, a);
						1 === t ? this.currentTrack.info = {
							type: "video",
							width: -1,
							height: -1,
							displayWidth: null,
							displayHeight: null,
							displayUnit: null,
							squarePixelWidth: -1,
							squarePixelHeight: -1,
							horizontalScale: 1,
							verticalScale: 1,
							rotation: 0,
							codec: null,
							codecDescription: null,
							colorSpace: { ...L },
							alphaMode: !1,
							proresFormat: null
						} : 2 === t && (this.currentTrack.info = {
							type: "audio",
							numberOfChannels: 1,
							sampleRate: 8e3,
							bitDepth: -1,
							codec: null,
							codecDescription: null,
							aacCodecInfo: null,
							dtsFormat: null
						});
					}
					break;
				case Di.FlagEnabled:
					if (!this.currentTrack) break;
					Wi(e, a) || (this.currentTrack = null);
					break;
				case Di.FlagDefault:
					if (!this.currentTrack) break;
					this.currentTrack.disposition.default = !!Wi(e, a);
					break;
				case Di.FlagForced:
					if (!this.currentTrack) break;
					this.currentTrack.disposition.forced = !!Wi(e, a);
					break;
				case Di.FlagOriginal:
					if (!this.currentTrack) break;
					this.currentTrack.disposition.original = !!Wi(e, a);
					break;
				case Di.FlagHearingImpaired:
					if (!this.currentTrack) break;
					this.currentTrack.disposition.hearingImpaired = !!Wi(e, a);
					break;
				case Di.FlagVisualImpaired:
					if (!this.currentTrack) break;
					this.currentTrack.disposition.visuallyImpaired = !!Wi(e, a);
					break;
				case Di.FlagCommentary:
					if (!this.currentTrack) break;
					this.currentTrack.disposition.commentary = !!Wi(e, a);
					break;
				case Di.CodecID:
					if (!this.currentTrack) break;
					this.currentTrack.codecId = ji(e, a);
					break;
				case Di.CodecPrivate:
					if (!this.currentTrack) break;
					this.currentTrack.codecPrivate = Ho(e, a);
					break;
				case Di.DefaultDuration:
					if (!this.currentTrack) break;
					this.currentTrack.defaultDurationNs = Wi(e, a);
					break;
				case Di.Name:
					if (!this.currentTrack) break;
					this.currentTrack.name = $i(e, a);
					break;
				case Di.Language:
					if (!this.currentTrack) break;
					if (this.currentTrack.hasLanguageBcp47) break;
					this.currentTrack.languageCode = ji(e, a), de(this.currentTrack.languageCode) || (this.currentTrack.languageCode = "und");
					break;
				case Di.LanguageBCP47:
					{
						if (!this.currentTrack) break;
						const t = ji(e, a).split("-")[0];
						this.currentTrack.languageCode = t || "und", this.currentTrack.hasLanguageBcp47 = !0;
					}
					break;
				case Di.Video:
					if ("video" !== this.currentTrack?.info?.type) break;
					this.readContiguousElements(e.slice(s, a));
					break;
				case Di.PixelWidth:
					if ("video" !== this.currentTrack?.info?.type) break;
					this.currentTrack.info.width = Wi(e, a);
					break;
				case Di.PixelHeight:
					if ("video" !== this.currentTrack?.info?.type) break;
					this.currentTrack.info.height = Wi(e, a);
					break;
				case Di.DisplayWidth:
					if ("video" !== this.currentTrack?.info?.type) break;
					this.currentTrack.info.displayWidth = Wi(e, a);
					break;
				case Di.DisplayHeight:
					if ("video" !== this.currentTrack?.info?.type) break;
					this.currentTrack.info.displayHeight = Wi(e, a);
					break;
				case Di.DisplayUnit:
					if ("video" !== this.currentTrack?.info?.type) break;
					this.currentTrack.info.displayUnit = Wi(e, a);
					break;
				case Di.AlphaMode:
					if ("video" !== this.currentTrack?.info?.type) break;
					this.currentTrack.info.alphaMode = 1 === Wi(e, a);
					break;
				case Di.Colour:
					if ("video" !== this.currentTrack?.info?.type) break;
					this.readContiguousElements(e.slice(s, a));
					break;
				case Di.MatrixCoefficients:
					{
						if ("video" !== this.currentTrack?.info?.type) break;
						const t = N[Wi(e, a)];
						this.currentTrack.info.colorSpace.matrix = t;
					}
					break;
				case Di.Range:
					{
						if ("video" !== this.currentTrack?.info?.type) break;
						const t = Wi(e, a);
						this.currentTrack.info.colorSpace.fullRange = 1 === t || 2 === t ? 2 === t : void 0;
					}
					break;
				case Di.TransferCharacteristics:
					{
						if ("video" !== this.currentTrack?.info?.type) break;
						const t = O[Wi(e, a)];
						this.currentTrack.info.colorSpace.transfer = t;
					}
					break;
				case Di.Primaries:
					{
						if ("video" !== this.currentTrack?.info?.type) break;
						const t = M[Wi(e, a)];
						this.currentTrack.info.colorSpace.primaries = t;
					}
					break;
				case Di.Projection:
					if ("video" !== this.currentTrack?.info?.type) break;
					this.readContiguousElements(e.slice(s, a));
					break;
				case Di.ProjectionPoseYaw:
					{
						if ("video" !== this.currentTrack?.info?.type) break;
						const t = Ki(e, a);
						try {
							const e = u(t);
							this.currentTrack.info.horizontalScale = Math.round(Math.cos(e * l));
						} catch {}
					}
					break;
				case Di.ProjectionPosePitch:
					{
						if ("video" !== this.currentTrack?.info?.type) break;
						const t = Ki(e, a);
						try {
							const e = u(t);
							this.currentTrack.info.verticalScale = Math.round(Math.cos(e * l));
						} catch {}
					}
					break;
				case Di.ProjectionPoseRoll:
					{
						if ("video" !== this.currentTrack?.info?.type) break;
						const t = -Ki(e, a);
						try {
							this.currentTrack.info.rotation = u(t);
						} catch {}
					}
					break;
				case Di.Audio:
					if ("audio" !== this.currentTrack?.info?.type) break;
					this.readContiguousElements(e.slice(s, a));
					break;
				case Di.SamplingFrequency:
					if ("audio" !== this.currentTrack?.info?.type) break;
					this.currentTrack.info.sampleRate = Ki(e, a);
					break;
				case Di.Channels:
					if ("audio" !== this.currentTrack?.info?.type) break;
					this.currentTrack.info.numberOfChannels = Wi(e, a);
					break;
				case Di.BitDepth:
					if ("audio" !== this.currentTrack?.info?.type) break;
					this.currentTrack.info.bitDepth = Wi(e, a);
					break;
				case Di.CuePoint:
					if (!this.currentSegment) break;
					this.readContiguousElements(e.slice(s, a)), this.currentCueTime = null;
					break;
				case Di.CueTime:
					this.currentCueTime = Wi(e, a);
					break;
				case Di.CueTrackPositions:
					{
						if (null === this.currentCueTime) break;
						c(this.currentSegment);
						const t = {
							time: this.currentCueTime,
							trackId: -1,
							clusterPosition: -1
						};
						this.currentSegment.cuePoints.push(t), this.readContiguousElements(e.slice(s, a)), -1 !== t.trackId && -1 !== t.clusterPosition || this.currentSegment.cuePoints.pop();
					}
					break;
				case Di.CueTrack:
					{
						const t = this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length - 1];
						if (!t) break;
						t.trackId = Wi(e, a);
					}
					break;
				case Di.CueClusterPosition:
					{
						const t = this.currentSegment?.cuePoints[this.currentSegment.cuePoints.length - 1];
						if (!t) break;
						c(this.currentSegment), t.clusterPosition = this.currentSegment.dataStartPos + Wi(e, a);
					}
					break;
				case Di.Timestamp:
					if (!this.currentCluster) break;
					this.currentCluster.timestamp = Wi(e, a);
					break;
				case Di.SimpleBlock:
					{
						if (!this.currentCluster) break;
						const t = Li(e);
						if (null === t) break;
						const r = this.getTrackDataInCluster(this.currentCluster, t);
						if (!r) break;
						const i = Qo(e), n = jo(e), o = n >> 1 & 3;
						let c = !!(128 & n);
						"audio" === r.track.info?.type && r.track.info.codec && (c = !0);
						const l = Ho(e, a - (e.filePos - s)), d = r.track.decodingInstructions.length > 0;
						r.blocks.push({
							timestamp: i,
							duration: 0,
							isKeyFrame: c,
							data: l,
							lacing: o,
							decoded: !d,
							postProcessed: !1,
							mainAdditional: null
						});
					}
					break;
				case Di.BlockGroup:
					if (!this.currentCluster) break;
					this.readContiguousElements(e.slice(s, a)), this.currentBlock = null;
					break;
				case Di.Block:
					{
						if (!this.currentCluster) break;
						const t = Li(e);
						if (null === t) break;
						const r = this.getTrackDataInCluster(this.currentCluster, t);
						if (!r) break;
						const i = Qo(e), n = jo(e) >> 1 & 3, o = Ho(e, a - (e.filePos - s)), c = r.track.decodingInstructions.length > 0;
						this.currentBlock = {
							timestamp: i,
							duration: 0,
							isKeyFrame: !0,
							data: o,
							lacing: n,
							decoded: !c,
							postProcessed: !1,
							mainAdditional: null
						}, r.blocks.push(this.currentBlock);
					}
					break;
				case Di.BlockAdditions:
					this.readContiguousElements(e.slice(s, a));
					break;
				case Di.BlockMore:
					if (!this.currentBlock) break;
					this.currentBlockAdditional = {
						addId: 1,
						data: null
					}, this.readContiguousElements(e.slice(s, a)), this.currentBlockAdditional.data && 1 === this.currentBlockAdditional.addId && (this.currentBlock.mainAdditional = this.currentBlockAdditional.data), this.currentBlockAdditional = null;
					break;
				case Di.BlockAdditional:
					if (!this.currentBlockAdditional) break;
					this.currentBlockAdditional.data = Ho(e, a);
					break;
				case Di.BlockAddID:
					if (!this.currentBlockAdditional) break;
					this.currentBlockAdditional.addId = Wi(e, a);
					break;
				case Di.BlockDuration:
					if (!this.currentBlock) break;
					this.currentBlock.duration = Wi(e, a);
					break;
				case Di.ReferenceBlock:
					if (!this.currentBlock) break;
					this.currentBlock.isKeyFrame = !1;
					break;
				case Di.Tag:
					this.currentTagTargetIsMovie = !0, this.readContiguousElements(e.slice(s, a));
					break;
				case Di.Targets:
					this.readContiguousElements(e.slice(s, a));
					break;
				case Di.TargetTypeValue:
					50 !== Wi(e, a) && (this.currentTagTargetIsMovie = !1);
					break;
				case Di.TagTrackUID:
				case Di.TagEditionUID:
				case Di.TagChapterUID:
				case Di.TagAttachmentUID:
					this.currentTagTargetIsMovie = !1;
					break;
				case Di.SimpleTag:
					if (!this.currentTagTargetIsMovie) break;
					this.currentSimpleTagName = null, this.readContiguousElements(e.slice(s, a));
					break;
				case Di.TagName:
					this.currentSimpleTagName = $i(e, a);
					break;
				case Di.TagString:
					{
						if (!this.currentSimpleTagName) break;
						const t = $i(e, a);
						this.processTagValue(this.currentSimpleTagName, t);
					}
					break;
				case Di.TagBinary:
					{
						if (!this.currentSimpleTagName) break;
						const t = Ho(e, a);
						this.processTagValue(this.currentSimpleTagName, t);
					}
					break;
				case Di.AttachedFile:
					{
						if (!this.currentSegment) break;
						this.currentAttachedFile = {
							fileUid: null,
							fileName: null,
							fileMediaType: null,
							fileData: null,
							fileDescription: null
						}, this.readContiguousElements(e.slice(s, a));
						const t = this.currentSegment.metadataTags;
						if (this.currentAttachedFile.fileUid && this.currentAttachedFile.fileData && (t.raw ??= {}, t.raw[this.currentAttachedFile.fileUid.toString()] = new He(this.currentAttachedFile.fileData, this.currentAttachedFile.fileMediaType ?? void 0, this.currentAttachedFile.fileName ?? void 0, this.currentAttachedFile.fileDescription ?? void 0)), this.currentAttachedFile.fileMediaType?.startsWith("image/") && this.currentAttachedFile.fileData) {
							const e = this.currentAttachedFile.fileName;
							let r = "unknown";
							if (e) {
								const t = e.toLowerCase();
								t.startsWith("cover.") ? r = "coverFront" : t.startsWith("back.") && (r = "coverBack");
							}
							t.images ??= [], t.images.push({
								data: this.currentAttachedFile.fileData,
								mimeType: this.currentAttachedFile.fileMediaType,
								kind: r,
								name: this.currentAttachedFile.fileName ?? void 0,
								description: this.currentAttachedFile.fileDescription ?? void 0
							});
						}
						this.currentAttachedFile = null;
					}
					break;
				case Di.FileUID:
					if (!this.currentAttachedFile) break;
					this.currentAttachedFile.fileUid = ((e, t) => {
						if (t < 1) throw new Error("Bad unsigned int size " + t);
						let r = 0n;
						for (let i = 0; i < t; i++) r <<= 8n, r += BigInt(jo(e));
						return r;
					})(e, a);
					break;
				case Di.FileName:
					if (!this.currentAttachedFile) break;
					this.currentAttachedFile.fileName = $i(e, a);
					break;
				case Di.FileMediaType:
					if (!this.currentAttachedFile) break;
					this.currentAttachedFile.fileMediaType = ji(e, a);
					break;
				case Di.FileData:
					if (!this.currentAttachedFile) break;
					this.currentAttachedFile.fileData = Ho(e, a);
					break;
				case Di.FileDescription:
					if (!this.currentAttachedFile) break;
					this.currentAttachedFile.fileDescription = $i(e, a);
					break;
				case Di.ContentEncodings:
					if (!this.currentTrack) break;
					this.readContiguousElements(e.slice(s, a)), this.currentTrack.decodingInstructions.sort((e, t) => t.order - e.order);
					break;
				case Di.ContentEncoding:
					this.currentDecodingInstruction = {
						order: 0,
						scope: ha.Block,
						data: null
					}, this.readContiguousElements(e.slice(s, a)), this.currentDecodingInstruction.data && this.currentTrack.decodingInstructions.push(this.currentDecodingInstruction), this.currentDecodingInstruction = null;
					break;
				case Di.ContentEncodingOrder:
					if (!this.currentDecodingInstruction) break;
					this.currentDecodingInstruction.order = Wi(e, a);
					break;
				case Di.ContentEncodingScope:
					if (!this.currentDecodingInstruction) break;
					this.currentDecodingInstruction.scope = Wi(e, a);
					break;
				case Di.ContentCompression:
					if (!this.currentDecodingInstruction) break;
					this.currentDecodingInstruction.data = {
						type: "decompress",
						algorithm: fa.Zlib,
						settings: null
					}, this.readContiguousElements(e.slice(s, a));
					break;
				case Di.ContentCompAlgo:
					if ("decompress" !== this.currentDecodingInstruction?.data?.type) break;
					this.currentDecodingInstruction.data.algorithm = Wi(e, a);
					break;
				case Di.ContentCompSettings:
					if ("decompress" !== this.currentDecodingInstruction?.data?.type) break;
					this.currentDecodingInstruction.data.settings = Ho(e, a);
					break;
				case Di.ContentEncryption:
					if (!this.currentDecodingInstruction) break;
					this.currentDecodingInstruction.data = { type: "decrypt" };
			}
			return e.filePos = s + a, !0;
		}
		decodeBlockData(e, t) {
			c(e.decodingInstructions.length > 0);
			let r = t;
			for (const i of e.decodingInstructions) if (c(i.data), "decompress" === i.data.type) {
				if (i.data.algorithm === fa.HeaderStripping) {
					if (i.data.settings && i.data.settings.length > 0) {
						const e = i.data.settings, t = new Uint8Array(e.length + r.length);
						t.set(e, 0), t.set(r, e.length), r = t;
					}
				}
			}
			return r;
		}
		processTagValue(e, t) {
			if (!this.currentSegment?.metadataTags) return;
			const r = this.currentSegment.metadataTags;
			if (r.raw ??= {}, r.raw[e] ??= t, "string" == typeof t) switch (e.toLowerCase()) {
				case "title":
					r.title ??= t;
					break;
				case "description":
					r.description ??= t;
					break;
				case "artist":
					r.artist ??= t;
					break;
				case "album":
					r.album ??= t;
					break;
				case "album_artist":
					r.albumArtist ??= t;
					break;
				case "genre":
					r.genre ??= t;
					break;
				case "bpm":
					{
						const e = Number.parseInt(t, 10);
						Number.isInteger(e) && e > 0 && (r.beatsPerMinute ??= e);
					}
					break;
				case "comment":
					r.comment ??= t;
					break;
				case "lyrics":
					r.lyrics ??= t;
					break;
				case "date":
					{
						const e = new Date(t);
						Number.isNaN(e.getTime()) || (r.date ??= e);
					}
					break;
				case "track_number":
				case "part_number":
					{
						const e = t.split("/"), i = Number.parseInt(e[0], 10), a = e[1] && Number.parseInt(e[1], 10);
						Number.isInteger(i) && i > 0 && (r.trackNumber ??= i), a && Number.isInteger(a) && a > 0 && (r.tracksTotal ??= a);
					}
					break;
				case "disc_number":
				case "disc": {
					const e = t.split("/"), i = Number.parseInt(e[0], 10), a = e[1] && Number.parseInt(e[1], 10);
					Number.isInteger(i) && i > 0 && (r.discNumber ??= i), a && Number.isInteger(a) && a > 0 && (r.discsTotal ??= a);
				}
			}
		}
		getDurationFromMetadata(e) {
			return e.duration <= 0 ? null : e.duration / e.timestampFactor;
		}
	}, ka = class {
		constructor(e) {
			this.internalTrack = e, this.packetToClusterLocation = /* @__PURE__ */ new WeakMap();
		}
		getId() {
			return this.internalTrack.id;
		}
		getNumber() {
			const e = this.internalTrack.demuxer, t = this.internalTrack.trackBacking.getType();
			let r = 0;
			for (const i of e.segments) for (const e of i.tracks) if (e.trackBacking.getType() === t && r++, e === this.internalTrack) break;
			return r;
		}
		getCodec() {
			throw new Error("Not implemented on base class.");
		}
		getInternalCodecId() {
			return this.internalTrack.codecId;
		}
		getName() {
			return this.internalTrack.name;
		}
		getLanguageCode() {
			return this.internalTrack.languageCode;
		}
		getTimeResolution() {
			return this.internalTrack.segment.timestampFactor;
		}
		isRelativeToUnixEpoch() {
			return !1;
		}
		getUnixTimeForTimestamp() {
			return null;
		}
		getDisposition() {
			return this.internalTrack.disposition;
		}
		getPairingMask() {
			return 1n;
		}
		getBitrate() {
			return null;
		}
		getAverageBitrate() {
			return null;
		}
		async getDurationFromMetadata() {
			return this.internalTrack.demuxer.getDurationFromMetadata(this.internalTrack.segment);
		}
		async getLiveRefreshInterval() {
			return null;
		}
		async getFirstPacket(e) {
			return this.performClusterLookup(null, (e) => e.trackData.get(this.internalTrack.id) ? {
				blockIndex: 0,
				correctBlockFound: !0
			} : {
				blockIndex: -1,
				correctBlockFound: !1
			}, -Infinity, Infinity, e);
		}
		intoTimescale(e) {
			return ie(e * this.internalTrack.segment.timestampFactor);
		}
		async getPacket(e, t) {
			const r = this.intoTimescale(e);
			return this.performClusterLookup(null, (e) => {
				const t = e.trackData.get(this.internalTrack.id);
				if (!t) return {
					blockIndex: -1,
					correctBlockFound: !1
				};
				const i = K(t.presentationTimestamps, r, (e) => e.timestamp);
				return {
					blockIndex: -1 !== i ? t.presentationTimestamps[i].blockIndex : -1,
					correctBlockFound: -1 !== i && r < t.endTimestamp
				};
			}, r, r, t);
		}
		async getNextPacket(e, t) {
			const r = this.packetToClusterLocation.get(e);
			if (void 0 === r) throw new Error("Packet was not created from this track.");
			return this.performClusterLookup(r.cluster, (e) => {
				if (e === r.cluster) {
					const t = e.trackData.get(this.internalTrack.id);
					if (r.blockIndex + 1 < t.blocks.length) return {
						blockIndex: r.blockIndex + 1,
						correctBlockFound: !0
					};
				} else if (e.trackData.get(this.internalTrack.id)) return {
					blockIndex: 0,
					correctBlockFound: !0
				};
				return {
					blockIndex: -1,
					correctBlockFound: !1
				};
			}, -Infinity, Infinity, t);
		}
		async getKeyPacket(e, t) {
			const r = this.intoTimescale(e);
			return this.performClusterLookup(null, (e) => {
				const t = e.trackData.get(this.internalTrack.id);
				if (!t) return {
					blockIndex: -1,
					correctBlockFound: !1
				};
				const i = Z(t.presentationTimestamps, (e) => t.blocks[e.blockIndex].isKeyFrame && e.timestamp <= r);
				return {
					blockIndex: -1 !== i ? t.presentationTimestamps[i].blockIndex : -1,
					correctBlockFound: -1 !== i && r < t.endTimestamp
				};
			}, r, r, t);
		}
		async getNextKeyPacket(e, t) {
			const r = this.packetToClusterLocation.get(e);
			if (void 0 === r) throw new Error("Packet was not created from this track.");
			return this.performClusterLookup(r.cluster, (e) => {
				if (e === r.cluster) {
					const t = e.trackData.get(this.internalTrack.id).blocks.findIndex((e, t) => e.isKeyFrame && t > r.blockIndex);
					if (-1 !== t) return {
						blockIndex: t,
						correctBlockFound: !0
					};
				} else {
					const t = e.trackData.get(this.internalTrack.id);
					if (t && null !== t.firstKeyFrameTimestamp) {
						const e = t.blocks.findIndex((e) => e.isKeyFrame);
						return c(-1 !== e), {
							blockIndex: e,
							correctBlockFound: !0
						};
					}
				}
				return {
					blockIndex: -1,
					correctBlockFound: !1
				};
			}, -Infinity, Infinity, t);
		}
		async fetchPacketInCluster(e, t, r) {
			if (-1 === t) return null;
			const i = e.trackData.get(this.internalTrack.id).blocks[t];
			if (c(i), i.decoded || (i.data = this.internalTrack.demuxer.decodeBlockData(this.internalTrack, i.data), i.decoded = !0), !i.postProcessed) {
				if ("prores" === this.internalTrack.info?.codec && !(i.data.length >= 8 && 105 === i.data[4] && 99 === i.data[5] && 112 === i.data[6] && 102 === i.data[7])) {
					const e = new Uint8Array(i.data.length + 8);
					E(e).setUint32(0, e.length, !1), e[4] = 105, e[5] = 99, e[6] = 112, e[7] = 102, e.set(i.data, 8), i.data = e;
				}
				i.postProcessed = !0;
			}
			const a = r.metadataOnly ? Yr : i.data, s = i.timestamp / this.internalTrack.segment.timestampFactor, n = i.duration / this.internalTrack.segment.timestampFactor, o = {};
			i.mainAdditional && "video" === this.internalTrack.info?.type && this.internalTrack.info.alphaMode && (o.alpha = r.metadataOnly ? Yr : i.mainAdditional, o.alphaByteLength = i.mainAdditional.byteLength);
			const l = new Zr(a, i.isKeyFrame ? "key" : "delta", s, n, e.dataStartPos + t, i.data.byteLength, o);
			return this.packetToClusterLocation.set(l, {
				cluster: e,
				blockIndex: t
			}), l;
		}
		async performClusterLookup(e, t, r, i, a) {
			const { demuxer: s, segment: n } = this.internalTrack;
			let o = null, l = null, d = -1;
			if (e) {
				const { blockIndex: r, correctBlockFound: i } = t(e);
				if (i) return this.fetchPacketInCluster(e, r, a);
				-1 !== r && (l = e, d = r);
			}
			const u = K(this.internalTrack.cuePoints, r, (e) => e.time), h = -1 !== u ? this.internalTrack.cuePoints[u] : null, f = K(this.internalTrack.clusterPositionCache, r, (e) => e.startTimestamp), m = -1 !== f ? this.internalTrack.clusterPositionCache[f] : null, p = Math.max(h?.clusterPosition ?? 0, m?.elementStartPos ?? 0) || null;
			let g;
			for (e ? null === p || e.elementStartPos >= p ? (g = e.elementEndPos, o = e) : g = p : g = p ?? n.clusterSeekStartPos; null === n.elementEndPos || g <= n.elementEndPos - 2;) {
				if (o) {
					const e = o.trackData.get(this.internalTrack.id);
					if (e && e.startTimestamp > i) break;
				}
				let e = s.reader.requestSliceRange(g, 2, 16);
				if (Pe(e) && (e = await e), !e) break;
				const r = g, u = Hi(e);
				if (!u || !zi.includes(u.id) && u.id !== Di.Void) {
					const e = await Qi(s.reader, r, zi, Math.min(n.elementEndPos ?? Infinity, r + pa));
					if (e) {
						g = e;
						continue;
					}
					break;
				}
				const h = u.id;
				let f = u.size;
				const m = e.filePos;
				if (h === Di.Cluster) {
					o = await s.readCluster(r, n), f = o.elementEndPos - m;
					const { blockIndex: e, correctBlockFound: i } = t(o);
					if (i) return this.fetchPacketInCluster(o, e, a);
					-1 !== e && (l = o, d = e);
				}
				void 0 === f && (c(h !== Di.Cluster), f = (await Xi(s.reader, m, Ni, n.elementEndPos)).pos - m);
				const p = m + f;
				if (null === n.elementEndPos) {
					let e = s.reader.requestSliceRange(p, 2, 16);
					if (Pe(e) && (e = await e), !e) break;
					if (qi(e) === Di.Segment) {
						n.elementEndPos = p;
						break;
					}
				}
				g = p;
			}
			if (h && (!l || l.elementStartPos < h.clusterPosition)) {
				const e = this.internalTrack.cuePoints[u - 1];
				c(!e || e.time < h.time);
				const r = e?.time ?? -Infinity;
				return this.performClusterLookup(null, t, r, i, a);
			}
			return l ? this.fetchPacketInCluster(l, d, a) : null;
		}
	}, wa = class extends ka {
		constructor(e) {
			super(e), this.decoderConfigPromise = null;
		}
		getType() {
			return "video";
		}
		getCodec() {
			return this.internalTrack.info.codec;
		}
		getCodedWidth() {
			return this.internalTrack.info.width;
		}
		getCodedHeight() {
			return this.internalTrack.info.height;
		}
		getSquarePixelWidth() {
			return this.internalTrack.info.squarePixelWidth;
		}
		getSquarePixelHeight() {
			return this.internalTrack.info.squarePixelHeight;
		}
		getTransformationMatrix() {
			const e = this.internalTrack.info;
			return f(y(w(e.horizontalScale, e.verticalScale), g(e.rotation)), e.width, e.height);
		}
		async getColorSpace() {
			const e = await this.getDecoderConfig();
			return e ? {
				primaries: e.colorSpace?.primaries,
				transfer: e.colorSpace?.transfer,
				matrix: e.colorSpace?.matrix,
				fullRange: e.colorSpace?.fullRange
			} : this.internalTrack.info.colorSpace;
		}
		async canBeTransparent() {
			return this.internalTrack.info.alphaMode || "prores" === this.internalTrack.info.codec && ("ap4h" === this.internalTrack.info.proresFormat || "ap4x" === this.internalTrack.info.proresFormat);
		}
		async getDecoderConfig() {
			return this.internalTrack.info.codec ? this.decoderConfigPromise ??= (async () => {
				let e = null;
				("vp9" === this.internalTrack.info.codec || "av1" === this.internalTrack.info.codec || "prores" === this.internalTrack.info.codec || "avc" === this.internalTrack.info.codec && !this.internalTrack.info.codecDescription || "hevc" === this.internalTrack.info.codec && !this.internalTrack.info.codecDescription) && (e = await this.getFirstPacket({}));
				const t = {
					width: this.internalTrack.info.width,
					height: this.internalTrack.info.height,
					codec: this.internalTrack.info.codec,
					codecDescription: this.internalTrack.info.codecDescription,
					colorSpace: this.internalTrack.info.colorSpace,
					avcType: 1,
					avcCodecInfo: "avc" === this.internalTrack.info.codec && e ? gt(e.data) : null,
					hevcCodecInfo: "hevc" === this.internalTrack.info.codec && e ? Ct(e.data) : null,
					vp9CodecInfo: "vp9" === this.internalTrack.info.codec && e ? zt(e.data) : null,
					av1CodecInfo: "av1" === this.internalTrack.info.codec && e ? Ut(e.data) : null,
					proresCodecInfo: "prores" === this.internalTrack.info.codec && e ? Lt(e.data) : null,
					proresFormat: this.internalTrack.info.proresFormat
				};
				if (!U(this.internalTrack.info.colorSpace)) {
					const e = _r(t);
					this.internalTrack.info.colorSpace.primaries ??= e.primaries, this.internalTrack.info.colorSpace.transfer ??= e.transfer, this.internalTrack.info.colorSpace.matrix ??= e.matrix, this.internalTrack.info.colorSpace.fullRange ??= e.fullRange;
				}
				const r = {
					codec: Er(t),
					codedWidth: this.internalTrack.info.width,
					codedHeight: this.internalTrack.info.height,
					description: this.internalTrack.info.codecDescription ?? void 0,
					colorSpace: this.internalTrack.info.colorSpace
				};
				return this.internalTrack.info.width === this.internalTrack.info.squarePixelWidth && this.internalTrack.info.height === this.internalTrack.info.squarePixelHeight || (r.displayAspectWidth = this.internalTrack.info.squarePixelWidth, r.displayAspectHeight = this.internalTrack.info.squarePixelHeight), r;
			})() : null;
		}
	}, ya = class extends ka {
		constructor(e) {
			super(e), this.decoderConfigPromise = null;
		}
		getType() {
			return "audio";
		}
		getCodec() {
			return this.internalTrack.info.codec;
		}
		getNumberOfChannels() {
			return this.internalTrack.info.numberOfChannels;
		}
		getSampleRate() {
			return this.internalTrack.info.sampleRate;
		}
		async getDecoderConfig() {
			return this.internalTrack.info.codec ? this.decoderConfigPromise ??= (async () => {
				if ("dts" === this.internalTrack.info.codec && !this.internalTrack.info.dtsFormat) {
					const e = await this.getFirstPacket({});
					this.internalTrack.info.dtsFormat = e && lr(e.data);
				}
				return {
					codec: Br({
						codec: this.internalTrack.info.codec,
						codecDescription: this.internalTrack.info.codecDescription,
						aacCodecInfo: this.internalTrack.info.aacCodecInfo,
						dtsFormat: this.internalTrack.info.dtsFormat
					}),
					numberOfChannels: this.internalTrack.info.numberOfChannels,
					sampleRate: this.internalTrack.info.sampleRate,
					description: this.internalTrack.info.codecDescription ?? void 0
				};
			})() : null;
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	const ba = async (e, t, r, i = null) => {
		let a = t;
		for (; null === r || a < r;) {
			const t = null !== r ? Math.min(65536, r - a) : 65536;
			let s = e.requestSliceRange(a, 4, t);
			if (Pe(s) && (s = await s), !s || s.length < 4) break;
			for (; s.remainingLength >= 4;) {
				const t = s.filePos, r = $r(Yo(s), null !== e.fileSize ? e.fileSize - a : null);
				if (r.header && (!i || r.header.sampleRate === i.sampleRate && r.header.mpegVersionId === i.mpegVersionId && r.header.layer === i.layer && Qr(r.header.channel) === Qr(i.channel))) return {
					header: r.header,
					startPos: a
				};
				s.filePos = t + r.bytesAdvanced, a = s.filePos;
			}
		}
		return null;
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/ var Ta = class extends Gr {
		constructor(e) {
			super(e), this.metadataPromise = null, this.firstFrameHeader = null, this.firstFrameHeaderPos = null, this.xingFrameHeader = null, this.xingFrameHeaderPos = null, this.loadedSamples = [], this.metadataTags = null, this.xingData = null, this.trackBackings = [], this.readingMutex = new q(), this.lastSampleLoaded = !1, this.lastLoadedPos = 0, this.nextTimestampInSamples = 0, this.reader = e._reader;
		}
		async readMetadata() {
			return this.metadataPromise ??= (async () => {
				for (; !this.firstFrameHeader && !this.lastSampleLoaded;) await this.advanceReader();
				if (!this.firstFrameHeader && this.xingFrameHeader && (this.firstFrameHeader = this.xingFrameHeader, this.firstFrameHeaderPos = this.xingFrameHeaderPos), !this.firstFrameHeader) throw new Error("No valid MP3 frame found.");
				this.trackBackings = [new va(this)];
			})();
		}
		async advanceReader() {
			if (0 === this.lastLoadedPos) for (;;) {
				let e = this.reader.requestSlice(this.lastLoadedPos, 10);
				if (Pe(e) && (e = await e), !e) return void (this.lastSampleLoaded = !0);
				const t = fc(e);
				if (!t) break;
				this.lastLoadedPos = e.filePos + t.size;
			}
			const e = await ba(this.reader, this.lastLoadedPos, this.reader.fileSize, this.firstFrameHeader);
			if (!e) return void (this.lastSampleLoaded = !0);
			const t = e.header;
			this.lastLoadedPos = e.startPos + t.totalSize - 1;
			const r = jr(t.mpegVersionId, t.channel);
			let i = this.reader.requestSlice(e.startPos + r, 4);
			if (Pe(i) && (i = await i), i) {
				const a = Yo(i);
				if (1483304551 === a || 1231971951 === a) {
					if (this.xingFrameHeader || (this.xingFrameHeader = t, this.xingFrameHeaderPos = e.startPos), !this.xingData) {
						let t = this.reader.requestSlice(e.startPos + r + 4, 12);
						if (Pe(t) && (t = await t), t) {
							const e = E(Ho(t, 12)), r = e.getUint32(0, !1);
							this.xingData = {
								frameCount: r & Xr.FrameCount ? e.getUint32(4, !1) : null,
								fileSize: r & Xr.FileSize ? e.getUint32(8, !1) : null
							};
						}
					}
					return;
				}
			}
			this.firstFrameHeader || (this.firstFrameHeader = t, this.firstFrameHeaderPos = e.startPos);
			const a = t.audioSamplesInFrame / this.firstFrameHeader.sampleRate, s = {
				timestamp: this.nextTimestampInSamples / this.firstFrameHeader.sampleRate,
				duration: a,
				dataStart: e.startPos,
				dataSize: t.totalSize
			};
			this.loadedSamples.push(s), this.nextTimestampInSamples += t.audioSamplesInFrame;
		}
		async getMimeType() {
			return "audio/mpeg";
		}
		async getTrackBackings() {
			return await this.readMetadata(), this.trackBackings;
		}
		async getMetadataTags() {
			const e = await this.readingMutex.acquire();
			try {
				if (await this.readMetadata(), this.metadataTags) return this.metadataTags;
				this.metadataTags = {};
				let e = 0, t = !1;
				for (;;) {
					let r = this.reader.requestSlice(e, 10);
					if (Pe(r) && (r = await r), !r) break;
					const i = fc(r);
					if (!i) break;
					t = !0;
					let a = this.reader.requestSlice(r.filePos, i.size);
					if (Pe(a) && (a = await a), !a) break;
					mc(a, i, this.metadataTags), e = r.filePos + i.size;
				}
				if (!t && null !== this.reader.fileSize && this.reader.fileSize >= 128) {
					let e = this.reader.requestSlice(this.reader.fileSize - 128, 128);
					Pe(e) && (e = await e), c(e), "TAG" === nc(e, 3) && uc(e, this.metadataTags);
				}
				return this.metadataTags;
			} finally {
				e();
			}
		}
	}, va = class {
		constructor(e) {
			this.demuxer = e;
		}
		getType() {
			return "audio";
		}
		getId() {
			return 1;
		}
		getNumber() {
			return 1;
		}
		getTimeResolution() {
			return c(this.demuxer.firstFrameHeader), this.demuxer.firstFrameHeader.sampleRate / this.demuxer.firstFrameHeader.audioSamplesInFrame;
		}
		isRelativeToUnixEpoch() {
			return !1;
		}
		getUnixTimeForTimestamp() {
			return null;
		}
		getPairingMask() {
			return 1n;
		}
		getBitrate() {
			return null;
		}
		getAverageBitrate() {
			return null;
		}
		async getDurationFromMetadata() {
			const e = this.demuxer;
			if (c(null !== e.firstFrameHeader), c(null !== e.firstFrameHeaderPos), e.xingData) {
				if (null !== e.xingData.frameCount) return e.xingData.frameCount * e.firstFrameHeader.audioSamplesInFrame / e.firstFrameHeader.sampleRate;
			} else if (null !== e.reader.fileSize) {
				const s = (t = e.firstFrameHeader.lowSamplingFrequency, r = e.firstFrameHeader.layer, i = e.firstFrameHeader.bitrate, a = e.firstFrameHeader.sampleRate, 0 === r ? 0 : 1 === r ? 144 * i / (a << t) : 2 === r ? 144 * i / a : 12 * i / a * 4), n = (e.reader.fileSize - e.firstFrameHeaderPos) / s;
				return Math.round(n) * e.firstFrameHeader.audioSamplesInFrame / e.firstFrameHeader.sampleRate;
			}
			var t, r, i, a;
			return null;
		}
		async getLiveRefreshInterval() {
			return null;
		}
		getName() {
			return null;
		}
		getLanguageCode() {
			return "und";
		}
		getCodec() {
			return "mp3";
		}
		getInternalCodecId() {
			return null;
		}
		getNumberOfChannels() {
			return c(this.demuxer.firstFrameHeader), Qr(this.demuxer.firstFrameHeader.channel);
		}
		getSampleRate() {
			return c(this.demuxer.firstFrameHeader), this.demuxer.firstFrameHeader.sampleRate;
		}
		getDisposition() {
			return { ...$e };
		}
		async getDecoderConfig() {
			return c(this.demuxer.firstFrameHeader), {
				codec: "mp3",
				numberOfChannels: Qr(this.demuxer.firstFrameHeader.channel),
				sampleRate: this.demuxer.firstFrameHeader.sampleRate
			};
		}
		async getPacketAtIndex(e, t) {
			if (-1 === e) return null;
			const r = this.demuxer.loadedSamples[e];
			if (!r) return null;
			let i;
			if (t.metadataOnly) i = Yr;
			else {
				let e = this.demuxer.reader.requestSlice(r.dataStart, r.dataSize);
				if (Pe(e) && (e = await e), !e) return null;
				i = Ho(e, r.dataSize);
			}
			return new Zr(i, "key", r.timestamp, r.duration, e, r.dataSize);
		}
		getFirstPacket(e) {
			return this.getPacketAtIndex(0, e);
		}
		async getNextPacket(e, t) {
			const r = await this.demuxer.readingMutex.acquire();
			try {
				const r = $(this.demuxer.loadedSamples, e.timestamp, (e) => e.timestamp);
				if (-1 === r) throw new Error("Packet was not created from this track.");
				const i = r + 1;
				for (; i >= this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded;) await this.demuxer.advanceReader();
				return this.getPacketAtIndex(i, t);
			} finally {
				r();
			}
		}
		async getPacket(e, t) {
			const r = await this.demuxer.readingMutex.acquire();
			try {
				for (;;) {
					const r = K(this.demuxer.loadedSamples, e, (e) => e.timestamp);
					if (-1 === r && this.demuxer.loadedSamples.length > 0) return null;
					if (this.demuxer.lastSampleLoaded) return this.getPacketAtIndex(r, t);
					if (r >= 0 && r + 1 < this.demuxer.loadedSamples.length) return this.getPacketAtIndex(r, t);
					await this.demuxer.advanceReader();
				}
			} finally {
				r();
			}
		}
		getKeyPacket(e, t) {
			return this.getPacket(e, t);
		}
		getNextKeyPacket(e, t) {
			return this.getNextPacket(e, t);
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	const Sa = new Uint32Array(256);
	for (let $u = 0; $u < 256; $u++) {
		let e = $u << 24;
		for (let t = 0; t < 8; t++) e = 2147483648 & e ? e << 1 ^ 79764919 : e << 1;
		Sa[$u] = e >>> 0 & 4294967295;
	}
	const Pa = (e) => {
		const t = E(e), r = t.getUint32(22, !0);
		t.setUint32(22, 0, !0);
		let i = 0;
		for (let a = 0; a < e.length; a++) {
			const t = e[a];
			i = (i << 8 ^ Sa[i >>> 24 ^ t]) >>> 0;
		}
		return t.setUint32(22, r, !0), i;
	}, xa = (e, t, r) => {
		let i = 0, a = null;
		if (e.length > 0) if ("vorbis" === t.codec) {
			c(t.vorbisInfo);
			const s = (1 << ((e) => {
				let t = 0;
				for (; e;) t++, e >>= 1;
				return t;
			})(t.vorbisInfo.modeBlockflags.length - 1)) - 1 << 1, n = (e[0] & s) >> 1;
			if (n >= t.vorbisInfo.modeBlockflags.length) throw new Error("Invalid mode number.");
			let o = r;
			const l = t.vorbisInfo.modeBlockflags[n];
			if (a = t.vorbisInfo.blocksizes[l], 1 === l) {
				const r = 1 + (1 | s), i = e[0] & r ? 1 : 0;
				o = t.vorbisInfo.blocksizes[i];
			}
			i = null !== o ? o + a >> 2 : 0;
		} else "opus" === t.codec && (i = ((e) => {
			const t = e[0] >> 3, r = 3 & e[0];
			let i;
			return i = 0 === r ? 1 : 1 === r || 2 === r ? 2 : 63 & e[1], { durationInSamples: qt[t] * i };
		})(e).durationInSamples);
		return {
			durationInSamples: i,
			vorbisBlockSize: a
		};
	}, Ca = (e) => {
		const t = e.filePos;
		if (1399285583 !== Zo(e)) return null;
		e.skip(1);
		const r = jo(e), i = ic(e), a = Zo(e), s = Zo(e), n = Zo(e), o = jo(e), c = new Uint8Array(o);
		for (let u = 0; u < o; u++) c[u] = jo(e);
		const l = 27 + o, d = c.reduce((e, t) => e + t, 0);
		return {
			headerStartPos: t,
			totalSize: l + d,
			dataStartPos: t + l,
			dataSize: d,
			headerType: r,
			granulePosition: i,
			serialNumber: a,
			sequenceNumber: s,
			checksum: n,
			lacingValues: c
		};
	}, Ea = (e, t) => {
		for (; e.filePos < t - 3;) {
			const t = Zo(e), r = 79;
			if ((255 & t) === r || (t >>> 8 & 255) === r || (t >>> 16 & 255) === r || (t >>> 24 & 255) === r) {
				if (e.skip(-4), 1399285583 === t) return !0;
				e.skip(1);
			}
		}
		return !1;
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var _a = class extends Gr {
		constructor(e) {
			super(e), this.metadataPromise = null, this.bitstreams = [], this.trackBackings = [], this.metadataTags = {}, this.reader = e._reader;
		}
		async readMetadata() {
			return this.metadataPromise ??= (async () => {
				let e = 0;
				for (;;) {
					let t = this.reader.requestSliceRange(e, 27, 282);
					if (Pe(t) && (t = await t), !t) break;
					const r = Ca(t);
					if (!r) break;
					if (!(2 & r.headerType)) break;
					this.bitstreams.push({
						serialNumber: r.serialNumber,
						bosPage: r,
						description: null,
						numberOfChannels: -1,
						sampleRate: -1,
						codecInfo: {
							codec: null,
							vorbisInfo: null,
							opusInfo: null
						},
						lastMetadataPacket: null
					}), e = r.headerStartPos + r.totalSize;
				}
				for (const t of this.bitstreams) {
					const e = await this.readPacket(t.bosPage, 0);
					e && (e.data.byteLength >= 7 && 1 === e.data[0] && 118 === e.data[1] && 111 === e.data[2] && 114 === e.data[3] && 98 === e.data[4] && 105 === e.data[5] && 115 === e.data[6] ? await this.readVorbisMetadata(e, t) : e.data.byteLength >= 8 && 79 === e.data[0] && 112 === e.data[1] && 117 === e.data[2] && 115 === e.data[3] && 72 === e.data[4] && 101 === e.data[5] && 97 === e.data[6] && 100 === e.data[7] && await this.readOpusMetadata(e, t), null !== t.codecInfo.codec && this.trackBackings.push(new Ia(t, this)));
				}
			})();
		}
		async readVorbisMetadata(e, t) {
			let r = await this.findNextPacketStart(e);
			if (!r) return;
			const i = await this.readPacket(r.startPage, r.startSegmentIndex);
			if (!i) return;
			if (r = await this.findNextPacketStart(i), !r) return;
			const a = await this.readPacket(r.startPage, r.startSegmentIndex);
			if (!a) return;
			if (3 !== i.data[0] || 5 !== a.data[0]) return;
			const s = [], n = (e) => {
				for (; s.push(Math.min(255, e)), !(e < 255);) e -= 255;
			};
			n(e.data.length), n(i.data.length);
			const o = new Uint8Array(1 + s.length + e.data.length + i.data.length + a.data.length);
			o[0] = 2, o.set(s, 1), o.set(e.data, 1 + s.length), o.set(i.data, 1 + s.length + e.data.length), o.set(a.data, 1 + s.length + e.data.length + i.data.length), t.codecInfo.codec = "vorbis", t.description = o, t.lastMetadataPacket = a;
			const c = E(e.data);
			t.numberOfChannels = c.getUint8(11), t.sampleRate = c.getUint32(12, !0);
			const l = c.getUint8(28);
			t.codecInfo.vorbisInfo = {
				blocksizes: [1 << (15 & l), 1 << (l >> 4)],
				modeBlockflags: Vt(a.data).modeBlockflags
			}, $t(i.data.subarray(7), this.metadataTags);
		}
		async readOpusMetadata(e, t) {
			const r = await this.findNextPacketStart(e);
			if (!r) return;
			const i = await this.readPacket(r.startPage, r.startSegmentIndex);
			if (!i) return;
			t.codecInfo.codec = "opus", t.description = e.data, t.lastMetadataPacket = i;
			const a = Wt(e.data);
			t.numberOfChannels = a.outputChannelCount, t.sampleRate = Ar, t.codecInfo.opusInfo = { preSkip: a.preSkip }, $t(i.data.subarray(8), this.metadataTags);
		}
		async readPacket(e, t) {
			c(t < e.lacingValues.length);
			let r = 0;
			for (let c = 0; c < t; c++) r += e.lacingValues[c];
			let i = e, a = r, s = t;
			const n = [];
			e: for (;;) {
				let t = this.reader.requestSlice(i.dataStartPos, i.dataSize);
				Pe(t) && (t = await t), c(t);
				const o = Ho(t, i.dataSize);
				for (;;) {
					if (s === i.lacingValues.length) {
						n.push(o.subarray(r, a));
						break;
					}
					const e = i.lacingValues[s];
					if (a += e, e < 255) {
						n.push(o.subarray(r, a));
						break e;
					}
					s++;
				}
				let l = i.headerStartPos + i.totalSize;
				for (;;) {
					let t = this.reader.requestSliceRange(l, 27, 282);
					if (Pe(t) && (t = await t), !t) return null;
					const r = Ca(t);
					if (!r) return null;
					if (i = r, i.serialNumber === e.serialNumber) break;
					l = i.headerStartPos + i.totalSize;
				}
				r = 0, a = 0, s = 0;
			}
			const o = n.reduce((e, t) => e + t.length, 0);
			if (0 === o) return null;
			const l = new Uint8Array(o);
			let d = 0;
			for (let c = 0; c < n.length; c++) {
				const e = n[c];
				l.set(e, d), d += e.length;
			}
			return {
				data: l,
				endPage: i,
				endSegmentIndex: s
			};
		}
		async findNextPacketStart(e) {
			if (e.endSegmentIndex < e.endPage.lacingValues.length - 1) return {
				startPage: e.endPage,
				startSegmentIndex: e.endSegmentIndex + 1
			};
			if (4 & e.endPage.headerType) return null;
			let t = e.endPage.headerStartPos + e.endPage.totalSize;
			for (;;) {
				let r = this.reader.requestSliceRange(t, 27, 282);
				if (Pe(r) && (r = await r), !r) return null;
				const i = Ca(r);
				if (!i) return null;
				if (i.serialNumber === e.endPage.serialNumber) return {
					startPage: i,
					startSegmentIndex: 0
				};
				t = i.headerStartPos + i.totalSize;
			}
		}
		async getMimeType() {
			return await this.readMetadata(), ((e) => {
				let t = "audio/ogg";
				e.codecStrings && (t += `; codecs="${[...new Set(e.codecStrings)].join(", ")}"`);
				return t;
			})({ codecStrings: (await Promise.all(this.trackBackings.map((e) => e.getDecoderConfig().then((e) => e?.codec ?? null)))).filter(Boolean) });
		}
		async getTrackBackings() {
			return await this.readMetadata(), this.trackBackings;
		}
		async getMetadataTags() {
			return await this.readMetadata(), this.metadataTags;
		}
	}, Ia = class {
		constructor(e, t) {
			this.bitstream = e, this.demuxer = t, this.encodedPacketToMetadata = /* @__PURE__ */ new WeakMap(), this.sequentialScanCache = [], this.sequentialScanMutex = new q(), this.firstTimestampInSamplesPromise = null, this.internalSampleRate = "opus" === e.codecInfo.codec ? Ar : e.sampleRate;
		}
		getType() {
			return "audio";
		}
		getId() {
			return this.bitstream.serialNumber;
		}
		getNumber() {
			const e = this.demuxer.trackBackings.findIndex((e) => e.bitstream === this.bitstream);
			return c(-1 !== e), e + 1;
		}
		getNumberOfChannels() {
			return this.bitstream.numberOfChannels;
		}
		getSampleRate() {
			return this.bitstream.sampleRate;
		}
		getTimeResolution() {
			return this.bitstream.sampleRate;
		}
		isRelativeToUnixEpoch() {
			return !1;
		}
		getUnixTimeForTimestamp() {
			return null;
		}
		getPairingMask() {
			return 1n;
		}
		getBitrate() {
			return null;
		}
		getAverageBitrate() {
			return null;
		}
		async getDurationFromMetadata() {
			return null;
		}
		async getLiveRefreshInterval() {
			return null;
		}
		getCodec() {
			return this.bitstream.codecInfo.codec;
		}
		getInternalCodecId() {
			return null;
		}
		async getDecoderConfig() {
			return c(this.bitstream.codecInfo.codec), {
				codec: this.bitstream.codecInfo.codec,
				numberOfChannels: this.bitstream.numberOfChannels,
				sampleRate: this.bitstream.sampleRate,
				description: this.bitstream.description ?? void 0
			};
		}
		getName() {
			return null;
		}
		getLanguageCode() {
			return "und";
		}
		getDisposition() {
			return {
				...$e,
				primary: !1
			};
		}
		granulePositionToTimestampInSamples(e) {
			return "opus" === this.bitstream.codecInfo.codec ? (c(this.bitstream.codecInfo.opusInfo), e - this.bitstream.codecInfo.opusInfo.preSkip) : e;
		}
		createEncodedPacketFromOggPacket(e, t, r) {
			if (!e) return null;
			const i = xa(e.data, this.bitstream.codecInfo, t.vorbisLastBlocksize), { vorbisBlockSize: a } = i;
			let { durationInSamples: s } = i;
			4 & e.endPage.headerType && e.endSegmentIndex === e.endPage.lacingValues.length - 1 && (s = re(this.granulePositionToTimestampInSamples(e.endPage.granulePosition) - t.timestampInSamples, 0, s));
			const n = Math.max(t.timestampInSamples, 0), o = Math.max(t.timestampInSamples + s, 0), c = new Zr(r.metadataOnly ? Yr : e.data, "key", n / this.internalSampleRate, (o - n) / this.internalSampleRate, e.endPage.headerStartPos + e.endSegmentIndex, e.data.byteLength);
			return this.encodedPacketToMetadata.set(c, {
				packet: e,
				timestampInSamples: t.timestampInSamples,
				durationInSamples: s,
				vorbisLastBlockSize: t.vorbisLastBlocksize,
				vorbisBlockSize: a
			}), c;
		}
		getFirstTimestampInSamples() {
			return this.firstTimestampInSamplesPromise ??= (async () => {
				const e = this.granulePositionToTimestampInSamples(0);
				c(this.bitstream.lastMetadataPacket);
				let t = await this.demuxer.findNextPacketStart(this.bitstream.lastMetadataPacket);
				if (!t) return e;
				let r = null, i = 0, a = null;
				for (; t;) {
					const e = await this.demuxer.readPacket(t.startPage, t.startSegmentIndex);
					if (!e) break;
					if (r ??= e.endPage, e.endPage.headerStartPos !== r.headerStartPos) break;
					const { durationInSamples: s, vorbisBlockSize: n } = xa(e.data, this.bitstream.codecInfo, a);
					i += s, a = n, t = await this.demuxer.findNextPacketStart(e);
				}
				return r ? e + Math.max(r.granulePosition - i, 0) : e;
			})();
		}
		async getFirstPacket(e) {
			c(this.bitstream.lastMetadataPacket);
			const t = await this.demuxer.findNextPacketStart(this.bitstream.lastMetadataPacket);
			if (!t) return null;
			const r = await this.getFirstTimestampInSamples(), i = await this.demuxer.readPacket(t.startPage, t.startSegmentIndex);
			return this.createEncodedPacketFromOggPacket(i, {
				timestampInSamples: r,
				vorbisLastBlocksize: null
			}, e);
		}
		async getNextPacket(e, t) {
			const r = this.encodedPacketToMetadata.get(e);
			if (!r) throw new Error("Packet was not created from this track.");
			const i = await this.demuxer.findNextPacketStart(r.packet);
			if (!i) return null;
			const a = r.timestampInSamples + r.durationInSamples, s = await this.demuxer.readPacket(i.startPage, i.startSegmentIndex);
			return this.createEncodedPacketFromOggPacket(s, {
				timestampInSamples: a,
				vorbisLastBlocksize: r.vorbisBlockSize
			}, t);
		}
		async getPacket(e, t) {
			if (null === this.demuxer.reader.fileSize) return this.getPacketSequential(e, t);
			const r = ie(e * this.internalSampleRate), i = await this.getFirstTimestampInSamples();
			if (r === Math.max(i, 0)) return this.getFirstPacket(t);
			if (r < Math.max(i, 0)) return null;
			c(this.bitstream.lastMetadataPacket);
			const a = await this.demuxer.findNextPacketStart(this.bitstream.lastMetadataPacket);
			if (!a) return null;
			let s = a.startPage, n = this.demuxer.reader.fileSize;
			const o = [s];
			e: for (; s.headerStartPos + s.totalSize < n;) {
				const e = s.headerStartPos, t = Math.floor((e + n) / 2);
				let i = t;
				for (;;) {
					const e = Math.min(i + 65307, n - 27);
					let a = this.demuxer.reader.requestSlice(i, e - i);
					if (Pe(a) && (a = await a), c(a), !Ea(a, e)) {
						if (n <= t + 27) break e;
						n = t + 27;
						continue e;
					}
					let l = this.demuxer.reader.requestSliceRange(a.filePos, 27, 282);
					Pe(l) && (l = await l), c(l);
					const d = Ca(l);
					c(d);
					let u = !1;
					if (d.serialNumber === this.bitstream.serialNumber) u = !0;
					else {
						let e = this.demuxer.reader.requestSlice(d.headerStartPos, d.totalSize);
						Pe(e) && (e = await e), c(e), u = Pa(Ho(e, d.totalSize)) === d.checksum;
					}
					if (u) if (u && d.serialNumber !== this.bitstream.serialNumber) i = d.headerStartPos + d.totalSize;
					else {
						if (-1 !== d.granulePosition) {
							this.granulePositionToTimestampInSamples(d.granulePosition) > r ? n = d.headerStartPos : (s = d, o.push(d));
							continue e;
						}
						i = d.headerStartPos + d.totalSize;
					}
					else i = d.headerStartPos + 4;
				}
			}
			let l = a.startPage;
			for (const c of o) {
				if (c.granulePosition === s.granulePosition) break;
				(!l || c.headerStartPos > l.headerStartPos) && (l = c);
			}
			let d = l;
			const u = [d];
			for (; d.serialNumber !== this.bitstream.serialNumber || d.granulePosition !== s.granulePosition;) {
				const e = d.headerStartPos + d.totalSize;
				let t = this.demuxer.reader.requestSliceRange(e, 27, 282);
				Pe(t) && (t = await t), c(t);
				const r = Ca(t);
				c(r), d = r, d.serialNumber === this.bitstream.serialNumber && u.push(d);
			}
			c(-1 !== d.granulePosition);
			let h, f, m = null, p = d, g = 0;
			if (d.headerStartPos === a.startPage.headerStartPos) h = i, f = !0, m = 0;
			else {
				h = 0, f = !1;
				for (let t = d.lacingValues.length - 1; t >= 0; t--) if (d.lacingValues[t] < 255) {
					m = t + 1;
					break;
				}
				if (null === m) throw new Error("Invalid page with granule position: no packets end on this page.");
				g = m - 1;
				const e = {
					data: Yr,
					endPage: p,
					endSegmentIndex: g
				};
				if (await this.demuxer.findNextPacketStart(e)) {
					const e = Aa(u, d, m);
					c(e);
					const t = Ba(u, e.page, e.segmentIndex);
					t && (d = t.page, m = t.segmentIndex);
				} else for (;;) {
					const e = Aa(u, d, m);
					if (!e) break;
					const t = Ba(u, e.page, e.segmentIndex);
					if (!t) break;
					if (d = t.page, m = t.segmentIndex, e.page.headerStartPos !== p.headerStartPos) {
						p = e.page, g = e.segmentIndex;
						break;
					}
				}
			}
			let k = null, w = null;
			for (; null !== d;) {
				c(null !== m);
				const e = await this.demuxer.readPacket(d, m);
				if (!e) break;
				if (!(d.headerStartPos === a.startPage.headerStartPos && m < a.startSegmentIndex)) {
					let i = this.createEncodedPacketFromOggPacket(e, {
						timestampInSamples: h,
						vorbisLastBlocksize: w?.vorbisBlockSize ?? null
					}, t);
					c(i);
					let a = this.encodedPacketToMetadata.get(i);
					if (c(a), f || e.endPage.headerStartPos !== p.headerStartPos || e.endSegmentIndex !== g ? h += a.durationInSamples : (h = this.granulePositionToTimestampInSamples(d.granulePosition), f = !0, i = this.createEncodedPacketFromOggPacket(e, {
						timestampInSamples: h - a.durationInSamples,
						vorbisLastBlocksize: w?.vorbisBlockSize ?? null
					}, t), c(i), a = this.encodedPacketToMetadata.get(i), c(a)), k = i, w = a, f && (Math.max(h, 0) > r || Math.max(a.timestampInSamples, 0) === r)) break;
				}
				const i = await this.demuxer.findNextPacketStart(e);
				if (!i) break;
				d = i.startPage, m = i.startSegmentIndex;
			}
			return k;
		}
		async getPacketSequential(e, t) {
			const r = await this.sequentialScanMutex.acquire();
			try {
				const r = ie(e * this.internalSampleRate);
				e = r / this.internalSampleRate;
				const i = K(this.sequentialScanCache, r, (e) => e.timestampInSamples);
				let a;
				if (-1 !== i) {
					const e = this.sequentialScanCache[i];
					a = this.createEncodedPacketFromOggPacket(e.packet, {
						timestampInSamples: e.timestampInSamples,
						vorbisLastBlocksize: e.vorbisLastBlockSize
					}, t);
				} else if (a = await this.getFirstPacket(t), a && a.timestamp > e) return null;
				let s = 0;
				for (; a && a.timestamp < e;) {
					const r = await this.getNextPacket(a, t);
					if (!r || r.timestamp > e) break;
					if (a = r, s++, 100 === s) {
						s = 0;
						const e = this.encodedPacketToMetadata.get(a);
						c(e), this.sequentialScanCache.length > 0 && c(T(this.sequentialScanCache).timestampInSamples <= e.timestampInSamples), this.sequentialScanCache.push(e);
					}
				}
				return a;
			} finally {
				r();
			}
		}
		getKeyPacket(e, t) {
			return this.getPacket(e, t);
		}
		getNextKeyPacket(e, t) {
			return this.getNextPacket(e, t);
		}
	};
	const Ba = (e, t, r) => {
		let i = t, a = r;
		e: for (;;) {
			for (a--; a >= 0; a--) if (i.lacingValues[a] < 255) {
				a++;
				break e;
			}
			if (c(-1 === a), !(1 & i.headerType)) {
				a = 0;
				break;
			}
			const t = Y(e, (e) => e.headerStartPos < i.headerStartPos);
			if (!t) return null;
			i = t, a = i.lacingValues.length;
		}
		if (c(-1 !== a), a === i.lacingValues.length) {
			const t = e[e.indexOf(i) + 1];
			c(t), i = t, a = 0;
		}
		return {
			page: i,
			segmentIndex: a
		};
	}, Aa = (e, t, r) => {
		if (r > 0) return {
			page: t,
			segmentIndex: r - 1
		};
		const i = Y(e, (e) => e.headerStartPos < t.headerStartPos);
		return i ? {
			page: i,
			segmentIndex: i.lacingValues.length - 1
		} : null;
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var Ra;
	(function(e) {
		e[e.PCM = 1] = "PCM", e[e.IEEE_FLOAT = 3] = "IEEE_FLOAT", e[e.ALAW = 6] = "ALAW", e[e.MULAW = 7] = "MULAW", e[e.EXTENSIBLE = 65534] = "EXTENSIBLE";
	})(Ra || (Ra = {}));
	var Fa = class extends Gr {
		constructor(e) {
			super(e), this.metadataPromise = null, this.dataStart = -1, this.dataSize = -1, this.audioInfo = null, this.trackBackings = [], this.lastKnownPacketIndex = 0, this.metadataTags = {}, this.reader = e._reader;
		}
		async readMetadata() {
			return this.metadataPromise ??= (async () => {
				let e = this.reader.requestSlice(0, 12);
				Pe(e) && (e = await e), c(e);
				const t = nc(e, 4), r = "RIFX" !== t, i = "RF64" === t, a = Go(e, r);
				let s = i ? this.reader.fileSize : Math.min(a + 8, this.reader.fileSize ?? Infinity);
				if ("WAVE" !== nc(e, 4)) throw new Error("Invalid WAVE file - wrong format");
				let n = 0, o = null, l = e.filePos;
				for (; null === s || l < s;) {
					let e = this.reader.requestSlice(l, 8);
					if (Pe(e) && (e = await e), !e) break;
					const t = nc(e, 4), a = Go(e, r), c = e.filePos;
					if (i && 0 === n && "ds64" !== t) throw new Error("Invalid RF64 file: First chunk must be \"ds64\".");
					if ("fmt " === t) await this.parseFmtChunk(c, a, r);
					else if ("data" === t) {
						if (o ??= a, this.dataStart = e.filePos, this.dataSize = Math.min(o, (s ?? Infinity) - this.dataStart), null === this.reader.fileSize) break;
					} else if ("ds64" === t) {
						let e = this.reader.requestSlice(c, a);
						if (Pe(e) && (e = await e), !e) break;
						const t = ec(e, r);
						o = ec(e, r), s = Math.min(t + 8, this.reader.fileSize ?? Infinity);
					} else "LIST" === t ? await this.parseListChunk(c, a, r) : "ID3 " !== t && "id3 " !== t || await this.parseId3Chunk(c, a);
					l = c + a + (1 & a), n++;
				}
				if (!this.audioInfo) throw new Error("Invalid WAVE file - missing \"fmt \" chunk");
				if (-1 === this.dataStart) throw new Error("Invalid WAVE file - missing \"data\" chunk");
				const d = this.audioInfo.blockSizeInBytes;
				this.dataSize = Math.floor(this.dataSize / d) * d, this.trackBackings.push(new Da(this));
			})();
		}
		async parseFmtChunk(e, t, r) {
			let i = this.reader.requestSlice(e, t);
			if (Pe(i) && (i = await i), !i) return;
			let a = $o(i, r);
			const s = $o(i, r), n = Go(i, r);
			i.skip(4);
			const o = $o(i, r);
			let c;
			if (c = 14 === t ? 8 : $o(i, r), t >= 18 && 357 !== a) {
				const e = $o(i, r), s = t - 18;
				if (Math.min(s, e) >= 22 && a === Ra.EXTENSIBLE) {
					i.skip(6);
					const e = Ho(i, 16);
					a = e[0] | e[1] << 8;
				}
			}
			if (a !== Ra.MULAW && a !== Ra.ALAW || (c = 8), a !== Ra.PCM && a !== Ra.IEEE_FLOAT && a !== Ra.ALAW && a !== Ra.MULAW) throw new Error(`Unsupported WAVE codec (format tag ${a}). Only integer/float PCM, A-law, and μ-law are supported.`);
			if (a === Ra.PCM && ![
				8,
				16,
				24,
				32
			].includes(c)) throw new Error(`Unsupported WAVE PCM bit depth (${c}). Only 8, 16, 24, and 32 bits are supported.`);
			if (a === Ra.IEEE_FLOAT && ![32, 64].includes(c)) throw new Error(`Unsupported WAVE float bit depth (${c}). Only 32 and 64 bits are supported.`);
			this.audioInfo = {
				format: a,
				numberOfChannels: s,
				sampleRate: n,
				sampleSizeInBytes: Math.ceil(c / 8),
				blockSizeInBytes: o
			};
		}
		async parseListChunk(e, t, r) {
			let i = this.reader.requestSlice(e, t);
			if (Pe(i) && (i = await i), !i) return;
			const a = nc(i, 4);
			if ("INFO" !== a && "INF0" !== a) return;
			let s = i.filePos;
			for (; s <= e + t - 8;) {
				i.filePos = s;
				const e = nc(i, 4), t = Go(i, r), a = Ho(i, t);
				let n = 0;
				for (let r = 0; r < a.length && 0 !== a[r]; r++) n++;
				const o = String.fromCharCode(...a.subarray(0, n));
				switch (this.metadataTags.raw ??= {}, this.metadataTags.raw[e] = o, e) {
					case "INAM":
					case "TITL":
						this.metadataTags.title ??= o;
						break;
					case "TIT3":
						this.metadataTags.description ??= o;
						break;
					case "IART":
						this.metadataTags.artist ??= o;
						break;
					case "IPRD":
						this.metadataTags.album ??= o;
						break;
					case "IPRT":
					case "ITRK":
					case "TRCK":
						{
							const e = o.split("/"), t = Number.parseInt(e[0], 10), r = e[1] && Number.parseInt(e[1], 10);
							Number.isInteger(t) && t > 0 && (this.metadataTags.trackNumber ??= t), r && Number.isInteger(r) && r > 0 && (this.metadataTags.tracksTotal ??= r);
						}
						break;
					case "ICRD":
					case "IDIT":
						{
							const e = new Date(o);
							Number.isNaN(e.getTime()) || (this.metadataTags.date ??= e);
						}
						break;
					case "YEAR":
						{
							const e = Number.parseInt(o, 10);
							Number.isInteger(e) && e > 0 && (this.metadataTags.date ??= new Date(e, 0, 1));
						}
						break;
					case "IGNR":
					case "GENR":
						this.metadataTags.genre ??= o;
						break;
					case "ICMT":
					case "CMNT":
					case "COMM": this.metadataTags.comment ??= o;
				}
				s += 8 + t + (1 & t);
			}
		}
		async parseId3Chunk(e, t) {
			let r = this.reader.requestSlice(e, t);
			if (Pe(r) && (r = await r), !r) return;
			const i = fc(r);
			if (i) {
				const a = t - 10;
				i.size = Math.min(i.size, a), i.size > 0 && mc(r.slice(e + 10, i.size), i, this.metadataTags);
			}
		}
		getCodec() {
			if (c(this.audioInfo), this.audioInfo.format === Ra.MULAW) return "ulaw";
			if (this.audioInfo.format === Ra.ALAW) return "alaw";
			if (this.audioInfo.format === Ra.PCM) {
				if (1 === this.audioInfo.sampleSizeInBytes) return "pcm-u8";
				if (2 === this.audioInfo.sampleSizeInBytes) return "pcm-s16";
				if (3 === this.audioInfo.sampleSizeInBytes) return "pcm-s24";
				if (4 === this.audioInfo.sampleSizeInBytes) return "pcm-s32";
			}
			if (this.audioInfo.format === Ra.IEEE_FLOAT) {
				if (4 === this.audioInfo.sampleSizeInBytes) return "pcm-f32";
				if (8 === this.audioInfo.sampleSizeInBytes) return "pcm-f64";
			}
			c(!1);
		}
		async getMimeType() {
			return "audio/wav";
		}
		async getTrackBackings() {
			return await this.readMetadata(), this.trackBackings;
		}
		async getMetadataTags() {
			return await this.readMetadata(), this.metadataTags;
		}
	};
	const Ma = 2048;
	var Da = class {
		constructor(e) {
			this.demuxer = e;
		}
		getType() {
			return "audio";
		}
		getId() {
			return 1;
		}
		getNumber() {
			return 1;
		}
		getCodec() {
			return this.demuxer.getCodec();
		}
		getInternalCodecId() {
			return c(this.demuxer.audioInfo), this.demuxer.audioInfo.format;
		}
		async getDecoderConfig() {
			const e = this.demuxer.getCodec();
			return e ? (c(this.demuxer.audioInfo), {
				codec: e,
				numberOfChannels: this.demuxer.audioInfo.numberOfChannels,
				sampleRate: this.demuxer.audioInfo.sampleRate
			}) : null;
		}
		getNumberOfChannels() {
			return c(this.demuxer.audioInfo), this.demuxer.audioInfo.numberOfChannels;
		}
		getSampleRate() {
			return c(this.demuxer.audioInfo), this.demuxer.audioInfo.sampleRate;
		}
		getTimeResolution() {
			return c(this.demuxer.audioInfo), this.demuxer.audioInfo.sampleRate;
		}
		isRelativeToUnixEpoch() {
			return !1;
		}
		getUnixTimeForTimestamp() {
			return null;
		}
		getPairingMask() {
			return 1n;
		}
		getBitrate() {
			return null;
		}
		getAverageBitrate() {
			return null;
		}
		async getDurationFromMetadata() {
			return c(-1 !== this.demuxer.dataSize), this.demuxer.dataSize / this.demuxer.audioInfo.blockSizeInBytes / this.demuxer.audioInfo.sampleRate;
		}
		async getLiveRefreshInterval() {
			return null;
		}
		getName() {
			return null;
		}
		getLanguageCode() {
			return "und";
		}
		getDisposition() {
			return { ...$e };
		}
		async getPacketAtIndex(e, t) {
			c(e >= 0), c(this.demuxer.audioInfo);
			const r = e * Ma * this.demuxer.audioInfo.blockSizeInBytes;
			if (r >= this.demuxer.dataSize) return null;
			const i = Math.min(Ma * this.demuxer.audioInfo.blockSizeInBytes, this.demuxer.dataSize - r);
			if (null === this.demuxer.reader.fileSize) {
				let e = this.demuxer.reader.requestSlice(this.demuxer.dataStart + r, i);
				if (Pe(e) && (e = await e), !e) return null;
			}
			let a;
			if (t.metadataOnly) a = Yr;
			else {
				let e = this.demuxer.reader.requestSlice(this.demuxer.dataStart + r, i);
				Pe(e) && (e = await e), c(e), a = Ho(e, i);
			}
			const s = e * Ma / this.demuxer.audioInfo.sampleRate, n = i / this.demuxer.audioInfo.blockSizeInBytes / this.demuxer.audioInfo.sampleRate;
			return this.demuxer.lastKnownPacketIndex = Math.max(e, this.demuxer.lastKnownPacketIndex), new Zr(a, "key", s, n, e, i);
		}
		getFirstPacket(e) {
			return this.getPacketAtIndex(0, e);
		}
		async getPacket(e, t) {
			c(this.demuxer.audioInfo);
			const r = Math.floor(Math.min(e * this.demuxer.audioInfo.sampleRate / Ma, (this.demuxer.dataSize - 1) / (Ma * this.demuxer.audioInfo.blockSizeInBytes)));
			if (r < 0) return null;
			const i = await this.getPacketAtIndex(r, t);
			if (i) return i;
			if (0 === r) return null;
			c(null === this.demuxer.reader.fileSize);
			let a = await this.getPacketAtIndex(this.demuxer.lastKnownPacketIndex, t);
			for (; a;) {
				const e = await this.getNextPacket(a, t);
				if (!e) break;
				a = e;
			}
			return a;
		}
		getNextPacket(e, t) {
			c(this.demuxer.audioInfo);
			const r = Math.round(e.timestamp * this.demuxer.audioInfo.sampleRate / Ma);
			return this.getPacketAtIndex(r + 1, t);
		}
		getKeyPacket(e, t) {
			return this.getPacket(e, t);
		}
		getNextKeyPacket(e, t) {
			return this.getNextPacket(e, t);
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/ const Oa = (e) => {
		const t = e.filePos, r = new Ke(Ho(e, 9));
		if (4095 !== r.readBits(12)) return null;
		if (r.skipBits(1), 0 !== r.readBits(2)) return null;
		const i = r.readBits(1), a = r.readBits(2) + 1, s = r.readBits(4);
		if (15 === s) return null;
		r.skipBits(1);
		const n = r.readBits(3);
		if (0 === n) throw new Error("ADTS frames with channel configuration 0 are not supported.");
		r.skipBits(1), r.skipBits(1), r.skipBits(1), r.skipBits(1);
		const o = r.readBits(13);
		r.skipBits(11);
		const c = r.readBits(2) + 1;
		if (1 !== c) throw new Error("ADTS frames with more than one AAC frame are not supported.");
		let l = null;
		return 1 === i ? e.filePos -= 2 : l = r.readBits(16), {
			objectType: a,
			samplingFrequencyIndex: s,
			channelConfiguration: n,
			frameLength: o,
			numberOfAacFrames: c,
			crcCheck: l,
			startPos: t
		};
	}, za = 1024;
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/ var Na = class extends Gr {
		constructor(e) {
			super(e), this.metadataPromise = null, this.firstFrameHeader = null, this.loadedSamples = [], this.metadataTags = null, this.trackBackings = [], this.readingMutex = new q(), this.lastSampleLoaded = !1, this.lastLoadedPos = 0, this.nextTimestampInSamples = 0, this.reader = e._reader;
		}
		async readMetadata() {
			return this.metadataPromise ??= (async () => {
				for (; !this.firstFrameHeader && !this.lastSampleLoaded;) await this.advanceReader();
				c(this.firstFrameHeader), this.trackBackings = [new Ua(this)];
			})();
		}
		async advanceReader() {
			if (0 === this.lastLoadedPos) for (;;) {
				let e = this.reader.requestSlice(this.lastLoadedPos, 10);
				if (Pe(e) && (e = await e), !e) return void (this.lastSampleLoaded = !0);
				const t = fc(e);
				if (!t) break;
				this.lastLoadedPos = e.filePos + t.size;
			}
			let e = this.reader.requestSliceRange(this.lastLoadedPos, 7, 9);
			if (Pe(e) && (e = await e), !e) return void (this.lastSampleLoaded = !0);
			const t = Oa(e);
			if (!t) return void (this.lastSampleLoaded = !0);
			if (null !== this.reader.fileSize && t.startPos + t.frameLength > this.reader.fileSize) return void (this.lastSampleLoaded = !0);
			this.firstFrameHeader || (this.firstFrameHeader = t);
			const r = Xe[t.samplingFrequencyIndex];
			c(void 0 !== r);
			const i = za / r, a = {
				timestamp: this.nextTimestampInSamples / r,
				duration: i,
				dataStart: t.startPos,
				dataSize: t.frameLength
			};
			this.loadedSamples.push(a), this.nextTimestampInSamples += za, this.lastLoadedPos = t.startPos + t.frameLength;
		}
		async getMimeType() {
			return "audio/aac";
		}
		async getTrackBackings() {
			return await this.readMetadata(), this.trackBackings;
		}
		async getMetadataTags() {
			const e = await this.readingMutex.acquire();
			try {
				if (await this.readMetadata(), this.metadataTags) return this.metadataTags;
				this.metadataTags = {};
				let e = 0;
				for (;;) {
					let t = this.reader.requestSlice(e, 10);
					if (Pe(t) && (t = await t), !t) break;
					const r = fc(t);
					if (!r) break;
					let i = this.reader.requestSlice(t.filePos, r.size);
					if (Pe(i) && (i = await i), !i) break;
					mc(i, r, this.metadataTags), e = t.filePos + r.size;
				}
				return this.metadataTags;
			} finally {
				e();
			}
		}
	}, Ua = class {
		constructor(e) {
			this.demuxer = e;
		}
		getType() {
			return "audio";
		}
		getId() {
			return 1;
		}
		getNumber() {
			return 1;
		}
		getTimeResolution() {
			return this.getSampleRate() / za;
		}
		isRelativeToUnixEpoch() {
			return !1;
		}
		getUnixTimeForTimestamp() {
			return null;
		}
		getPairingMask() {
			return 1n;
		}
		getBitrate() {
			return null;
		}
		getAverageBitrate() {
			return null;
		}
		async getDurationFromMetadata() {
			return null;
		}
		async getLiveRefreshInterval() {
			return null;
		}
		getName() {
			return null;
		}
		getLanguageCode() {
			return "und";
		}
		getCodec() {
			return "aac";
		}
		getInternalCodecId() {
			return c(this.demuxer.firstFrameHeader), this.demuxer.firstFrameHeader.objectType;
		}
		getNumberOfChannels() {
			c(this.demuxer.firstFrameHeader);
			const e = Qe[this.demuxer.firstFrameHeader.channelConfiguration];
			return c(void 0 !== e), e;
		}
		getSampleRate() {
			c(this.demuxer.firstFrameHeader);
			const e = Xe[this.demuxer.firstFrameHeader.samplingFrequencyIndex];
			return c(void 0 !== e), e;
		}
		getDisposition() {
			return { ...$e };
		}
		async getDecoderConfig() {
			return c(this.demuxer.firstFrameHeader), {
				codec: `mp4a.40.${this.demuxer.firstFrameHeader.objectType}`,
				numberOfChannels: this.getNumberOfChannels(),
				sampleRate: this.getSampleRate()
			};
		}
		async getPacketAtIndex(e, t) {
			if (-1 === e) return null;
			const r = this.demuxer.loadedSamples[e];
			if (!r) return null;
			let i;
			if (t.metadataOnly) i = Yr;
			else {
				let e = this.demuxer.reader.requestSlice(r.dataStart, r.dataSize);
				if (Pe(e) && (e = await e), !e) return null;
				i = Ho(e, r.dataSize);
			}
			return new Zr(i, "key", r.timestamp, r.duration, e, r.dataSize);
		}
		getFirstPacket(e) {
			return this.getPacketAtIndex(0, e);
		}
		async getNextPacket(e, t) {
			const r = await this.demuxer.readingMutex.acquire();
			try {
				const r = $(this.demuxer.loadedSamples, e.timestamp, (e) => e.timestamp);
				if (-1 === r) throw new Error("Packet was not created from this track.");
				const i = r + 1;
				for (; i >= this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded;) await this.demuxer.advanceReader();
				return this.getPacketAtIndex(i, t);
			} finally {
				r();
			}
		}
		async getPacket(e, t) {
			const r = await this.demuxer.readingMutex.acquire();
			try {
				for (;;) {
					const r = K(this.demuxer.loadedSamples, e, (e) => e.timestamp);
					if (-1 === r && this.demuxer.loadedSamples.length > 0) return null;
					if (this.demuxer.lastSampleLoaded) return this.getPacketAtIndex(r, t);
					if (r >= 0 && r + 1 < this.demuxer.loadedSamples.length) return this.getPacketAtIndex(r, t);
					await this.demuxer.advanceReader();
				}
			} finally {
				r();
			}
		}
		getKeyPacket(e, t) {
			return this.getPacket(e, t);
		}
		getNextKeyPacket(e, t) {
			return this.getNextPacket(e, t);
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var La = class extends Gr {
		constructor(e) {
			super(e), this.loadedSamples = [], this.metadataPromise = null, this.trackBacking = null, this.metadataTags = {}, this.audioInfo = null, this.lastLoadedPos = null, this.blockingBit = null, this.readingMutex = new q(), this.lastSampleLoaded = !1, this.reader = e._reader;
		}
		async getMetadataTags() {
			return await this.readMetadata(), this.metadataTags;
		}
		async getTrackBackings() {
			return await this.readMetadata(), c(this.trackBacking), [this.trackBacking];
		}
		async getMimeType() {
			return "audio/flac";
		}
		async readMetadata() {
			return this.metadataPromise ??= (async () => {
				let e = 0;
				for (;;) {
					let t = this.reader.requestSlice(e, 10);
					if (Pe(t) && (t = await t), !t) return void (this.lastSampleLoaded = !0);
					const r = fc(t);
					if (!r) break;
					let i = this.reader.requestSlice(t.filePos, r.size);
					Pe(i) && (i = await i), c(i), mc(i, r, this.metadataTags), e = t.filePos + r.size;
				}
				for (e += 4; null === this.reader.fileSize || e < this.reader.fileSize;) {
					let t = this.reader.requestSlice(e, 4);
					if (Pe(t) && (t = await t), e += 4, null === t) throw new Error(`Metadata block at position ${e} is too small! Corrupted file.`);
					c(t);
					const r = jo(t), i = Xo(t), a = !!(128 & r);
					switch (127 & r) {
						case jt.STREAMINFO: {
							let t = this.reader.requestSlice(e, i);
							if (Pe(t) && (t = await t), c(t), null === t) throw new Error(`StreamInfo block at position ${e} is too small! Corrupted file.`);
							const r = Ho(t, 34), a = new Ke(r), s = a.readBits(16), n = a.readBits(16), o = a.readBits(24), l = a.readBits(24), d = a.readBits(20), u = a.readBits(3) + 1;
							a.readBits(5);
							const h = a.readBits(36);
							a.skipBits(128);
							const f = new Uint8Array(42);
							f.set(new Uint8Array([
								102,
								76,
								97,
								67
							]), 0), f.set(new Uint8Array([
								128,
								0,
								0,
								34
							]), 4), f.set(r, 8), this.audioInfo = {
								numberOfChannels: u,
								sampleRate: d,
								totalSamples: h,
								minimumBlockSize: s,
								maximumBlockSize: n,
								minimumFrameSize: o,
								maximumFrameSize: l,
								description: f
							}, this.trackBacking = new Wa(this);
							break;
						}
						case jt.VORBIS_COMMENT: {
							let t = this.reader.requestSlice(e, i);
							Pe(t) && (t = await t), c(t), $t(Ho(t, i), this.metadataTags);
							break;
						}
						case jt.PICTURE: {
							let t = this.reader.requestSlice(e, i);
							Pe(t) && (t = await t), c(t);
							const r = Yo(t), a = Yo(t), s = B.decode(Ho(t, a)), n = Yo(t), o = B.decode(Ho(t, n));
							t.skip(16);
							const l = Yo(t), d = Ho(t, l);
							this.metadataTags.images ??= [], this.metadataTags.images.push({
								data: d,
								mimeType: s,
								kind: 3 === r ? "coverFront" : 4 === r ? "coverBack" : "unknown",
								description: o
							});
							break;
						}
					}
					if (e += i, a) {
						this.lastLoadedPos = e;
						break;
					}
				}
				if (!this.audioInfo) throw new Error("Missing STREAMINFO metadata block! Corrupted FLAC file.");
			})();
		}
		async readNextFlacFrame({ startPos: e, isFirstPacket: t }) {
			c(this.audioInfo);
			const r = this.audioInfo.maximumBlockSize * this.audioInfo.numberOfChannels * 4 + 16 + 2, i = this.audioInfo.minimumFrameSize || 10, a = (this.audioInfo.maximumFrameSize || r) + 16, s = await this.reader.requestSliceRange(e, 16, a);
			if (!s) return null;
			const n = this.readFlacFrameHeader({
				slice: s,
				isFirstPacket: t
			});
			if (!n) return null;
			for (s.filePos = e + i;;) {
				if (s.filePos > s.end - 6) return {
					num: n.num,
					blockSize: n.blockSize,
					sampleRate: n.sampleRate,
					size: s.end - e,
					isLastFrame: !0
				};
				if (255 === jo(s)) {
					const t = s.filePos;
					if (jo(s) !== (1 === this.blockingBit ? 249 : 248)) {
						s.filePos = t;
						continue;
					}
					s.skip(-2);
					const r = s.filePos - e, i = this.readFlacFrameHeader({
						slice: s,
						isFirstPacket: !1
					});
					if (!i) {
						s.filePos = t;
						continue;
					}
					if (0 === this.blockingBit) {
						if (i.num - n.num !== 1) {
							s.filePos = t;
							continue;
						}
					} else if (i.num - n.num !== n.blockSize) {
						s.filePos = t;
						continue;
					}
					return {
						num: n.num,
						blockSize: n.blockSize,
						sampleRate: n.sampleRate,
						size: r,
						isLastFrame: !1
					};
				}
			}
		}
		readFlacFrameHeader({ slice: e, isFirstPacket: t }) {
			const r = e.filePos, i = new Ke(Ho(e, 4));
			if (32764 !== i.readBits(15)) return null;
			if (null === this.blockingBit) {
				c(t);
				const e = i.readBits(1);
				this.blockingBit = e;
			} else if (1 === this.blockingBit) {
				if (c(!t), 1 !== i.readBits(1)) return null;
			} else {
				if (0 !== this.blockingBit) throw new Error("Invalid blocking bit");
				if (c(!t), 0 !== i.readBits(1)) return null;
			}
			const a = 0 === (s = i.readBits(4)) ? null : 1 === s ? 192 : s >= 2 && s <= 5 ? 144 * 2 ** s : 6 === s ? "uncommon-u8" : 7 === s ? "uncommon-u16" : s >= 8 && s <= 15 ? 2 ** s : null;
			var s;
			if (!a) return null;
			c(this.audioInfo);
			const n = ((e, t) => {
				switch (e) {
					case 0: return t;
					case 1: return 88200;
					case 2: return 176400;
					case 3: return 192e3;
					case 4: return 8e3;
					case 5: return 16e3;
					case 6: return 22050;
					case 7: return 24e3;
					case 8: return 32e3;
					case 9: return 44100;
					case 10: return 48e3;
					case 11: return 96e3;
					case 12: return "uncommon-u8";
					case 13: return "uncommon-u16";
					case 14: return "uncommon-u16-10";
					default: return null;
				}
			})(i.readBits(4), this.audioInfo.sampleRate);
			if (!n) return null;
			if (i.readBits(4), i.readBits(3), 0 !== i.readBits(1)) return null;
			const o = ((e) => {
				let t = 0;
				const r = new Ke(Ho(e, 1));
				for (; 1 === r.readBits(1);) t++;
				if (0 === t) return r.readBits(7);
				const i = [], a = t - 1, s = new Ke(Ho(e, a)), n = 8 - t - 1;
				for (let o = 0; o < n; o++) i.unshift(r.readBits(1));
				for (let o = 0; o < a; o++) for (let e = 0; e < 8; e++) {
					const t = s.readBits(1);
					e < 2 || i.unshift(t);
				}
				return i.reduce((e, t, r) => e | t << r, 0);
			})(e), l = ((e, t) => "uncommon-u16" === t ? Ko(e) + 1 : "uncommon-u8" === t ? jo(e) + 1 : "number" == typeof t ? t : (J(t), void c(!1)))(e, a), d = ((e, t) => "uncommon-u16" === t ? Ko(e) : "uncommon-u16-10" === t ? 10 * Ko(e) : "uncommon-u8" === t ? jo(e) : "number" == typeof t ? t : null)(e, n);
			if (null === d) return null;
			if (d !== this.audioInfo.sampleRate) return null;
			const u = e.filePos - r, h = jo(e);
			return e.skip(-u), e.skip(-1), h !== ((e) => {
				let t = 0;
				for (const r of e) {
					t ^= r;
					for (let e = 0; e < 8; e++) 128 & t ? t = t << 1 ^ 7 : t <<= 1, t &= 255;
				}
				return t;
			})(Ho(e, u)) ? null : {
				num: o,
				blockSize: l,
				sampleRate: d
			};
		}
		async advanceReader() {
			await this.readMetadata(), c(null !== this.lastLoadedPos), c(this.audioInfo);
			const e = this.lastLoadedPos, t = await this.readNextFlacFrame({
				startPos: e,
				isFirstPacket: 0 === this.loadedSamples.length
			});
			if (!t) return void (this.lastSampleLoaded = !0);
			const r = this.loadedSamples[this.loadedSamples.length - 1], i = {
				blockOffset: r ? r.blockOffset + r.blockSize : 0,
				blockSize: t.blockSize,
				byteOffset: e,
				byteSize: t.size
			};
			this.lastLoadedPos = this.lastLoadedPos + t.size, this.loadedSamples.push(i), t.isLastFrame && (this.lastSampleLoaded = !0);
		}
	}, Wa = class {
		constructor(e) {
			this.demuxer = e;
		}
		getType() {
			return "audio";
		}
		getId() {
			return 1;
		}
		getNumber() {
			return 1;
		}
		getCodec() {
			return "flac";
		}
		getInternalCodecId() {
			return null;
		}
		getNumberOfChannels() {
			return c(this.demuxer.audioInfo), this.demuxer.audioInfo.numberOfChannels;
		}
		getSampleRate() {
			return c(this.demuxer.audioInfo), this.demuxer.audioInfo.sampleRate;
		}
		getName() {
			return null;
		}
		getLanguageCode() {
			return "und";
		}
		getTimeResolution() {
			return c(this.demuxer.audioInfo), this.demuxer.audioInfo.sampleRate;
		}
		isRelativeToUnixEpoch() {
			return !1;
		}
		getUnixTimeForTimestamp() {
			return null;
		}
		getPairingMask() {
			return 1n;
		}
		getBitrate() {
			return null;
		}
		getAverageBitrate() {
			return null;
		}
		async getDurationFromMetadata() {
			return c(this.demuxer.audioInfo), 0 === this.demuxer.audioInfo.totalSamples ? null : this.demuxer.audioInfo.totalSamples / this.demuxer.audioInfo.sampleRate;
		}
		async getLiveRefreshInterval() {
			return null;
		}
		getDisposition() {
			return { ...$e };
		}
		async getDecoderConfig() {
			return c(this.demuxer.audioInfo), {
				codec: "flac",
				numberOfChannels: this.demuxer.audioInfo.numberOfChannels,
				sampleRate: this.demuxer.audioInfo.sampleRate,
				description: this.demuxer.audioInfo.description
			};
		}
		async getPacket(e, t) {
			if (c(this.demuxer.audioInfo), e < 0) return null;
			const r = await this.demuxer.readingMutex.acquire();
			try {
				for (;;) {
					const r = K(this.demuxer.loadedSamples, e, (e) => e.blockOffset / this.demuxer.audioInfo.sampleRate);
					if (-1 === r) {
						await this.demuxer.advanceReader();
						continue;
					}
					const i = this.demuxer.loadedSamples[r];
					if (!(i.blockOffset / this.demuxer.audioInfo.sampleRate + i.blockSize / this.demuxer.audioInfo.sampleRate <= e)) return this.getPacketAtIndex(r, t);
					if (this.demuxer.lastSampleLoaded) return this.getPacketAtIndex(this.demuxer.loadedSamples.length - 1, t);
					await this.demuxer.advanceReader();
				}
			} finally {
				r();
			}
		}
		async getNextPacket(e, t) {
			const r = await this.demuxer.readingMutex.acquire();
			try {
				const r = e.sequenceNumber + 1;
				if (this.demuxer.lastSampleLoaded && r >= this.demuxer.loadedSamples.length) return null;
				for (; r >= this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded;) await this.demuxer.advanceReader();
				return this.getPacketAtIndex(r, t);
			} finally {
				r();
			}
		}
		getKeyPacket(e, t) {
			return this.getPacket(e, t);
		}
		getNextKeyPacket(e, t) {
			return this.getNextPacket(e, t);
		}
		async getPacketAtIndex(e, t) {
			const r = this.demuxer.loadedSamples[e];
			if (!r) return null;
			let i;
			if (t.metadataOnly) i = Yr;
			else {
				let e = this.demuxer.reader.requestSlice(r.byteOffset, r.byteSize);
				if (Pe(e) && (e = await e), !e) return null;
				i = Ho(e, r.byteSize);
			}
			c(this.demuxer.audioInfo);
			const a = r.blockOffset / this.demuxer.audioInfo.sampleRate, s = r.blockSize / this.demuxer.audioInfo.sampleRate;
			return new Zr(i, "key", a, s, e, r.byteSize);
		}
		async getFirstPacket(e) {
			for (; 0 === this.demuxer.loadedSamples.length && !this.demuxer.lastSampleLoaded;) await this.demuxer.advanceReader();
			return this.getPacketAtIndex(0, e);
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	const qa = 9e4, Va = 2 ** 33, Ha = "PES packet is missing PTS where it was expected. PES packets without PTS are not currently supported. If you think this file should be supported, please report it.", ja = new Set([
		133,
		134,
		162
	]), $a = /* @__PURE__ */ new Set();
	var Ka = class extends Gr {
		constructor(e) {
			super(e), this.metadataPromise = null, this.elementaryStreams = [], this.trackBackingEntries = [], this.packetOffset = 0, this.packetStride = -1, this.sectionEndPositions = [], this.seekChunkSize = 5242880, this.minReferencePointByteDistance = -1, this.timestampWrapInfo = null, this.reader = e._reader;
		}
		async readMetadata() {
			return this.metadataPromise ??= (async () => {
				let e = this.reader.requestSlice(0, 205);
				Pe(e) && (e = await e), c(e);
				const t = Ho(e, 205);
				if (71 === t[0] && 71 === t[188]) this.packetOffset = 0, this.packetStride = 188;
				else if (71 === t[0] && 71 === t[204]) this.packetOffset = 0, this.packetStride = 204;
				else {
					if (71 !== t[4] || 71 !== t[196]) throw new Error("Unreachable.");
					this.packetOffset = 4, this.packetStride = 192;
				}
				this.minReferencePointByteDistance = 256 * this.packetStride;
				let r = this.packetOffset, i = null, a = !1, s = !1;
				for (;;) {
					const e = await this.readPacketHeader(r);
					if (!e) break;
					if (0 === e.payloadUnitStartIndicator) {
						r += this.packetStride;
						continue;
					}
					if (s && !this.elementaryStreams.some((t) => t.pid === e.pid)) {
						r += this.packetStride;
						continue;
					}
					const t = await this.readSection(r, !0, !s);
					if (!t) break;
					const n = 3, o = 32;
					let l = !1;
					if (!s && 0 !== t.pid && (0 !== t.payload[0] || 0 !== t.payload[1] || 1 !== t.payload[2])) {
						const e = new Ke(t.payload), r = e.readAlignedByte();
						e.skipBits(8 * r), l = 2 === e.readBits(8);
					}
					if (0 !== t.pid || a) if (t.pid !== i && !l || s) {
						const e = this.elementaryStreams.find((e) => e.pid === t.pid);
						e: if (e && !e.initialized) {
							const r = Qa(this, t, !0);
							if (!r) throw new Error(`Couldn't read first PES packet for Elementary Stream with PID ${e.pid}`);
							if (e.firstSection = t, e.canBeTrustedWithKeyPackets = 1 === t.randomAccessIndicator, this.input._initInput) {
								const r = (await this.input._initInput._getDemuxer()).elementaryStreams.find((r) => r.pid === t.pid && r.info.codec === e.info.codec);
								if (r) {
									e.info = r.info, e.initialized = !0;
									break e;
								}
							}
							const i = new es(e, r);
							if ("video" === e.info.type) {
								for (;;) {
									if (i.suppliedPacket = null, await i.markNextPacket(), "avc" === e.info.codec) {
										if (!i.suppliedPacket) throw new Error("Invalid AVC video stream; could not extract AVCDecoderConfigurationRecord from any packet.");
										if (e.info.avcCodecInfo = gt(i.suppliedPacket.data), !e.info.avcCodecInfo) continue;
										const t = e.info.avcCodecInfo.sequenceParameterSets[0];
										c(t);
										const r = bt(t);
										e.info.width = r.displayWidth, e.info.height = r.displayHeight;
										const a = r.pixelAspectRatio.num, s = r.pixelAspectRatio.den;
										a > 0 && s > 0 && (a > s ? (e.info.squarePixelWidth = Math.round(e.info.width * a / s), e.info.squarePixelHeight = e.info.height) : (e.info.squarePixelWidth = e.info.width, e.info.squarePixelHeight = Math.round(e.info.height * s / a))), e.info.colorSpace = {
											primaries: M[r.colourPrimaries],
											transfer: O[r.transferCharacteristics],
											matrix: N[r.matrixCoefficients],
											fullRange: !!r.fullRangeFlag
										}, e.info.reorderSize = r.maxDecFrameBuffering;
										break;
									}
									if ("hevc" === e.info.codec) {
										if (!i.suppliedPacket) throw new Error("Invalid HEVC video stream; could not extract HVCDecoderConfigurationRecord from first packet.");
										if (e.info.hevcCodecInfo = Ct(i.suppliedPacket.data), !e.info.hevcCodecInfo) continue;
										const t = e.info.hevcCodecInfo.arrays.find((e) => e.nalUnitType === ot.SPS_NUT).nalUnits[0];
										c(t);
										const r = xt(t);
										e.info.width = r.displayWidth, e.info.height = r.displayHeight, r.pixelAspectRatio.num > r.pixelAspectRatio.den ? (e.info.squarePixelWidth = Math.round(e.info.width * r.pixelAspectRatio.num / r.pixelAspectRatio.den), e.info.squarePixelHeight = e.info.height) : (e.info.squarePixelWidth = e.info.width, e.info.squarePixelHeight = Math.round(e.info.height * r.pixelAspectRatio.den / r.pixelAspectRatio.num)), e.info.colorSpace = {
											primaries: M[r.colourPrimaries],
											transfer: O[r.transferCharacteristics],
											matrix: N[r.matrixCoefficients],
											fullRange: !!r.fullRangeFlag
										}, e.info.reorderSize = r.maxDecFrameBuffering;
										break;
									}
									throw new Error("Unhandled.");
								}
								e.info.decoderConfig = {
									codec: Er({
										width: e.info.width,
										height: e.info.height,
										codec: e.info.codec,
										codecDescription: null,
										colorSpace: e.info.colorSpace,
										avcType: 1,
										avcCodecInfo: e.info.avcCodecInfo,
										hevcCodecInfo: e.info.hevcCodecInfo,
										vp9CodecInfo: null,
										av1CodecInfo: null,
										proresFormat: null
									}),
									codedWidth: e.info.width,
									codedHeight: e.info.height,
									colorSpace: e.info.colorSpace
								}, e.info.width === e.info.squarePixelWidth && e.info.height === e.info.squarePixelHeight || (e.info.decoderConfig.displayAspectWidth = e.info.squarePixelWidth, e.info.decoderConfig.displayAspectHeight = e.info.squarePixelHeight), e.initialized = !0;
							} else {
								if (await i.markNextPacket(), !i.suppliedPacket) throw new Error(`Couldn't parse first media packet for Elementary Stream with PID ${e.pid}`);
								if ("aac" === e.info.codec) {
									const t = Oa(qo.tempFromBytes(i.suppliedPacket.data));
									if (!t) throw new Error("Invalid AAC audio stream; could not read ADTS frame header from first packet.");
									e.info.aacCodecInfo = {
										isMpeg2: !1,
										objectType: t.objectType
									}, e.info.numberOfChannels = Qe[t.channelConfiguration], e.info.sampleRate = Xe[t.samplingFrequencyIndex];
								} else if ("mp3" === e.info.codec) {
									const t = $r(Yo(qo.tempFromBytes(i.suppliedPacket.data)), i.suppliedPacket.data.byteLength);
									if (!t.header) throw new Error("Invalid MP3 audio stream; could not read frame header from first packet.");
									e.info.numberOfChannels = Qr(t.header.channel), e.info.sampleRate = t.header.sampleRate;
								} else if ("ac3" === e.info.codec) {
									const t = Xt(i.suppliedPacket.data);
									if (!t) throw new Error("Invalid AC-3 audio stream; could not read sync frame from first packet.");
									if (3 === t.fscod) throw new Error("Invalid AC-3 audio stream; reserved sample rate code found in first packet.");
									e.info.numberOfChannels = Kt[t.acmod] + t.lfeon, e.info.sampleRate = it[t.fscod];
								} else if ("eac3" === e.info.codec) {
									const t = Yt(i.suppliedPacket.data);
									if (!t) throw new Error("Invalid E-AC-3 audio stream; could not read sync frame from first packet.");
									const r = Zt(t);
									if (null === r) throw new Error("Invalid E-AC-3 audio stream; reserved sample rate code found in first packet.");
									e.info.numberOfChannels = Jt(t), e.info.sampleRate = r;
								} else {
									if ("dts" !== e.info.codec) throw new Error("Unhandled.");
									{
										const t = cr(i.suppliedPacket.data);
										if (!t) throw new Error("Invalid DTS audio stream; could not read frame header from first packet.");
										e.info.numberOfChannels = t.numberOfChannels, e.info.sampleRate = t.sampleRate, t.core && (e.info.dtsFormat = t.hasExtensions ? "dtsh" : "dtsc");
									}
								}
								e.info.decoderConfig = {
									codec: Br({
										codec: e.info.codec,
										codecDescription: null,
										aacCodecInfo: e.info.aacCodecInfo,
										dtsFormat: e.info.dtsFormat
									}),
									numberOfChannels: e.info.numberOfChannels,
									sampleRate: e.info.sampleRate
								}, e.initialized = !0;
							}
						}
					} else {
						const e = new Ke(t.payload), r = e.readAlignedByte();
						e.skipBits(8 * r), e.skipBits(12);
						const i = e.readBits(12);
						e.skipBits(43), e.readBits(13), e.skipBits(6);
						const a = e.readBits(10), c = e.pos + 8 * a;
						let l = !1;
						for (; e.pos < c;) {
							const t = e.readBits(8), r = e.readBits(8), i = e.pos + 8 * r;
							if (5 === t && r >= 4) {
								const t = e.readBits(32);
								l ||= 1212435798 === t || 1212436562 === t;
							}
							e.pos = i;
						}
						for (e.pos = c; 8 * (i + n) - e.pos > o;) {
							const t = e.readBits(8);
							e.skipBits(3);
							const r = e.readBits(13);
							e.skipBits(6);
							const i = e.readBits(10), a = e.pos + 8 * i;
							let s = !1, n = !1, o = !1;
							for (; e.pos < a;) {
								const t = e.readBits(8), r = e.readBits(8), i = e.pos + 8 * r;
								if (106 === t) s = !0;
								else if (122 === t || 204 === t) n = !0;
								else if (123 === t) o = !0;
								else if (5 === t && r >= 4) {
									const t = e.readBits(32);
									o ||= 1146376960 == (4294967040 & t);
								}
								e.pos = i;
							}
							let c = null;
							const d = l && ja.has(t) ? 130 : t;
							switch (d) {
								case 27:
								case 36:
									c = {
										type: "video",
										codec: 27 === t ? "avc" : "hevc",
										decoderConfig: null,
										avcCodecInfo: null,
										hevcCodecInfo: null,
										colorSpace: {
											primaries: null,
											transfer: null,
											matrix: null,
											fullRange: null
										},
										width: -1,
										height: -1,
										squarePixelWidth: -1,
										squarePixelHeight: -1,
										reorderSize: -1
									};
									break;
								case 3:
								case 4:
								case 15:
								case 129:
								case 135:
								case 130:
								case 138:
									{
										let e;
										e = 3 === d || 4 === d ? "mp3" : 15 === d ? "aac" : 129 === d ? "ac3" : 135 === d ? "eac3" : "dts", c = {
											type: "audio",
											codec: e,
											decoderConfig: null,
											aacCodecInfo: null,
											dtsFormat: null,
											numberOfChannels: -1,
											sampleRate: -1
										};
									}
									break;
								case 6:
									n ? c = {
										type: "audio",
										codec: "eac3",
										decoderConfig: null,
										aacCodecInfo: null,
										dtsFormat: null,
										numberOfChannels: -1,
										sampleRate: -1
									} : s ? c = {
										type: "audio",
										codec: "ac3",
										decoderConfig: null,
										aacCodecInfo: null,
										dtsFormat: null,
										numberOfChannels: -1,
										sampleRate: -1
									} : o && (c = {
										type: "audio",
										codec: "dts",
										decoderConfig: null,
										aacCodecInfo: null,
										dtsFormat: null,
										numberOfChannels: -1,
										sampleRate: -1
									});
									break;
								default: $a.has(t) || (qe._warn(`Note: MPEG-TS streams with stream_type 0x${t.toString(16)} are not currently supported.`), $a.add(t));
							}
							c && this.elementaryStreams.push({
								demuxer: this,
								pid: r,
								streamType: t,
								initialized: !1,
								firstSection: null,
								canBeTrustedWithKeyPackets: !1,
								info: c,
								referencePesPackets: []
							});
						}
						s = !0;
					}
					else {
						const e = new Ke(t.payload), r = e.readAlignedByte();
						e.skipBits(8 * r), e.skipBits(14);
						const s = e.readBits(10);
						for (e.skipBits(40); 8 * (s + n) - e.pos > o;) {
							const t = e.readBits(16);
							e.skipBits(3);
							const r = e.readBits(13);
							if (0 !== t) {
								if (null !== i) throw new Error("Only files with a single program are supported.");
								i = r;
							}
						}
						if (null === i) throw new Error("Program Association Table must link to a Program Map Table.");
						a = !0;
					}
					if (s && this.elementaryStreams.every((e) => e.initialized)) break;
					r += this.packetStride;
				}
				if (!s) {
					if (!a) throw new Error("No Program Association Table found in the file.");
					throw new Error("No Program Map Table found in the file.");
				}
				for (const n of this.elementaryStreams) n.initialized && ("video" === n.info.type ? this.trackBackingEntries.push(new Ya(n)) : this.trackBackingEntries.push(new Za(n)));
			})();
		}
		async getTrackBackings() {
			return await this.readMetadata(), this.trackBackingEntries;
		}
		async getMetadataTags() {
			return {};
		}
		async getMimeType() {
			return await this.readMetadata(), ((e) => {
				let t = "video/MP2T";
				const r = [...new Set(e.filter(Boolean))];
				return r.length > 0 && (t += `; codecs="${r.join(", ")}"`), t;
			})(await Promise.all(this.trackBackingEntries.map((e) => e.getDecoderConfig().then((e) => e?.codec ?? null))));
		}
		async readSection(e, t, r = !1) {
			let i = e, a = e;
			const s = [];
			let n, o = 0, c = null, l = !0, d = 0;
			for (;;) {
				const e = await this.readPacket(a);
				if (a += this.packetStride, !e) break;
				if (c) {
					if (e.pid !== c.pid) {
						if (r) break;
						continue;
					}
					if (1 === e.payloadUnitStartIndicator) break;
				} else {
					if (0 === e.payloadUnitStartIndicator) break;
					c = e;
				}
				const n = !!(2 & e.adaptationFieldControl), u = !!(1 & e.adaptationFieldControl);
				let h = 0;
				if (n && (h = 1 + e.body[0], e === c && h > 1 && (d = e.body[1] >> 6 & 1)), u && (0 === h ? (s.push(e.body), o += e.body.byteLength) : (s.push(e.body.subarray(h)), o += e.body.byteLength - h)), i = a, !t && o >= 64) {
					l = !1;
					break;
				}
				if (-1 !== $(this.sectionEndPositions, i, (e) => e)) {
					l = !1;
					break;
				}
			}
			if (l) {
				const e = K(this.sectionEndPositions, i, (e) => e);
				this.sectionEndPositions.splice(e + 1, 0, i);
			}
			if (!c) return null;
			if (1 === s.length) n = s[0];
			else {
				const e = s.reduce((e, t) => e + t.length, 0);
				n = new Uint8Array(e);
				let t = 0;
				for (const r of s) n.set(r, t), t += r.length;
			}
			return {
				startPos: e,
				endPos: t ? i : null,
				pid: c.pid,
				payload: n,
				randomAccessIndicator: d
			};
		}
		async readPacketHeader(e) {
			let t = this.reader.requestSlice(e, 4);
			if (Pe(t) && (t = await t), !t) return null;
			if (71 !== jo(t)) throw new Error("Invalid TS packet sync byte. Likely an internal bug, please report this file.");
			const r = Ko(t);
			return {
				payloadUnitStartIndicator: r >> 14 & 1,
				pid: 8191 & r,
				adaptationFieldControl: jo(t) >> 4 & 3
			};
		}
		async readPacket(e) {
			let t = this.reader.requestSlice(e, 188);
			if (Pe(t) && (t = await t), !t) return null;
			const r = Ho(t, 188);
			if (71 !== r[0]) throw new Error("Invalid TS packet sync byte. Likely an internal bug, please report this file.");
			const i = (r[1] << 8) + r[2];
			return {
				payloadUnitStartIndicator: i >> 14 & 1,
				pid: 8191 & i,
				adaptationFieldControl: r[3] >> 4 & 3,
				body: r.subarray(4)
			};
		}
		normalizeTimestamp(e) {
			if (!this.timestampWrapInfo) {
				const t = 54e5;
				this.timestampWrapInfo = {
					reference: e - t,
					offset: e >= Va - t ? -8589934592 : Va
				};
			}
			const { reference: t, offset: r } = this.timestampWrapInfo;
			return r < 0 && e >= t || r > 0 && e < t ? e + r : e;
		}
	};
	const Xa = (e, t, r) => {
		if (t.payload.byteLength < 3) return null;
		const i = new Ke(t.payload);
		if (1 !== i.readBits(24)) return null;
		const a = i.readBits(8);
		if (i.skipBits(16), 188 === a || 190 === a || 191 === a || 240 === a || 241 === a || 255 === a || 242 === a || 248 === a) return null;
		i.skipBits(8);
		const s = i.readBits(2);
		i.skipBits(14);
		let n = null;
		if (2 === s || 3 === s) n = 0, i.skipBits(4), n += i.readBits(3) * (1 << 30), i.skipBits(1), n += 32768 * i.readBits(15), i.skipBits(1), n += i.readBits(15), n = e.normalizeTimestamp(n);
		else if (r) throw new Error(Ha);
		return {
			sectionStartPos: t.startPos,
			sectionEndPos: t.endPos,
			pts: n,
			randomAccessIndicator: t.randomAccessIndicator
		};
	}, Qa = (e, t, r) => {
		c(null !== t.endPos);
		const i = Xa(e, t, r);
		if (!i) return null;
		const a = new Ke(t.payload);
		a.skipBits(32);
		const s = a.readBits(16);
		a.skipBits(16);
		const n = a.readBits(8), o = a.pos + 8 * n;
		a.pos = o;
		const l = o / 8;
		c(Number.isInteger(l));
		const d = t.payload.subarray(l, s > 0 ? 6 + s : t.payload.byteLength);
		return {
			...i,
			data: d
		};
	};
	var Ga = class e {
		constructor(e) {
			this.elementaryStream = e, this.packetBuffers = /* @__PURE__ */ new WeakMap(), this.packetSectionStarts = /* @__PURE__ */ new WeakMap();
		}
		getId() {
			return this.elementaryStream.pid;
		}
		getNumber() {
			const t = this.elementaryStream.demuxer, r = this.elementaryStream.info.type;
			let i = 0;
			for (const a of t.trackBackingEntries) if (a.getType() === r && i++, c(a instanceof e), a.elementaryStream === this.elementaryStream) break;
			return i;
		}
		getCodec() {
			throw new Error("Not implemented on base class.");
		}
		getInternalCodecId() {
			return this.elementaryStream.streamType;
		}
		getName() {
			return null;
		}
		getLanguageCode() {
			return "und";
		}
		getDisposition() {
			return {
				...$e,
				primary: !1
			};
		}
		getTimeResolution() {
			return qa;
		}
		isRelativeToUnixEpoch() {
			return !1;
		}
		getUnixTimeForTimestamp() {
			return null;
		}
		getPairingMask() {
			return 1n;
		}
		getBitrate() {
			return null;
		}
		getAverageBitrate() {
			return null;
		}
		async getDurationFromMetadata() {
			return null;
		}
		async getLiveRefreshInterval() {
			return null;
		}
		createEncodedPacket(e, t, r) {
			let i;
			return i = this.allPacketsAreKeyPackets() || 1 === e.randomAccessIndicator ? "key" : "delta", new Zr(r.metadataOnly ? Yr : e.data, i, e.pts / qa, Math.max(t / qa, 0), e.sequenceNumber, e.data.byteLength);
		}
		async getFirstPacket(e) {
			const t = this.elementaryStream.firstSection;
			c(t);
			const r = Qa(this.elementaryStream.demuxer, t, !0);
			c(r);
			const i = new es(this.elementaryStream, r), a = new ts(this, i), s = await a.readNext();
			if (!s) return null;
			const n = this.createEncodedPacket(s.packet, s.duration, e);
			return this.packetBuffers.set(n, a), this.packetSectionStarts.set(n, s.packet.sectionStartPos), n;
		}
		async getNextPacket(e, t) {
			let r = this.packetBuffers.get(e);
			if (r) {
				const i = await r.readNext();
				if (!i) return null;
				this.packetBuffers.delete(e);
				const a = this.createEncodedPacket(i.packet, i.duration, t);
				return this.packetBuffers.set(a, r), this.packetSectionStarts.set(a, i.packet.sectionStartPos), a;
			}
			const i = this.packetSectionStarts.get(e);
			if (void 0 === i) throw new Error("Packet was not created from this track.");
			const a = this.elementaryStream.demuxer, s = await a.readSection(i, !0);
			c(s);
			const n = Qa(a, s, !0);
			c(n);
			const o = new es(this.elementaryStream, n);
			r = new ts(this, o);
			const l = e.sequenceNumber;
			for (;;) {
				const e = await r.readNext();
				if (!e) return null;
				if (e.packet.sequenceNumber > l) {
					const i = this.createEncodedPacket(e.packet, e.duration, t);
					return this.packetBuffers.set(i, r), this.packetSectionStarts.set(i, e.packet.sectionStartPos), i;
				}
			}
		}
		async getNextKeyPacket(e, t) {
			let r = e;
			for (;;) {
				if (r = await this.getNextPacket(r, t), !r) return null;
				if ("key" === r.type) return r;
			}
		}
		getPacket(e, t) {
			return this.doPacketLookup(e, !1, t);
		}
		getKeyPacket(e, t) {
			return this.doPacketLookup(e, !0, t);
		}
		async doPacketLookup(e, t, r) {
			const i = ie(e * qa), a = this.elementaryStream.demuxer, { reader: s, seekChunkSize: n } = a, o = this.elementaryStream.pid, l = async (e, t, r) => {
				let i = e;
				for (; i < t;) {
					const e = await a.readPacketHeader(i);
					if (!e) return null;
					if (e.pid === o && 1 === e.payloadUnitStartIndicator) {
						const e = await a.readSection(i, r);
						if (!e) return null;
						const t = Xa(a, e, !1);
						if (t && null !== t.pts) return {
							pesPacketHeader: t,
							section: e
						};
					}
					i += a.packetStride;
				}
				return null;
			}, d = this.elementaryStream.firstSection;
			c(d);
			const u = Xa(a, d, !0);
			if (c(u), i < u.pts) return null;
			let h;
			const f = this.elementaryStream.referencePesPackets, m = K(f, i, (e) => e.pts), p = -1 !== m ? f[m] : null;
			if (p && i - p.pts < 45e3) h = p.sectionStartPos;
			else {
				let e = 0;
				if (null !== s.fileSize) {
					const t = Math.ceil(s.fileSize / n);
					if (t > 1) {
						let r = 0, s = t - 1;
						for (e = r; r <= s;) {
							const t = Math.floor((r + s) / 2), o = ne(t * n, a.packetStride) + u.sectionStartPos, c = await l(o, o + n, !1);
							c ? c.pesPacketHeader.pts <= i ? (e = t, r = t + 1) : s = t - 1 : s = t - 1;
						}
					}
				}
				h = ne(e * n, a.packetStride) + u.sectionStartPos;
			}
			let g = (await l(h, s.fileSize ?? Infinity, !1))?.pesPacketHeader ?? null;
			g || (g = u);
			const k = this.getReorderSize(), w = async (e, t) => {
				const s = await a.readSection(e, !0);
				c(s);
				const n = Qa(a, s, !0);
				c(n);
				const o = new es(this.elementaryStream, n), l = new ts(this, o);
				for (; !((T(l.presentationOrderPackets)?.pts ?? -Infinity) >= i) && await l.readNextPacket(););
				const d = Z(l.presentationOrderPackets, t);
				if (-1 === d) return null;
				const u = l.presentationOrderPackets[d], h = 0 === d ? 0 : u.pts - l.presentationOrderPackets[d - 1].pts;
				for (; l.decodeOrderPackets[0] !== u;) l.decodeOrderPackets.shift();
				l.lastDuration = h;
				const f = await l.readNext();
				c(f);
				const m = this.createEncodedPacket(f.packet, f.duration, r);
				return this.packetBuffers.set(m, l), this.packetSectionStarts.set(m, f.packet.sectionStartPos), m;
			};
			if (!t || this.allPacketsAreKeyPackets()) {
				e: for (;;) {
					let e = g.sectionStartPos + a.packetStride;
					for (;;) {
						const t = await a.readPacketHeader(e);
						if (!t) break e;
						if (t.pid === o && 1 === t.payloadUnitStartIndicator) {
							const t = await a.readSection(e, !1);
							if (t) {
								const e = Xa(a, t, !1);
								if (e && null !== e.pts) {
									if (e.pts > i) break e;
									g = e, Ja(this.elementaryStream, g);
									break;
								}
							}
						}
						e += a.packetStride;
					}
				}
				e: for (let e = 0; e < k + 1; e++) {
					let e = g.sectionStartPos - a.packetStride;
					for (; e >= a.packetOffset;) {
						const t = await a.readPacketHeader(e);
						if (!t) break e;
						if (t.pid === o && 1 === t.payloadUnitStartIndicator) {
							const t = await a.readSection(e, !1);
							if (t) {
								const e = Xa(a, t, !1);
								if (e && null !== e.pts) {
									g = e;
									break;
								}
							}
						}
						e -= a.packetStride;
					}
				}
				return w(g.sectionStartPos, (e) => e.pts <= i);
			}
			{
				let e = h, t = null;
				const r = !this.elementaryStream.canBeTrustedWithKeyPackets;
				for (;;) {
					let h = null;
					const f = e <= u.sectionStartPos;
					let m, p = null;
					if (f) m = u, p = d;
					else {
						const t = await l(e, s.fileSize ?? Infinity, r);
						m = t?.pesPacketHeader ?? null, p = t?.section ?? null;
					}
					let g = !1, y = 0;
					e: for (; m && !(null !== t && m.sectionStartPos >= t);) {
						if (m.pts <= i) {
							let e;
							if (this.elementaryStream.canBeTrustedWithKeyPackets) e = 1 === m.randomAccessIndicator;
							else {
								c(p);
								const t = Qa(a, p, !0);
								c(t);
								const r = new es(this.elementaryStream, t);
								await r.markNextPacket(), e = 1 === r.suppliedPacket?.randomAccessIndicator;
							}
							e && (h = m);
						}
						if (m.pts > i && (g = !0), g && (y++, y > k)) break;
						let e = m.sectionStartPos + a.packetStride;
						for (;;) {
							const t = await a.readPacketHeader(e);
							if (!t) break e;
							if (t.pid === o && 1 === t.payloadUnitStartIndicator) {
								const t = await a.readSection(e, r);
								if (t) {
									const e = Xa(a, t, !1);
									if (e && null !== e.pts) {
										m = e, p = t, Ja(this.elementaryStream, m);
										break;
									}
								}
							}
							e += a.packetStride;
						}
					}
					if (h) {
						let e = h;
						if (0 === y) e: for (let i = 0; i < k; i++) {
							let t = e.sectionStartPos - a.packetStride;
							for (; t >= a.packetOffset;) {
								const i = await a.readPacketHeader(t);
								if (!i) break e;
								if (i.pid === o && 1 === i.payloadUnitStartIndicator) {
									const i = await a.readSection(t, r);
									if (i) {
										const t = Xa(a, i, !1);
										if (t && null !== t.pts) {
											e = t;
											break;
										}
									}
								}
								t -= a.packetStride;
							}
						}
						const t = await w(e.sectionStartPos, (e) => e.pts <= i && 1 === e.randomAccessIndicator);
						return c(t), t;
					}
					if (f) return null;
					t = e, e = Math.max(ne(e - u.sectionStartPos - n, a.packetStride) + u.sectionStartPos, u.sectionStartPos);
				}
			}
		}
	}, Ya = class extends Ga {
		getType() {
			return "video";
		}
		getCodec() {
			return this.elementaryStream.info.codec;
		}
		getCodedWidth() {
			return this.elementaryStream.info.width;
		}
		getCodedHeight() {
			return this.elementaryStream.info.height;
		}
		getSquarePixelWidth() {
			return this.elementaryStream.info.squarePixelWidth;
		}
		getSquarePixelHeight() {
			return this.elementaryStream.info.squarePixelHeight;
		}
		getTransformationMatrix() {
			return [...h];
		}
		async getColorSpace() {
			return this.elementaryStream.info.colorSpace;
		}
		async canBeTransparent() {
			return !1;
		}
		async getDecoderConfig() {
			return c(this.elementaryStream.info.decoderConfig), this.elementaryStream.info.decoderConfig;
		}
		allPacketsAreKeyPackets() {
			return !1;
		}
		getReorderSize() {
			return this.elementaryStream.info.reorderSize;
		}
	}, Za = class extends Ga {
		getType() {
			return "audio";
		}
		getCodec() {
			return this.elementaryStream.info.codec;
		}
		getNumberOfChannels() {
			return this.elementaryStream.info.numberOfChannels;
		}
		getSampleRate() {
			return this.elementaryStream.info.sampleRate;
		}
		async getDecoderConfig() {
			return c(this.elementaryStream.info.decoderConfig), this.elementaryStream.info.decoderConfig;
		}
		allPacketsAreKeyPackets() {
			return !0;
		}
		getReorderSize() {
			return 0;
		}
	};
	const Ja = (e, t) => {
		const r = e.referencePesPackets, i = K(r, t.sectionStartPos, (e) => e.sectionStartPos);
		if (i >= 0) {
			const a = r[i];
			if (t.pts <= a.pts) return !1;
			const s = e.demuxer.minReferencePointByteDistance;
			if (t.sectionStartPos - a.sectionStartPos < s) return !1;
			if (i < r.length - 1) {
				const e = r[i + 1];
				if (e.pts < t.pts) return !1;
				if (e.sectionStartPos - t.sectionStartPos < s) return !1;
			}
		}
		return r.splice(i + 1, 0, t), !0;
	};
	var es = class {
		constructor(e, t) {
			this.currentPos = 0, this.pesPackets = [], this.currentPesPacketIndex = 0, this.currentPesPacketPos = 0, this.endPos = 0, this.lastSuppliedPesPacket = null, this.nextPts = null, this.suppliedPacket = null, this.elementaryStream = e, this.pid = e.pid, this.demuxer = e.demuxer, this.startingPesPacket = t;
		}
		ensureBuffered(e) {
			const t = this.endPos - this.currentPos;
			return t >= e ? e : this.bufferData(e - t).then(() => Math.min(this.endPos - this.currentPos, e));
		}
		getCurrentPesPacket() {
			const e = this.pesPackets[this.currentPesPacketIndex];
			return c(e), e;
		}
		async bufferData(e) {
			const t = this.endPos + e;
			for (; this.endPos < t;) {
				let e;
				if (0 === this.pesPackets.length) e = this.startingPesPacket;
				else {
					let t = T(this.pesPackets).sectionEndPos;
					for (c(null !== t);;) {
						const r = await this.demuxer.readPacketHeader(t);
						if (!r) return;
						if (r.pid === this.pid) {
							const r = await this.demuxer.readSection(t, !0);
							if (!r) return;
							const i = Qa(this.demuxer, r, !1);
							if (i) {
								e = i;
								break;
							}
						}
						t += this.demuxer.packetStride;
					}
				}
				this.pesPackets.push(e), this.endPos += e.data.byteLength;
			}
		}
		readBytes(e) {
			const t = this.getCurrentPesPacket(), r = this.currentPos - this.currentPesPacketPos, i = r + e;
			if (this.currentPos += e, i <= t.data.byteLength) return t.data.subarray(r, i);
			const a = new Uint8Array(e);
			a.set(t.data.subarray(r));
			let s = t.data.byteLength - r;
			for (;;) {
				this.advanceCurrentPacket();
				const t = this.getCurrentPesPacket(), r = e - s;
				if (r <= t.data.byteLength) {
					a.set(t.data.subarray(0, r), s);
					break;
				}
				a.set(t.data, s), s += t.data.byteLength;
			}
			return a;
		}
		readU8() {
			let e = this.getCurrentPesPacket();
			const t = this.currentPos - this.currentPesPacketPos;
			return this.currentPos++, t < e.data.byteLength ? e.data[t] : (this.advanceCurrentPacket(), e = this.getCurrentPesPacket(), e.data[0]);
		}
		seekTo(e) {
			if (e !== this.currentPos) {
				if (e < this.currentPos) for (; e < this.currentPesPacketPos;) {
					this.currentPesPacketIndex--;
					const e = this.getCurrentPesPacket();
					this.currentPesPacketPos -= e.data.byteLength;
				}
				else for (;;) {
					const t = this.getCurrentPesPacket();
					if (e < this.currentPesPacketPos + t.data.byteLength) break;
					this.currentPesPacketPos += t.data.byteLength, this.currentPesPacketIndex++;
				}
				this.currentPos = e;
			}
		}
		skip(e) {
			this.seekTo(this.currentPos + e);
		}
		advanceCurrentPacket() {
			this.currentPesPacketPos += this.getCurrentPesPacket().data.byteLength, this.currentPesPacketIndex++;
		}
		async markNextPacket() {
			c(!this.suppliedPacket);
			const e = this.elementaryStream;
			if ("video" === e.info.type) {
				const t = e.info.codec, r = 1024;
				if ("avc" !== t && "hevc" !== t) throw new Error("Unhandled.");
				const i = "avc" === t ? 1 : 2;
				let a = null, s = !1, n = 0;
				for (;;) {
					let e = this.ensureBuffered(r);
					if (Pe(e) && (e = await e), 0 === e) break;
					const o = this.currentPos, c = this.readBytes(e), l = c.byteLength;
					let d = 0;
					for (; d < l;) {
						const e = c.indexOf(0, d);
						if (-1 === e || e >= l) break;
						d = e;
						const r = o + d;
						if (d + 3 >= l) {
							this.seekTo(r);
							break;
						}
						const u = c[d + 1], h = c[d + 2], f = c[d + 3];
						let m = 0;
						if (0 === u && 0 === h && 1 === f ? m = 4 : 0 === u && 1 === h && (m = 3), 0 === m) {
							d++;
							continue;
						}
						const p = r;
						a ??= p;
						const g = d + m, k = g + i, w = 6;
						if (k + ("avc" === t ? w : 1) > l) {
							this.seekTo(r);
							break;
						}
						const y = c[g];
						let b, T, v;
						if ("avc" === t) b = ut(y), T = b === nt.NON_IDR_SLICE || b === nt.SLICE_DPA || b === nt.IDR, v = b === nt.SEI || b === nt.SPS || b === nt.PPS || b === nt.AUD;
						else {
							if (b = Pt(y), ((1 & y) << 5 | c[g + 1] >> 3) > 0) {
								d += m;
								continue;
							}
							T = b <= ot.RASL_R || b >= ot.BLA_W_LP && b <= 21, v = b >= ot.VPS_NUT && b <= 37 || b === ot.PREFIX_SEI_NUT || b >= 41 && b <= 44 || b >= 48 && b <= 55;
						}
						let P = !1;
						if (T) {
							let e;
							if ("avc" === t) {
								const t = S(new Ke(c.subarray(k, k + w)));
								e = !s || t <= n, n = t;
							} else e = c[k] >> 7 == 1;
							e && (s ? P = !0 : s = !0);
						} else v && s && (P = !0);
						if (P) {
							const e = p - a;
							return this.seekTo(a), this.supplyPacket(e, 0);
						}
						d += m;
					}
					if (e < r) break;
				}
				if (null !== a && this.endPos > a) {
					const e = this.endPos - a;
					return this.seekTo(a), this.supplyPacket(e, 0);
				}
			} else {
				const t = e.info.codec, r = 128;
				for (;;) {
					let i = this.ensureBuffered(r);
					Pe(i) && (i = await i);
					const a = this.currentPos;
					for (; this.currentPos - a < i;) {
						const r = this.readU8();
						if ("aac" === t) {
							if (255 !== r) continue;
							this.skip(-1);
							const t = this.currentPos;
							let i = this.ensureBuffered(9);
							if (Pe(i) && (i = await i), i < 9) return;
							const a = this.readBytes(9), s = Oa(qo.tempFromBytes(a));
							if (s) {
								this.seekTo(t);
								let r = this.ensureBuffered(s.frameLength);
								return Pe(r) && (r = await r), this.supplyPacket(r, Math.round(9216e4 / e.info.sampleRate));
							}
							this.seekTo(t + 1);
						} else {
							if ("mp3" !== t) {
								if ("ac3" === t) {
									if (11 !== r) continue;
									this.skip(-1);
									const t = this.currentPos;
									let i = this.ensureBuffered(5);
									if (Pe(i) && (i = await i), i < 5) return;
									const a = this.readBytes(5);
									if (11 !== a[0] || 119 !== a[1]) {
										this.seekTo(t + 1);
										continue;
									}
									const s = a[4] >> 6, n = 63 & a[4];
									if (3 === s || n > 37) {
										this.seekTo(t + 1);
										continue;
									}
									const o = Qt[3 * n + s];
									c(void 0 !== o), this.seekTo(t), i = this.ensureBuffered(o), Pe(i) && (i = await i);
									const l = Math.round(13824e4 / e.info.sampleRate);
									return this.supplyPacket(i, l);
								}
								if ("eac3" === t) {
									if (11 !== r) continue;
									this.skip(-1);
									const t = this.currentPos;
									let i = this.ensureBuffered(5);
									if (Pe(i) && (i = await i), i < 5) return;
									const a = this.readBytes(5);
									if (11 !== a[0] || 119 !== a[1]) {
										this.seekTo(t + 1);
										continue;
									}
									const s = 2 * (1 + ((7 & a[2]) << 8 | a[3])), n = Gt[a[4] >> 6 == 3 ? 3 : a[4] >> 4 & 3];
									this.seekTo(t), i = this.ensureBuffered(s), Pe(i) && (i = await i);
									const o = 256 * n, c = Math.round(o * qa / e.info.sampleRate);
									return this.supplyPacket(i, c);
								}
								if ("dts" === t) {
									if (127 !== r && 100 !== r) continue;
									this.skip(-1);
									const t = this.currentPos;
									let i = this.ensureBuffered(18);
									if (Pe(i) && (i = await i), i < 18) return;
									const a = this.readBytes(18), s = dr(a);
									let n = s ? null : ur(a);
									if (!s && !n) {
										this.seekTo(t + 1);
										continue;
									}
									if (n && !n.asset) {
										this.seekTo(t);
										const e = Math.min(n.frameSize, 4096);
										let r = this.ensureBuffered(e);
										Pe(r) && (r = await r), n = ur(this.readBytes(r)) ?? n;
									}
									let o = s ? s.frameSize : n.frameSize;
									if (s) {
										let e = 4 * Math.ceil(s.frameSize / 4);
										for (;;) {
											this.seekTo(t);
											const r = e + 10;
											let i = this.ensureBuffered(r);
											if (Pe(i) && (i = await i), i < r) break;
											this.seekTo(t + e);
											const a = ur(this.readBytes(10));
											if (!a) break;
											e += a.frameSize, o = e;
										}
									}
									const c = s?.sampleCount ?? n.asset?.sampleCount;
									if (void 0 === c) {
										this.seekTo(t + 1);
										continue;
									}
									this.seekTo(t), i = this.ensureBuffered(o), Pe(i) && (i = await i);
									const l = Math.round(c * qa / e.info.sampleRate);
									return this.supplyPacket(i, l);
								}
								throw new Error("Unhandled.");
							}
							{
								if (255 !== r) continue;
								this.skip(-1);
								const t = this.currentPos;
								let i = this.ensureBuffered(4);
								if (Pe(i) && (i = await i), i < 4) return;
								const a = $r(E(this.readBytes(4)).getUint32(0), null);
								if (a.header) {
									this.seekTo(t);
									let r = this.ensureBuffered(a.header.totalSize);
									Pe(r) && (r = await r);
									const i = a.header.audioSamplesInFrame * qa / e.info.sampleRate;
									return this.supplyPacket(r, Math.round(i));
								}
								this.seekTo(t + 1);
							}
						}
					}
					if (i < r) break;
				}
			}
		}
		supplyPacket(e, t) {
			const r = this.getCurrentPesPacket();
			let i;
			if (this.lastSuppliedPesPacket === r) c(null !== this.nextPts), i = this.nextPts;
			else {
				if (null === r.pts) throw new Error(Ha);
				i = r.pts, Ja(this.elementaryStream, r);
			}
			this.lastSuppliedPesPacket = r, this.nextPts = i + t;
			const a = r.sectionStartPos, s = a + (this.currentPos - this.currentPesPacketPos), n = this.readBytes(e);
			let o = r.randomAccessIndicator;
			if (0 === o && !this.elementaryStream.canBeTrustedWithKeyPackets) {
				if ("audio" === this.elementaryStream.info.type) o = 1;
				else if (this.elementaryStream.info.decoderConfig) {
					const e = "key" === Ht(this.elementaryStream.info.codec, this.elementaryStream.info.decoderConfig, n);
					o = Number(e);
				}
			}
			this.suppliedPacket = {
				pts: i,
				data: n,
				sequenceNumber: s,
				sectionStartPos: a,
				randomAccessIndicator: o
			}, this.pesPackets.splice(0, this.currentPesPacketIndex), this.currentPesPacketIndex = 0;
		}
	}, ts = class {
		constructor(e, t) {
			this.decodeOrderPackets = [], this.reorderBuffer = [], this.presentationOrderPackets = [], this.reachedEnd = !1, this.lastDuration = 0, this.backing = e, this.context = t, this.reorderSize = e.getReorderSize(), c(this.reorderSize >= 0);
		}
		async readNext() {
			if (0 === this.decodeOrderPackets.length && !await this.readNextPacket()) return null;
			await this.ensureCurrentPacketHasNext();
			const e = this.decodeOrderPackets[0], t = this.presentationOrderPackets.indexOf(e);
			let r;
			for (c(-1 !== t), t === this.presentationOrderPackets.length - 1 ? r = this.lastDuration : (r = this.presentationOrderPackets[t + 1].pts - e.pts, this.lastDuration = r), this.decodeOrderPackets.shift(); this.presentationOrderPackets.length > 0;) {
				const e = this.presentationOrderPackets[0];
				if (this.decodeOrderPackets.includes(e)) break;
				this.presentationOrderPackets.shift();
			}
			return {
				packet: e,
				duration: r
			};
		}
		async readNextPacket() {
			if (this.reachedEnd) return !1;
			let e;
			return this.context.suppliedPacket || await this.context.markNextPacket(), e = this.context.suppliedPacket, this.context.suppliedPacket = null, e ? (this.decodeOrderPackets.push(e), this.processPacketThroughReorderBuffer(e), !0) : (this.reachedEnd = !0, this.flushReorderBuffer(), !1);
		}
		async ensureCurrentPacketHasNext() {
			const e = this.decodeOrderPackets[0];
			for (c(e);;) {
				const t = this.presentationOrderPackets.indexOf(e);
				if (-1 !== t && t <= this.presentationOrderPackets.length - 2) break;
				if (!await this.readNextPacket()) break;
			}
		}
		processPacketThroughReorderBuffer(e) {
			if (this.reorderBuffer.push(e), this.reorderBuffer.length > this.reorderSize) {
				let e = 0;
				for (let r = 1; r < this.reorderBuffer.length; r++) this.reorderBuffer[r].pts < this.reorderBuffer[e].pts && (e = r);
				const t = this.reorderBuffer[e];
				this.presentationOrderPackets.push(t), this.reorderBuffer.splice(e, 1);
			}
		}
		flushReorderBuffer() {
			this.reorderBuffer.sort((e, t) => e.pts - t.pts), this.presentationOrderPackets.push(...this.reorderBuffer), this.reorderBuffer.length = 0;
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	const rs = "application/vnd.apple.mpegurl", is = (e) => 0 === e.length || e.startsWith("#") && !e.startsWith("#EXT");
	var as = class {
		constructor(e, t) {
			this._attributes = {};
			let r = "", i = "", a = !1, s = !1, n = !1;
			const o = () => {
				if (!r) return;
				const e = r.trim().toLowerCase();
				Object.prototype.hasOwnProperty.call(this._attributes, e) && qe._warn(`Duplicate AttributeName "${e}"; using last value`);
				const s = n || i.startsWith("0x") || i.startsWith("0X");
				this._attributes[e] = s && t ? t.substitute(i) : i, r = "", i = "", a = !1, n = !1;
			};
			for (let c = 0; c < e.length; c++) {
				const t = e[c];
				"\"" === t ? (a && !s && 0 === i.length && (n = !0), s = !s) : "=" !== t || a || s ? "," !== t || s ? a ? i += t : r += t : o() : a = !0;
			}
			if (s) throw new Error("Invalid M3U8 file; unterminated quoted-string AttributeValue.");
			o();
		}
		get(e) {
			return this._attributes[e.toLowerCase()] ?? null;
		}
		getAsNumber(e) {
			const t = this.get(e);
			if (null === t) return null;
			const r = Number(t);
			return Number.isFinite(r) ? r : null;
		}
		merge(e) {
			Object.assign(this._attributes, e._attributes);
		}
	};
	const ss = /^[A-Za-z0-9_-]+$/, ns = /\{\$([A-Za-z0-9_-]+)\}/g;
	var os = class {
		constructor(e, t) {
			this.playlistPath = e, this.importedVariables = t, this.variables = /* @__PURE__ */ new Map();
		}
		define(e) {
			const t = new as(e, this), r = t.get("name"), i = t.get("import"), a = t.get("queryparam");
			if (1 !== [
				r,
				i,
				a
			].filter((e) => null !== e).length) throw new Error("Invalid #EXT-X-DEFINE tag; exactly one of NAME, IMPORT, or QUERYPARAM must be present.");
			if (null !== r) {
				const e = t.get("value");
				if (null === e) throw new Error("Invalid #EXT-X-DEFINE tag; NAME requires VALUE.");
				this.set(r, e);
			} else if (null !== i) {
				const e = this.importedVariables?.get(i);
				if (void 0 === e) throw new Error(`Invalid #EXT-X-DEFINE tag; cannot import undefined variable "${i}".`);
				this.set(i, e);
			} else if (null !== a) {
				const e = ((e, t) => {
					const r = e.indexOf("?");
					if (-1 === r) return null;
					const i = e.indexOf("#", r), a = e.slice(r + 1, -1 === i ? void 0 : i);
					for (const s of a.split("&")) {
						const e = s.indexOf("="), r = -1 === e ? s : s.slice(0, e);
						if (decodeURIComponent(r) !== t) continue;
						const i = -1 === e ? "" : s.slice(e + 1);
						return decodeURIComponent(i);
					}
					return null;
				})(this.playlistPath, a);
				if (null === e) throw new Error(`Invalid #EXT-X-DEFINE tag; query parameter "${a}" is missing.`);
				this.set(a, e);
			}
		}
		substitute(e) {
			return e.replaceAll(ns, (e, t) => {
				const r = this.variables.get(t);
				if (void 0 === r) throw new Error(`Invalid M3U8 file; variable "${t}" is referenced before being defined.`);
				return r;
			});
		}
		get(e) {
			return this.variables.get(e);
		}
		set(e, t) {
			if (!ss.test(e)) throw new Error(`Invalid #EXT-X-DEFINE tag; invalid variable name "${e}".`);
			if (this.variables.has(e)) throw new Error(`Invalid #EXT-X-DEFINE tag; variable "${e}" is already defined.`);
			this.variables.set(e, t);
		}
	}, cs = class {
		constructor(e, t, r) {
			this.nextInputCacheAge = 0, this.inputCache = [], this.trackBackingsPromise = null, this.firstSegment = null, this.firstSegmentFirstTimestamps = /* @__PURE__ */ new WeakMap(), this.firstTimestampCache = /* @__PURE__ */ new WeakMap(), this.input = e, this.path = t, this.trackDeclarations = r;
		}
		async getDurationFromMetadata(e) {
			const t = await this.getSegmentAt(Infinity, { skipLiveWait: e.skipLiveWait });
			return t ? t.timestamp + t.duration : null;
		}
		async getUnixTimeForTimestamp(e) {
			let t = await this.getSegmentAt(e, {});
			if (t ??= await this.getFirstSegment({}), !t || null === t.unixEpochTimestamp) return null;
			const r = e - t.timestamp;
			return t.unixEpochTimestamp + r;
		}
		async getTrackBackings() {
			return this.trackBackingsPromise ??= (async () => {
				const e = [];
				if (this.trackDeclarations) {
					for (const t of this.trackDeclarations) if ("video" === t.type) {
						const r = Re(e, (e) => "video" === e.getType()) + 1;
						e.push(new ds(this, t, r));
					} else if ("audio" === t.type) {
						const r = Re(e, (e) => "audio" === e.getType()) + 1;
						e.push(new us(this, t, r));
					}
				} else {
					if (this.firstSegment = await this.getFirstSegment({}), !this.firstSegment) return [];
					const t = await this.getInputForSegment(this.firstSegment).getTracks();
					for (const r of t) if ("video" === r.type) {
						const t = Re(e, (e) => "video" === e.getType()) + 1;
						e.push(new ds(this, {
							id: e.length + 1,
							type: "video"
						}, t));
					} else if ("audio" === r.type) {
						const t = Re(e, (e) => "audio" === e.getType()) + 1;
						e.push(new us(this, {
							id: e.length + 1,
							type: "audio"
						}, t));
					}
				}
				return e;
			})();
		}
		async getFirstTimestampForInput(e) {
			const t = this.firstTimestampCache.get(e);
			if (void 0 !== t) return t;
			const r = await e.getFirstTimestamp();
			return this.firstTimestampCache.set(e, r), r;
		}
		async getMediaOffset(e, t) {
			const r = e.firstSegment ?? e;
			let i;
			if (this.firstSegmentFirstTimestamps.has(r)) i = this.firstSegmentFirstTimestamps.get(r);
			else {
				const e = this.getInputForSegment(r);
				i = await this.getFirstTimestampForInput(e), this.firstSegmentFirstTimestamps.set(r, i);
			}
			if (r === e) return r.timestamp - i;
			const a = await this.getFirstTimestampForInput(t), s = e.timestamp - r.timestamp, n = a - i - s;
			return Math.abs(n) <= Math.min(.25, s) ? r.timestamp - i : e.timestamp - a;
		}
		dispose() {
			for (const e of this.inputCache) e.input.dispose();
			this.inputCache.length = 0;
		}
	}, ls = class {
		constructor(e, t, r) {
			this.packetInfos = /* @__PURE__ */ new WeakMap(), this.hydrationPromise = null, this.firstInputTrack = null, this.firstSegment = null, this.segmentedInput = e, this.decl = t, this.number = r;
		}
		hydrate() {
			return this.hydrationPromise ??= (async () => {
				if (this.segmentedInput.firstSegment ??= await this.segmentedInput.getFirstSegment({}), !this.segmentedInput.firstSegment) throw new Error("Missing first segment, can't retrieve track.");
				let e = this.segmentedInput.firstSegment, t = null;
				for (; e && (t = (await this.segmentedInput.getInputForSegment(e).getTracks()).find((e) => e.type === this.decl.type && e.number === this.number) ?? null, !t);) e = await this.segmentedInput.getNextSegment(e, {});
				if (!t) throw new Error("No matching track found in underlying media data.");
				this.firstInputTrack = t, this.firstSegment = e;
			})();
		}
		getId() {
			return this.decl.id;
		}
		getType() {
			return this.decl.type;
		}
		getNumber() {
			return this.number;
		}
		delegate(e) {
			return this.firstInputTrack ? e() : this.hydrate().then(e);
		}
		async getDecoderConfig() {
			return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
		}
		getHasOnlyKeyPackets() {
			return this.delegate(() => this.firstInputTrack._backing.getHasOnlyKeyPackets?.() ?? null);
		}
		getPairingMask() {
			return 1n;
		}
		getCodec() {
			return this.delegate(() => this.firstInputTrack._backing.getCodec());
		}
		getInternalCodecId() {
			return this.delegate(() => this.firstInputTrack._backing.getInternalCodecId());
		}
		getDisposition() {
			return this.delegate(() => this.firstInputTrack._backing.getDisposition());
		}
		getLanguageCode() {
			return this.delegate(() => this.firstInputTrack._backing.getLanguageCode());
		}
		getName() {
			return this.delegate(() => this.firstInputTrack._backing.getName());
		}
		getTimeResolution() {
			return this.delegate(() => this.firstInputTrack._backing.getTimeResolution());
		}
		async isRelativeToUnixEpoch() {
			return await this.hydrate(), c(this.segmentedInput.firstSegment), this.segmentedInput.firstSegment.unixEpochTimestamp === this.segmentedInput.firstSegment.timestamp;
		}
		getUnixTimeForTimestamp(e) {
			return this.segmentedInput.getUnixTimeForTimestamp(e);
		}
		getBitrate() {
			return this.delegate(() => this.firstInputTrack._backing.getBitrate());
		}
		getAverageBitrate() {
			return this.delegate(() => this.firstInputTrack._backing.getAverageBitrate());
		}
		getDurationFromMetadata(e) {
			return this.segmentedInput.getDurationFromMetadata(e);
		}
		getLiveRefreshInterval() {
			return this.segmentedInput.getLiveRefreshInterval();
		}
		async createAdjustedPacket(e, t, r) {
			c(e.sequenceNumber >= 0), c(this.segmentedInput.firstSegment);
			const i = await this.segmentedInput.getMediaOffset(t, r.input), a = t.timestamp - this.segmentedInput.firstSegment.timestamp, s = e.clone({
				timestamp: se(e.timestamp + i, await r.getTimeResolution()),
				sequenceNumber: Math.floor(1e8 * a) + e.sequenceNumber
			});
			return this.packetInfos.set(s, {
				segment: t,
				track: r,
				sourcePacket: e
			}), s;
		}
		async getFirstPacket(e) {
			await this.hydrate(), c(this.firstInputTrack), c(this.firstSegment);
			let t = this.firstInputTrack, r = this.firstSegment;
			for (;;) {
				if (t) {
					const i = await t._backing.getFirstPacket(e);
					if (i) return this.createAdjustedPacket(i, r, t);
				}
				if (r = await this.segmentedInput.getNextSegment(r, { skipLiveWait: e.skipLiveWait }), !r) break;
				t = (await this.segmentedInput.getInputForSegment(r).getTracks()).find((e) => e.type === this.firstInputTrack.type && e.number === this.firstInputTrack.number) ?? null;
			}
			return null;
		}
		getNextPacket(e, t) {
			return this._getNextInternal(e, t, !1);
		}
		getNextKeyPacket(e, t) {
			return this._getNextInternal(e, t, !0);
		}
		async _getNextInternal(e, t, r) {
			const i = this.packetInfos.get(e);
			if (!i) throw new Error("Packet was not created from this track.");
			const a = r ? await i.track._backing.getNextKeyPacket(i.sourcePacket, t) : await i.track._backing.getNextPacket(i.sourcePacket, t);
			if (a) return this.createAdjustedPacket(a, i.segment, i.track);
			let s = i.segment;
			for (;;) {
				const e = await this.segmentedInput.getNextSegment(s, { skipLiveWait: t.skipLiveWait });
				if (!e) return null;
				const r = (await this.segmentedInput.getInputForSegment(e).getTracks()).find((e) => e.type === i.track.type && e.number === i.track.number);
				if (!r) {
					s = e;
					continue;
				}
				const a = await r._backing.getFirstPacket(t);
				return a ? this.createAdjustedPacket(a, e, r) : null;
			}
		}
		getPacket(e, t) {
			return this._getPacketInternal(e, t, !1);
		}
		getKeyPacket(e, t) {
			return this._getPacketInternal(e, t, !0);
		}
		async _getPacketInternal(e, t, r) {
			let i = await this.segmentedInput.getSegmentAt(e, { skipLiveWait: t.skipLiveWait });
			if (!i) return null;
			for (await this.hydrate(); i;) {
				const a = this.segmentedInput.getInputForSegment(i), s = (await a.getTracks()).find((e) => e.type === this.firstInputTrack.type && e.number === this.firstInputTrack.number);
				if (!s) {
					i = await this.segmentedInput.getPreviousSegment(i, { skipLiveWait: t.skipLiveWait });
					continue;
				}
				const n = e - await this.segmentedInput.getMediaOffset(i, a), o = r ? await s._backing.getKeyPacket(n, t) : await s._backing.getPacket(n, t);
				if (o) return this.createAdjustedPacket(o, i, s);
				i = await this.segmentedInput.getPreviousSegment(i, { skipLiveWait: t.skipLiveWait });
			}
			return null;
		}
	}, ds = class extends ls {
		getType() {
			return "video";
		}
		getCodec() {
			return this.delegate(() => this.firstInputTrack._backing.getCodec());
		}
		getCodedWidth() {
			return this.delegate(() => this.firstInputTrack._backing.getCodedWidth());
		}
		getCodedHeight() {
			return this.delegate(() => this.firstInputTrack._backing.getCodedHeight());
		}
		getSquarePixelWidth() {
			return this.delegate(() => this.firstInputTrack._backing.getSquarePixelWidth());
		}
		getSquarePixelHeight() {
			return this.delegate(() => this.firstInputTrack._backing.getSquarePixelHeight());
		}
		getTransformationMatrix() {
			return this.delegate(() => this.firstInputTrack._backing.getTransformationMatrix());
		}
		async getColorSpace() {
			return this.delegate(() => this.firstInputTrack._backing.getColorSpace());
		}
		async canBeTransparent() {
			return this.delegate(() => this.firstInputTrack._backing.canBeTransparent());
		}
		async getDecoderConfig() {
			return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
		}
	}, us = class extends ls {
		getType() {
			return "audio";
		}
		getCodec() {
			return this.delegate(() => this.firstInputTrack._backing.getCodec());
		}
		getNumberOfChannels() {
			return this.delegate(() => this.firstInputTrack._backing.getNumberOfChannels());
		}
		getSampleRate() {
			return this.delegate(() => this.firstInputTrack._backing.getSampleRate());
		}
		async getDecoderConfig() {
			return this.delegate(() => this.firstInputTrack._backing.getDecoderConfig());
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/ n((e, t) => {
		t.exports = {};
	})();
	Ie();
	const hs = Infinity;
	"undefined" != typeof FinalizationRegistry && new FinalizationRegistry((e) => {
		e();
	});
	var ms = class extends Ne {
		constructor() {
			super(), this._disposed = !1, this._refCount = 0, this._usedForHls = !1, this._refFinalizationRegistry = null, this._sizePromise = null, this.onread = null, "undefined" != typeof FinalizationRegistry && (this._refFinalizationRegistry = new FinalizationRegistry((e) => {
				e._decrementRefCount();
			}));
		}
		async getSizeOrNull() {
			if (this._disposed) throw new Lo();
			return this._sizePromise ??= (async () => {
				let e = this._getFileSize();
				return void 0 !== e || (await this._read(0, 1, 0, hs), e = this._getFileSize(), c(void 0 !== e)), e;
			})();
		}
		async getSize() {
			if (this._disposed) throw new Lo();
			const e = await this.getSizeOrNull();
			if (null === e) throw new Error("Cannot determine the size of an unsized source.");
			return e;
		}
		slice(e, t) {
			if (!Number.isInteger(e) || e < 0) throw new TypeError("offset must be a non-negative integer.");
			if (void 0 !== t && (!Number.isInteger(t) || t < 0)) throw new TypeError("length, when provided, must be a non-negative integer.");
			return new Es(this, e, t);
		}
		_dispatchRead(e, t) {
			this.onread?.(e, t), this._emit("read", {
				start: e,
				end: t
			});
		}
		ref() {
			return new ps(this);
		}
		_incrementRefCount() {
			this._refCount++;
		}
		_decrementRefCount() {
			this._refCount--, 0 === this._refCount && (this._dispose(), this._disposed = !0);
		}
	}, ps = class {
		constructor(e) {
			if (this._freed = !1, e._disposed) throw new Error("Cannot ref a disposed source.");
			e._incrementRefCount(), e._refFinalizationRegistry?.register(this, e, this), this._source = e;
		}
		get source() {
			if (!this._source) throw new Error("Can't get source; ref has already been freed.");
			return this._source;
		}
		get freed() {
			return this._freed;
		}
		free() {
			if (this._freed) throw new Error("Illegal operation: double free on SourceRef.");
			const e = this.source;
			c(e._refCount > 0), e._decrementRefCount(), e._refFinalizationRegistry?.unregister(this), this._freed = !0, this._source = null;
		}
		[Symbol.dispose]() {
			this.freed || this.free();
		}
	}, gs = class extends ms {
		constructor(e, t) {
			if ("string" != typeof e) throw new TypeError("rootPath must be a string.");
			if ("function" != typeof t) throw new TypeError("requestHandler must be a function.");
			super(), this.rootPath = e, this.requestHandler = t;
		}
		_resolveRequest(e) {
			const t = this.requestHandler(e), r = (e) => {
				if (!(e instanceof ms || e instanceof ps)) throw new TypeError("requestHandler must return or resolve to a Source or SourceRef.");
				const t = e instanceof ms ? e.ref() : e;
				return t.source._usedForHls ||= this._usedForHls, t;
			};
			return Pe(t) ? t.then(r) : r(t);
		}
	};
	const ks = (e, t) => e.path === t.path;
	var ws = class extends gs {
		constructor() {
			super(...arguments), this._root = null, this._rootRequest = null;
		}
		_read(e, t, r, i) {
			if (!this._root) {
				if (!this._rootRequest) {
					const e = this._resolveRequest({
						path: this.rootPath,
						isRoot: !0
					}), t = (e) => {
						const t = e instanceof ms ? e.ref() : e;
						return this._root = t, this._rootRequest = null, t;
					};
					Pe(e) ? this._rootRequest = e.then(t) : (t(e), c(this._root));
				}
				if (this._rootRequest) return this._rootRequest.then((a) => a.source._read(e, t, r, i));
			}
			return this._root.source._read(e, t, r, i);
		}
		_getFileSize() {
			if (this._root) return this._root.source._getFileSize();
		}
		_dispose() {
			this._root ? this._root.free() : this._rootRequest && this._rootRequest.then((e) => e.free());
		}
	};
	"undefined" != typeof FinalizationRegistry && new FinalizationRegistry((e) => {
		e.cancel().catch(() => {});
	});
	const ys = (e, t, r) => {
		if (t instanceof Error && (t.message.includes("Failed to fetch") || t.message.includes("Load failed") || t.message.includes("NetworkError when attempting to fetch resource")) && "undefined" != typeof window) {
			let e = null;
			try {
				"undefined" != typeof window && void 0 !== window.location && (e = new URL(r instanceof Request ? r.url : r, window.location.href).origin);
			} catch {}
			if (("undefined" == typeof navigator || "boolean" != typeof navigator.onLine || navigator.onLine) && null !== e && e !== window.location.origin) return qe._warn("Request will not be retried because a CORS error was suspected due to different origins. You can modify this behavior by providing your own function for the 'getRetryDelay' option."), null;
		}
		return Math.min(2 ** (e - 2), 16);
	}, bs = /* @__PURE__ */ new Set();
	var Ts = class e extends gs {
		constructor(t, r = {}) {
			if (!("string" == typeof t || t instanceof URL || "undefined" != typeof Request && t instanceof Request)) throw new TypeError("url must be a string, URL or Request.");
			if (!r || "object" != typeof r) throw new TypeError("options must be an object.");
			if (void 0 !== r.requestInit && (!r.requestInit || "object" != typeof r.requestInit)) throw new TypeError("options.requestInit, when provided, must be an object.");
			if (void 0 !== r.getRetryDelay && "function" != typeof r.getRetryDelay) throw new TypeError("options.getRetryDelay, when provided, must be a function.");
			if (void 0 !== r.maxCacheSize && (!Be(r.maxCacheSize) || r.maxCacheSize < 0)) throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
			if (void 0 !== r.parallelism && (!Number.isInteger(r.parallelism) || r.parallelism < 1)) throw new TypeError("options.parallelism, when provided, must be a positive number.");
			if (void 0 !== r.fetchFn && "function" != typeof r.fetchFn) throw new TypeError("options.fetchFn, when provided, must be a function.");
			if (void 0 !== r.handleUnhandledError && "function" != typeof r.handleUnhandledError) throw new TypeError("options.handleUnhandledError, when provided, must be a function.");
			super(t instanceof Request ? t.url : t instanceof URL ? t.href : t, (t) => new e(t.path, this._options)), this._offset = 0, this._length = null, this._fileSizeDetermined = !1, this._sequentialBacking = null, this._abortControllers = /* @__PURE__ */ new Map(), this._sequentialAbortController = null, this._url = t, this._options = r, this._getRetryDelay = r.getRetryDelay ?? ys, this._requestInit = { ...r.requestInit };
			let i = null;
			if (r.requestInit?.headers) {
				const e = { ...fe(r.requestInit.headers) }, t = Object.keys(e).find((e) => "range" === e.toLowerCase());
				void 0 !== t && (i = e[t], delete e[t], this._requestInit.headers = e);
			}
			if (t instanceof Request) {
				const e = t.headers.get("Range");
				if (null !== e) {
					i ??= e;
					const r = new Request(t);
					r.headers.delete("Range"), this._url = r;
				}
			}
			if (null !== i) {
				const e = Ss(i);
				e && (this._offset = e.offset, this._length = e.length);
			}
			this._orchestrator = new Cs({
				maxCacheSize: r.maxCacheSize ?? 67108864,
				maxWorkerCount: r.parallelism ?? 2,
				runWorker: this._runWorker.bind(this),
				onIdleWorkerRemoved: (e) => this._abortControllers.delete(e),
				prefetchProfile: xs.network,
				handleUnhandledError: r.handleUnhandledError
			});
		}
		_getFileSize() {
			if (!this._fileSizeDetermined) return null !== this._length ? this._length : void 0;
			const e = this._sequentialBacking ? this._sequentialBacking._endIndex : this._orchestrator.fileSize;
			return null === e ? null !== this._length ? this._length : null : re(e - this._offset, 0, this._length ?? Infinity);
		}
		_read(e, t, r, i) {
			if (null !== this._length && t > this._length) return null;
			const a = this._offset, s = this._sequentialBacking ? this._sequentialBacking._read(a + e, a + t) : this._orchestrator.read(a + e, a + t, Math.max(a + r, a), a + Math.min(i, this._length ?? Infinity)), n = (e) => e ? (e.offset -= this._offset, e) : null;
			return Pe(s) ? s.then(n) : n(s);
		}
		async _runWorker(e) {
			for (;;) {
				if (e.aborted) return void this._orchestrator.signalWorkerStoppedRunning(e);
				const r = new AbortController();
				this._abortControllers.set(e, r);
				const i = await me(this._options.fetchFn ?? fetch, this._url, he(this._requestInit, {
					headers: { Range: `bytes=${e.currentPos}-` },
					signal: r.signal
				}), this._getRetryDelay, () => r.signal.aborted);
				if (!i.ok) throw new Error(`Error fetching ${String(this._url)}: ${i.status} ${i.statusText}`);
				i.redirected && (this.rootPath = i.url);
				e: if (null === this._orchestrator.fileSize && !i.headers.has("Content-Encoding") && (206 === i.status || "basic" === i.type)) {
					const t = i.headers.get("Content-Range");
					if (t) {
						const e = /\/(\d+)/.exec(t);
						if (e) {
							this._orchestrator.supplyFileSize(Number(e[1]));
							break e;
						}
					}
					const r = i.headers.get("Content-Length");
					if (r) {
						const t = 206 === i.status ? e.currentPos : 0;
						this._orchestrator.supplyFileSize(t + Number(r));
					}
				}
				if (this._fileSizeDetermined = !0, !i.body) throw new Error("Missing HTTP response body stream. The used fetch function must provide the response body as a ReadableStream.");
				if (206 !== i.status) {
					if (this._sequentialBacking) return void i.body.cancel().catch(() => {});
					if (!this._usedForHls) {
						const e = new URL(this._url instanceof Request ? this._url.url : this._url, "undefined" != typeof window ? window.location.href : void 0);
						"null" === e.origin || e.pathname.endsWith(".m3u8") || e.pathname.endsWith(".m3u") || bs.has(e.origin) || (qe._warn(`HTTP server (origin ${e.origin}) did not respond to a range request with 206 Partial Content, meaning the resource will now be streamed sequentially, with old data being evicted from the cache. Reads into evicted regions will throw. To enable efficient media file streaming across a network, please make sure your server supports range requests. Alternatively, set maxCacheSize to Infinity in the UrlSource options to keep the entire resource in memory.`), bs.add(e.origin));
					}
					this._abortControllers.delete(e), this._transitionToSequentialMode(i.body, r);
					return;
				}
				const a = i.body.getReader();
				for (;;) {
					if (e.currentPos >= e.targetPos || e.aborted) return r.abort(), void this._orchestrator.signalWorkerStoppedRunning(e);
					let i;
					try {
						i = await a.read();
					} catch (t) {
						if (r.signal.aborted) throw t;
						const e = this._getRetryDelay(1, t, this._url);
						if (null !== e) {
							qe._error("Error while reading response stream. Attempting to resume.", t), await Oe(1e3 * e);
							break;
						}
						throw t;
					}
					if (e.aborted) continue;
					const { done: s, value: n } = i;
					if (s) {
						if (e.currentPos >= e.targetPos) return void this._orchestrator.onWorkerFinished(e);
						if (e.strictTarget) break;
						this._orchestrator.onWorkerFinished(e);
						return;
					}
					this._dispatchRead(e.currentPos, e.currentPos + n.length), this._orchestrator.supplyWorkerData(e, n);
				}
			}
		}
		_transitionToSequentialMode(e, t) {
			this._sequentialAbortController = t;
			let r = e.getReader(), i = 0, a = 0;
			const s = new Ps(new ReadableStream({
				pull: async (e) => {
					for (;;) {
						let s;
						try {
							s = await r.read();
						} catch (t) {
							if (this._disposed) throw t;
							const e = this._getRetryDelay(1, t, this._url);
							if (null === e) throw t;
							qe._error("Error while reading response stream. Attempting to resume.", t), await Oe(1e3 * e), this._sequentialAbortController = new AbortController(), this._disposed && this._sequentialAbortController.abort();
							const s = await me(this._options.fetchFn ?? fetch, this._url, he(this._requestInit, {
								headers: { Range: `bytes=${i}-` },
								signal: this._sequentialAbortController.signal
							}), this._getRetryDelay, () => this._disposed);
							if (!s.ok) throw new Error(`Error fetching ${String(this._url)}: ${s.status} ${s.statusText}`);
							if (!s.body) throw new Error("Missing HTTP response body stream. The used fetch function must provide the response body as a ReadableStream.");
							r = s.body.getReader(), a = 206 === s.status ? 0 : i;
							continue;
						}
						if (s.done) return void e.close();
						let n = s.value;
						if (a > 0) {
							const e = Math.min(a, n.length);
							a -= e, n = n.subarray(e);
						}
						if (0 !== n.length) return i += n.length, void e.enqueue(n);
					}
				},
				cancel: () => r.cancel().catch(() => {})
			}), {
				maxCacheSize: this._orchestrator.options.maxCacheSize,
				handleUnhandledError: this._options.handleUnhandledError
			});
			s._endIndex = this._orchestrator.fileSize, s._cacheMissErrorMessage = "Attempted to read data from an already-evicted part of the cache. Because the HTTP server did not honor the range request, data can only be read sequentially, with old data being evicted from the cache. To fix this issue, either ensure your server responds to range requests with 206 Partial Content, or set maxCacheSize to Infinity in the UrlSource options. Note that the latter will store the entire file in the cache if needed, no matter how large.", s.on("read", ({ start: e, end: t }) => this._dispatchRead(e, t)), this._sequentialBacking = s;
			const n = /* @__PURE__ */ new Set();
			for (const o of this._orchestrator.workers) {
				for (const e of o.pendingSlices) n.add(e);
				o.aborted = !0, o.pendingSlices.length = 0;
			}
			for (const o of this._orchestrator.queuedReads) for (const e of o.pendingSlices) n.add(e);
			this._orchestrator.workers.length = 0, this._orchestrator.queuedReads.length = 0;
			for (const [, o] of this._abortControllers) o.abort();
			this._abortControllers.clear();
			for (const o of n) {
				const e = s._read(o.start, o.start + o.bytes.length);
				Pe(e) ? e.then((e) => {
					e ? (c(e.offset === o.start), o.resolve(e.bytes)) : o.resolve(null);
				}, (e) => o.reject(e)) : (c(null === e), o.resolve(null));
			}
		}
		_dispose() {
			this._orchestrator.dispose();
			for (const [, e] of this._abortControllers) e.abort();
			this._abortControllers.clear(), this._sequentialAbortController?.abort(), this._sequentialBacking && (this._sequentialBacking._disposed = !0, this._sequentialBacking._dispose());
		}
	};
	const vs = /^bytes=(\d+)-(\d*)$/, Ss = (e) => {
		const t = vs.exec(e.trim());
		if (!t) return null;
		const r = Number(t[1]), i = "" === t[2] ? null : Number(t[2]);
		return null !== i && i < r ? null : {
			offset: r,
			length: null !== i ? i - r + 1 : null
		};
	};
	var Ps = class extends ms {
		constructor(e, t = {}) {
			if (!(e instanceof ReadableStream)) throw new TypeError("stream must be a ReadableStream.");
			if (!t || "object" != typeof t) throw new TypeError("options must be an object.");
			if (void 0 !== t.handleUnhandledError && "function" != typeof t.handleUnhandledError) throw new TypeError("options.handleUnhandledError, when provided, must be a function.");
			if (void 0 !== t.maxCacheSize && (!Be(t.maxCacheSize) || t.maxCacheSize < 0)) throw new TypeError("options.maxCacheSize, when provided, must be a non-negative number.");
			super(), this._reader = null, this._cache = [], this._pendingSlices = [], this._currentIndex = 0, this._targetIndex = 0, this._maxRequestedIndex = 0, this._endIndex = null, this._pulling = !1, this._cacheMissErrorMessage = "Attempted to read data from an already-evicted part of the cache. With ReadableStreamSource, you must access the data more sequentially or increase the size of its cache.", this._stream = e, this._maxCacheSize = t.maxCacheSize ?? 33554432, this._handleUnhandledError = t.handleUnhandledError;
		}
		_getFileSize() {
			return this._endIndex;
		}
		_read(e, t) {
			if (null !== this._endIndex && t > this._endIndex) return null;
			this._maxRequestedIndex = Math.max(this._maxRequestedIndex, t);
			const r = K(this._cache, e, (e) => e.start), i = -1 !== r ? this._cache[r] : null;
			if (i && i.start <= e && t <= i.end) return {
				bytes: i.bytes,
				view: i.view,
				offset: i.start
			};
			let a = e;
			const s = new Uint8Array(t - e);
			if (-1 !== r) for (let l = r; l < this._cache.length; l++) {
				const r = this._cache[l];
				if (r.start >= t) break;
				const i = Math.max(e, r.start);
				i > a && this._throwDueToCacheMiss();
				const n = Math.min(t, r.end);
				i < n && (s.set(r.bytes.subarray(i - r.start, n - r.start), i - e), a = n);
			}
			if (a === t) return {
				bytes: s,
				view: E(s),
				offset: e
			};
			this._currentIndex > a && this._throwDueToCacheMiss();
			const { promise: n, resolve: o, reject: c } = Q();
			return this._pendingSlices.push({
				start: e,
				end: t,
				bytes: s,
				resolve: o,
				reject: c
			}), this._targetIndex = Math.max(this._targetIndex, t), this._pulling || (this._pulling = !0, this._pull().catch((e) => {
				if (this._pulling = !1, this._pendingSlices.length > 0) this._pendingSlices.forEach((t) => t.reject(e)), this._pendingSlices.length = 0;
				else {
					if (!this._handleUnhandledError) throw e;
					this._handleUnhandledError(e);
				}
			})), n;
		}
		_throwDueToCacheMiss() {
			throw new Error(this._cacheMissErrorMessage);
		}
		async _pull() {
			for (this._reader ??= this._stream.getReader(); this._currentIndex < this._targetIndex && !this._disposed;) {
				const { done: e, value: t } = await this._reader.read();
				if (e) {
					for (const e of this._pendingSlices) e.resolve(null);
					this._pendingSlices.length = 0, this._endIndex = this._currentIndex;
					break;
				}
				const r = this._currentIndex, i = this._currentIndex + t.byteLength;
				this._dispatchRead(r, i);
				for (let a = 0; a < this._pendingSlices.length; a++) {
					const e = this._pendingSlices[a], s = Math.max(r, e.start), n = Math.min(i, e.end);
					s < n && (e.bytes.set(t.subarray(s - r, n - r), s - e.start), n === e.end && (e.resolve({
						bytes: e.bytes,
						view: E(e.bytes),
						offset: e.start
					}), this._pendingSlices.splice(a, 1), a--));
				}
				for (this._cache.push({
					start: r,
					end: i,
					bytes: t,
					view: E(t),
					age: 0
				}); this._cache.length > 0;) {
					const e = this._cache[0];
					if (this._maxRequestedIndex - e.end <= this._maxCacheSize) break;
					this._cache.shift();
				}
				this._currentIndex += t.byteLength;
			}
			this._pulling = !1;
		}
		_dispose() {
			for (const e of this._pendingSlices) e.reject(new Lo());
			this._pendingSlices.length = 0, this._cache.length = 0, this._reader?.cancel().catch(() => {});
		}
	};
	const xs = {
		none: (e, t) => ({
			start: e,
			end: t
		}),
		fileSystem: (e, t) => {
			const r = 65536;
			return {
				start: e = Math.floor((e - r) / r) * r,
				end: t = Math.ceil((t + r) / r) * r
			};
		},
		network: (e, t, r) => {
			const i = 65536;
			e = Math.max(0, Math.floor((e - i) / i) * i);
			for (const a of r) {
				const r = 8388608, i = Math.max((a.startPos + a.targetPos) / 2, a.targetPos - r);
				if (Ce(e, t, i, a.targetPos)) {
					const e = a.targetPos - a.startPos, i = Math.ceil((e + 1) / r) * r, s = 2 ** Math.ceil(Math.log2(e + 1)), n = Math.min(s, i);
					t = Math.max(t, a.startPos + n);
				}
			}
			return {
				start: e,
				end: t = Math.max(t, e + 524288)
			};
		}
	};
	var Cs = class {
		constructor(e) {
			this.options = e, this.fileSize = null, this.nextAge = 0, this.workers = [], this.cache = [], this.currentCacheSize = 0, this.disposed = !1, this.queuedReads = [];
		}
		read(e, t, r, i) {
			c(!this.disposed);
			const a = this.options.prefetchProfile(e, t, this.workers), s = Math.max(a.start, r), n = Math.min(a.end, this.fileSize ?? Infinity, i);
			c(s <= e && t <= n);
			let o = null;
			const l = K(this.cache, e, (e) => e.start), d = -1 !== l ? this.cache[l] : null;
			d && d.start <= e && t <= d.end && (d.age = this.nextAge++, o = {
				bytes: d.bytes,
				view: d.view,
				offset: d.start
			});
			const u = K(this.cache, s, (e) => e.start), h = o ? null : new Uint8Array(t - e);
			let f = 0, m = s;
			const p = [];
			if (-1 !== u) {
				for (let r = u; r < this.cache.length; r++) {
					const i = this.cache[r];
					if (i.start >= n) break;
					if (i.end <= s) continue;
					const a = Math.max(s, i.start), o = Math.min(n, i.end);
					if (c(a <= o), m < a && p.push({
						start: m,
						end: a
					}), m = o, h) {
						const r = Math.max(e, i.start), a = Math.min(t, i.end);
						if (r < a) {
							const t = r - e;
							h.set(i.bytes.subarray(r - i.start, a - i.start), t), t === f && (f = a - e);
						}
					}
					i.age = this.nextAge++;
				}
				m < n && p.push({
					start: m,
					end: n
				});
			} else p.push({
				start: s,
				end: n
			});
			if (h && f >= h.length && (o = {
				bytes: h,
				view: E(h),
				offset: e
			}), 0 === p.length) return c(o), o;
			const { promise: g, resolve: k, reject: w } = Q(), y = [];
			for (const c of p) {
				const r = Math.max(e, c.start), i = Math.min(t, c.end);
				r === c.start && i === c.end ? y.push(c) : r < i && y.push({
					start: r,
					end: i
				});
			}
			const b = h && {
				start: e,
				bytes: h,
				holes: y,
				resolve: k,
				reject: w
			};
			e: for (const c of p) {
				for (const r of this.workers) if (this.checkHoleAgainstWorker(r, c, b ? [b] : [])) {
					this.checkQueuedReadsAgainstWorker(r);
					continue e;
				}
				const e = c.end < n || null !== this.fileSize, t = this.createWorker(c.start, c.end, e);
				if (t) b && (t.pendingSlices = [b]), this.runWorker(t);
				else {
					let t = K(this.queuedReads, c.start, (e) => e.hole.start), r = -1 !== t ? this.queuedReads[t] : null;
					for (r && c.start <= r.hole.end ? (r.hole.end = Math.max(r.hole.end, c.end), r.strictTarget &&= e, b && r.pendingSlices.push(b)) : (t++, r = {
						hole: {
							start: c.start,
							end: c.end
						},
						strictTarget: e,
						pendingSlices: b ? [b] : [],
						age: this.nextAge++
					}, this.queuedReads.splice(t, 0, r)); t + 1 < this.queuedReads.length;) {
						const e = this.queuedReads[t + 1];
						if (e.hole.start > r.hole.end) break;
						r.hole.end = Math.max(r.hole.end, e.hole.end), r.pendingSlices.push(...e.pendingSlices), r.strictTarget &&= e.strictTarget, r.age = Math.min(r.age, e.age), this.queuedReads.splice(t + 1, 1);
					}
				}
			}
			return o ? g.catch((e) => {
				if (!this.disposed) {
					if (!this.options.handleUnhandledError) throw e;
					this.options.handleUnhandledError(e);
				}
			}) : (c(h), o = g.then((t) => t && {
				bytes: t,
				view: E(t),
				offset: e
			})), o;
		}
		checkHoleAgainstWorker(e, t, r) {
			if (Ce(t.start - 2 ** 17, t.start, e.currentPos, e.targetPos)) {
				e.targetPos = Math.max(e.targetPos, t.end);
				for (let t = 0; t < r.length; t++) {
					const i = r[t];
					e.pendingSlices.includes(i) || e.pendingSlices.push(i);
				}
				return e.running || this.runWorker(e), !0;
			}
			return !1;
		}
		checkQueuedReadsAgainstWorker(e) {
			let t = !1;
			for (let r = 0; r < this.queuedReads.length; r++) {
				const i = this.queuedReads[r];
				if (this.checkHoleAgainstWorker(e, i.hole, i.pendingSlices)) this.queuedReads.splice(r, 1), r--, t = !0;
				else if (t) break;
			}
		}
		createWorker(e, t, r) {
			if (this.workers.length >= this.options.maxWorkerCount) {
				let e = null, t = null;
				for (let r = 0; r < this.workers.length; r++) {
					const i = this.workers[r];
					i.running || 0 !== i.pendingSlices.length || e && !(i.age < e.age) || (t = r, e = i);
				}
				if (!e) return null;
				c(null !== t), c(0 === e.pendingSlices.length), this.workers.splice(t, 1), this.options.onIdleWorkerRemoved?.(e);
			}
			const i = {
				startPos: e,
				currentPos: e,
				targetPos: t,
				strictTarget: r,
				running: !1,
				aborted: this.disposed,
				pendingSlices: [],
				age: this.nextAge++
			};
			return this.workers.push(i), i;
		}
		runWorker(e) {
			c(!e.running), c(e.currentPos < e.targetPos), e.running = !0, e.age = this.nextAge++, this.options.runWorker(e).catch((t) => {
				if (e.running = !1, e.pendingSlices.length > 0) e.pendingSlices.forEach((e) => e.reject(t)), e.pendingSlices.length = 0;
				else if (!e.aborted && !this.disposed) {
					if (!this.options.handleUnhandledError) throw t;
					this.options.handleUnhandledError(t);
				}
			}).finally(() => {
				if (!e.running && this.queuedReads.length > 0) {
					let e = 0;
					for (let i = 1; i < this.queuedReads.length; i++) this.queuedReads[i].age < this.queuedReads[e].age && (e = i);
					const t = this.queuedReads[e], r = this.createWorker(t.hole.start, t.hole.end, t.strictTarget);
					if (!r) return;
					this.queuedReads.splice(e, 1), r.pendingSlices = t.pendingSlices, this.runWorker(r);
				}
			});
		}
		supplyWorkerData(e, t) {
			c(!e.aborted);
			const r = e.currentPos, i = r + t.length;
			this.insertIntoCache({
				start: r,
				end: i,
				bytes: t,
				view: E(t),
				age: this.nextAge++
			}), e.currentPos += t.length, e.currentPos > e.targetPos && (e.targetPos = e.currentPos, this.checkQueuedReadsAgainstWorker(e));
			for (let a = 0; a < e.pendingSlices.length; a++) {
				const s = e.pendingSlices[a], n = Math.max(r, s.start), o = Math.min(i, s.start + s.bytes.length);
				n < o && s.bytes.set(t.subarray(n - r, o - r), n - s.start);
				for (let e = 0; e < s.holes.length; e++) {
					const t = s.holes[e];
					r <= t.start && i > t.start && (t.start = i), t.end <= t.start && (s.holes.splice(e, 1), e--);
				}
				0 === s.holes.length && (s.resolve(s.bytes), e.pendingSlices.splice(a, 1), a--);
			}
			for (let a = 0; a < this.workers.length; a++) {
				const t = this.workers[a];
				e === t || t.running || Ce(r, i, t.currentPos, t.targetPos) && (this.workers.splice(a, 1), this.options.onIdleWorkerRemoved?.(t), a--);
			}
		}
		supplyFileSize(e) {
			c(null === this.fileSize), this.fileSize = e;
			for (const t of this.workers) {
				t.targetPos = Math.min(t.targetPos, e), t.strictTarget = !0;
				for (let r = 0; r < t.pendingSlices.length; r++) {
					const i = t.pendingSlices[r];
					for (const a of i.holes) if (a.end > e) {
						i.resolve(null), t.pendingSlices.splice(r, 1), r--;
						break;
					}
				}
			}
			for (let t = 0; t < this.queuedReads.length; t++) {
				const r = this.queuedReads[t];
				if (r.hole.start >= e) {
					for (const e of r.pendingSlices) e.resolve(null);
					this.queuedReads.splice(t, 1), t--;
				} else if (r.hole.end > e) {
					r.hole.end = e, r.strictTarget = !0;
					for (let t = 0; t < r.pendingSlices.length; t++) {
						const i = r.pendingSlices[t];
						i.start >= e && (i.resolve(null), r.pendingSlices.splice(t, 1), t--);
					}
				}
			}
		}
		signalWorkerStoppedRunning(e) {
			e.running = !1, e.aborted || (e.pendingSlices.length = 0);
		}
		onWorkerFinished(e) {
			const t = this.workers.indexOf(e);
			c(-1 !== t), e.running = !1, this.workers.splice(t, 1), this.options.onIdleWorkerRemoved?.(e), null === this.fileSize && this.supplyFileSize(e.currentPos);
			for (const r of e.pendingSlices) r.resolve(null);
		}
		insertIntoCache(e) {
			if (0 === this.options.maxCacheSize) return;
			let t = K(this.cache, e.start, (e) => e.start) + 1;
			if (t > 0) {
				const r = this.cache[t - 1];
				if (r.end >= e.end) return;
				if (r.end > e.start) {
					const i = new Uint8Array(e.end - r.start);
					i.set(r.bytes, 0), i.set(e.bytes, e.start - r.start), this.currentCacheSize += e.end - r.end, r.bytes = i, r.view = E(i), r.end = e.end, t--, e = r;
				} else this.cache.splice(t, 0, e), this.currentCacheSize += e.bytes.length;
			} else this.cache.splice(t, 0, e), this.currentCacheSize += e.bytes.length;
			for (let r = t + 1; r < this.cache.length; r++) {
				const t = this.cache[r];
				if (e.end <= t.start) break;
				if (e.end >= t.end) {
					this.cache.splice(r, 1), this.currentCacheSize -= t.bytes.length, r--;
					continue;
				}
				const i = new Uint8Array(t.end - e.start);
				i.set(e.bytes, 0), i.set(t.bytes, t.start - e.start), this.currentCacheSize -= e.end - t.start, e.bytes = i, e.view = E(i), e.end = t.end, this.cache.splice(r, 1);
				break;
			}
			for (; this.currentCacheSize > this.options.maxCacheSize;) {
				let e = 0, t = this.cache[0];
				for (let r = 1; r < this.cache.length; r++) {
					const i = this.cache[r];
					i.age < t.age && (e = r, t = i);
				}
				if (this.currentCacheSize - t.bytes.length <= this.options.maxCacheSize) break;
				this.cache.splice(e, 1), this.currentCacheSize -= t.bytes.length;
			}
		}
		dispose() {
			for (const e of this.workers) {
				for (const t of e.pendingSlices) t.reject(new Lo());
				e.pendingSlices.length = 0, e.aborted = !0, e.running || this.options.onIdleWorkerRemoved?.(e);
			}
			for (const e of this.queuedReads) for (const t of e.pendingSlices) t.reject(new Lo());
			this.workers.length = 0, this.cache.length = 0, this.queuedReads.length = 0, this.disposed = !0;
		}
	}, Es = class extends ms {
		constructor(e, t, r) {
			if (super(), this._ref = null, e._disposed) throw new Error("Cannot create a slice of a disposed source.");
			this._baseSource = e, this._offset = t, this._length = r ?? null;
		}
		_getFileSize() {
			const e = this._baseSource._getFileSize();
			return void 0 === e ? null !== this._length ? this._length : void 0 : null === e ? null !== this._length ? this._length : null : re(e - this._offset, 0, this._length ?? Infinity);
		}
		_read(e, t, r, i) {
			if (null !== this._length && t > this._length) return null;
			const a = this._baseSource._read(this._offset + e, this._offset + t, this._offset + r, this._offset + i), s = (e) => e ? (e.offset -= this._offset, e) : null;
			return Pe(a) ? a.then(s) : s(a);
		}
		_dispose() {
			this._ref?.free();
		}
		ref() {
			return this._ref ??= this._baseSource.ref(), super.ref();
		}
	}, _s = function(e, t, r) {
		if (null != t) {
			if ("object" != typeof t && "function" != typeof t) throw new TypeError("Object expected.");
			var i, a;
			if (r) {
				if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
				i = t[Symbol.asyncDispose];
			}
			if (void 0 === i) {
				if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
				i = t[Symbol.dispose], r && (a = i);
			}
			if ("function" != typeof i) throw new TypeError("Object not disposable.");
			a && (i = function() {
				try {
					a.call(this);
				} catch (e) {
					return Promise.reject(e);
				}
			}), e.stack.push({
				value: t,
				dispose: i,
				async: r
			});
		} else r && e.stack.push({ async: !0 });
		return t;
	}, Is = function(e) {
		return function(t) {
			function r(r) {
				t.error = t.hasError ? new e(r, t.error, "An error was suppressed during disposal.") : r, t.hasError = !0;
			}
			var i, a = 0;
			return function e() {
				for (; i = t.stack.pop();) try {
					if (!i.async && 1 === a) return a = 0, t.stack.push(i), Promise.resolve().then(e);
					if (i.dispose) {
						var s = i.dispose.call(i.value);
						if (i.async) return a |= 2, Promise.resolve(s).then(e, function(t) {
							return r(t), e();
						});
					} else a |= 1;
				} catch (n) {
					r(n);
				}
				if (1 === a) return t.hasError ? Promise.reject(t.error) : Promise.resolve();
				if (t.hasError) throw t.error;
			}();
		};
	}("function" == typeof SuppressedError ? SuppressedError : function(e, t, r) {
		var i = new Error(r);
		return i.name = "SuppressedError", i.error = e, i.suppressed = t, i;
	});
	const Bs = /^0[xX][0-9a-fA-F]+$/, As = /^data:.*;base64,/i;
	var Rs = class extends cs {
		constructor(e, t, r, i) {
			super(e.input, t, r), this.segments = [], this.nextLines = null, this.currentUpdateSegmentsPromise = null, this.streamHasEnded = !1, this.lastSegmentUpdateTime = -Infinity, this.refreshInterval = 5, this.rootPath = t, this.demuxer = e, this.nextLines = i;
		}
		runUpdateSegments() {
			return this.currentUpdateSegmentsPromise ??= (async () => {
				try {
					const e = this.getRemainingWaitTimeMs();
					e > 0 && await Oe(e), this.lastSegmentUpdateTime = performance.now(), await this.updateSegments();
				} finally {
					this.currentUpdateSegmentsPromise = null;
				}
			})();
		}
		getRemainingWaitTimeMs() {
			const e = performance.now() - this.lastSegmentUpdateTime, t = Math.max(0, 1e3 * this.refreshInterval - e);
			return t <= 50 ? 0 : t;
		}
		async updateSegments() {
			let e = this.nextLines;
			if (this.nextLines = null, !e) {
				const t = {
					stack: [],
					error: void 0,
					hasError: !1
				};
				try {
					const r = _s(t, await this.demuxer.input._getSourceUncached({
						path: this.rootPath,
						isRoot: !1
					}), !1), i = await new Wo(r.source).requestEntireFile();
					c(i), e = oc(i, i.length, { ignore: is }), r.source instanceof gs && (this.rootPath = r.source.rootPath);
				} catch (b) {
					t.error = b, t.hasError = !0;
				} finally {
					Is(t);
				}
			}
			const t = !1 !== this.input._formatOptions.hls?.offsetTimestampsByDateTime, r = new os(this.rootPath, this.demuxer.hasMasterPlaylist ? this.demuxer.masterPlaylistVariables : null);
			let i = !1, a = 0, s = null, n = null, o = null, l = 0, d = null, u = null, h = null, f = null, m = null, p = null, g = !1, k = T(this.segments) ?? null;
			const w = (e) => {
				const t = e.indexOf("@"), r = Number(-1 === t ? e : e.slice(0, t));
				if (!Number.isInteger(r) || r < 0) throw new Error(`Invalid #EXT-X-BYTERANGE length '${e}'.`);
				let i = null;
				if (-1 !== t && (i = Number(e.slice(t + 1)), !Number.isInteger(i) || i < 0)) throw new Error(`Invalid #EXT-X-BYTERANGE offset '${e}'.`);
				return {
					length: r,
					offset: i
				};
			}, y = (e) => {
				l = e, k && (c(null !== k.sequenceNumber), k.sequenceNumber < e && (a = k.timestamp + k.duration, d = k.firstSegment, u = k.initSegment, m = k.lastProgramDateTimeSeconds, s = null !== k.unixEpochTimestamp ? k.unixEpochTimestamp + k.duration : null, k = null));
			};
			for (let c = 0; c < e.length; c++) {
				const b = e[c];
				if (i) {
					if (!b.startsWith("#")) {
						if (!k) {
							if (null === n) throw new Error("Invalid M3U8 file; a segment must be preceded by an #EXTINF tag.");
							let e = o;
							if (e && "AES-128" === e.method && !e.iv) {
								const t = new Uint8Array(16), r = E(t);
								r.setUint32(8, Math.floor(l / 2 ** 32)), r.setUint32(12, l), e = {
									...e,
									iv: t
								};
							}
							const t = {
								path: Ae(this.rootPath, r.substitute(b)),
								offset: f?.offset ?? 0,
								length: f?.length ?? null
							}, i = {
								timestamp: a,
								unixEpochTimestamp: s,
								firstSegment: d,
								sequenceNumber: l,
								location: t,
								duration: n,
								encryption: e,
								initSegment: u,
								lastProgramDateTimeSeconds: m
							};
							d ??= i, a += n, null !== s && (s += n), this.segments.push(i);
						}
						n = null, null === f ? h = null : f = null, y(l + 1);
					}
					if (b.startsWith("#EXTINF:")) {
						if (k) {
							g = !0;
							continue;
						}
						g || (null === m && l > 0 && null !== p && (a = l * p), g = !0);
						const e = b.slice(8), t = e.indexOf(","), r = -1 === t ? e : e.slice(0, t), i = Number(r);
						if (!Number.isFinite(i) || i < 0) throw new Error(`Invalid #EXTINF tag duration '${r}'.`);
						n = i;
					} else if (b.startsWith("#EXT-X-DEFINE:")) r.define(b.slice(14));
					else if (b.startsWith("#EXT-X-MAP:")) {
						const e = new as(b.slice(11), r), t = e.get("uri");
						if (!t) throw new Error("Invalid #EXT-X-MAP tag; missing URI attribute.");
						const i = e.get("byterange");
						let c = null;
						if (null !== i && (c = w(i)), c && null === c.offset) throw new Error("Invalid #EXT-X-MAP tag; BYTERANGE attribute must have a specified offset.");
						if (!k) {
							const e = {
								path: Ae(this.rootPath, t),
								offset: c?.offset ?? 0,
								length: c?.length ?? null
							};
							if ("AES-128" === o?.method && !o.iv) throw new Error("IV attribute must be set on #EXT-X-KEY tag preceding the #EXT-X-MAP tag.");
							u = {
								timestamp: a,
								unixEpochTimestamp: s,
								firstSegment: null,
								sequenceNumber: null,
								location: e,
								duration: 0,
								encryption: o,
								initSegment: null,
								lastProgramDateTimeSeconds: m
							};
						}
						n = null, null === f ? h = null : f = null;
					} else if (b.startsWith("#EXT-X-KEY:")) {
						const e = new as(b.slice(11), r), t = e.get("method");
						if ("NONE" === t) o = null;
						else if ("AES-128" === t) {
							const t = e.get("uri");
							if (!t) throw new Error("Invalid #EXT-X-KEY: AES-128 requires a URI attribute.");
							let r = null;
							const i = e.get("iv");
							if (i) {
								if (!Bs.test(i)) throw new Error(`Unsupported IV format '${i}'.`);
								let e = i.slice(2);
								e = e.padStart(32, "0"), e = e.slice(-32), r = new Uint8Array(16);
								for (let t = 0; t < 16; t++) {
									const i = 2 * t;
									r[t] = parseInt(e.slice(i, i + 2), 16);
								}
							}
							const a = e.get("keyformat") ?? "identity";
							if ("identity" !== a) throw new Error("For AES-128 encryption, only the 'identity' KEYFORMAT is currently supported. If you think other formats should be supported, please raise an issue.");
							o = {
								method: "AES-128",
								keyUri: Ae(this.rootPath, t),
								iv: r,
								keyFormat: a
							};
						} else {
							if ("SAMPLE-AES" !== t && "SAMPLE-AES-CTR" !== t) throw new Error(`Unsupported encryption method '${t}'. If you think this method should be supported, please raise an issue.`);
							{
								const r = e.get("uri");
								if (!r) throw new Error(`Invalid #EXT-X-KEY: ${t} requires a URI attribute.`);
								if ("identity" === (e.get("keyformat") ?? "identity")) throw new Error("For SAMPLE-AES and SAMPLE-AES-CTR encryption, the 'identity' KEYFORMAT is not supported. If you think this format should be supported, please raise an issue.");
								let i = null;
								if (As.test(r)) {
									const e = r.indexOf(","), t = _e(r.slice(e + 1));
									if (t.length >= 8 && 112 === t[4] && 115 === t[5] && 115 === t[6] && 104 === t[7]) {
										const e = E(t).getUint32(0);
										i = ei(t.subarray(8, Math.min(e, t.length)));
									}
								}
								o = {
									method: t,
									psshBox: i
								};
							}
						}
					} else if (b.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
						const e = b.slice(22), t = Number(e);
						if (!Number.isInteger(t) || t < 0) throw new Error(`Invalid EXT-X-MEDIA-SEQUENCE value '${e}'.`);
						y(t);
					} else if (b.startsWith("#EXT-X-BYTERANGE:")) {
						const e = w(b.slice(17));
						if (null === e.offset) {
							if (null === h) throw new Error("Invalid M3U8 file; #EXT-X-BYTERANGE without offset requires a previous byte range.");
							e.offset = h;
						}
						f = e, h = e.offset + e.length;
					} else if (b.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
						if (k) continue;
						const e = b.slice(25), r = Date.parse(e);
						if (!Number.isFinite(r)) continue;
						const i = r / 1e3;
						if (m === i) continue;
						if (null === m && this.segments.length > 0) {
							const e = T(this.segments), r = i - (e.timestamp + e.duration);
							for (const i of this.segments) i.unixEpochTimestamp = i.timestamp + r, t && (i.timestamp = i.unixEpochTimestamp);
						}
						m = i, s = i, t && (a = i);
					} else if ("#EXT-X-DISCONTINUITY" === b) d = null;
					else if (b.startsWith("#EXT-X-TARGETDURATION:")) {
						const e = b.slice(22), t = Number(e);
						if (!Number.isFinite(t) || t < 0) throw new Error(`Invalid EXT-X-TARGETDURATION value '${e}'.`);
						this.refreshInterval = t, p = t;
					} else {
						if ("#EXT-X-ENDLIST" === b) {
							this.streamHasEnded = !0;
							break;
						}
						b.startsWith("#EXT-X-PLAYLIST-TYPE:") && "vod" === b.slice(21).toLowerCase() && (this.streamHasEnded = !0);
					}
				} else {
					if ("#EXTM3U" !== b) throw new Error("Invalid M3U8 file; expected first line to be #EXTM3U.");
					i = !0;
				}
			}
			if (!i) throw new Error("Invalid M3U8 file; no #EXTM3U header.");
		}
		async getFirstSegment() {
			return 0 === this.segments.length && await this.runUpdateSegments(), this.segments[0] ?? null;
		}
		async getSegmentAt(e, t) {
			0 === this.segments.length && await this.runUpdateSegments();
			let r = !!t.skipLiveWait && this.getRemainingWaitTimeMs() > 0;
			for (;;) {
				const i = K(this.segments, e, (e) => e.timestamp);
				if (-1 === i) return null;
				if (i < this.segments.length - 1 || this.streamHasEnded || r) return this.segments[i];
				const a = this.segments[i];
				if (e < a.timestamp + a.duration) return a;
				await this.runUpdateSegments(), t.skipLiveWait && (r = !0);
			}
		}
		async getNextSegment(e, t) {
			const r = this.segments.indexOf(e);
			c(-1 !== r);
			const i = r + 1;
			let a = !!t.skipLiveWait && this.getRemainingWaitTimeMs() > 0;
			for (;;) {
				if (i < this.segments.length) return this.segments[i];
				if (this.streamHasEnded || a) return null;
				await this.runUpdateSegments(), t.skipLiveWait && (a = !0);
			}
		}
		async getPreviousSegment(e) {
			const t = this.segments.indexOf(e);
			return c(-1 !== t), this.segments[t - 1] ?? null;
		}
		getInputForSegment(e) {
			const t = e, r = this.inputCache.find((e) => e.segment === t);
			if (r) return r.age = this.nextInputCacheAge++, r.input;
			let i = null;
			(t.initSegment || t.firstSegment) && (i = this.getInputForSegment(t.initSegment ?? t.firstSegment));
			const a = {
				...this.input._formatOptions,
				isobmff: {
					...this.input._formatOptions.isobmff,
					resolveKeyId: this.input._formatOptions.isobmff?.resolveKeyId && ((e) => {
						if (!t.encryption || "SAMPLE-AES" !== t.encryption.method && "SAMPLE-AES-CTR" !== t.encryption.method || !t.encryption.psshBox) return this.input._formatOptions.isobmff.resolveKeyId(e);
						let r = e.psshBoxes;
						const { psshBox: i } = t.encryption;
						return null !== i.keyIds && !i.keyIds.includes(e.keyId) || r.some((e) => ti(e, i)) || (r = [...r, i]), this.input._formatOptions.isobmff.resolveKeyId({
							...e,
							psshBoxes: r
						});
					})
				}
			}, s = new No({
				source: new ws(t.location.path, async (e) => {
					c(e.isRoot);
					const r = {
						...e,
						isRoot: !1
					};
					let i;
					const a = t.location.offset > 0 || null !== t.location.length;
					if (t.encryption && "SAMPLE-AES" !== t.encryption.method && "SAMPLE-AES-CTR" !== t.encryption.method) if ("AES-128" === t.encryption.method) {
						const e = t.encryption;
						c(e.iv);
						let s = await this.input._getSourceCached(r);
						if (a) {
							const e = s.source.slice(t.location.offset, t.location.length ?? void 0).ref();
							s.free(), s = e;
						}
						i = new Ps(((e, t, r) => {
							let i = !1, a = 0;
							const s = new gi();
							return new ReadableStream({
								pull: async (n) => {
									i || (s.init(await t()), i = !0);
									let o = e.requestSliceRange(a, 0, 65552);
									if (Pe(o) && (o = await o), !o || 0 === o.length) throw new Error("Invalid ciphertext.");
									const c = o.length;
									if (c % 16 != 0) throw new Error("Invalid ciphertext.");
									const l = 65552 === c ? c - 16 : c, d = Ho(o, l), u = new Uint8Array(l);
									for (let e = 0; e < l; e += 16) s.in.set(d.subarray(e, e + 16)), s.decrypt(), u.set(s.out, e);
									if (l < c) n.enqueue(u), a += l;
									else {
										const e = u[l - 1];
										if (0 === e || e > 16) throw new Error("Invalid PKCS#7 padding. Incorrect key or corrupted data.");
										const t = u.subarray(0, l - e);
										n.enqueue(t), n.close(), r();
									}
								},
								cancel: () => {
									r();
								}
							});
						})(new Wo(s.source), async () => {
							const t = {
								stack: [],
								error: void 0,
								hasError: !1
							};
							try {
								const r = await new Wo(_s(t, await this.input._getSourceCached({
									path: e.keyUri,
									isRoot: !1
								}, 2), !1).source).requestSlice(0, 16);
								if (!r) throw new Error("Invalid AES-128 key; expected at least 16 bytes of data.");
								return {
									key: Ho(r, 16),
									iv: e.iv
								};
							} catch (r) {
								t.error = r, t.hasError = !0;
							} finally {
								Is(t);
							}
						}, () => {
							s.free();
						})).ref();
					} else c(!1);
					else if (i = await this.input._getSourceCached(r), a) {
						const e = i.source.slice(t.location.offset, t.location.length ?? void 0).ref();
						i.free(), i = e;
					}
					return i;
				}),
				formats: this.input._formats.filter((e) => !(e instanceof Zs)),
				initInput: i ?? void 0,
				formatOptions: a
			});
			if (s._onFormatDetermined = (e) => {
				if (("SAMPLE-AES" === t.encryption?.method || "SAMPLE-AES-CTR" === t.encryption?.method) && !e._isIsobmff) throw new Error("The SAMPLE-AES and SAMPLE-AES-CTR encryption methods are currently only supported for ISOBMFF files.");
			}, this.inputCache.push({
				segment: t,
				input: s,
				age: this.nextInputCacheAge++
			}), this.inputCache.length > 4) {
				const e = Fe(this.inputCache, (e) => e.age);
				c(-1 !== e), this.inputCache.splice(e, 1);
			}
			return s;
		}
		async getLiveRefreshInterval() {
			return 0 === this.getRemainingWaitTimeMs() && await this.runUpdateSegments(), this.streamHasEnded ? null : this.refreshInterval;
		}
	}, Fs = class extends Gr {
		constructor(e) {
			super(e), this.metadataPromise = null, this.trackBackings = null, this.internalTracks = null, this.segmentedInputs = [], this.hasMasterPlaylist = !0, this.masterPlaylistVariables = null;
		}
		readMetadata() {
			return this.metadataPromise ??= (async () => {
				c(this.input._rootSource instanceof gs);
				const e = await this.input._reader.requestEntireFile();
				c(e);
				const t = oc(e, e.length, { ignore: is }), { rootPath: r } = this.input._rootSource, i = new os(r, null), a = [], s = [];
				for (let c = 1; c < t.length; c++) {
					const e = t[c];
					if (e.startsWith("#EXT-X-DEFINE:")) i.define(e.slice(14));
					else if (e.startsWith("#EXT-X-STREAM-INF:")) {
						const s = c;
						let n = t[++c];
						if (void 0 === n) throw new Error("Incorrect M3U8 file; a line must follow the #EXT-X-STREAM-INF tag.");
						n = i.substitute(n);
						const o = Ae(r, n), l = new as(e.slice(18), i);
						if (null === l.getAsNumber("bandwidth")) throw new Error("Invalid M3U8 file; #EXT-X-STREAM-INF tag requires a BANDWIDTH attribute with a valid numerical value.");
						a.push({
							fullPath: o,
							attributes: l,
							lineNumber: s,
							hasOnlyKeyPackets: !1
						});
					} else if (e.startsWith("#EXT-X-I-FRAME-STREAM-INF:")) {
						const t = new as(e.slice(26), i), s = t.get("uri");
						if (null === s) throw new Error("Invalid M3U8 file; #EXT-X-I-FRAME-STREAM-INF tag requires a URI attribute.");
						if (null === t.getAsNumber("bandwidth")) throw new Error("Invalid M3U8 file; #EXT-X-I-FRAME-STREAM-INF tag requires a BANDWIDTH attribute with a valid numerical value.");
						const n = Ae(r, s);
						a.push({
							fullPath: n,
							attributes: t,
							lineNumber: c,
							hasOnlyKeyPackets: !0
						});
					} else if (e.startsWith("#EXT-X-MEDIA:")) {
						const t = new as(e.slice(13), i);
						if (null === t.get("type")) throw new Error("Invalid M3U8 file; #EXT-X-MEDIA tag requires a TYPE attribute.");
						if (null === t.get("group-id")) throw new Error("Invalid M3U8 file; #EXT-X-MEDIA tag requires a GROUP-ID attribute.");
						let a = null;
						const n = t.get("uri");
						null !== n && (a = Ae(r, n)), s.push({
							fullPath: a,
							attributes: t,
							lineNumber: c
						});
					} else if ("#EXT-X-I-FRAMES-ONLY" === e);
					else if (e.startsWith("#EXTINF:")) {
						const e = new Rs(this, r, null, t);
						this.segmentedInputs = [e], this.hasMasterPlaylist = !1, this.trackBackings = await e.getTrackBackings();
						return;
					}
				}
				this.masterPlaylistVariables = i;
				const n = await Promise.all(a.map(async (e, t) => {
					const i = [], a = e.attributes.get("codecs");
					let n;
					if (a) n = a.split(",").map((e) => e.trim());
					else {
						const t = await this.getSegmentedInputForPath(e.fullPath).getTrackBackings(), r = await Promise.all(t.map(async (e) => ({
							track: e,
							codec: await e.getCodec()
						})));
						n = await Promise.all(r.filter((e) => null !== e.codec).map((e) => e.track.getDecoderConfig().then((e) => e.codec)));
					}
					const o = e.attributes.get("video"), l = e.attributes.get("audio"), d = n.some((e) => mr.includes(Mr(e))), u = n.some((e) => kr.includes(Mr(e)));
					if (null !== o && !d) {
						const e = s.find((e) => {
							const t = e.attributes.get("group-id"), r = e.attributes.get("type");
							return t === o && "video" === r.toLowerCase();
						});
						e: if (e) {
							const t = e.attributes.get("uri");
							if (null === t) break e;
							const i = Ae(r, t), a = (await this.getSegmentedInputForPath(i).getTrackBackings()).find((e) => "video" === e.getType());
							if (!a || null === await a.getCodec()) break e;
							const s = await a.getDecoderConfig().then((e) => e?.codec ?? null);
							c(null !== s), n.push(s);
						}
					}
					if (null !== l && !u) {
						const e = s.find((e) => {
							const t = e.attributes.get("group-id"), r = e.attributes.get("type");
							return t === l && "audio" === r.toLowerCase();
						});
						e: if (e) {
							const t = e.attributes.get("uri");
							if (null === t) break e;
							const i = Ae(r, t), a = (await this.getSegmentedInputForPath(i).getTrackBackings()).find((e) => "audio" === e.getType());
							if (!a || null === await a.getCodec()) break e;
							const s = await a.getDecoderConfig().then((e) => e?.codec ?? null);
							c(null !== s), n.push(s);
						}
					}
					n = [...new Set(n)];
					let h = null, f = null;
					const m = e.attributes.getAsNumber("bandwidth");
					c(null !== m);
					const p = e.attributes.getAsNumber("average-bandwidth"), g = e.attributes.get("name");
					for (const r of n) {
						const a = Mr(r);
						if (null !== a) {
							if (mr.includes(a)) {
								if (null !== h) throw new Error("Unsupported M3U8 file; multiple video codecs found in the CODECS attribute of a variant stream.");
								h = r;
								const a = e.attributes.get("video");
								if (null === a) {
									const r = e.attributes.get("resolution");
									let a = null, s = null;
									if (r) {
										const e = r.match(/^(\d+)x(\d+)$/);
										e && (a = Number(e[1]), s = Number(e[2]));
									}
									i.push({
										id: -1,
										demuxer: this,
										backingTrack: null,
										default: !0,
										autoselect: !0,
										languageCode: "und",
										lineNumber: e.lineNumber,
										fullPath: e.fullPath,
										fullCodecString: h,
										pairingMask: 1n << BigInt(t),
										peakBitrate: m,
										averageBitrate: p,
										name: g,
										hasOnlyKeyPackets: e.hasOnlyKeyPackets,
										info: {
											type: "video",
											width: a,
											height: s
										}
									});
								} else for (const r of s) {
									const s = r.attributes.get("group-id"), n = r.attributes.get("type");
									if (s !== a || "video" !== n.toLowerCase()) continue;
									const o = r.attributes.get("resolution") ?? e.attributes.get("resolution");
									let c = null, l = null;
									if (o) {
										const e = o.match(/^(\d+)x(\d+)$/);
										e && (c = Number(e[1]), l = Number(e[2]));
									}
									i.push({
										id: -1,
										demuxer: this,
										backingTrack: null,
										default: zs(r.attributes),
										autoselect: zs(r.attributes) || Ns(r.attributes),
										languageCode: Us(r.attributes.get("language")),
										lineNumber: r.lineNumber,
										fullPath: r.fullPath ?? e.fullPath,
										fullCodecString: h,
										pairingMask: 1n << BigInt(t),
										peakBitrate: null === r.fullPath ? m : null,
										averageBitrate: null === r.fullPath ? p : null,
										name: r.attributes.get("name"),
										hasOnlyKeyPackets: e.hasOnlyKeyPackets,
										info: {
											type: "video",
											width: c,
											height: l
										}
									});
								}
							} else if (kr.includes(a)) {
								if (null !== f) throw new Error("Unsupported M3U8 file; multiple audio codecs found in the CODECS attribute of a variant stream.");
								f = r;
								const a = e.attributes.get("audio");
								if (null === a) {
									const r = e.attributes.get("channels"), a = null !== r ? Number(r.split("/")[0]) : null;
									i.push({
										id: -1,
										demuxer: this,
										backingTrack: null,
										default: !0,
										autoselect: !0,
										languageCode: "und",
										lineNumber: e.lineNumber,
										fullPath: e.fullPath,
										fullCodecString: f,
										pairingMask: 1n << BigInt(t),
										peakBitrate: m,
										averageBitrate: p,
										name: g,
										hasOnlyKeyPackets: e.hasOnlyKeyPackets,
										info: {
											type: "audio",
											numberOfChannels: null !== a && Number.isInteger(a) && a > 0 ? a : null
										}
									});
								} else for (const r of s) {
									const s = r.attributes.get("group-id"), n = r.attributes.get("type");
									if (s !== a || "audio" !== n.toLowerCase()) continue;
									const o = r.attributes.get("channels") ?? e.attributes.get("channels"), c = null !== o ? Number(o.split("/")[0]) : null;
									i.push({
										id: -1,
										demuxer: this,
										backingTrack: null,
										default: zs(r.attributes),
										autoselect: zs(r.attributes) || Ns(r.attributes),
										languageCode: Us(r.attributes.get("language")),
										lineNumber: r.lineNumber,
										fullPath: r.fullPath ?? e.fullPath,
										fullCodecString: f,
										pairingMask: 1n << BigInt(t),
										peakBitrate: null === r.fullPath ? m : null,
										averageBitrate: null === r.fullPath ? p : null,
										name: r.attributes.get("name"),
										hasOnlyKeyPackets: e.hasOnlyKeyPackets,
										info: {
											type: "audio",
											numberOfChannels: null !== c && Number.isInteger(c) && c > 0 ? c : null
										}
									});
								}
							}
						}
					}
					return i;
				})), o = [], l = (e) => {
					const t = o.find((t) => t.fullPath === e.fullPath && t.info.type === e.info.type);
					t ? (t.pairingMask |= e.pairingMask, t.default ||= e.default, t.autoselect ||= e.autoselect, t.lineNumber = Math.min(t.lineNumber, e.lineNumber), null !== e.peakBitrate && (t.peakBitrate = Math.max(t.peakBitrate ?? -Infinity, e.peakBitrate)), null !== e.averageBitrate && (t.averageBitrate = Math.max(t.averageBitrate ?? -Infinity, e.averageBitrate)), "und" === t.languageCode && (t.languageCode = e.languageCode)) : (e.id = o.length + 1, o.push(e));
				};
				for (const c of n) for (const e of c) l(e);
				o.sort((e, t) => e.lineNumber - t.lineNumber), this.trackBackings = [];
				for (const c of o) "video" === c.info.type ? this.trackBackings.push(new Ds(c)) : this.trackBackings.push(new Os(c));
				this.internalTracks = o;
			})();
		}
		async getTrackBackings() {
			return await this.readMetadata(), c(this.trackBackings), this.trackBackings;
		}
		getSegmentedInputForPath(e) {
			let t = this.segmentedInputs.find((t) => t.path === e);
			if (t) return t;
			let r = null;
			return this.internalTracks && (r = this.internalTracks.filter((t) => t.fullPath === e).map((e) => ({
				id: e.id,
				type: e.info.type
			}))), t = new Rs(this, e, r, null), this.segmentedInputs.push(t), t;
		}
		async getMetadataTags() {
			return {};
		}
		async getMimeType() {
			return rs;
		}
		dispose() {
			if (this.segmentedInputs) {
				for (const e of this.segmentedInputs) e.dispose();
				this.segmentedInputs.length = 0;
			}
		}
	}, Ms = class {
		constructor(e) {
			this.internalTrack = e, this.hydrationPromise = null;
		}
		hydrate() {
			return this.hydrationPromise ??= (async () => {
				const e = this.internalTrack.demuxer.getSegmentedInputForPath(this.internalTrack.fullPath);
				let t = null;
				const r = (await e.getTrackBackings()).filter((e) => e.getType() === this.getType());
				if (1 === r.length) t = r[0];
				else if (this instanceof Ds) {
					for (const i of r) if (await i.getCodec() === this.getCodec()) {
						t = i;
						break;
					}
				} else {
					c(this instanceof Os);
					for (const e of r) if (await e.getCodec() === this.getCodec()) {
						t = e;
						break;
					}
				}
				if (!t) throw new Error("Could not find matching track in underlying media data.");
				this.internalTrack.backingTrack = t;
			})();
		}
		delegate(e) {
			return this.internalTrack.backingTrack ? e() : this.hydrate().then(e);
		}
		getCodec() {
			throw new Error("Not implemented on base class.");
		}
		getDisposition() {
			return {
				...$e,
				default: this.internalTrack.autoselect,
				primary: this.internalTrack.default
			};
		}
		getId() {
			return this.internalTrack.id;
		}
		getPairingMask() {
			return this.internalTrack.pairingMask;
		}
		getInternalCodecId() {
			return null;
		}
		getLanguageCode() {
			return this.internalTrack.languageCode;
		}
		getName() {
			return this.internalTrack.name;
		}
		getNumber() {
			c(this.internalTrack.demuxer.internalTracks);
			const e = this.internalTrack.info.type;
			let t = 0;
			for (const r of this.internalTrack.demuxer.internalTracks) if (r.info.type === e && t++, r === this.internalTrack) break;
			return t;
		}
		getTimeResolution() {
			return this.delegate(() => this.internalTrack.backingTrack.getTimeResolution());
		}
		isRelativeToUnixEpoch() {
			return this.delegate(() => this.internalTrack.backingTrack.isRelativeToUnixEpoch());
		}
		getUnixTimeForTimestamp(e) {
			return this.delegate(() => this.internalTrack.backingTrack.getUnixTimeForTimestamp(e));
		}
		getBitrate() {
			return this.internalTrack.peakBitrate;
		}
		getAverageBitrate() {
			return this.internalTrack.averageBitrate;
		}
		async getDurationFromMetadata(e) {
			return await this.hydrate(), this.internalTrack.backingTrack.getDurationFromMetadata(e);
		}
		async getLiveRefreshInterval() {
			return await this.hydrate(), this.internalTrack.backingTrack.getLiveRefreshInterval();
		}
		getHasOnlyKeyPackets() {
			return this.internalTrack.hasOnlyKeyPackets || null;
		}
		async getFirstPacket(e) {
			return await this.hydrate(), this.internalTrack.backingTrack.getFirstPacket(e);
		}
		async getPacket(e, t) {
			return await this.hydrate(), this.internalTrack.backingTrack.getPacket(e, t);
		}
		async getKeyPacket(e, t) {
			return await this.hydrate(), this.internalTrack.backingTrack.getKeyPacket(e, t);
		}
		async getNextPacket(e, t) {
			return await this.hydrate(), this.internalTrack.backingTrack.getNextPacket(e, t);
		}
		async getNextKeyPacket(e, t) {
			return await this.hydrate(), this.internalTrack.backingTrack.getNextKeyPacket(e, t);
		}
	}, Ds = class extends Ms {
		constructor(e) {
			super(e);
		}
		get backingVideoTrack() {
			return this.internalTrack.backingTrack;
		}
		getType() {
			return "video";
		}
		getCodec() {
			return Mr(this.internalTrack.fullCodecString);
		}
		getCodedWidth() {
			return this.delegate(() => this.backingVideoTrack.getCodedWidth());
		}
		getCodedHeight() {
			return this.delegate(() => this.backingVideoTrack.getCodedHeight());
		}
		getSquarePixelWidth() {
			return this.delegate(() => this.backingVideoTrack.getSquarePixelWidth());
		}
		getSquarePixelHeight() {
			return this.delegate(() => this.backingVideoTrack.getSquarePixelHeight());
		}
		getMetadataDisplayWidth() {
			return this.backingVideoTrack ? null : this.internalTrack.info.width;
		}
		getMetadataDisplayHeight() {
			return this.backingVideoTrack ? null : this.internalTrack.info.height;
		}
		getTransformationMatrix() {
			return this.delegate(() => this.backingVideoTrack.getTransformationMatrix());
		}
		async getColorSpace() {
			return await this.hydrate(), this.backingVideoTrack.getColorSpace();
		}
		async canBeTransparent() {
			return await this.hydrate(), this.backingVideoTrack.canBeTransparent();
		}
		getMetadataCodecParameterString() {
			return this.backingVideoTrack ? null : this.internalTrack.fullCodecString;
		}
		async getDecoderConfig() {
			return await this.hydrate(), this.backingVideoTrack.getDecoderConfig();
		}
	}, Os = class extends Ms {
		constructor(e) {
			super(e);
		}
		get backingAudioTrack() {
			return this.internalTrack.backingTrack;
		}
		getType() {
			return "audio";
		}
		getCodec() {
			return Mr(this.internalTrack.fullCodecString);
		}
		getNumberOfChannels() {
			return null !== this.internalTrack.info.numberOfChannels ? this.internalTrack.info.numberOfChannels : this.delegate(() => this.backingAudioTrack.getNumberOfChannels());
		}
		getSampleRate() {
			return this.delegate(() => this.backingAudioTrack.getSampleRate());
		}
		getMetadataCodecParameterString() {
			return this.backingAudioTrack ? null : this.internalTrack.fullCodecString;
		}
		async getDecoderConfig() {
			return await this.hydrate(), this.backingAudioTrack.getDecoderConfig();
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/ const zs = (e) => {
		const t = e.get("default");
		if (null === t) return !1;
		const r = t.toUpperCase();
		if ("YES" === r) return !0;
		if ("NO" === r) return !1;
		throw new Error(`Invalid M3U8 file; #EXT-X-MEDIA DEFAULT attribute must be YES or NO, got "${t}".`);
	}, Ns = (e) => {
		const t = e.get("autoselect");
		if (null === t) return !1;
		const r = t.toUpperCase();
		if ("YES" === r) return !0;
		if ("NO" === r) return !1;
		throw new Error(`Invalid M3U8 file; #EXT-X-MEDIA AUTOSELECT attribute must be YES or NO, got "${t}".`);
	}, Us = (e) => {
		if (null === e) return "und";
		return e.split("-")[0] || "und";
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var Ls = class {
		constructor() {
			this._isIsobmff = !1;
		}
	}, Ws = class extends Ls {
		constructor() {
			super(...arguments), this._isIsobmff = !0;
		}
		async _getMajorBrand(e) {
			let t = e._reader.requestSlice(0, 12);
			if (Pe(t) && (t = await t), !t) return null;
			t.skip(4);
			const r = nc(t, 4);
			return "ftyp" !== r && "styp" !== r ? null : nc(t, 4);
		}
		_createDemuxer(e) {
			return new ki(e);
		}
	}, qs = class extends Ws {
		async _canReadInput(e) {
			const t = await this._getMajorBrand(e);
			if (null !== t) return "qt  " !== t;
			let r = 0;
			for (let i = 0; i < 10; i++) {
				let t = e._reader.requestSlice(r, 8);
				if (Pe(t) && (t = await t), !t) return !1;
				let i = Yo(t), a = 8;
				if (1 === i) {
					let t = e._reader.requestSlice(r + 8, 8);
					if (Pe(t) && (t = await t), !t) return !1;
					i = tc(t), a = 16;
				}
				if (i < a) return !1;
				const s = nc(t, 4);
				if ("moof" === s || "sidx" === s) return !0;
				if ("emsg" !== s && "prft" !== s && "free" !== s) return !1;
				r += i;
			}
			return !1;
		}
		get name() {
			return "MP4";
		}
		get mimeType() {
			return "video/mp4";
		}
	}, Vs = class extends Ws {
		async _canReadInput(e) {
			return "qt  " === await this._getMajorBrand(e);
		}
		get name() {
			return "QuickTime File Format";
		}
		get mimeType() {
			return "video/quicktime";
		}
	}, Hs = class extends Ls {
		async isSupportedEBMLOfDocType(e, t) {
			let r = e._reader.requestSlice(0, 16);
			if (Pe(r) && (r = await r), !r) return !1;
			const i = Ui(r);
			if (null === i) return !1;
			if (i < 1 || i > 8) return !1;
			if (Wi(r, i) !== Di.EBML) return !1;
			const a = Vi(r);
			if ("number" != typeof a) return !1;
			let s = e._reader.requestSlice(r.filePos, a);
			if (Pe(s) && (s = await s), !s) return !1;
			const n = r.filePos;
			for (; s.filePos <= n + a - 2;) {
				const e = Hi(s);
				if (!e) break;
				const { id: r, size: i } = e, a = s.filePos;
				if (void 0 === i) return !1;
				switch (r) {
					case Di.EBMLVersion:
					case Di.EBMLReadVersion:
						if (1 !== Wi(s, i)) return !1;
						break;
					case Di.DocType:
						if (ji(s, i) !== t) return !1;
						break;
					case Di.DocTypeVersion: if (Wi(s, i) > 4) return !1;
				}
				s.filePos = a + i;
			}
			return !0;
		}
		_canReadInput(e) {
			return this.isSupportedEBMLOfDocType(e, "matroska");
		}
		_createDemuxer(e) {
			return new ga(e);
		}
		get name() {
			return "Matroska";
		}
		get mimeType() {
			return "video/x-matroska";
		}
	}, js = class extends Hs {
		_canReadInput(e) {
			return this.isSupportedEBMLOfDocType(e, "webm");
		}
		get name() {
			return "WebM";
		}
		get mimeType() {
			return "video/webm";
		}
	}, $s = class extends Ls {
		async _canReadInput(e) {
			let t = 0;
			for (;;) {
				let r = e._reader.requestSlice(t, 10);
				if (Pe(r) && (r = await r), !r) break;
				const i = fc(r);
				if (!i) break;
				t = r.filePos + i.size;
			}
			const r = await ba(e._reader, t, t + 4096);
			if (!r) return !1;
			const i = r.header, a = jr(i.mpegVersionId, i.channel);
			let s = e._reader.requestSlice(r.startPos + a, 4);
			if (Pe(s) && (s = await s), !s) return !1;
			const n = Yo(s);
			if (1483304551 === n || 1231971951 === n) return !0;
			t = r.startPos + r.header.totalSize;
			const o = await ba(e._reader, t, t + 4);
			if (!o) return !1;
			const c = o.header;
			return i.channel === c.channel && i.sampleRate === c.sampleRate;
		}
		_createDemuxer(e) {
			return new Ta(e);
		}
		get name() {
			return "MP3";
		}
		get mimeType() {
			return "audio/mpeg";
		}
	}, Ks = class extends Ls {
		async _canReadInput(e) {
			let t = e._reader.requestSlice(0, 12);
			if (Pe(t) && (t = await t), !t) return !1;
			const r = nc(t, 4);
			return ("RIFF" === r || "RIFX" === r || "RF64" === r) && (t.skip(4), "WAVE" === nc(t, 4));
		}
		_createDemuxer(e) {
			return new Fa(e);
		}
		get name() {
			return "WAVE";
		}
		get mimeType() {
			return "audio/wav";
		}
	}, Xs = class extends Ls {
		async _canReadInput(e) {
			let t = e._reader.requestSlice(0, 4);
			return Pe(t) && (t = await t), !!t && "OggS" === nc(t, 4);
		}
		_createDemuxer(e) {
			return new _a(e);
		}
		get name() {
			return "Ogg";
		}
		get mimeType() {
			return "application/ogg";
		}
	}, Qs = class extends Ls {
		async _canReadInput(e) {
			let t = 0;
			for (;;) {
				let r = e._reader.requestSlice(t, 10);
				if (Pe(r) && (r = await r), !r) break;
				const i = fc(r);
				if (!i) break;
				t = r.filePos + i.size;
			}
			let r = e._reader.requestSlice(t, 4);
			return Pe(r) && (r = await r), !!r && "fLaC" === nc(r, 4);
		}
		get name() {
			return "FLAC";
		}
		get mimeType() {
			return "audio/flac";
		}
		_createDemuxer(e) {
			return new La(e);
		}
	}, Gs = class extends Ls {
		async _canReadInput(e) {
			let t = 0;
			for (;;) {
				let r = e._reader.requestSlice(t, 10);
				if (Pe(r) && (r = await r), !r) break;
				const i = fc(r);
				if (!i) break;
				t = r.filePos + i.size;
			}
			let r = e._reader.requestSliceRange(t, 7, 9);
			if (Pe(r) && (r = await r), !r) return !1;
			const i = Oa(r);
			if (!i) return !1;
			if (t += i.frameLength, r = e._reader.requestSliceRange(t, 7, 9), Pe(r) && (r = await r), !r) return !1;
			const a = Oa(r);
			return !!a && i.objectType === a.objectType && i.samplingFrequencyIndex === a.samplingFrequencyIndex && i.channelConfiguration === a.channelConfiguration;
		}
		_createDemuxer(e) {
			return new Na(e);
		}
		get name() {
			return "ADTS";
		}
		get mimeType() {
			return "audio/aac";
		}
	}, Ys = class extends Ls {
		async _canReadInput(e) {
			let t = e._reader.requestSlice(0, 205);
			if (Pe(t) && (t = await t), !t) return !1;
			const r = Ho(t, 205);
			return 71 === r[0] && 71 === r[188] || 71 === r[0] && 71 === r[204] || 71 === r[4] && 71 === r[196];
		}
		_createDemuxer(e) {
			return new Ka(e);
		}
		get name() {
			return "MPEG Transport Stream";
		}
		get mimeType() {
			return "video/MP2T";
		}
	}, Zs = class extends Ls {
		async _canReadInput(e) {
			let t = e._reader.requestSlice(0, 7);
			if (Pe(t) && (t = await t), !t) return !1;
			if ("#EXTM3U" !== nc(t, 7)) return !1;
			if (!(e._rootSource instanceof gs)) throw new TypeError("HLS inputs require `InputOptions.source` to be a PathedSource or a ref to one.");
			return e._rootSource._usedForHls = !0, !0;
		}
		_createDemuxer(e) {
			return new Fs(e);
		}
		get name() {
			return "HTTP Live Streaming (HLS)";
		}
		get mimeType() {
			return rs;
		}
	};
	const Js = new qs(), en = new Vs(), tn = new Hs(), rn = new js(), an = new $s(), sn = new Ks(), nn = new Xs(), on = new Gs(), cn = new Qs(), ln = new Ys(), dn = [
		new Zs(),
		Js,
		en,
		tn,
		rn,
		sn,
		nn,
		cn,
		an,
		on,
		ln
	];
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var un = function(e, t, r) {
		if (null != t) {
			if ("object" != typeof t && "function" != typeof t) throw new TypeError("Object expected.");
			var i, a;
			if (r) {
				if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
				i = t[Symbol.asyncDispose];
			}
			if (void 0 === i) {
				if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
				i = t[Symbol.dispose], r && (a = i);
			}
			if ("function" != typeof i) throw new TypeError("Object not disposable.");
			a && (i = function() {
				try {
					a.call(this);
				} catch (e) {
					return Promise.reject(e);
				}
			}), e.stack.push({
				value: t,
				dispose: i,
				async: r
			});
		} else r && e.stack.push({ async: !0 });
		return t;
	}, hn = function(e) {
		return function(t) {
			function r(r) {
				t.error = t.hasError ? new e(r, t.error, "An error was suppressed during disposal.") : r, t.hasError = !0;
			}
			var i, a = 0;
			return function e() {
				for (; i = t.stack.pop();) try {
					if (!i.async && 1 === a) return a = 0, t.stack.push(i), Promise.resolve().then(e);
					if (i.dispose) {
						var s = i.dispose.call(i.value);
						if (i.async) return a |= 2, Promise.resolve(s).then(e, function(t) {
							return r(t), e();
						});
					} else a |= 1;
				} catch (n) {
					r(n);
				}
				if (1 === a) return t.hasError ? Promise.reject(t.error) : Promise.resolve();
				if (t.hasError) throw t.error;
			}();
		};
	}("function" == typeof SuppressedError ? SuppressedError : function(e, t, r) {
		var i = new Error(r);
		return i.name = "SuppressedError", i.error = e, i.suppressed = t, i;
	});
	Ie();
	let fn = -Infinity, mn = -Infinity, pn = null;
	"undefined" != typeof FinalizationRegistry && (pn = new FinalizationRegistry((e) => {
		const t = performance.now();
		"video" === e.type ? (t - fn >= 1e3 && (qe._error("A VideoSample was garbage collected without first being closed. For proper resource management, make sure to call close() on all your VideoSamples as soon as you're done using them."), fn = t), "undefined" != typeof VideoFrame && e.data instanceof VideoFrame && e.data.close()) : (t - mn >= 1e3 && (qe._error("An AudioSample was garbage collected without first being closed. For proper resource management, make sure to call close() on all your AudioSamples as soon as you're done using them."), mn = t), "undefined" != typeof AudioData && e.data instanceof AudioData && e.data.close());
	}));
	var gn = class {
		constructor() {
			this._referenceCount = 0, this._lastAllocationBuffer = null;
		}
	};
	const kn = [
		"I420",
		"I420P10",
		"I420P12",
		"I420A",
		"I420AP10",
		"I420AP12",
		"I422",
		"I422P10",
		"I422P12",
		"I422A",
		"I422AP10",
		"I422AP12",
		"I444",
		"I444P10",
		"I444P12",
		"I444A",
		"I444AP10",
		"I444AP12",
		"NV12",
		"RGBA",
		"RGBX",
		"BGRA",
		"BGRX"
	], wn = new Set(kn);
	var yn = class e {
		get codedWidth() {
			return this.visibleRect.width;
		}
		get codedHeight() {
			return this.visibleRect.height;
		}
		get displayWidth() {
			return this.rotation % 180 == 0 ? this.squarePixelWidth : this.squarePixelHeight;
		}
		get displayHeight() {
			return this.rotation % 180 == 0 ? this.squarePixelHeight : this.squarePixelWidth;
		}
		get microsecondTimestamp() {
			return Math.trunc(ue * this.timestamp);
		}
		get microsecondDuration() {
			return Math.trunc(ue * this.duration);
		}
		get hasAlpha() {
			return this.format && this.format.includes("A");
		}
		constructor(t, r) {
			if (this._closed = !1, t instanceof ArrayBuffer || "undefined" != typeof SharedArrayBuffer && t instanceof SharedArrayBuffer || ArrayBuffer.isView(t)) {
				if (!r || "object" != typeof r) throw new TypeError("init must be an object.");
				if (void 0 === r.format || !wn.has(r.format)) throw new TypeError("init.format must be one of: " + kn.join(", "));
				if (!Number.isInteger(r.codedWidth) || r.codedWidth <= 0) throw new TypeError("init.codedWidth must be a positive integer.");
				if (!Number.isInteger(r.codedHeight) || r.codedHeight <= 0) throw new TypeError("init.codedHeight must be a positive integer.");
				if (void 0 !== r.rotation && ![
					0,
					90,
					180,
					270
				].includes(r.rotation)) throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
				if (void 0 !== r.flip && "boolean" != typeof r.flip) throw new TypeError("init.flip, when provided, must be a boolean.");
				if (!Number.isFinite(r.timestamp)) throw new TypeError("init.timestamp must be a number.");
				if (void 0 !== r.duration && (!Number.isFinite(r.duration) || r.duration < 0)) throw new TypeError("init.duration, when provided, must be a non-negative number.");
				if (void 0 !== r.layout) {
					if (!Array.isArray(r.layout)) throw new TypeError("init.layout, when provided, must be an array.");
					for (const e of r.layout) {
						if (!e || "object" != typeof e || Array.isArray(e)) throw new TypeError("Each entry in init.layout must be an object.");
						if (!Number.isInteger(e.offset) || e.offset < 0) throw new TypeError("plane.offset must be a non-negative integer.");
						if (!Number.isInteger(e.stride) || e.stride < 0) throw new TypeError("plane.stride must be a non-negative integer.");
					}
				}
				if (void 0 !== r.visibleRect && De(r.visibleRect, "init.visibleRect"), void 0 !== r.displayWidth && (!Number.isInteger(r.displayWidth) || r.displayWidth <= 0)) throw new TypeError("init.displayWidth, when provided, must be a positive integer.");
				if (void 0 !== r.displayHeight && (!Number.isInteger(r.displayHeight) || r.displayHeight <= 0)) throw new TypeError("init.displayHeight, when provided, must be a positive integer.");
				if (void 0 !== r.displayWidth != (void 0 !== r.displayHeight)) throw new TypeError("init.displayWidth and init.displayHeight must be either both provided or both omitted.");
				this.format = r.format, this.rotation = r.rotation ?? 0, this.flip = r.flip ?? !1, this.timestamp = r.timestamp, this.duration = r.duration ?? 0;
				const e = r.layout ?? In(r.format, r.codedWidth, r.codedHeight);
				let i = r.colorSpace ?? null;
				null === i && (i = "RGBA" === this.format || "RGBX" === this.format || "BGRA" === this.format || "BGRX" === this.format ? {
					primaries: "bt709",
					transfer: "iec61966-2-1",
					matrix: "rgb",
					fullRange: !0
				} : {
					primaries: "bt709",
					transfer: "bt709",
					matrix: "bt709",
					fullRange: !1
				}), this.visibleRect = {
					left: r.visibleRect?.left ?? 0,
					top: r.visibleRect?.top ?? 0,
					width: r.visibleRect?.width ?? r.codedWidth,
					height: r.visibleRect?.height ?? r.codedHeight
				}, void 0 !== r.displayWidth ? (this.squarePixelWidth = this.rotation % 180 == 0 ? r.displayWidth : r.displayHeight, this.squarePixelHeight = this.rotation % 180 == 0 ? r.displayHeight : r.displayWidth) : (this.squarePixelWidth = this.visibleRect.width, this.squarePixelHeight = this.visibleRect.height), this._data = r._doNotCopy ? C(t) : C(t).slice(), this._layout = e, this.colorSpace = new Pn(i);
			} else if ("undefined" != typeof VideoFrame && t instanceof VideoFrame) {
				if (void 0 !== r?.rotation && ![
					0,
					90,
					180,
					270
				].includes(r.rotation)) throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
				if (void 0 !== r?.flip && "boolean" != typeof r.flip) throw new TypeError("init.flip, when provided, must be a boolean.");
				if (void 0 !== r?.timestamp && !Number.isFinite(r?.timestamp)) throw new TypeError("init.timestamp, when provided, must be a number.");
				if (void 0 !== r?.duration && (!Number.isFinite(r.duration) || r.duration < 0)) throw new TypeError("init.duration, when provided, must be a non-negative number.");
				void 0 !== r?.visibleRect && De(r.visibleRect, "init.visibleRect"), this._data = t, this._layout = null, this.format = t.format, this.visibleRect = {
					left: t.visibleRect?.x ?? 0,
					top: t.visibleRect?.y ?? 0,
					width: t.visibleRect?.width ?? t.codedWidth,
					height: t.visibleRect?.height ?? t.codedHeight
				}, this.rotation = r?.rotation ?? 0, this.flip = r?.flip ?? !1, this.squarePixelWidth = t.displayWidth, this.squarePixelHeight = t.displayHeight, this.timestamp = r?.timestamp ?? t.timestamp / 1e6, this.duration = r?.duration ?? (t.duration ?? 0) / 1e6, this.colorSpace = new Pn(t.colorSpace);
			} else if ("undefined" != typeof HTMLImageElement && t instanceof HTMLImageElement || "undefined" != typeof SVGImageElement && t instanceof SVGImageElement || "undefined" != typeof ImageBitmap && t instanceof ImageBitmap || "undefined" != typeof HTMLVideoElement && t instanceof HTMLVideoElement || "undefined" != typeof HTMLCanvasElement && t instanceof HTMLCanvasElement || "undefined" != typeof OffscreenCanvas && t instanceof OffscreenCanvas) {
				if (!r || "object" != typeof r) throw new TypeError("init must be an object.");
				if (void 0 !== r.rotation && ![
					0,
					90,
					180,
					270
				].includes(r.rotation)) throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
				if (void 0 !== r.flip && "boolean" != typeof r.flip) throw new TypeError("init.flip, when provided, must be a boolean.");
				if (!Number.isFinite(r.timestamp)) throw new TypeError("init.timestamp must be a number.");
				if (void 0 !== r.duration && (!Number.isFinite(r.duration) || r.duration < 0)) throw new TypeError("init.duration, when provided, must be a non-negative number.");
				if (void 0 !== r.visibleRect && De(r.visibleRect, "init.visibleRect"), "undefined" != typeof VideoFrame) return new e(new VideoFrame(t, {
					timestamp: Math.trunc(r.timestamp * ue),
					duration: Math.trunc((r.duration ?? 0) * ue) || void 0,
					visibleRect: r.visibleRect && {
						x: r.visibleRect.left,
						y: r.visibleRect.top,
						width: r.visibleRect.width,
						height: r.visibleRect.height
					}
				}), r);
				let i = 0, a = 0;
				if ("naturalWidth" in t ? (i = t.naturalWidth, a = t.naturalHeight) : "videoWidth" in t ? (i = t.videoWidth, a = t.videoHeight) : "width" in t && (i = Number(t.width), a = Number(t.height)), !i || !a) throw new TypeError("Could not determine dimensions.");
				const s = r.visibleRect ?? {
					left: 0,
					top: 0,
					width: i,
					height: a
				}, n = new OffscreenCanvas(s.width, s.height), o = n.getContext("2d", {
					alpha: ye(),
					willReadFrequently: !0
				});
				if (!o) throw new Error("OffscreenCanvas must have support for the '2d' context in order to create a VideoSample from this data.");
				o.drawImage(t, -s.left, -s.top), this._data = n, this._layout = null, this.format = "RGBX", this.visibleRect = {
					left: 0,
					top: 0,
					width: s.width,
					height: s.height
				}, this.squarePixelWidth = s.width, this.squarePixelHeight = s.height, this.rotation = r.rotation ?? 0, this.flip = r.flip ?? !1, this.timestamp = r.timestamp, this.duration = r.duration ?? 0, this.colorSpace = new Pn({
					matrix: "rgb",
					primaries: "bt709",
					transfer: "iec61966-2-1",
					fullRange: !0
				});
			} else {
				if (!(t instanceof gn)) throw new TypeError("Invalid data type: Must be a BufferSource, CanvasImageSource, or VideoSampleResource.");
				if (!r || "object" != typeof r) throw new TypeError("init must be an object.");
				if (void 0 !== r.rotation && ![
					0,
					90,
					180,
					270
				].includes(r.rotation)) throw new TypeError("init.rotation, when provided, must be 0, 90, 180, or 270.");
				if (void 0 !== r.flip && "boolean" != typeof r.flip) throw new TypeError("init.flip, when provided, must be a boolean.");
				if (!Number.isFinite(r.timestamp)) throw new TypeError("init.timestamp must be a number.");
				if (void 0 !== r.duration && (!Number.isFinite(r.duration) || r.duration < 0)) throw new TypeError("init.duration, when provided, must be a non-negative number.");
				if (this._data = t, t._referenceCount++, this.format = t.getFormat(), null !== this.format && !kn.includes(this.format)) throw new TypeError("getFormat() must return a VideoSamplePixelFormat or null.");
				if (this.visibleRect = {
					left: 0,
					top: 0,
					width: t.getCodedWidth(),
					height: t.getCodedHeight()
				}, !Number.isInteger(this.visibleRect.width) || this.visibleRect.width <= 0) throw new TypeError("getCodedWidth() must return a positive integer.");
				if (!Number.isInteger(this.visibleRect.height) || this.visibleRect.height <= 0) throw new TypeError("getCodedHeight() must return a positive integer.");
				if (this.squarePixelWidth = t.getSquarePixelWidth(), !Number.isInteger(this.squarePixelWidth) || this.squarePixelWidth <= 0) throw new TypeError("getSquarePixelWidth() must return a positive integer.");
				if (this.squarePixelHeight = t.getSquarePixelHeight(), !Number.isInteger(this.squarePixelHeight) || this.squarePixelHeight <= 0) throw new TypeError("getSquarePixelHeight() must return a positive integer.");
				this.rotation = r.rotation ?? 0, this.flip = r.flip ?? !1, this.timestamp = r.timestamp, this.duration = r.duration ?? 0, this.colorSpace = t.getColorSpace();
			}
			this.encodeOptions = r?.encodeOptions ?? {}, this.pixelAspectRatio = Me({
				num: this.squarePixelWidth * this.codedHeight,
				den: this.squarePixelHeight * this.codedWidth
			}), pn?.register(this, {
				type: "video",
				data: this._data
			}, this);
		}
		clone() {
			if (this._closed) throw new Error("VideoSample is closed.");
			return c(null !== this._data), this._data instanceof gn ? new e(this._data, {
				timestamp: this.timestamp,
				duration: this.duration,
				rotation: this.rotation,
				flip: this.flip,
				encodeOptions: this.encodeOptions
			}) : xn(this._data) ? new e(this._data.clone(), {
				timestamp: this.timestamp,
				duration: this.duration,
				rotation: this.rotation,
				flip: this.flip,
				encodeOptions: this.encodeOptions
			}) : this._data instanceof Uint8Array ? (c(this._layout), new e(this._data, {
				format: this.format,
				layout: this._layout,
				codedWidth: this.codedWidth,
				codedHeight: this.codedHeight,
				timestamp: this.timestamp,
				duration: this.duration,
				colorSpace: this.colorSpace,
				rotation: this.rotation,
				flip: this.flip,
				visibleRect: this.visibleRect,
				displayWidth: this.displayWidth,
				displayHeight: this.displayHeight,
				encodeOptions: this.encodeOptions,
				_doNotCopy: !0
			})) : new e(this._data, {
				format: this.format,
				codedWidth: this.codedWidth,
				codedHeight: this.codedHeight,
				timestamp: this.timestamp,
				duration: this.duration,
				colorSpace: this.colorSpace,
				rotation: this.rotation,
				flip: this.flip,
				visibleRect: this.visibleRect,
				displayWidth: this.displayWidth,
				displayHeight: this.displayHeight,
				encodeOptions: this.encodeOptions
			});
		}
		close() {
			this._closed || (pn?.unregister(this), this._data instanceof gn ? (this._data._referenceCount--, 0 === this._data._referenceCount && this._data.close()) : xn(this._data) ? this._data.close() : this._data = null, this._closed = !0);
		}
		allocationSize(e = {}) {
			if (_n(e), this._closed) throw new Error("VideoSample is closed.");
			if (null == (e.format ?? this.format)) throw new Error("Cannot get allocation size when format is null.");
			return xn(this._data) ? this._data.allocationSize(e) : An(this, e).allocationSize;
		}
		async copyTo(t, r = {}) {
			if (!W(t)) throw new TypeError("destination must be an ArrayBuffer or an ArrayBuffer view.");
			if (_n(r), this._closed) throw new Error("VideoSample is closed.");
			if (null == (r.format ?? this.format)) throw new Error("Cannot copy video sample data when format is null.");
			if (c(null !== this._data), xn(this._data)) return this._data.copyTo(t, r);
			if (r.format && ![
				"RGBA",
				"RGBX",
				"BGRA",
				"BGRX"
			].includes(this.format) && [
				"RGBA",
				"RGBX",
				"BGRA",
				"BGRX"
			].includes(r.format)) {
				if (!(this._data instanceof gn)) {
					if ("undefined" == typeof VideoFrame) throw new Error("For this sample, converting from a non-RGB to an RGB format requires VideoFrame to be defined.");
					const e = this.toVideoFrame(), i = await e.copyTo(t, r);
					return e.close(), i;
				}
				{
					const i = {
						stack: [],
						error: void 0,
						hasError: !1
					};
					try {
						const a = un(i, await this._data.toRgbSample({
							timestamp: this.timestamp,
							duration: this.duration,
							rotation: this.rotation,
							flip: this.flip
						}, r.colorSpace ?? "srgb"), !1);
						if (!(a instanceof e)) throw new TypeError("toRgbSample() must return a VideoSample.");
						if (![
							"RGBA",
							"RGBX",
							"BGRA",
							"BGRX"
						].includes(a.format)) throw new Error(`Sample returned by toRgbSample was expected to have an RGB format, got '${a.format}' instead.`);
						return await a.copyTo(t, r);
					} catch (d) {
						i.error = d, i.hasError = !0;
					} finally {
						hn(i);
					}
				}
			}
			const i = An(this, r);
			c(this.format);
			const a = C(t);
			if (a.byteLength < i.allocationSize) throw new TypeError(`Destination buffer too small. Required: ${i.allocationSize}, Available: ${a.byteLength}`);
			const s = Bn(this.format);
			let n;
			if (this._data instanceof gn) {
				let e = this._data.getDataPlanes();
				if (Pe(e) && (e = await e), !Array.isArray(e) || e.some((e) => !(e.data instanceof Uint8Array) || !Number.isInteger(e.stride) || e.stride < 0)) throw new TypeError("getDataPlanes() must return an array of objects with a Uint8Array \"data\" property and a non-negative integer \"stride\" property.");
				n = e;
			} else if (this._data instanceof Uint8Array) c(this._layout), c(this._layout.length === s.length), n = this._layout.map((e, t) => {
				const r = Math.ceil(this.codedHeight / s[t].heightDivisor);
				return {
					data: this._data.subarray(e.offset, e.offset + e.stride * r),
					stride: e.stride
				};
			});
			else {
				const e = this._data.getContext("2d");
				c(e), n = [{
					data: C(e.getImageData(0, 0, this.codedWidth, this.codedHeight).data),
					stride: 4 * this.codedWidth
				}];
			}
			const o = [], l = s.length;
			for (let e = 0; e < l; e++) {
				const t = i.computedLayouts[e], r = n[e].stride, s = n[e].data;
				let c = t.sourceTop * r;
				c += t.sourceLeftBytes;
				let l = t.destinationOffset;
				const d = t.sourceWidthBytes, u = {
					offset: l,
					stride: t.destinationStride
				};
				for (let e = 0; e < t.sourceHeight; e++) {
					if (c + d > s.byteLength) throw new Error("Source buffer OOB read.");
					if (l + d > a.byteLength) throw new Error("Destination buffer OOB write.");
					const e = s.subarray(c, c + d);
					a.set(e, l), c += r, l += t.destinationStride;
				}
				o.push(u);
			}
			if (void 0 !== r.format) {
				const e = this.format.startsWith("RGB") !== r.format.startsWith("RGB"), t = this.format.includes("X") && r.format.includes("A");
				if (e || t) for (let r = 0; r < i.allocationSize; r += 4) {
					if (e) {
						const e = a[r];
						a[r] = a[r + 2], a[r + 2] = e;
					}
					t && (a[r + 3] = 255);
				}
			}
			return o;
		}
		toVideoFrame() {
			if (this._closed) throw new Error("VideoSample is closed.");
			if (c(null !== this._data), this._data instanceof gn) {
				if (null === this.format) throw new Error("Cannot convert a VideoSampleResource-backed VideoSample to VideoFrame if format is null.");
				const e = this._data.getDataPlanes();
				if (Pe(e)) throw new Error("Cannot convert a VideoSampleResource-backed VideoSample to VideoFrame if getDataPlanes() returns a promise.");
				const t = e.reduce((e, t) => e + t.data.byteLength, 0), r = new Uint8Array(t);
				let i = 0;
				const a = [];
				for (const s of e) r.set(s.data, i), a.push(i), i += s.data.byteLength;
				return new VideoFrame(r, {
					format: this.format,
					layout: e.map((e, t) => ({
						offset: a[t],
						stride: e.stride
					})),
					codedWidth: this.codedWidth,
					codedHeight: this.codedHeight,
					timestamp: this.microsecondTimestamp,
					duration: this.microsecondDuration,
					colorSpace: this.colorSpace,
					visibleRect: this.visibleRect,
					displayWidth: this.squarePixelWidth,
					displayHeight: this.squarePixelHeight
				});
			}
			return xn(this._data) ? new VideoFrame(this._data, {
				timestamp: this.microsecondTimestamp,
				duration: this.microsecondDuration || void 0
			}) : this._data instanceof Uint8Array ? (c(this._layout), new VideoFrame(this._data, {
				format: this.format,
				codedWidth: this.codedWidth,
				codedHeight: this.codedHeight,
				layout: this._layout,
				timestamp: this.microsecondTimestamp,
				duration: this.microsecondDuration || void 0,
				colorSpace: this.colorSpace,
				visibleRect: this.visibleRect,
				displayWidth: this.squarePixelWidth,
				displayHeight: this.squarePixelHeight
			})) : new VideoFrame(this._data, {
				timestamp: this.microsecondTimestamp,
				duration: this.microsecondDuration || void 0
			});
		}
		draw(e, t, r, i, a, s, n, o, c) {
			let l = 0, d = 0, u = this.displayWidth, h = this.displayHeight, f = 0, m = 0, p = this.displayWidth, g = this.displayHeight;
			if (void 0 !== s ? (l = t, d = r, u = i, h = a, f = s, m = n, void 0 !== o ? (p = o, g = c) : (p = u, g = h)) : (f = t, m = r, void 0 !== i && (p = i, g = a)), !("undefined" != typeof CanvasRenderingContext2D && e instanceof CanvasRenderingContext2D || "undefined" != typeof OffscreenCanvasRenderingContext2D && e instanceof OffscreenCanvasRenderingContext2D)) throw new TypeError("context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");
			if (!Number.isFinite(l)) throw new TypeError("sx must be a number.");
			if (!Number.isFinite(d)) throw new TypeError("sy must be a number.");
			if (!Number.isFinite(u) || u < 0) throw new TypeError("sWidth must be a non-negative number.");
			if (!Number.isFinite(h) || h < 0) throw new TypeError("sHeight must be a non-negative number.");
			if (!Number.isFinite(f)) throw new TypeError("dx must be a number.");
			if (!Number.isFinite(m)) throw new TypeError("dy must be a number.");
			if (!Number.isFinite(p) || p < 0) throw new TypeError("dWidth must be a non-negative number.");
			if (!Number.isFinite(g) || g < 0) throw new TypeError("dHeight must be a non-negative number.");
			if (this._closed) throw new Error("VideoSample is closed.");
			({sx: l, sy: d, sWidth: u, sHeight: h} = this._unmapSourceRegion(l, d, u, h, this.rotation, this.flip));
			const k = this.toCanvasImageSource();
			e.save();
			const w = f + p / 2, y = m + g / 2;
			e.translate(w, y), this.flip && e.scale(-1, 1), e.rotate(this.rotation * Math.PI / 180);
			const b = this.rotation % 180 == 0 ? 1 : p / g;
			e.scale(1 / b, b), e.drawImage(k, l, d, u, h, -p / 2, -g / 2, p, g), e.restore();
		}
		drawWithFit(e, t) {
			if (!("undefined" != typeof CanvasRenderingContext2D && e instanceof CanvasRenderingContext2D || "undefined" != typeof OffscreenCanvasRenderingContext2D && e instanceof OffscreenCanvasRenderingContext2D)) throw new TypeError("context must be a CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D.");
			if (!t || "object" != typeof t) throw new TypeError("options must be an object.");
			if (![
				"fill",
				"contain",
				"cover"
			].includes(t.fit)) throw new TypeError("options.fit must be 'fill', 'contain', or 'cover'.");
			if (void 0 !== t.rotation && ![
				0,
				90,
				180,
				270
			].includes(t.rotation)) throw new TypeError("options.rotation, when provided, must be 0, 90, 180, or 270.");
			if (void 0 !== t.flip && "boolean" != typeof t.flip) throw new TypeError("options.flip, when provided, must be a boolean.");
			void 0 !== t.crop && En(t.crop, "options.");
			const r = e.canvas.width, i = e.canvas.height, a = t.rotation ?? this.rotation, s = t.flip ?? this.flip, [n, o] = a % 180 == 0 ? [this.squarePixelWidth, this.squarePixelHeight] : [this.squarePixelHeight, this.squarePixelWidth];
			let c, l, d, u, h = t.crop;
			h && (h = Cn(h, n, o));
			const { sx: f, sy: m, sWidth: p, sHeight: g } = this._unmapSourceRegion(t.crop?.left ?? 0, t.crop?.top ?? 0, t.crop?.width ?? n, t.crop?.height ?? o, a, s);
			if ("fill" === t.fit) c = 0, l = 0, d = r, u = i;
			else {
				const [e, a] = t.crop ? [t.crop.width, t.crop.height] : [n, o], s = "contain" === t.fit ? Math.min(r / e, i / a) : Math.max(r / e, i / a);
				d = e * s, u = a * s, c = (r - d) / 2, l = (i - u) / 2;
			}
			e.save();
			const k = a % 180 == 0 ? 1 : d / u;
			e.translate(r / 2, i / 2), s && e.scale(-1, 1), e.rotate(a * Math.PI / 180), e.scale(1 / k, k), e.translate(-r / 2, -i / 2), e.drawImage(this.toCanvasImageSource(), f, m, p, g, c, l, d, u), e.restore();
		}
		_unmapSourceRegion(e, t, r, i, a, s) {
			return s && (e = (a % 180 == 0 ? this.squarePixelWidth : this.squarePixelHeight) - e - r), 90 === a ? [e, t, r, i] = [
				t,
				this.squarePixelHeight - e - r,
				i,
				r
			] : 180 === a ? [e, t] = [this.squarePixelWidth - e - r, this.squarePixelHeight - t - i] : 270 === a && ([e, t, r, i] = [
				this.squarePixelWidth - t - i,
				e,
				i,
				r
			]), {
				sx: e,
				sy: t,
				sWidth: r,
				sHeight: i
			};
		}
		_drawWithFitAndMipmapping(e, t, r) {
			const i = e.width, a = e.height, [s, n] = r.rotation % 180 == 0 ? [this.squarePixelWidth, this.squarePixelHeight] : [this.squarePixelHeight, this.squarePixelWidth], o = r.crop ? r.crop.width : s, c = r.crop ? r.crop.height : n;
			let l = 0;
			2 * i < o && 2 * a < c && (l = Math.floor(Math.log2(Math.min(o / i, c / a))));
			const d = i * 2 ** l, u = a * 2 ** l, { canvas: h, context: f, isNew: m } = l > 0 ? Sn(d, u) : {
				canvas: e,
				context: t,
				isNew: r.targetIsFresh
			};
			f.imageSmoothingQuality = "high", r.fillBlack ? (f.fillStyle = "black", f.fillRect(0, 0, d, u)) : m || f.clearRect(0, 0, d, u), this.drawWithFit(f, {
				fit: r.fit,
				rotation: r.rotation,
				flip: r.flip,
				crop: r.crop
			}), f.globalCompositeOperation = "copy";
			for (let p = l; p > 1; p--) {
				const e = i * 2 ** p, t = a * 2 ** p;
				f.drawImage(h, 0, 0, e, t, 0, 0, e / 2, t / 2);
			}
			f.globalCompositeOperation = "source-over", l > 0 && (t.imageSmoothingQuality = "high", t.globalCompositeOperation = "copy", t.drawImage(h, 0, 0, 2 * i, 2 * a, 0, 0, i, a), t.globalCompositeOperation = "source-over");
		}
		toCanvasImageSource() {
			if (this._closed) throw new Error("VideoSample is closed.");
			if (c(null !== this._data), this._data instanceof gn || this._data instanceof Uint8Array) {
				const e = this.toVideoFrame();
				return queueMicrotask(() => e.close()), e;
			}
			return this._data;
		}
		async transform(t) {
			if (!t || "object" != typeof t) throw new TypeError("options must be an object.");
			if (void 0 !== t.width && (!Number.isInteger(t.width) || t.width <= 0)) throw new TypeError("options.width, when provided, must be a positive integer.");
			if (void 0 !== t.height && (!Number.isInteger(t.height) || t.height <= 0)) throw new TypeError("options.height, when provided, must be a positive integer.");
			if (void 0 !== t.roundDimensionsTo && (!Number.isInteger(t.roundDimensionsTo) || t.roundDimensionsTo <= 0)) throw new TypeError("options.roundDimensionsTo, when provided, must be a positive integer.");
			if (void 0 !== t.fit && ![
				"fill",
				"contain",
				"cover"
			].includes(t.fit)) throw new TypeError("options.fit, when provided, must be one of \"fill\", \"contain\", or \"cover\".");
			if (void 0 !== t.width && void 0 !== t.height && void 0 === t.fit) throw new TypeError("When both options.width and options.height are provided, options.fit must also be provided.");
			if (void 0 !== t.rotate && ![
				0,
				90,
				180,
				270
			].includes(t.rotate)) throw new TypeError("options.rotate, when provided, must be 0, 90, 180 or 270.");
			if (void 0 !== t.flip && "boolean" != typeof t.flip) throw new TypeError("options.flip, when provided, must be a boolean.");
			if (void 0 !== t.crop && En(t.crop, "options."), void 0 !== t.alpha && !["keep", "discard"].includes(t.alpha)) throw new TypeError("options.alpha, when provided, must be 'keep' or 'discard'.");
			const { rotation: r, flip: i } = b(this.rotation, this.flip, t.rotate ?? 0, t.flip ?? !1), [a, s] = r % 180 == 0 ? [this.squarePixelWidth, this.squarePixelHeight] : [this.squarePixelHeight, this.squarePixelWidth];
			let n = t.crop;
			n && (n = Cn(n, a, s));
			const o = n ? n.width : a, c = n ? n.height : s, l = o / c;
			let d, u;
			void 0 !== t.width && void 0 === t.height ? (d = t.width, u = d / l) : void 0 === t.width && void 0 !== t.height ? (u = t.height, d = u * l) : void 0 !== t.width && void 0 !== t.height ? (d = t.width, u = t.height) : (d = o, u = c), d = ae(d, t.roundDimensionsTo ?? 1), u = ae(u, t.roundDimensionsTo ?? 1);
			const h = {
				width: d,
				height: u,
				fit: t.fit ?? "fill",
				rotation: r,
				flip: i,
				crop: n ?? {
					left: 0,
					top: 0,
					width: a,
					height: s
				},
				alpha: t.alpha ?? "keep"
			};
			for (const e of bn) {
				let t = e(this, h);
				if (Pe(t) && (t = await t), null !== t) return t;
			}
			const { canvas: f, context: m, isNew: p } = Sn(h.width, h.height);
			return this._drawWithFitAndMipmapping(f, m, {
				fit: h.fit,
				rotation: h.rotation,
				flip: h.flip,
				crop: h.crop,
				targetIsFresh: p,
				fillBlack: "discard" === h.alpha
			}), new e(f, {
				timestamp: this.timestamp,
				duration: this.duration,
				rotation: 0,
				flip: !1
			});
		}
		setRotation(e) {
			if (![
				0,
				90,
				180,
				270
			].includes(e)) throw new TypeError("newRotation must be 0, 90, 180, or 270.");
			this.rotation = e;
		}
		setFlip(e) {
			if ("boolean" != typeof e) throw new TypeError("newFlip must be a boolean.");
			this.flip = e;
		}
		setTimestamp(e) {
			if (!Number.isFinite(e)) throw new TypeError("newTimestamp must be a number.");
			this.timestamp = e;
		}
		setDuration(e) {
			if (!Number.isFinite(e) || e < 0) throw new TypeError("newDuration must be a non-negative number.");
			this.duration = e;
		}
		setEncodeOptions(e) {
			if (!e || "object" != typeof e) throw new TypeError("newEncodeOptions must be an object.");
			this.encodeOptions = e;
		}
		[Symbol.dispose]() {
			this.close();
		}
	};
	const bn = [], Tn = [];
	let vn = 0;
	const Sn = (e, t) => {
		for (const a of Tn) if (a.canvas.width === e && a.canvas.height === t) return a.age = vn++, {
			canvas: a.canvas,
			context: a.context,
			isNew: !1
		};
		let r;
		if ("undefined" != typeof OffscreenCanvas) r = new OffscreenCanvas(e, t);
		else {
			if ("undefined" == typeof window || "undefined" == typeof document) throw new Error("Cannot transform VideoSamples in this environment. Either run in an environment with OffscreenCanvas or HTMLCanvasElement, or supply a custom VideoSample transformer using registerVideoSampleTransformer().");
			r = document.createElement("canvas"), r.width = e, r.height = t;
		}
		const i = r.getContext("2d", {
			alpha: !0,
			willReadFrequently: !1
		});
		if (!i) throw new Error("The '2d' canvas context is required to transform VideoSamples. Register a custom transformer using registerVideoSampleTransformer to work around this limitation.");
		return Tn.length >= 3 && Tn.splice(Fe(Tn, (e) => e.age), 1), Tn.push({
			canvas: r,
			context: i,
			age: vn++
		}), {
			canvas: r,
			context: i,
			isNew: !0
		};
	};
	var Pn = class {
		constructor(e) {
			if (void 0 !== e) {
				if (!e || "object" != typeof e) throw new TypeError("init.colorSpace, when provided, must be an object.");
				const t = Object.keys(F);
				if (null != e.primaries && !t.includes(e.primaries)) throw new TypeError(`init.colorSpace.primaries, when provided, must be one of ${t.join(", ")}.`);
				const r = Object.keys(D);
				if (null != e.transfer && !r.includes(e.transfer)) throw new TypeError(`init.colorSpace.transfer, when provided, must be one of ${r.join(", ")}.`);
				const i = Object.keys(z);
				if (null != e.matrix && !i.includes(e.matrix)) throw new TypeError(`init.colorSpace.matrix, when provided, must be one of ${i.join(", ")}.`);
				if (null != e.fullRange && "boolean" != typeof e.fullRange) throw new TypeError("init.colorSpace.fullRange, when provided, must be a boolean.");
			}
			this.primaries = e?.primaries ?? null, this.transfer = e?.transfer ?? null, this.matrix = e?.matrix ?? null, this.fullRange = e?.fullRange ?? null;
		}
		toJSON() {
			return {
				primaries: this.primaries,
				transfer: this.transfer,
				matrix: this.matrix,
				fullRange: this.fullRange
			};
		}
	};
	const xn = (e) => "undefined" != typeof VideoFrame && e instanceof VideoFrame, Cn = (e, t, r) => {
		const i = Math.min(e.left, t), a = Math.min(e.top, r), s = Math.min(e.width, t - i), n = Math.min(e.height, r - a);
		return c(s >= 0), c(n >= 0), {
			left: i,
			top: a,
			width: s,
			height: n
		};
	}, En = (e, t) => {
		if (!e || "object" != typeof e) throw new TypeError(t + "crop, when provided, must be an object.");
		if (!Number.isInteger(e.left) || e.left < 0) throw new TypeError(t + "crop.left must be a non-negative integer.");
		if (!Number.isInteger(e.top) || e.top < 0) throw new TypeError(t + "crop.top must be a non-negative integer.");
		if (!Number.isInteger(e.width) || e.width < 0) throw new TypeError(t + "crop.width must be a non-negative integer.");
		if (!Number.isInteger(e.height) || e.height < 0) throw new TypeError(t + "crop.height must be a non-negative integer.");
	}, _n = (e) => {
		if (!e || "object" != typeof e) throw new TypeError("options must be an object.");
		if (void 0 !== e.colorSpace && !["display-p3", "srgb"].includes(e.colorSpace)) throw new TypeError("options.colorSpace, when provided, must be 'display-p3' or 'srgb'.");
		if (void 0 !== e.format && "string" != typeof e.format) throw new TypeError("options.format, when provided, must be a string.");
		if (void 0 !== e.layout) {
			if (!Array.isArray(e.layout)) throw new TypeError("options.layout, when provided, must be an array.");
			for (const t of e.layout) {
				if (!t || "object" != typeof t) throw new TypeError("Each entry in options.layout must be an object.");
				if (!Number.isInteger(t.offset) || t.offset < 0) throw new TypeError("plane.offset must be a non-negative integer.");
				if (!Number.isInteger(t.stride) || t.stride < 0) throw new TypeError("plane.stride must be a non-negative integer.");
			}
		}
		if (void 0 !== e.rect) {
			if (!e.rect || "object" != typeof e.rect) throw new TypeError("options.rect, when provided, must be an object.");
			if (void 0 !== e.rect.x && (!Number.isInteger(e.rect.x) || e.rect.x < 0)) throw new TypeError("options.rect.x, when provided, must be a non-negative integer.");
			if (void 0 !== e.rect.y && (!Number.isInteger(e.rect.y) || e.rect.y < 0)) throw new TypeError("options.rect.y, when provided, must be a non-negative integer.");
			if (void 0 !== e.rect.width && (!Number.isInteger(e.rect.width) || e.rect.width < 0)) throw new TypeError("options.rect.width, when provided, must be a non-negative integer.");
			if (void 0 !== e.rect.height && (!Number.isInteger(e.rect.height) || e.rect.height < 0)) throw new TypeError("options.rect.height, when provided, must be a non-negative integer.");
		}
	}, In = (e, t, r) => {
		const i = Bn(e), a = [];
		let s = 0;
		for (const n of i) {
			const e = Math.ceil(t / n.widthDivisor), i = Math.ceil(r / n.heightDivisor), o = e * n.sampleBytes, c = o * i;
			a.push({
				offset: s,
				stride: o
			}), s += c;
		}
		return a;
	}, Bn = (e) => {
		const t = (e, t, r, i, a) => {
			const s = [
				{
					sampleBytes: e,
					widthDivisor: 1,
					heightDivisor: 1
				},
				{
					sampleBytes: t,
					widthDivisor: r,
					heightDivisor: i
				},
				{
					sampleBytes: t,
					widthDivisor: r,
					heightDivisor: i
				}
			];
			return a && s.push({
				sampleBytes: e,
				widthDivisor: 1,
				heightDivisor: 1
			}), s;
		};
		switch (e) {
			case "I420": return t(1, 1, 2, 2, !1);
			case "I420P10":
			case "I420P12": return t(2, 2, 2, 2, !1);
			case "I420A": return t(1, 1, 2, 2, !0);
			case "I420AP10":
			case "I420AP12": return t(2, 2, 2, 2, !0);
			case "I422": return t(1, 1, 2, 1, !1);
			case "I422P10":
			case "I422P12": return t(2, 2, 2, 1, !1);
			case "I422A": return t(1, 1, 2, 1, !0);
			case "I422AP10":
			case "I422AP12": return t(2, 2, 2, 1, !0);
			case "I444": return t(1, 1, 1, 1, !1);
			case "I444P10":
			case "I444P12": return t(2, 2, 1, 1, !1);
			case "I444A": return t(1, 1, 1, 1, !0);
			case "I444AP10":
			case "I444AP12": return t(2, 2, 1, 1, !0);
			case "NV12": return [{
				sampleBytes: 1,
				widthDivisor: 1,
				heightDivisor: 1
			}, {
				sampleBytes: 2,
				widthDivisor: 2,
				heightDivisor: 2
			}];
			case "RGBA":
			case "RGBX":
			case "BGRA":
			case "BGRX": return [{
				sampleBytes: 4,
				widthDivisor: 1,
				heightDivisor: 1
			}];
			default: J(e), c(!1);
		}
	}, An = (e, t) => {
		const r = {
			left: 0,
			top: 0,
			width: e.codedWidth,
			height: e.codedHeight
		}, i = t.rect, a = Rn(r, i, e.codedWidth, e.codedHeight, e.format), s = t.layout;
		let n;
		if (t.format && t.format !== e.format) {
			if (![
				"RGBA",
				"RGBX",
				"BGRA",
				"BGRX"
			].includes(t.format)) throw new Error("NotSupportedError: Invalid destination format.");
			n = t.format;
		} else n = e.format;
		return Mn(a, n, s);
	}, Rn = (e, t, r, i, a) => {
		const s = { ...e };
		if (void 0 !== t) {
			if (0 === t.width || 0 === t.height) throw new TypeError("visibleRect dimensions cannot be zero.");
			if ((t.x || 0) + (t.width || 0) > r) throw new TypeError("visibleRect exceeds codedWidth.");
			if ((t.y || 0) + (t.height || 0) > i) throw new TypeError("visibleRect exceeds codedHeight.");
			s.x = t.x || 0, s.y = t.y || 0, s.width = t.width || 0, s.height = t.height || 0;
		}
		if (!Fn(a, s)) throw new TypeError("visibleRect alignment is invalid for the format.");
		return s;
	}, Fn = (e, t) => {
		if (null === e) return !0;
		const r = Bn(e);
		for (let i = 0; i < r.length; i++) {
			const e = r[i], a = e.widthDivisor, s = e.heightDivisor;
			if ((t.x || 0) % a !== 0) return !1;
			if ((t.y || 0) % s !== 0) return !1;
		}
		return !0;
	}, Mn = (e, t, r) => {
		const i = Bn(t), a = i.length;
		if (void 0 !== r && r.length !== a) throw new TypeError(`Layout must have ${a} planes.`);
		let s = 0;
		const n = [], o = [];
		for (let c = 0; c < a; c++) {
			const t = i[c], a = t.sampleBytes, l = t.widthDivisor, d = t.heightDivisor, u = {
				destinationOffset: 0,
				destinationStride: 0,
				sourceTop: 0,
				sourceHeight: 0,
				sourceLeftBytes: 0,
				sourceWidthBytes: 0
			};
			if (u.sourceTop = Math.ceil(Math.trunc(e.y || 0) / d), u.sourceHeight = Math.ceil(Math.trunc(e.height || 0) / d), u.sourceLeftBytes = Math.floor(Math.trunc(e.x || 0) / l) * a, u.sourceWidthBytes = Math.floor(Math.trunc(e.width || 0) / l) * a, void 0 !== r) {
				const e = r[c];
				if (e.stride < u.sourceWidthBytes) throw new TypeError(`Stride for plane ${c} is too small.`);
				u.destinationOffset = e.offset, u.destinationStride = e.stride;
			} else u.destinationOffset = s, u.destinationStride = u.sourceWidthBytes;
			const h = u.destinationStride * u.sourceHeight + u.destinationOffset;
			if (h > 4294967295) throw new TypeError("Allocation size exceeds limit.");
			o.push(h), s = Math.max(s, h);
			for (let e = 0; e < c; e++) {
				const t = n[e];
				if (!(o[c] <= t.destinationOffset || o[e] <= u.destinationOffset)) throw new TypeError("Planes overlap.");
			}
			n.push(u);
		}
		return {
			allocationSize: s,
			computedLayouts: n
		};
	}, Dn = new Set([
		"f32",
		"f32-planar",
		"s16",
		"s16-planar",
		"s32",
		"s32-planar",
		"u8",
		"u8-planar"
	]);
	var On = class {
		constructor() {
			this._referenceCount = 0;
		}
	}, zn = class e {
		get microsecondTimestamp() {
			return Math.trunc(ue * this.timestamp);
		}
		get microsecondDuration() {
			return Math.trunc(ue * this.duration);
		}
		constructor(e) {
			if (this._closed = !1, qn(e)) {
				if (null === e.format) throw new TypeError("AudioData with null format is not supported.");
				this._data = e, this.format = e.format, this.sampleRate = e.sampleRate, this.numberOfFrames = e.numberOfFrames, this.numberOfChannels = e.numberOfChannels, this.timestamp = e.timestamp / 1e6, this.duration = e.numberOfFrames / e.sampleRate;
			} else if (e instanceof On) {
				if (this._data = e, e._referenceCount++, this.format = e.getFormat(), !Dn.has(this.format)) throw new TypeError("getFormat() must return an AudioSampleFormat.");
				if (this.sampleRate = e.getSampleRate(), !Number.isInteger(this.sampleRate) || this.sampleRate <= 0) throw new TypeError("getSampleRate() must return a positive integer.");
				if (this.numberOfFrames = e.getNumberOfFrames(), !Number.isInteger(this.numberOfFrames) || this.numberOfFrames < 0) throw new TypeError("getNumberOfFrames() must return a non-negative integer.");
				if (this.numberOfChannels = e.getNumberOfChannels(), !Number.isInteger(this.numberOfChannels) || this.numberOfChannels <= 0) throw new TypeError("getNumberOfChannels() must return a positive integer.");
				if (this.timestamp = e.getTimestamp(), !Number.isFinite(this.timestamp)) throw new TypeError("getTimestamp() must return a finite number.");
				this.duration = this.numberOfFrames / this.sampleRate;
			} else {
				if (!e || "object" != typeof e) throw new TypeError("Invalid AudioDataInit: must be an object.");
				if (!Dn.has(e.format)) throw new TypeError("Invalid AudioDataInit: invalid format.");
				if (!Number.isFinite(e.sampleRate) || e.sampleRate <= 0) throw new TypeError("Invalid AudioDataInit: sampleRate must be > 0.");
				if (!Number.isInteger(e.numberOfChannels) || 0 === e.numberOfChannels) throw new TypeError("Invalid AudioDataInit: numberOfChannels must be an integer > 0.");
				if (!Number.isFinite(e?.timestamp)) throw new TypeError("init.timestamp must be a number.");
				const t = e.data.byteLength / (Nn(e.format) * e.numberOfChannels);
				if (!Number.isInteger(t)) throw new TypeError("Invalid AudioDataInit: data size is not a multiple of frame size.");
				let r;
				if (this.format = e.format, this.sampleRate = e.sampleRate, this.numberOfFrames = t, this.numberOfChannels = e.numberOfChannels, this.timestamp = e.timestamp, this.duration = t / e.sampleRate, e.data instanceof ArrayBuffer) r = new Uint8Array(e.data);
				else {
					if (!ArrayBuffer.isView(e.data)) throw new TypeError("Invalid AudioDataInit: data is not a BufferSource.");
					r = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength);
				}
				const i = this.numberOfFrames * this.numberOfChannels * Nn(this.format);
				if (r.byteLength < i) throw new TypeError("Invalid AudioDataInit: insufficient data size.");
				this._data = r;
			}
			pn?.register(this, {
				type: "audio",
				data: this._data
			}, this);
		}
		allocationSize(e) {
			if (!e || "object" != typeof e) throw new TypeError("options must be an object.");
			if (!Number.isInteger(e.planeIndex) || e.planeIndex < 0) throw new TypeError("planeIndex must be a non-negative integer.");
			if (void 0 !== e.format && !Dn.has(e.format)) throw new TypeError("Invalid format.");
			if (void 0 !== e.frameOffset && (!Number.isInteger(e.frameOffset) || e.frameOffset < 0)) throw new TypeError("frameOffset must be a non-negative integer.");
			if (void 0 !== e.frameCount && (!Number.isInteger(e.frameCount) || e.frameCount < 0)) throw new TypeError("frameCount must be a non-negative integer.");
			if (this._closed) throw new Error("AudioSample is closed.");
			const t = e.format ?? this.format, r = e.frameOffset ?? 0;
			if (r >= this.numberOfFrames) throw new RangeError("frameOffset out of range");
			const i = void 0 !== e.frameCount ? e.frameCount : this.numberOfFrames - r;
			if (i > this.numberOfFrames - r) throw new RangeError("frameCount out of range");
			const a = Nn(t), s = Un(t);
			if (s && e.planeIndex >= this.numberOfChannels) throw new RangeError("planeIndex out of range");
			if (!s && 0 !== e.planeIndex) throw new RangeError("planeIndex out of range");
			return (s ? i : i * this.numberOfChannels) * a;
		}
		copyTo(e, t) {
			if (!W(e)) throw new TypeError("destination must be an ArrayBuffer or an ArrayBuffer view.");
			if (!t || "object" != typeof t) throw new TypeError("options must be an object.");
			if (!Number.isInteger(t.planeIndex) || t.planeIndex < 0) throw new TypeError("planeIndex must be a non-negative integer.");
			if (void 0 !== t.format && !Dn.has(t.format)) throw new TypeError("Invalid format.");
			if (void 0 !== t.frameOffset && (!Number.isInteger(t.frameOffset) || t.frameOffset < 0)) throw new TypeError("frameOffset must be a non-negative integer.");
			if (void 0 !== t.frameCount && (!Number.isInteger(t.frameCount) || t.frameCount < 0)) throw new TypeError("frameCount must be a non-negative integer.");
			if (this._closed) throw new Error("AudioSample is closed.");
			const { format: r, frameCount: i, frameOffset: a } = t;
			let { planeIndex: s } = t, n = this.format;
			const o = r ?? this.format;
			if (!o) throw new Error("Destination format not determined");
			const l = this.numberOfFrames, d = this.numberOfChannels, u = a ?? 0;
			if (u >= l) throw new RangeError("frameOffset out of range");
			const h = void 0 !== i ? i : l - u;
			if (h > l - u) throw new RangeError("frameCount out of range");
			const f = Nn(o), m = Un(o);
			if (m && s >= d) throw new RangeError("planeIndex out of range");
			if (!m && 0 !== s) throw new RangeError("planeIndex out of range");
			const p = (m ? h : h * d) * f;
			if (e.byteLength < p) throw new RangeError("Destination buffer is too small");
			const g = E(e), k = Wn(o);
			if (qn(this._data)) {
				if (ke() && d > 2 && o !== n) return void Vn(this._data, g, n, o, d, s, u, h);
				try {
					this._data.copyTo(e, {
						planeIndex: s,
						frameOffset: u,
						frameCount: h,
						format: o
					});
					return;
				} catch (S) {
					if ("f32-planar" === o) throw S;
					n = "f32-planar";
				}
			}
			const w = Ln(n), y = Nn(n), b = Un(n);
			let T;
			if (this._data instanceof On) {
				const e = (e) => {
					const t = this._data.getDataPlane(e);
					if (!(t instanceof Uint8Array)) throw new TypeError("getDataPlane() must return a Uint8Array.");
					const r = l * y * (b ? 1 : d);
					if (t.byteLength !== r) throw new TypeError(`Data plane ${e} has invalid size. Expected exactly ${r} bytes, got ${t.byteLength} bytes.`);
					return t;
				};
				if (b) if (m) T = e(s), s = 0;
				else {
					T = new Uint8Array(l * y * d);
					for (let t = 0; t < d; t++) {
						const r = e(t);
						T.set(r, t * l * y);
					}
				}
				else T = e(0);
			} else if (this._data instanceof Uint8Array) T = this._data;
			else if (c("f32-planar" === n), m) T = new Uint8Array(this._data.allocationSize({
				format: "f32-planar",
				planeIndex: s
			})), this._data.copyTo(T, {
				format: "f32-planar",
				planeIndex: s
			}), s = 0;
			else {
				T = new Uint8Array(this._data.allocationSize({
					format: "f32-planar",
					planeIndex: 0
				}) * d);
				for (let e = 0; e < d; e++) this._data.copyTo(T.subarray(e * l * y, (e + 1) * l * y), {
					format: "f32-planar",
					planeIndex: e
				});
			}
			const v = E(T);
			for (let c = 0; c < h; c++) if (m) {
				let e;
				e = b ? (s * l + (c + u)) * y : ((c + u) * d + s) * y, k(g, c * f, w(v, e));
			} else for (let e = 0; e < d; e++) {
				let t;
				t = b ? (e * l + (c + u)) * y : ((c + u) * d + e) * y, k(g, (c * d + e) * f, w(v, t));
			}
		}
		clone() {
			if (this._closed) throw new Error("AudioSample is closed.");
			if (this._data instanceof On) {
				const t = new e(this._data);
				return t.setTimestamp(this.timestamp), t;
			}
			if (qn(this._data)) {
				const t = new e(this._data.clone());
				return t.setTimestamp(this.timestamp), t;
			}
			return new e({
				format: this.format,
				sampleRate: this.sampleRate,
				numberOfFrames: this.numberOfFrames,
				numberOfChannels: this.numberOfChannels,
				timestamp: this.timestamp,
				data: this._data
			});
		}
		trim(t, r = this.numberOfFrames) {
			if (!Number.isInteger(t) || t < 0) throw new TypeError("startFrame must be a non-negative integer.");
			if (!Number.isInteger(r) || r < 0) throw new TypeError("endFrame must be a non-negative integer.");
			if (t > this.numberOfFrames) throw new RangeError("startFrame out of range.");
			if (r > this.numberOfFrames) throw new RangeError("endFrame out of range.");
			if (r < t) throw new RangeError("endFrame must not be less than startFrame.");
			if (this._closed) throw new Error("AudioSample is closed.");
			const i = r - t, a = Nn(this.format);
			let s;
			if (Un(this.format)) {
				const e = i * a;
				if (s = new Uint8Array(e * this.numberOfChannels), i > 0) for (let r = 0; r < this.numberOfChannels; r++) this.copyTo(s.subarray(r * e, (r + 1) * e), {
					planeIndex: r,
					format: this.format,
					frameOffset: t,
					frameCount: i
				});
			} else s = new Uint8Array(i * this.numberOfChannels * a), i > 0 && this.copyTo(s, {
				planeIndex: 0,
				format: this.format,
				frameOffset: t,
				frameCount: i
			});
			return new e({
				data: s,
				format: this.format,
				sampleRate: this.sampleRate,
				numberOfChannels: this.numberOfChannels,
				timestamp: this.timestamp + t / this.sampleRate
			});
		}
		close() {
			this._closed || (pn?.unregister(this), this._data instanceof On ? (this._data._referenceCount--, 0 === this._data._referenceCount && this._data.close()) : qn(this._data) ? this._data.close() : this._data = new Uint8Array(0), this._closed = !0);
		}
		toAudioData() {
			if (this._closed) throw new Error("AudioSample is closed.");
			return this._data instanceof On ? this._createAudioDataFromData() : qn(this._data) ? this._data.timestamp === this.microsecondTimestamp ? this._data.clone() : this._createAudioDataFromData() : new AudioData({
				format: this.format,
				sampleRate: this.sampleRate,
				numberOfFrames: this.numberOfFrames,
				numberOfChannels: this.numberOfChannels,
				timestamp: this.microsecondTimestamp,
				data: this._data.buffer instanceof ArrayBuffer ? this._data.buffer : this._data.slice()
			});
		}
		_createAudioDataFromData() {
			if (Un(this.format)) {
				const e = this.allocationSize({
					planeIndex: 0,
					format: this.format
				}), t = new ArrayBuffer(e * this.numberOfChannels);
				for (let r = 0; r < this.numberOfChannels; r++) this.copyTo(new Uint8Array(t, r * e, e), {
					planeIndex: r,
					format: this.format
				});
				return new AudioData({
					format: this.format,
					sampleRate: this.sampleRate,
					numberOfFrames: this.numberOfFrames,
					numberOfChannels: this.numberOfChannels,
					timestamp: this.microsecondTimestamp,
					data: t
				});
			}
			{
				const e = new ArrayBuffer(this.allocationSize({
					planeIndex: 0,
					format: this.format
				}));
				return this.copyTo(e, {
					planeIndex: 0,
					format: this.format
				}), new AudioData({
					format: this.format,
					sampleRate: this.sampleRate,
					numberOfFrames: this.numberOfFrames,
					numberOfChannels: this.numberOfChannels,
					timestamp: this.microsecondTimestamp,
					data: e
				});
			}
		}
		toAudioBuffer() {
			if (this._closed) throw new Error("AudioSample is closed.");
			const e = new AudioBuffer({
				numberOfChannels: this.numberOfChannels,
				length: this.numberOfFrames,
				sampleRate: this.sampleRate
			}), t = new Float32Array(this.allocationSize({
				planeIndex: 0,
				format: "f32-planar"
			}) / 4);
			for (let r = 0; r < this.numberOfChannels; r++) this.copyTo(t, {
				planeIndex: r,
				format: "f32-planar"
			}), e.copyToChannel(t, r);
			return e;
		}
		setTimestamp(e) {
			if (!Number.isFinite(e)) throw new TypeError("newTimestamp must be a number.");
			this.timestamp = e;
		}
		[Symbol.dispose]() {
			this.close();
		}
		static *_fromAudioBuffer(t, r) {
			if (!(t instanceof AudioBuffer)) throw new TypeError("audioBuffer must be an AudioBuffer.");
			const i = t.numberOfChannels, a = t.sampleRate, s = t.length, n = Math.floor(24e4 / i);
			let o = 0, c = s;
			for (; c > 0;) {
				const s = Math.min(n, c), l = new Float32Array(i * s);
				for (let e = 0; e < i; e++) t.copyFromChannel(l.subarray(e * s, (e + 1) * s), e, o);
				yield new e({
					format: "f32-planar",
					sampleRate: a,
					numberOfFrames: s,
					numberOfChannels: i,
					timestamp: r + o / a,
					data: l
				}), o += s, c -= s;
			}
		}
		static fromAudioBuffer(t, r) {
			if (!(t instanceof AudioBuffer)) throw new TypeError("audioBuffer must be an AudioBuffer.");
			const i = t.numberOfChannels, a = t.sampleRate, s = t.length, n = Math.floor(24e4 / i);
			let o = 0, c = s;
			const l = [];
			for (; c > 0;) {
				const s = Math.min(n, c), d = new Float32Array(i * s);
				for (let e = 0; e < i; e++) t.copyFromChannel(d.subarray(e * s, (e + 1) * s), e, o);
				const u = new e({
					format: "f32-planar",
					sampleRate: a,
					numberOfFrames: s,
					numberOfChannels: i,
					timestamp: r + o / a,
					data: d
				});
				l.push(u), o += s, c -= s;
			}
			return l;
		}
	};
	const Nn = (e) => {
		switch (e) {
			case "u8":
			case "u8-planar": return 1;
			case "s16":
			case "s16-planar": return 2;
			case "s32":
			case "s32-planar":
			case "f32":
			case "f32-planar": return 4;
			default: throw new Error("Unknown AudioSampleFormat");
		}
	}, Un = (e) => {
		switch (e) {
			case "u8-planar":
			case "s16-planar":
			case "s32-planar":
			case "f32-planar": return !0;
			default: return !1;
		}
	}, Ln = (e) => {
		switch (e) {
			case "u8":
			case "u8-planar": return (e, t) => (e.getUint8(t) - 128) / 128;
			case "s16":
			case "s16-planar": return (e, t) => e.getInt16(t, !0) / 32768;
			case "s32":
			case "s32-planar": return (e, t) => e.getInt32(t, !0) / 2147483648;
			case "f32":
			case "f32-planar": return (e, t) => e.getFloat32(t, !0);
		}
	}, Wn = (e) => {
		switch (e) {
			case "u8":
			case "u8-planar": return (e, t, r) => e.setUint8(t, re(Math.round(128 * r) + 128, 0, 255));
			case "s16":
			case "s16-planar": return (e, t, r) => e.setInt16(t, re(Math.round(32768 * r), -32768, 32767), !0);
			case "s32":
			case "s32-planar": return (e, t, r) => e.setInt32(t, re(Math.round(2147483648 * r), -2147483648, 2147483647), !0);
			case "f32":
			case "f32-planar": return (e, t, r) => e.setFloat32(t, r, !0);
		}
	}, qn = (e) => "undefined" != typeof AudioData && e instanceof AudioData, Vn = (e, t, r, i, a, s, n, o) => {
		const c = Ln(r), l = Wn(i), d = Nn(r), u = Nn(i), h = Un(r);
		if (Un(i)) if (h) {
			const i = new ArrayBuffer(o * d), a = E(i);
			e.copyTo(i, {
				planeIndex: s,
				frameOffset: n,
				frameCount: o,
				format: r
			});
			for (let e = 0; e < o; e++) l(t, e * u, c(a, e * d));
		} else {
			const i = new ArrayBuffer(o * a * d), h = E(i);
			e.copyTo(i, {
				planeIndex: 0,
				frameOffset: n,
				frameCount: o,
				format: r
			});
			for (let e = 0; e < o; e++) l(t, e * u, c(h, (e * a + s) * d));
		}
		else if (h) {
			const i = new ArrayBuffer(o * d), s = E(i);
			for (let h = 0; h < a; h++) {
				e.copyTo(i, {
					planeIndex: h,
					frameOffset: n,
					frameCount: o,
					format: r
				});
				for (let e = 0; e < o; e++) l(t, (e * a + h) * u, c(s, e * d));
			}
		} else {
			const i = new ArrayBuffer(o * a * d), s = E(i);
			e.copyTo(i, {
				planeIndex: 0,
				frameOffset: n,
				frameCount: o,
				format: r
			});
			for (let e = 0; e < o; e++) for (let r = 0; r < a; r++) {
				const i = e * a + r;
				l(t, i * u, c(s, i * d));
			}
		}
	}, Hn = /* @__PURE__ */ new Map(), jn = /* @__PURE__ */ new Map(), $n = (e, t) => {
		if (!t || "object" != typeof t) throw new TypeError("Encoding options must be an object.");
		if (void 0 !== t.alpha && !["discard", "keep"].includes(t.alpha)) throw new TypeError("options.alpha, when provided, must be 'discard' or 'keep'.");
		const r = t.bitrateMode;
		if (void 0 !== r && !["constant", "variable"].includes(r)) throw new TypeError("bitrateMode, when provided, must be 'constant' or 'variable'.");
		if (void 0 !== t.latencyMode && !["quality", "realtime"].includes(t.latencyMode)) throw new TypeError("latencyMode, when provided, must be 'quality' or 'realtime'.");
		if (void 0 !== t.fullCodecString && "string" != typeof t.fullCodecString) throw new TypeError("fullCodecString, when provided, must be a string.");
		if (void 0 !== t.fullCodecString && Mr(t.fullCodecString) !== e) throw new TypeError(`fullCodecString, when provided, must be a string that matches the specified codec (${e}).`);
		if (void 0 !== t.hardwareAcceleration && ![
			"no-preference",
			"prefer-hardware",
			"prefer-software"
		].includes(t.hardwareAcceleration)) throw new TypeError("hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'.");
		if (void 0 !== t.scalabilityMode && "string" != typeof t.scalabilityMode) throw new TypeError("scalabilityMode, when provided, must be a string.");
		if (void 0 !== t.contentHint && "string" != typeof t.contentHint) throw new TypeError("contentHint, when provided, must be a string.");
	}, Kn = (e) => {
		const t = e.bitrateMode, r = e.quality._toVideoRateControl(e.codec, e.width, e.height, t), i = (t, r, i) => {
			return {
				codec: e.fullCodecString ?? Cr(e.codec, e.width, e.height, i, "keep" === e.alpha),
				width: e.width,
				height: e.height,
				displayWidth: e.squarePixelWidth,
				displayHeight: e.squarePixelHeight,
				bitrate: t,
				bitrateMode: r,
				alpha: e.alpha ?? "discard",
				framerate: e.framerate,
				latencyMode: e.latencyMode,
				hardwareAcceleration: e.hardwareAcceleration,
				scalabilityMode: e.scalabilityMode,
				contentHint: e.contentHint,
				...(a = e.codec, "avc" === a ? { avc: { format: "avc" } } : "hevc" === a ? { hevc: { format: "hevc" } } : {})
			};
			var a;
		}, a = [];
		return null !== r.quantizer && a.push({
			config: i(void 0, "quantizer", r.bitrate),
			quantizer: r.quantizer
		}), "quantizer" !== r.bitrateMode && a.push({
			config: i(r.bitrate, r.bitrateMode, r.bitrate),
			quantizer: null
		}), c(a.length > 0), a;
	}, Xn = (e, t) => {
		if (!t || "object" != typeof t) throw new TypeError("Encoding options must be an object.");
		const r = t.bitrateMode;
		if (void 0 !== r && !["constant", "variable"].includes(r)) throw new TypeError("bitrateMode, when provided, must be 'constant' or 'variable'.");
		if (void 0 !== t.fullCodecString && "string" != typeof t.fullCodecString) throw new TypeError("fullCodecString, when provided, must be a string.");
		if (void 0 !== t.fullCodecString && Mr(t.fullCodecString) !== e) throw new TypeError(`fullCodecString, when provided, must be a string that matches the specified codec (${e}).`);
	}, Qn = (e) => {
		const t = e.bitrateMode;
		return {
			codec: e.fullCodecString ?? Ir(e.codec, e.numberOfChannels, e.sampleRate),
			numberOfChannels: e.numberOfChannels,
			sampleRate: e.sampleRate,
			bitrate: e.quality?._toAudioBitrate(e.codec),
			bitrateMode: e.quality?._bitrateMode ?? t,
			...(r = e.codec, "aac" === r ? { aac: { format: "aac" } } : "opus" === r ? { opus: { format: "opus" } } : {})
		};
		var r;
	};
	var Gn = class {
		constructor(e) {
			if ("number" != typeof e && "string" != typeof e || (e = { quality: e }), !e || "object" != typeof e) throw new TypeError("options must be an object.");
			if (void 0 !== e.bitrateMode && !["constant", "variable"].includes(e.bitrateMode)) throw new TypeError("options.bitrateMode, when provided, must be 'constant' or 'variable'.");
			if ("quality" in e) {
				if ("string" == typeof e.quality ? !(e.quality in Yn) : "number" != typeof e.quality || Number.isNaN(e.quality)) throw new TypeError("options.quality must be a number, or one of 'very-low', 'low', 'medium', 'high' or 'very-high'.");
				if (void 0 !== e.preferBitrate && "boolean" != typeof e.preferBitrate) throw new TypeError("options.preferBitrate, when provided, must be a boolean.");
				if ("bitrate" in e || "quantizer" in e) throw new TypeError("options.quality cannot be combined with options.bitrate or options.quantizer.");
				this._quality = "string" == typeof e.quality ? Yn[e.quality] : e.quality, this._preferBitrate = e.preferBitrate ?? !1, this._bitrate = void 0, this._quantizer = void 0;
			} else {
				if (void 0 !== e.bitrate && (!Number.isInteger(e.bitrate) || e.bitrate <= 0)) throw new TypeError("options.bitrate, when provided, must be a positive integer.");
				if (void 0 !== e.quantizer && (!Number.isInteger(e.quantizer) || e.quantizer < 0)) throw new TypeError("options.quantizer, when provided, must be a non-negative integer.");
				if (void 0 === e.bitrate && void 0 === e.quantizer) throw new TypeError("At least one of options.bitrate or options.quantizer must be set.");
				if ("preferBitrate" in e) throw new TypeError("options.preferBitrate can only be combined with options.quality.");
				this._quality = void 0, this._preferBitrate = !1, this._bitrate = e.bitrate, this._quantizer = e.quantizer;
			}
			this._bitrateMode = e.bitrateMode;
		}
		_toVideoRateControl(e, t, r, i) {
			const a = Zn[e];
			let s = null, n = this._bitrateMode ?? i ?? "variable";
			if (void 0 !== this._quantizer) {
				if (a) if (this._quantizer < a.min || this._quantizer > a.max) {
					if (void 0 === this._bitrate) throw new Error(`Quantizer ${this._quantizer} is out of range for codec '${e}'; must be between ${a.min} and ${a.max}.`);
				} else s = this._quantizer, void 0 === this._bitrate && (n = "quantizer");
				else if (void 0 === this._bitrate) throw new Error(`Codec '${e}' does not support quantizer-based encoding. Provide a bitrate in the Quality to define a fallback.`);
			} else void 0 === this._bitrate && a && !this._preferBitrate && (c(void 0 !== this._quality), s = re(Math.round((o = a.worst, l = a.best, d = this._quality, o + (l - o) * d)), a.min, a.max));
			var o, l, d;
			let u;
			if (void 0 !== this._bitrate) u = this._bitrate;
			else {
				let i = this._quality;
				void 0 === i && (c(null !== s && a), i = re((s - a.worst) / (a.best - a.worst), 0, 1)), u = eo(e, t, r, Jn(i));
			}
			return {
				quantizer: s,
				bitrate: u,
				bitrateMode: n
			};
		}
		_toVideoBitrate(e, t, r) {
			return void 0 !== this._bitrate ? this._bitrate : (c(void 0 !== this._quality), eo(e, t, r, Jn(this._quality)));
		}
		_toAudioBitrate(e) {
			if (pr.includes(e) || "flac" === e) return;
			if (void 0 !== this._bitrate) return this._bitrate;
			if (void 0 === this._quality) throw new Error("This Quality defines neither a quality level nor a bitrate and therefore cannot be used for audio encoding.");
			const t = Jn(this._quality), r = {
				aac: 128e3,
				opus: 64e3,
				mp3: 16e4,
				vorbis: 64e3,
				ac3: 384e3,
				eac3: 192e3,
				dts: 768e3
			}[e];
			if (!r) throw new Error(`Unhandled codec: ${e}`);
			let i = r * t;
			return "aac" === e ? i = [
				96e3,
				128e3,
				16e4,
				192e3
			].reduce((e, t) => Math.abs(t - i) < Math.abs(e - i) ? t : e) : "opus" === e || "vorbis" === e ? i = Math.max(6e3, i) : "mp3" === e && (i = [
				8e3,
				16e3,
				24e3,
				32e3,
				4e4,
				48e3,
				64e3,
				8e4,
				96e3,
				112e3,
				128e3,
				16e4,
				192e3,
				224e3,
				256e3,
				32e4
			].reduce((e, t) => Math.abs(t - i) < Math.abs(e - i) ? t : e)), 1e3 * Math.round(i / 1e3);
		}
	};
	const Yn = {
		"very-low": 0,
		low: .25,
		medium: .5,
		high: .75,
		"very-high": 1
	}, Zn = {
		avc: {
			min: 0,
			max: 51,
			worst: 41,
			best: 16
		},
		hevc: {
			min: 0,
			max: 51,
			worst: 41,
			best: 16
		},
		vp9: {
			min: 0,
			max: 63,
			worst: 52,
			best: 20
		},
		av1: {
			min: 0,
			max: 255,
			worst: 208,
			best: 80
		}
	}, Jn = (e) => .3 * Math.exp(2.5538 * e), eo = (e, t, r, i) => {
		const a = t * r, n = 3e6 * Math.pow(a / 2073600, .95) * {
			avc: 1,
			hevc: .6,
			vp9: .6,
			av1: .4,
			vp8: 1.2,
			prores: 73.33333333333333
		}[e] * i;
		return 1e3 * Math.ceil(n / 1e3);
	}, to = (e, t) => "avc" === e ? { avc: { quantizer: t } } : "hevc" === e ? { hevc: { quantizer: t } } : "vp9" === e ? { vp9: { quantizer: t } } : "av1" === e ? { av1: { quantizer: t } } : void c(!1), ro = async (e, t = {}) => {
		const { width: r = 1280, height: i = 720, quality: a, bitrate: s, frameRate: n, ...o } = t;
		if (!mr.includes(e)) return !1;
		if (!Number.isInteger(r) || r <= 0) throw new TypeError("width must be a positive integer.");
		if (!Number.isInteger(i) || i <= 0) throw new TypeError("height must be a positive integer.");
		if (void 0 !== a && !(a instanceof Gn)) throw new TypeError("quality, when provided, must be a Quality.");
		if (void 0 !== a && void 0 !== s) throw new TypeError("quality and bitrate cannot both be provided.");
		if (void 0 !== s && !(s instanceof Gn) && (!Number.isInteger(s) || s <= 0)) throw new TypeError("bitrate must be a positive integer or a quality.");
		if (void 0 !== n && (!Number.isFinite(n) || n <= 0)) throw new TypeError("frameRate, when provided, must be a finite positive number.");
		$n(e, o);
		const c = io(a, s) ?? new Gn("medium");
		let l;
		try {
			l = Kn({
				codec: e,
				width: r,
				height: i,
				quality: c,
				framerate: n,
				...o,
				alpha: "discard"
			});
		} catch {
			return !1;
		}
		const d = JSON.stringify(l), u = Hn.get(d);
		if (u) return u;
		const h = (async () => {
			for (const { config: t } of l) if (oo.some((r) => r.supports(e, t))) return !0;
			if ("undefined" == typeof VideoEncoder) return !1;
			if (!(r % 2 != 1 && i % 2 != 1 || "avc" !== e && "hevc" !== e)) return !1;
			for (const { config: t, quantizer: a } of l) {
				try {
					if (!(await VideoEncoder.isConfigSupported(t)).supported) continue;
				} catch {
					continue;
				}
				if (!ye()) return !0;
				if (await new Promise(async (s) => {
					try {
						const n = new VideoEncoder({
							output: () => {},
							error: () => s(!1)
						});
						n.configure(t);
						const o = new Uint8Array(r * i * 4), c = new VideoFrame(o, {
							format: "RGBA",
							codedWidth: r,
							codedHeight: i,
							timestamp: 0
						});
						n.encode(c, null !== a ? to(e, a) : void 0), c.close(), await n.flush(), s(!0);
					} catch {
						s(!1);
					}
				})) return !0;
			}
			return !1;
		})();
		return Hn.set(d, h), h;
	}, io = (e, t) => void 0 !== e ? e : void 0 !== t ? t instanceof Gn ? t : new Gn({ bitrate: t }) : void 0, ao = async (e = kr, t) => {
		const r = await Promise.all(e.map((e) => (async (e, t = {}) => {
			const { numberOfChannels: r = 2, sampleRate: i = 48e3, quality: a, bitrate: s, ...n } = t;
			if (!kr.includes(e)) return !1;
			if (!Number.isInteger(r) || r <= 0) throw new TypeError("numberOfChannels must be a positive integer.");
			if (!Number.isInteger(i) || i <= 0) throw new TypeError("sampleRate must be a positive integer.");
			if (void 0 !== a && !(a instanceof Gn)) throw new TypeError("quality, when provided, must be a Quality.");
			if (void 0 !== a && void 0 !== s) throw new TypeError("quality and bitrate cannot both be provided.");
			if (void 0 !== s && !(s instanceof Gn) && (!Number.isInteger(s) || s <= 0)) throw new TypeError("bitrate must be a positive integer.");
			Xn(e, n);
			const o = Qn({
				codec: e,
				numberOfChannels: r,
				sampleRate: i,
				quality: io(a, s) ?? new Gn("medium"),
				...n
			}), c = JSON.stringify(o), l = jn.get(c);
			if (l) return l;
			const d = (async () => {
				if (co.some((t) => t.supports(e, o))) return !0;
				if (pr.includes(e)) return !0;
				if ("undefined" == typeof AudioEncoder) return !1;
				try {
					return !0 === (await AudioEncoder.isConfigSupported(o)).supported;
				} catch {
					return !1;
				}
			})();
			return jn.set(c, d), d;
		})(e, t)));
		return e.filter((e, t) => r[t]);
	}, so = [], no = [], oo = [], co = [], lo = (e) => {
		if (!e || "object" != typeof e) throw new TypeError("options must be an object.");
		if (void 0 !== e.metadataOnly && "boolean" != typeof e.metadataOnly) throw new TypeError("options.metadataOnly, when defined, must be a boolean.");
		if (void 0 !== e.verifyKeyPackets && "boolean" != typeof e.verifyKeyPackets) throw new TypeError("options.verifyKeyPackets, when defined, must be a boolean.");
		if (e.verifyKeyPackets && e.metadataOnly) throw new TypeError("options.verifyKeyPackets and options.metadataOnly cannot be enabled together.");
		if (void 0 !== e.skipLiveWait && "boolean" != typeof e.skipLiveWait) throw new TypeError("options.skipLiveWait, when defined, must be a boolean.");
	}, uo = (e) => {
		if (!Be(e)) throw new TypeError("timestamp must be a number.");
	}, ho = (e, t, r) => r.verifyKeyPackets ? t.then(async (t) => {
		if (!t || "delta" === t.type) return t;
		const r = await e.determinePacketType(t);
		return r && (t.type = r), t;
	}) : t;
	var fo = class {
		constructor(e) {
			if (!(e instanceof xo)) throw new TypeError("track must be an InputTrack.");
			this._track = e;
		}
		async getFirstPacket(e = {}) {
			if (lo(e), this._track.input._disposed) throw new Lo();
			return ho(this._track, this._track._backing.getFirstPacket(e), e);
		}
		async getFirstKeyPacket(e = {}) {
			lo(e);
			const t = await this.getFirstPacket(e);
			return t ? "key" === t.type ? t : this.getNextKeyPacket(t, e) : null;
		}
		async getPacket(e, t = {}) {
			if (uo(e), lo(t), this._track.input._disposed) throw new Lo();
			return ho(this._track, this._track._backing.getPacket(e, t), t);
		}
		async getNextPacket(e, t = {}) {
			if (!(e instanceof Zr)) throw new TypeError("packet must be an EncodedPacket.");
			if (lo(t), this._track.input._disposed) throw new Lo();
			return ho(this._track, this._track._backing.getNextPacket(e, t), t);
		}
		async getKeyPacket(e, t = {}) {
			if (uo(e), lo(t), this._track.input._disposed) throw new Lo();
			if (!t.verifyKeyPackets) return this._track._backing.getKeyPacket(e, t);
			const r = await this._track._backing.getKeyPacket(e, t);
			return r ? (c("key" === r.type), "delta" === await this._track.determinePacketType(r) ? this.getKeyPacket(r.timestamp - 1 / await this._track.getTimeResolution(), t) : r) : r;
		}
		async getNextKeyPacket(e, t = {}) {
			if (!(e instanceof Zr)) throw new TypeError("packet must be an EncodedPacket.");
			if (lo(t), this._track.input._disposed) throw new Lo();
			if (!t.verifyKeyPackets) return this._track._backing.getNextKeyPacket(e, t);
			const r = await this._track._backing.getNextKeyPacket(e, t);
			return r ? (c("key" === r.type), "delta" === await this._track.determinePacketType(r) ? this.getNextKeyPacket(r, t) : r) : r;
		}
		packets(e, t, r = {}) {
			if (void 0 !== e && !(e instanceof Zr)) throw new TypeError("startPacket must be an EncodedPacket.");
			if (void 0 !== e && e.isMetadataOnly && !r?.metadataOnly) throw new TypeError("startPacket can only be metadata-only if options.metadataOnly is enabled.");
			if (void 0 !== t && !(t instanceof Zr)) throw new TypeError("endPacket must be an EncodedPacket.");
			if (lo(r), this._track.input._disposed) throw new Lo();
			const i = [];
			let { promise: a, resolve: s } = Q(), { promise: n, resolve: o } = Q(), c = !1, l = !1, d = null, u = !1;
			const h = [], f = () => Math.max(2, h.length);
			(async () => {
				let d = e ?? await this.getFirstPacket(r);
				for (; d && !l && !this._track.input._disposed && !(t && d.sequenceNumber >= t?.sequenceNumber);) i.length > f() ? ({promise: n, resolve: o} = Q(), await n) : (i.push(d), s(), {promise: a, resolve: s} = Q(), d = await this.getNextPacket(d, r));
				c = !0, s();
			})().catch((e) => {
				u || (d = e, u = !0, s());
			});
			const m = this._track;
			return {
				async next() {
					for (;;) {
						if (m.input._disposed) throw new Lo();
						if (l) return {
							value: void 0,
							done: !0
						};
						if (u) throw d;
						if (i.length > 0) {
							const e = i.shift(), t = performance.now();
							for (h.push(t); h.length > 0 && t - h[0] >= 1e3;) h.shift();
							return o(), {
								value: e,
								done: !1
							};
						}
						if (c) return {
							value: void 0,
							done: !0
						};
						await a;
					}
				},
				return: async () => (l = !0, o(), s(), {
					value: void 0,
					done: !0
				}),
				async throw(e) {
					throw e;
				},
				[Symbol.asyncIterator]() {
					return this;
				}
			};
		}
	}, mo = class {
		constructor(e, t) {
			this.onSample = e, this.onError = t;
		}
	}, po = class {
		mediaSamplesInRange(e = -Infinity, t = Infinity, r) {
			uo(e), uo(t);
			const i = [];
			let a = !1, s = null, { promise: n, resolve: o } = Q(), { promise: c, resolve: l } = Q(), d = !1, u = !1, h = !1, f = null, m = null, p = !1;
			const g = {
				...r,
				verifyKeyPackets: !0,
				metadataOnly: !1
			};
			(async () => {
				f = await this._createDecoder((r) => {
					l(), r.timestamp >= t && (u = !0), u ? r.close() : (s && (r.timestamp > e ? (i.push(s), a = !0) : s.close()), r.timestamp >= e && (i.push(r), a = !0), s = a ? null : r, i.length > 0 && (o(), {promise: n, resolve: o} = Q()));
				}, (e) => {
					p || (m = e, p = !0, o());
				});
				const r = this._createPacketSink(), k = await r.getKeyPacket(e, g) ?? await r.getFirstKeyPacket(g);
				let w = k;
				const y = r.packets(k ?? void 0, void 0, g);
				for (await y.next(); w && !u && !this._track.input._disposed;) {
					const e = go(i.length);
					if (i.length + f.getDecodeQueueSize() > e) {
						({promise: c, resolve: l} = Q()), await c;
						continue;
					}
					f.decode(w);
					const t = await y.next();
					if (t.done) break;
					w = t.value;
				}
				await y.return(), h || this._track.input._disposed || await f.flush(), !a && s && i.push(s), d = !0, o();
			})().catch((e) => {
				p || (m = e, p = !0, o());
			}).finally(() => {
				f?.close();
			});
			const k = this._track, w = () => {
				s?.close();
				for (const e of i) e.close();
			};
			return {
				async next() {
					for (;;) {
						if (k.input._disposed) throw h = !0, u = !0, w(), new Lo();
						if (h) return {
							value: void 0,
							done: !0
						};
						if (p) throw h = !0, u = !0, w(), m;
						if (i.length > 0) {
							const e = i.shift();
							return l(), {
								value: e,
								done: !1
							};
						}
						if (d) return {
							value: void 0,
							done: !0
						};
						await n;
					}
				},
				return: async () => (h = !0, u = !0, l(), o(), w(), {
					value: void 0,
					done: !0
				}),
				async throw(e) {
					throw e;
				},
				[Symbol.asyncIterator]() {
					return this;
				}
			};
		}
		mediaSamplesAtTimestamps(e, t) {
			((e) => {
				if (!(Symbol.iterator in e) && !(Symbol.asyncIterator in e)) throw new TypeError("Argument must be an iterable or async iterable.");
			})(e);
			const r = async function* (e) {
				Symbol.iterator in e ? yield* e[Symbol.iterator]() : yield* e[Symbol.asyncIterator]();
			}(e), i = [], a = [];
			let { promise: s, resolve: n } = Q(), { promise: o, resolve: l } = Q(), d = !1, u = !1, h = null, f = null, m = !1;
			const p = (e) => {
				a.push(e), n(), {promise: s, resolve: n} = Q();
			}, g = {
				...t,
				verifyKeyPackets: !0,
				metadataOnly: !1
			};
			(async () => {
				h = await this._createDecoder((e) => {
					if (l(), u) return void e.close();
					let t = 0;
					for (; i.length > 0 && e.timestamp - i[0] > -1e-10;) t++, i.shift();
					if (t > 0) for (let r = 0; r < t; r++) p(r < t - 1 ? e.clone() : e);
					else e.close();
				}, (e) => {
					m || (f = e, m = !0, n());
				});
				const e = this._createPacketSink();
				let t = null, s = null, k = -1;
				const w = async () => {
					c(s), c(h);
					let t = s;
					for (h.decode(t); t.sequenceNumber < k;) {
						const r = go(a.length);
						for (; a.length + h.getDecodeQueueSize() > r && !u;) ({promise: o, resolve: l} = Q()), await o;
						if (u) break;
						const i = await e.getNextPacket(t, g);
						c(i), h.decode(i), t = i;
					}
					k = -1;
				}, y = async () => {
					c(h), await h.flush();
					for (let e = 0; e < i.length; e++) p(null);
					i.length = 0;
				};
				for await (const a of r) {
					if (uo(a), u || this._track.input._disposed) break;
					const r = await e.getPacket(a, g), n = r && await e.getKeyPacket(a, g);
					n ? (t && (n.sequenceNumber !== s.sequenceNumber || r.timestamp < t.timestamp) && (await w(), await y()), i.push(r.timestamp), k = Math.max(r.sequenceNumber, k), t = r, s = n) : (-1 !== k && (await w(), await y()), p(null), t = null);
				}
				u || this._track.input._disposed || (-1 !== k && await w(), await y()), d = !0, n();
			})().catch((e) => {
				m || (f = e, m = !0, n());
			}).finally(() => {
				h?.close();
			});
			const k = this._track, w = () => {
				for (const e of a) e?.close();
			};
			return {
				async next() {
					for (;;) {
						if (k.input._disposed) throw u = !0, w(), new Lo();
						if (u) return {
							value: void 0,
							done: !0
						};
						if (m) throw u = !0, w(), f;
						if (a.length > 0) {
							const e = a.shift();
							return c(void 0 !== e), l(), {
								value: e,
								done: !1
							};
						}
						if (d) return {
							value: void 0,
							done: !0
						};
						await s;
					}
				},
				return: async () => (u = !0, l(), n(), w(), {
					value: void 0,
					done: !0
				}),
				async throw(e) {
					throw e;
				},
				[Symbol.asyncIterator]() {
					return this;
				}
			};
		}
	};
	const go = (e) => 0 === e ? 40 : 8;
	var ko = class extends mo {
		constructor(e, t, r, i, a, s, n) {
			super(e, t), this.codec = r, this.decoderConfig = i, this.rotation = a, this.flip = s, this.timeResolution = n, this.decoder = null, this.customDecoder = null, this.customDecoderCallSerializer = new pe(), this.customDecoderQueueSize = 0, this.inputTimestamps = [], this.sampleQueue = [], this.currentPacketIndex = 0, this.raslSkipped = !1, this.alphaDecoder = null, this.alphaHadKeyframe = !1, this.colorQueue = [], this.alphaQueue = [], this.merger = null, this.decodedAlphaChunkCount = 0, this.alphaDecoderQueueSize = 0, this.nullAlphaFrameQueue = [], this.currentAlphaPacketIndex = 0, this.alphaRaslSkipped = !1, this.finalSamples = [], this.mergeAlphaPromises = [];
			const o = so.find((e) => e.supports(r, i));
			if (o) this.customDecoder = new o(), this.customDecoder.codec = r, this.customDecoder.config = i, this.customDecoder.onSample = (e) => {
				if (!(e instanceof yn)) throw new TypeError("The argument passed to onSample must be a VideoSample.");
				this.finalizeAndEmitSample(e);
			}, this.customDecoder.onError = (e) => {
				t(e);
			}, this.customDecoderCallSerializer.call(() => this.customDecoder.init()).catch((e) => t(e));
			else {
				const e = (e) => {
					if (this.alphaQueue.length > 0) {
						const t = this.alphaQueue.shift();
						c(void 0 !== t), this.mergeAlpha(e, t);
					} else this.colorQueue.push(e);
				};
				if (Te()) {
					if ("avc" === r && this.decoderConfig.description) {
						const e = wt(C(this.decoderConfig.description));
						if (e && e.sequenceParameterSets.length > 0) {
							const t = bt(e.sequenceParameterSets[0]);
							t && (0 === t.frameMbsOnlyFlag && (this.decoderConfig = {
								...this.decoderConfig,
								hardwareAcceleration: "prefer-software"
							}), 0 !== t.maxDecFrameBuffering && 1 !== t.bitstreamRestrictionFlag && (e.sequenceParameterSets[0] = vt(t), this.decoderConfig = {
								...this.decoderConfig,
								description: kt(e)
							}));
						}
					}
					U(this.decoderConfig.colorSpace) || (this.decoderConfig = {
						...this.decoderConfig,
						colorSpace: {
							primaries: this.decoderConfig.colorSpace?.primaries ?? "bt709",
							matrix: this.decoderConfig.colorSpace?.matrix ?? "bt709",
							transfer: this.decoderConfig.colorSpace?.transfer ?? "bt709",
							fullRange: this.decoderConfig.colorSpace?.fullRange ?? !1
						}
					});
				}
				const t = (/* @__PURE__ */ new Error("Decoding error")).stack;
				this.decoder = new VideoDecoder({
					output: (t) => {
						try {
							e(t);
						} catch (r) {
							this.onError(r);
						}
					},
					error: (e) => {
						e.stack = t, this.onError(e);
					}
				}), this.decoder.configure(this.decoderConfig);
			}
		}
		getDecodeQueueSize() {
			return this.customDecoder ? this.customDecoderQueueSize : (c(this.decoder), Math.max(this.decoder.decodeQueueSize, this.alphaDecoder?.decodeQueueSize ?? 0));
		}
		decode(e) {
			if ("hevc" === this.codec && this.currentPacketIndex > 0 && !this.raslSkipped) {
				if (this.hasHevcRaslPicture(e.data)) return;
				this.raslSkipped = !0;
			}
			if (this.customDecoder) this.customDecoderQueueSize++, this.customDecoderCallSerializer.call(() => this.customDecoder.decode(e)).catch((e) => this.onError(e)).finally(() => this.customDecoderQueueSize--);
			else {
				if (c(this.decoder), ke() || X(this.inputTimestamps, e.timestamp, (e) => e), Te() && 0 === this.currentPacketIndex) {
					if ("avc" === this.codec) {
						const i = [];
						let a = !1;
						for (const t of dt(e.data, this.decoderConfig)) {
							const r = ut(e.data[t.offset]);
							if (a ||= r >= 1 && r <= 5, r === nt.AUD) {
								if (a) break;
								i.length = 0;
							}
							r >= 20 && r <= 31 || i.push(e.data.subarray(t.offset, t.offset + t.length));
						}
						if (!this.decoderConfig.description) for (let e = 0; e < i.length; e++) {
							const t = i[e];
							if (ut(t[0]) !== nt.SPS) continue;
							const r = bt(t);
							r && 0 !== r.maxDecFrameBuffering && 1 !== r.bitstreamRestrictionFlag && (i[e] = vt(r));
							break;
						}
						e = new Zr((t = i, (r = this.decoderConfig).description ? pt(t, 1 + (3 & C(r.description)[4])) : mt(t)), e.type, e.timestamp, e.duration);
					} else if ("hevc" === this.codec) {
						const t = Dt(e.data, this.decoderConfig);
						t && (e = new Zr(t, e.type, e.timestamp, e.duration));
					}
				}
				this.decoder.decode(e.toEncodedVideoChunk()), this.decodeAlphaData(e);
			}
			var t, r;
			this.currentPacketIndex++;
		}
		decodeAlphaData(e) {
			if (!e.sideData.alpha) return void this.pushNullAlphaFrame();
			if (this.merger || (this.merger = new yo()), !this.alphaDecoder) {
				const e = (e) => {
					if (this.colorQueue.length > 0) {
						const t = this.colorQueue.shift();
						c(void 0 !== t), this.mergeAlpha(t, e);
					} else this.alphaQueue.push(e);
					for (this.decodedAlphaChunkCount++; this.nullAlphaFrameQueue.length > 0 && this.nullAlphaFrameQueue[0] === this.decodedAlphaChunkCount;) if (this.nullAlphaFrameQueue.shift(), this.colorQueue.length > 0) {
						const e = this.colorQueue.shift();
						c(void 0 !== e), this.mergeAlpha(e, null);
					} else this.alphaQueue.push(null);
					this.alphaDecoderQueueSize--;
				}, t = (/* @__PURE__ */ new Error("Decoding error")).stack;
				this.alphaDecoder = new VideoDecoder({
					output: (t) => {
						try {
							e(t);
						} catch (r) {
							this.onError(r);
						}
					},
					error: (e) => {
						e.stack = t, this.onError(e);
					}
				}), this.alphaDecoder.configure(this.decoderConfig);
			}
			const t = Ht(this.codec, this.decoderConfig, e.sideData.alpha);
			if (this.alphaHadKeyframe || (this.alphaHadKeyframe = "key" === t), this.alphaHadKeyframe) {
				if ("hevc" === this.codec && this.currentAlphaPacketIndex > 0 && !this.alphaRaslSkipped) {
					if (this.hasHevcRaslPicture(e.sideData.alpha)) return void this.pushNullAlphaFrame();
					this.alphaRaslSkipped = !0;
				}
				this.currentAlphaPacketIndex++, this.alphaDecoder.decode(e.alphaToEncodedVideoChunk(t ?? e.type)), this.alphaDecoderQueueSize++;
			} else this.pushNullAlphaFrame();
		}
		pushNullAlphaFrame() {
			0 === this.alphaDecoderQueueSize ? this.alphaQueue.push(null) : this.nullAlphaFrameQueue.push(this.decodedAlphaChunkCount + this.alphaDecoderQueueSize);
		}
		hasHevcRaslPicture(e) {
			for (const t of St(e, this.decoderConfig)) {
				const r = Pt(e[t.offset]);
				if (r === ot.RASL_N || r === ot.RASL_R) return !0;
			}
			return !1;
		}
		sampleHandler(e) {
			if (ke()) {
				if (this.sampleQueue.length > 0 && e.timestamp >= T(this.sampleQueue).timestamp) {
					for (const e of this.sampleQueue) this.finalizeAndEmitSample(e);
					this.sampleQueue.length = 0;
				}
				X(this.sampleQueue, e, (e) => e.timestamp);
			} else {
				const t = this.inputTimestamps.shift();
				c(void 0 !== t), e.setTimestamp(t), this.finalizeAndEmitSample(e);
			}
		}
		finalizeAndEmitSample(e) {
			e.setTimestamp(Math.round(e.timestamp * this.timeResolution) / this.timeResolution), e.setDuration(Math.round(e.duration * this.timeResolution) / this.timeResolution), e.setRotation(this.rotation), e.setFlip(this.flip), this.onSample(e);
		}
		async mergeAlpha(e, t) {
			const r = Q();
			this.mergeAlphaPromises.push(r.promise);
			const i = { sample: null };
			this.finalSamples.push(i);
			try {
				for (t ? (c(this.merger), i.sample = new yn(await this.merger.merge(e, t))) : i.sample = new yn(e); this.finalSamples.length > 0 && null !== this.finalSamples[0].sample;) {
					const e = this.finalSamples.shift();
					this.sampleHandler(e.sample);
				}
			} catch (a) {
				G(this.finalSamples, i), this.onError(a);
			} finally {
				G(this.mergeAlphaPromises, r.promise), r.resolve();
			}
		}
		async flush() {
			if (this.customDecoder ? await this.customDecoderCallSerializer.call(() => this.customDecoder.flush()) : (c(this.decoder), await Promise.all([this.decoder.flush(), this.alphaDecoder?.flush()]), await Promise.all(this.mergeAlphaPromises), this.colorQueue.forEach((e) => e.close()), this.colorQueue.length = 0, this.alphaQueue.forEach((e) => e?.close()), this.alphaQueue.length = 0, this.alphaHadKeyframe = !1, this.decodedAlphaChunkCount = 0, this.alphaDecoderQueueSize = 0, this.nullAlphaFrameQueue.length = 0, this.currentAlphaPacketIndex = 0, this.alphaRaslSkipped = !1), ke()) {
				for (const e of this.sampleQueue) this.finalizeAndEmitSample(e);
				this.sampleQueue.length = 0;
			}
			this.currentPacketIndex = 0, this.raslSkipped = !1;
		}
		close() {
			this.customDecoder ? this.customDecoderCallSerializer.call(() => this.customDecoder.close()) : (c(this.decoder), "closed" !== this.decoder.state && this.decoder.close(), this.alphaDecoder && "closed" !== this.alphaDecoder.state && this.alphaDecoder.close(), this.colorQueue.forEach((e) => e.close()), this.colorQueue.length = 0, this.alphaQueue.forEach((e) => e?.close()), this.alphaQueue.length = 0, this.merger?.close());
			for (const e of this.sampleQueue) e.close();
			this.sampleQueue.length = 0;
		}
	};
	let wo = null;
	var yo = class {
		constructor() {
			this.workers = [], this.nextWorkerIndex = 0, this.pendingRequests = /* @__PURE__ */ new Map(), this.nextRequestId = 0;
		}
		merge(e, t) {
			if (0 === this.workers.length) {
				if (!wo) {
					const e = new Blob([`(${bo.toString()})()`], { type: "application/javascript" });
					wo = URL.createObjectURL(e);
				}
				const e = re(navigator.hardwareConcurrency, 1, 4);
				for (let t = 0; t < e; t++) {
					const e = new Worker(wo);
					e.addEventListener("message", (e) => {
						const t = e.data, r = this.pendingRequests.get(t.id);
						r && (this.pendingRequests.delete(t.id), "error" in t ? r.reject(new Error(t.error)) : r.resolve(t.frame));
					}), e.addEventListener("error", (e) => {
						const t = new Error(e.message || "Color/alpha merge worker error.");
						for (const r of this.pendingRequests.values()) r.reject(t);
						this.pendingRequests.clear();
					}), this.workers.push(e);
				}
			}
			const r = this.nextRequestId++, i = Q();
			this.pendingRequests.set(r, i);
			const a = this.workers[this.nextWorkerIndex];
			return this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length, a.postMessage({
				id: r,
				color: e,
				alpha: t
			}, { transfer: [e, t] }), i.promise;
		}
		close() {
			for (const t of this.workers) t.terminate();
			this.workers.length = 0;
			const e = /* @__PURE__ */ new Error("Color/alpha merger closed.");
			for (const t of this.pendingRequests.values()) t.reject(e);
			this.pendingRequests.clear();
		}
	};
	const bo = () => {
		let e = null, t = null, r = Promise.resolve();
		self.addEventListener("message", (e) => {
			const { id: t, color: a, alpha: s } = e.data;
			r = r.then(async () => {
				try {
					const e = await i(a, s);
					self.postMessage({
						id: t,
						frame: e
					}, { transfer: [e] });
				} catch (e) {
					self.postMessage({
						id: t,
						error: e.message
					});
				} finally {
					a.close(), s.close();
				}
			});
		});
		const i = async (e, t) => {
			const r = e.format, i = t.format;
			if (!r || !i) throw new Error("CPU color/alpha merging requires a known VideoFrame format.");
			const o = r.includes("P10"), c = r.includes("P12"), l = i.includes("P10"), d = i.includes("P12");
			if (l !== o || d !== c) throw new Error(`CPU color/alpha merging requires the alpha frame to have the same bit depth as the color frame (color: '${r}', alpha: '${i}').`);
			if ("RGBX" === r || "RGBA" === r || "BGRX" === r || "BGRA" === r) return await a(e, t, r);
			if ("I420" === r || "I420P10" === r || "I420P12" === r || "I422" === r || "I422P10" === r || "I422P12" === r || "I444" === r || "I444P10" === r || "I444P12" === r) return await s(e, t, r);
			if ("NV12" === r) return await n(e, t);
			throw new Error(`CPU color/alpha merging does not support format '${r}'.`);
		}, a = async (e, t, r) => {
			const i = e.visibleRect?.width ?? e.codedWidth, a = e.visibleRect?.height ?? e.codedHeight, s = i * a, n = new Uint8Array(4 * s);
			await e.copyTo(n);
			const c = await o(t, i, a, 1);
			for (let o = 0, d = 3; o < s; o++, d += 4) n[d] = c[o];
			const l = {
				format: "RGBX" === r || "RGBA" === r ? "RGBA" : "BGRA",
				codedWidth: i,
				codedHeight: a,
				timestamp: e.timestamp,
				duration: e.duration ?? void 0,
				transfer: [n.buffer]
			};
			return new VideoFrame(n, l);
		}, s = async (e, t, r) => {
			const i = e.visibleRect?.width ?? e.codedWidth, a = e.visibleRect?.height ?? e.codedHeight, s = r.includes("P10"), n = r.includes("P12"), c = s || n ? 2 : 1;
			let l, d;
			r.startsWith("I420") ? (l = Math.ceil(i / 2), d = Math.ceil(a / 2)) : r.startsWith("I422") ? (l = Math.ceil(i / 2), d = a) : (l = i, d = a);
			const u = i * a, h = u * c, f = l * d * c, m = new Uint8Array(h + 2 * f + u * c);
			await e.copyTo(m);
			const p = await o(t, i, a, c), g = h + 2 * f;
			m.set(p, g);
			const k = {
				format: r.slice(0, 4) + "A" + r.slice(4),
				codedWidth: i,
				codedHeight: a,
				timestamp: e.timestamp,
				duration: e.duration ?? void 0,
				transfer: [m.buffer]
			};
			return new VideoFrame(m, k);
		}, n = async (e, r) => {
			const i = e.visibleRect?.width ?? e.codedWidth, a = e.visibleRect?.height ?? e.codedHeight, s = i * a, n = Math.ceil(i / 2) * Math.ceil(a / 2), c = e.allocationSize();
			t && t.byteLength === c || (t = new Uint8Array(c)), await e.copyTo(t);
			const l = new Uint8Array(s + 2 * n + s);
			l.set(t.subarray(0, s), 0);
			const d = s, u = s + n, h = s;
			for (let o = 0; o < n; o++) l[d + o] = t[h + 2 * o], l[u + o] = t[h + 2 * o + 1];
			const f = await o(r, i, a, 1);
			l.set(f, s + 2 * n);
			const m = {
				format: "I420A",
				codedWidth: i,
				codedHeight: a,
				timestamp: e.timestamp,
				duration: e.duration ?? void 0,
				transfer: [l.buffer]
			};
			return new VideoFrame(l, m);
		}, o = async (t, r, i, a) => {
			const s = t.allocationSize();
			e && e.byteLength === s || (e = new Uint8Array(s)), await t.copyTo(e);
			const n = t.format;
			if ("RGBA" === n || "BGRA" === n || "RGBX" === n || "BGRX" === n) {
				const t = "RGBA" === n || "RGBX" === n ? 0 : 2, a = r * i;
				for (let r = 0; r < a; r++) e[r] = e[4 * r + t];
				return e.subarray(0, a);
			}
			return e.subarray(0, r * i * a);
		};
	};
	var To = class extends po {
		constructor(e, t = {}) {
			if (!(e instanceof _o)) throw new TypeError("videoTrack must be an InputVideoTrack.");
			((e) => {
				if (!e || "object" != typeof e) throw new TypeError("decoderOptions must be an object.");
				if (void 0 !== e.hardwareAcceleration && ![
					"no-preference",
					"prefer-hardware",
					"prefer-software"
				].includes(e.hardwareAcceleration)) throw new TypeError("decoderOptions.hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'.");
				if (void 0 !== e.optimizeForLatency && "boolean" != typeof e.optimizeForLatency) throw new TypeError("decoderOptions.optimizeForLatency, when provided, must be a boolean.");
			})(t), super(), this._track = e, this._decoderOptions = t;
		}
		async _createDecoder(e, t) {
			if (!await this._track.canDecode()) {
				if ("undefined" == typeof VideoDecoder) throw new Error(ve("VideoDecoder"));
				throw new Error("This video track cannot be decoded in this environment. Make sure to check decodability before using a track.");
			}
			const r = await this._track.getCodec(), i = await this._track.getRotation(), a = await this._track.getFlip();
			let s = await this._track.getDecoderConfig();
			const n = await this._track.getTimeResolution();
			return c(r && s), s = {
				...s,
				hardwareAcceleration: this._decoderOptions.hardwareAcceleration,
				optimizeForLatency: this._decoderOptions.optimizeForLatency
			}, new ko(e, t, r, s, i, a, n);
		}
		_createPacketSink() {
			return new fo(this._track);
		}
		async getSample(e, t = {}) {
			uo(e);
			for await (const r of this.mediaSamplesAtTimestamps([e], t)) return r;
			throw new Error("Internal error: Iterator returned nothing.");
		}
		samples(e, t, r = {}) {
			return this.mediaSamplesInRange(e, t, r);
		}
		samplesAtTimestamps(e, t = {}) {
			return this.mediaSamplesAtTimestamps(e, t);
		}
	}, vo = class extends mo {
		constructor(e, t, r, i) {
			super(e, t), this.decoder = null, this.customDecoder = null, this.customDecoderCallSerializer = new pe(), this.customDecoderQueueSize = 0, this.currentTimestamp = null, this.expectedFirstTimestamp = null, this.timestampOffset = 0;
			const a = (t) => {
				let r = t.timestamp;
				null !== this.expectedFirstTimestamp && null === this.currentTimestamp && (this.timestampOffset = this.expectedFirstTimestamp - r), r += this.timestampOffset, (null === this.currentTimestamp || Math.abs(r - this.currentTimestamp) >= t.duration) && (this.currentTimestamp = r);
				const a = this.currentTimestamp;
				if (this.currentTimestamp += t.duration, 0 === t.numberOfFrames) return void t.close();
				const s = i.sampleRate;
				t.setTimestamp(Math.round(a * s) / s), e(t);
			}, s = no.find((e) => e.supports(r, i));
			if (s) this.customDecoder = new s(), this.customDecoder.codec = r, this.customDecoder.config = i, this.customDecoder.onSample = (e) => {
				if (!(e instanceof zn)) throw new TypeError("The argument passed to onSample must be an AudioSample.");
				a(e);
			}, this.customDecoder.onError = (e) => {
				t(e);
			}, this.customDecoderCallSerializer.call(() => this.customDecoder.init()).catch((e) => t(e));
			else {
				const e = (/* @__PURE__ */ new Error("Decoding error")).stack;
				this.decoder = new AudioDecoder({
					output: (e) => {
						try {
							a(new zn(e));
						} catch (t) {
							this.onError(t);
						}
					},
					error: (t) => {
						t.stack = e, this.onError(t);
					}
				}), this.decoder.configure(i);
			}
		}
		getDecodeQueueSize() {
			return this.customDecoder ? this.customDecoderQueueSize : (c(this.decoder), this.decoder.decodeQueueSize);
		}
		decode(e) {
			this.customDecoder ? (this.customDecoderQueueSize++, this.customDecoderCallSerializer.call(() => this.customDecoder.decode(e)).catch((e) => this.onError(e)).finally(() => this.customDecoderQueueSize--)) : (c(this.decoder), this.expectedFirstTimestamp ??= e.timestamp, this.decoder.decode(e.toEncodedAudioChunk()));
		}
		async flush() {
			this.customDecoder ? await this.customDecoderCallSerializer.call(() => this.customDecoder.flush()) : (c(this.decoder), await this.decoder.flush()), this.currentTimestamp = null, this.expectedFirstTimestamp = null, this.timestampOffset = 0;
		}
		close() {
			this.customDecoder ? this.customDecoderCallSerializer.call(() => this.customDecoder.close()) : (c(this.decoder), "closed" !== this.decoder.state && this.decoder.close());
		}
	}, So = class extends mo {
		constructor(e, t, r) {
			super(e, t), this.decoderConfig = r, this.currentTimestamp = null, c(pr.includes(r.codec)), this.codec = r.codec;
			const { dataType: i, sampleSize: a, littleEndian: s } = Fr(this.codec);
			switch (this.inputSampleSize = a, a) {
				case 1:
					"unsigned" === i ? this.readInputValue = (e, t) => e.getUint8(t) - 128 : "signed" === i ? this.readInputValue = (e, t) => e.getInt8(t) : "ulaw" === i ? this.readInputValue = (e, t) => ((e) => {
						let t = 0, r = 0, i = ~e;
						128 & i && (i &= -129, t = -1), r = 5 + ((240 & i) >> 4);
						const a = (1 << r | (15 & i) << r - 4 | 1 << r - 5) - 33;
						return (0 === t ? a : -a) << 2;
					})(e.getUint8(t)) : "alaw" === i ? this.readInputValue = (e, t) => ((e) => {
						let t = 0, r = 0, i = 85 ^ e;
						128 & i && (i &= -129, t = -1), r = 4 + ((240 & i) >> 4);
						let a = 0;
						return a = 4 !== r ? 1 << r | (15 & i) << r - 4 | 1 << r - 5 : i << 1 | 1, (0 === t ? -a : a) << 3;
					})(e.getUint8(t)) : c(!1);
					break;
				case 2:
					"unsigned" === i ? this.readInputValue = (e, t) => e.getUint16(t, s) - 32768 : "signed" === i ? this.readInputValue = (e, t) => e.getInt16(t, s) : c(!1);
					break;
				case 3:
					"unsigned" === i ? this.readInputValue = (e, t) => ee(e, t, s) - 2 ** 23 : "signed" === i ? this.readInputValue = (e, t) => ((e, t, r) => ee(e, t, r) << 8 >> 8)(e, t, s) : c(!1);
					break;
				case 4:
					"unsigned" === i ? this.readInputValue = (e, t) => e.getUint32(t, s) - 2 ** 31 : "signed" === i ? this.readInputValue = (e, t) => e.getInt32(t, s) : "float" === i ? this.readInputValue = (e, t) => e.getFloat32(t, s) : c(!1);
					break;
				case 8:
					"float" === i ? this.readInputValue = (e, t) => e.getFloat64(t, s) : c(!1);
					break;
				default: J(a), c(!1);
			}
			switch (a) {
				case 1:
					"ulaw" === i || "alaw" === i ? (this.outputSampleSize = 2, this.outputFormat = "s16", this.writeOutputValue = (e, t, r) => e.setInt16(t, r, !0)) : (this.outputSampleSize = 1, this.outputFormat = "u8", this.writeOutputValue = (e, t, r) => e.setUint8(t, r + 128));
					break;
				case 2:
					this.outputSampleSize = 2, this.outputFormat = "s16", this.writeOutputValue = (e, t, r) => e.setInt16(t, r, !0);
					break;
				case 3:
					this.outputSampleSize = 4, this.outputFormat = "s32", this.writeOutputValue = (e, t, r) => e.setInt32(t, r << 8, !0);
					break;
				case 4:
					this.outputSampleSize = 4, "float" === i ? (this.outputFormat = "f32", this.writeOutputValue = (e, t, r) => e.setFloat32(t, r, !0)) : (this.outputFormat = "s32", this.writeOutputValue = (e, t, r) => e.setInt32(t, r, !0));
					break;
				case 8:
					this.outputSampleSize = 4, this.outputFormat = "f32", this.writeOutputValue = (e, t, r) => e.setFloat32(t, r, !0);
					break;
				default: J(a), c(!1);
			}
		}
		getDecodeQueueSize() {
			return 0;
		}
		decode(e) {
			const t = E(e.data), r = e.byteLength / this.decoderConfig.numberOfChannels / this.inputSampleSize, i = r * this.decoderConfig.numberOfChannels * this.outputSampleSize, a = new ArrayBuffer(i), s = new DataView(a);
			for (let l = 0; l < r * this.decoderConfig.numberOfChannels; l++) {
				const e = l * this.inputSampleSize, r = l * this.outputSampleSize, i = this.readInputValue(t, e);
				this.writeOutputValue(s, r, i);
			}
			const n = r / this.decoderConfig.sampleRate;
			(null === this.currentTimestamp || Math.abs(e.timestamp - this.currentTimestamp) >= n) && (this.currentTimestamp = e.timestamp);
			const o = this.currentTimestamp;
			this.currentTimestamp += n;
			const c = new zn({
				format: this.outputFormat,
				data: a,
				numberOfChannels: this.decoderConfig.numberOfChannels,
				sampleRate: this.decoderConfig.sampleRate,
				numberOfFrames: r,
				timestamp: o
			});
			this.onSample(c);
		}
		async flush() {}
		close() {}
	}, Po = class extends po {
		constructor(e) {
			if (!(e instanceof Io)) throw new TypeError("audioTrack must be an InputAudioTrack.");
			super(), this._track = e;
		}
		async _createDecoder(e, t) {
			if (!await this._track.canDecode()) {
				if ("undefined" == typeof AudioDecoder) throw new Error(ve("AudioDecoder"));
				throw new Error("This audio track cannot be decoded in this environment. Make sure to check decodability before using a track.");
			}
			const r = await this._track.getCodec(), i = await this._track.getDecoderConfig();
			return c(r && i), pr.includes(i.codec) ? new So(e, t, i) : new vo(e, t, r, i);
		}
		_createPacketSink() {
			return new fo(this._track);
		}
		async getSample(e, t = {}) {
			uo(e);
			for await (const r of this.mediaSamplesAtTimestamps([e], t)) return r;
			throw new Error("Internal error: Iterator returned nothing.");
		}
		samples(e, t, r = {}) {
			return this.mediaSamplesInRange(e, t, r);
		}
		samplesAtTimestamps(e, t = {}) {
			return this.mediaSamplesAtTimestamps(e, t);
		}
	}, xo = class e {
		constructor(e, t) {
			this.input = e, this._backing = t;
		}
		isVideoTrack() {
			return this instanceof _o;
		}
		isAudioTrack() {
			return this instanceof Io;
		}
		get id() {
			return this._backing.getId();
		}
		get number() {
			return this._backing.getNumber();
		}
		async getInternalCodecId() {
			return this._backing.getInternalCodecId();
		}
		get internalCodecId() {
			return Co(this._backing.getInternalCodecId(), "internalCodecId", "getInternalCodecId");
		}
		async getLanguageCode() {
			return this._backing.getLanguageCode();
		}
		get languageCode() {
			return Co(this._backing.getLanguageCode(), "languageCode", "getLanguageCode");
		}
		async getName() {
			return this._backing.getName();
		}
		get name() {
			return Co(this._backing.getName(), "name", "getName");
		}
		async getTimeResolution() {
			return this._backing.getTimeResolution();
		}
		get timeResolution() {
			return Co(this._backing.getTimeResolution(), "timeResolution", "getTimeResolution");
		}
		async isRelativeToUnixEpoch() {
			return this._backing.isRelativeToUnixEpoch();
		}
		async getUnixTimeForTimestamp(e) {
			return this._backing.getUnixTimeForTimestamp(e);
		}
		async hasUnixTimeMapping() {
			return null !== await this._backing.getUnixTimeForTimestamp(await this.getFirstTimestamp());
		}
		async getDisposition() {
			return this._backing.getDisposition();
		}
		get disposition() {
			return Co(this._backing.getDisposition(), "disposition", "getDisposition");
		}
		async getBitrate() {
			return this._backing.getBitrate();
		}
		async getAverageBitrate() {
			return this._backing.getAverageBitrate();
		}
		async getFirstTimestamp() {
			return (await this._backing.getFirstPacket({ metadataOnly: !0 }))?.timestamp ?? 0;
		}
		async computeDuration(e) {
			const t = await this._backing.getPacket(Infinity, {
				metadataOnly: !0,
				...e
			});
			return se((t?.timestamp ?? 0) + (t?.duration ?? 0), await this.getTimeResolution());
		}
		async getDurationFromMetadata(e = {}) {
			return this._backing.getDurationFromMetadata(e);
		}
		async computePacketStats(e = Infinity, t) {
			const r = new fo(this);
			let i = Infinity, a = -Infinity, s = 0, n = 0;
			for await (const o of r.packets(void 0, void 0, {
				metadataOnly: !0,
				...t
			})) {
				if (s >= e && o.timestamp >= a) break;
				i = Math.min(i, o.timestamp), a = Math.max(a, o.timestamp + o.duration), s++, n += o.byteLength;
			}
			return {
				packetCount: s,
				averagePacketRate: s ? Number((s / (a - i)).toPrecision(16)) : 0,
				averageBitrate: s ? Number((8 * n / (a - i)).toPrecision(16)) : 0
			};
		}
		async isLive() {
			return null !== await this._backing.getLiveRefreshInterval();
		}
		async getLiveRefreshInterval() {
			return this._backing.getLiveRefreshInterval();
		}
		canBePairedWith(t) {
			if (!(t instanceof e)) throw new TypeError("other must be an InputTrack.");
			return this.input === t.input && this !== t && 0n !== (this._backing.getPairingMask() & t._backing.getPairingMask());
		}
		async getPairableTracks(e) {
			return this.input.getTracks(Fo({ filter: (e) => e.canBePairedWith(this) }, e));
		}
		async getPairableVideoTracks(e) {
			return this.input.getVideoTracks(Fo({ filter: (e) => e.canBePairedWith(this) }, e));
		}
		async getPairableAudioTracks(e) {
			return this.input.getAudioTracks(Fo({ filter: (e) => e.canBePairedWith(this) }, e));
		}
		async getPrimaryPairableVideoTrack(e) {
			return this.input.getPrimaryVideoTrack(Fo({ filter: (e) => e.canBePairedWith(this) }, e));
		}
		async getPrimaryPairableAudioTrack(e) {
			return this.input.getPrimaryAudioTrack(Fo({ filter: (e) => e.canBePairedWith(this) }, e));
		}
		async hasPairableTrack(e) {
			e &&= Eo(e);
			const t = await this.input.getTracks();
			for (const r of t) if (this.canBePairedWith(r) && (!e || await e(r))) return !0;
			return !1;
		}
		hasPairableVideoTrack(e) {
			return e &&= Eo(e), this.hasPairableTrack(async (t) => t.isVideoTrack() && (!e || await e(t)));
		}
		hasPairableAudioTrack(e) {
			return e &&= Eo(e), this.hasPairableTrack(async (t) => t.isAudioTrack() && (!e || await e(t)));
		}
	};
	const Co = (e, t, r) => {
		if (Pe(e)) throw new Error(`'${t}' is deprecated and not available synchronously for this track. Use the preferred '${r}()' instead.`);
		return e;
	}, Eo = (e) => {
		if (void 0 !== e && "function" != typeof e) throw new TypeError("predicate, when provided, must be a function.");
		return e ? (t) => {
			const r = (e) => {
				if ("boolean" != typeof e) throw new TypeError("predicate must return or resolve to a boolean value.");
				return e;
			}, i = e(t);
			return Pe(i) ? i.then(r) : r(i);
		} : void 0;
	};
	var _o = class extends xo {
		constructor(e, t) {
			super(e, t), this._pixelAspectRatioCache = null;
		}
		get type() {
			return "video";
		}
		async getCodec() {
			return this._backing.getCodec();
		}
		get codec() {
			return Co(this._backing.getCodec(), "codec", "getCodec");
		}
		async hasOnlyKeyPackets() {
			return await this._backing.getHasOnlyKeyPackets?.() ?? "prores" === await this._backing.getCodec();
		}
		async getCodedWidth() {
			return this._backing.getCodedWidth();
		}
		get codedWidth() {
			return Co(this._backing.getCodedWidth(), "codedWidth", "getCodedWidth");
		}
		async getCodedHeight() {
			return this._backing.getCodedHeight();
		}
		get codedHeight() {
			return Co(this._backing.getCodedHeight(), "codedHeight", "getCodedHeight");
		}
		async getTransformationMatrix() {
			return this._backing.getTransformationMatrix();
		}
		async getRotation() {
			return m(await this._backing.getTransformationMatrix());
		}
		get rotation() {
			return m(Co(this._backing.getTransformationMatrix(), "rotation", "getRotation"));
		}
		async getFlip() {
			return p(await this._backing.getTransformationMatrix());
		}
		async getSquarePixelWidth() {
			return this._backing.getSquarePixelWidth();
		}
		get squarePixelWidth() {
			return Co(this._backing.getSquarePixelWidth(), "squarePixelWidth", "getSquarePixelWidth");
		}
		async getSquarePixelHeight() {
			return this._backing.getSquarePixelHeight();
		}
		get squarePixelHeight() {
			return Co(this._backing.getSquarePixelHeight(), "squarePixelHeight", "getSquarePixelHeight");
		}
		async getPixelAspectRatio() {
			return this._pixelAspectRatioCache ??= Me({
				num: await this.getSquarePixelWidth() * await this.getCodedHeight(),
				den: await this.getSquarePixelHeight() * await this.getCodedWidth()
			});
		}
		get pixelAspectRatio() {
			return this._pixelAspectRatioCache ??= Me({
				num: Co(this._backing.getSquarePixelWidth(), "pixelAspectRatio", "getPixelAspectRatio") * Co(this._backing.getCodedHeight(), "pixelAspectRatio", "getPixelAspectRatio"),
				den: Co(this._backing.getSquarePixelHeight(), "pixelAspectRatio", "getPixelAspectRatio") * Co(this._backing.getCodedWidth(), "pixelAspectRatio", "getPixelAspectRatio")
			});
		}
		async getDisplayWidth() {
			const e = await this._backing.getMetadataDisplayWidth?.();
			return null != e ? e : await this.getRotation() % 180 == 0 ? this.getSquarePixelWidth() : this.getSquarePixelHeight();
		}
		get displayWidth() {
			const e = this._backing.getMetadataDisplayWidth?.();
			if (void 0 !== e) {
				const t = Co(e, "displayWidth", "getDisplayWidth");
				if (null !== t) return t;
			}
			return Co(m(Co(this._backing.getTransformationMatrix(), "displayWidth", "getDisplayWidth")) % 180 == 0 ? this._backing.getSquarePixelWidth() : this._backing.getSquarePixelHeight(), "displayWidth", "getDisplayWidth");
		}
		async getDisplayHeight() {
			const e = await this._backing.getMetadataDisplayHeight?.();
			return null != e ? e : await this.getRotation() % 180 == 0 ? this.getSquarePixelHeight() : this.getSquarePixelWidth();
		}
		get displayHeight() {
			const e = this._backing.getMetadataDisplayHeight?.();
			if (void 0 !== e) {
				const t = Co(e, "displayHeight", "getDisplayHeight");
				if (null !== t) return t;
			}
			return Co(m(Co(this._backing.getTransformationMatrix(), "displayHeight", "getDisplayHeight")) % 180 == 0 ? this._backing.getSquarePixelHeight() : this._backing.getSquarePixelWidth(), "displayHeight", "getDisplayHeight");
		}
		async getColorSpace() {
			return this._backing.getColorSpace();
		}
		async hasHighDynamicRange() {
			const e = await this._backing.getColorSpace();
			return "bt2020" === e.primaries || "smpte432" === e.primaries || "pq" === e.transfer || "hlg" === e.transfer || "bt2020-ncl" === e.matrix;
		}
		async canBeTransparent() {
			return this._backing.canBeTransparent();
		}
		async getDecoderConfig() {
			return this._backing.getDecoderConfig();
		}
		async getCodecParameterString() {
			const e = await this._backing.getMetadataCodecParameterString?.();
			return null != e ? e : (await this._backing.getDecoderConfig())?.codec ?? null;
		}
		async canDecode() {
			try {
				const e = await this._backing.getDecoderConfig();
				if (!e) return !1;
				const t = await this._backing.getCodec();
				return c(null !== t), !!so.some((r) => r.supports(t, e)) || "undefined" != typeof VideoDecoder && !0 === (await VideoDecoder.isConfigSupported(e)).supported;
			} catch (e) {
				return qe._error("Error during decodability check:", e), !1;
			}
		}
		async determinePacketType(e) {
			if (!(e instanceof Zr)) throw new TypeError("packet must be an EncodedPacket.");
			if (e.isMetadataOnly) throw new TypeError("packet must not be metadata-only to determine its type.");
			const t = await this.getCodec();
			if (null === t) return null;
			const r = await this.getDecoderConfig();
			return c(r), Ht(t, r, e.data);
		}
		async computeFrameRateMetrics(e = {}) {
			if (!e || "object" != typeof e) throw new TypeError("options must be an object.");
			if (void 0 !== e.targetPacketCount && (!Be(e.targetPacketCount) || e.targetPacketCount < 0)) throw new TypeError("options.targetPacketCount must be a non-negative number.");
			const t = await this.getTimeResolution(), r = e.targetPacketCount ?? 256, i = new fo(this), a = [];
			let s = -Infinity, n = 0;
			for await (const x of i.packets(void 0, void 0, { metadataOnly: !0 })) {
				if (a.length >= r && x.timestamp >= s) break;
				a.push(x.timestamp), s = Math.max(s, x.timestamp), n++;
			}
			const o = new Float64Array(a.length);
			for (let x = 0; x < a.length; x++) o[x] = Math.round(a[x] * t);
			o.sort();
			let c = 1;
			for (let x = 1; x < o.length; x++) o[x] !== o[c - 1] && (o[c++] = o[x]);
			if (c < 2) return {
				underlyingFrameRate: null,
				bestGuessFrameRate: t,
				minFrameRate: t,
				maxFrameRate: t,
				averageFrameRate: t,
				medianFrameRate: t,
				frameRateIsConstant: !0,
				probedPacketCount: n
			};
			const l = o.subarray(0, c), d = Do(l, t), u = d ?? t, h = null !== d ? t / d : null, f = /* @__PURE__ */ new Map();
			let m = Infinity, p = -Infinity, g = 0;
			for (let x = 1; x < c; x++) {
				const e = l[x] - l[x - 1], t = null !== h ? Math.max(1, Math.round(e / h)) : e;
				f.set(t, (f.get(t) ?? 0) + 1), m = Math.min(m, t), p = Math.max(p, t), g += t;
			}
			const k = c - 1, w = [...f.keys()].sort((e, t) => e - t), y = k - 1 >> 1, b = k >> 1;
			let T = 0, v = 0, S = 0;
			for (const x of w) if (S += f.get(x), 0 === T && S > y && (T = x), S > b) {
				v = x;
				break;
			}
			const P = (u / T + u / v) / 2;
			return {
				underlyingFrameRate: d,
				bestGuessFrameRate: null !== d ? d : zo(P),
				minFrameRate: u / p,
				maxFrameRate: u / m,
				averageFrameRate: u * k / g,
				medianFrameRate: P,
				frameRateIsConstant: null !== d && 1 === m && 1 === p,
				probedPacketCount: n
			};
		}
	}, Io = class extends xo {
		constructor(e, t) {
			super(e, t);
		}
		get type() {
			return "audio";
		}
		async getCodec() {
			return this._backing.getCodec();
		}
		get codec() {
			return Co(this._backing.getCodec(), "codec", "getCodec");
		}
		async hasOnlyKeyPackets() {
			return await this._backing.getHasOnlyKeyPackets?.() ?? !0;
		}
		async getNumberOfChannels() {
			return this._backing.getNumberOfChannels();
		}
		get numberOfChannels() {
			return Co(this._backing.getNumberOfChannels(), "numberOfChannels", "getNumberOfChannels");
		}
		async getSampleRate() {
			return this._backing.getSampleRate();
		}
		get sampleRate() {
			return Co(this._backing.getSampleRate(), "sampleRate", "getSampleRate");
		}
		async getDecoderConfig() {
			return this._backing.getDecoderConfig();
		}
		async getCodecParameterString() {
			const e = await this._backing.getMetadataCodecParameterString?.();
			return null != e ? e : (await this._backing.getDecoderConfig())?.codec ?? null;
		}
		async canDecode() {
			try {
				const e = await this._backing.getDecoderConfig();
				if (!e) return !1;
				const t = await this._backing.getCodec();
				return c(null !== t), !!no.some((r) => r.supports(t, e)) || !!pr.includes(e.codec) || "undefined" != typeof AudioDecoder && !0 === (await AudioDecoder.isConfigSupported(e)).supported;
			} catch (e) {
				return qe._error("Error during decodability check:", e), !1;
			}
		}
		async determinePacketType(e) {
			if (!(e instanceof Zr)) throw new TypeError("packet must be an EncodedPacket.");
			return null === await this.getCodec() ? null : "key";
		}
	};
	const Bo = (e) => -(e ?? -Infinity), Ao = (e) => -e, Ro = (e) => {
		if ("object" != typeof e || !e) throw new TypeError("query must be an object.");
		if (void 0 !== e.filter && "function" != typeof e.filter) throw new TypeError("query.filter, when provided, must be a function.");
		if (void 0 !== e.sortBy && "function" != typeof e.sortBy) throw new TypeError("query.sortBy, when provided, must be a function.");
		return {
			filter: e.filter ? (t) => {
				const r = (e) => {
					if ("boolean" != typeof e) throw new TypeError("query.filter must return or resolve to a boolean.");
					return e;
				}, i = e.filter(t);
				return Pe(i) ? i.then(r) : r(i);
			} : void 0,
			sortBy: e.sortBy ? (t) => {
				const r = (e) => {
					if (!("number" == typeof e || Array.isArray(e) && e.every((e) => "number" == typeof e))) throw new TypeError("query.sortBy must return or resolve to a number or an array of numbers.");
					return e;
				}, i = e.sortBy(t);
				return Pe(i) ? i.then(r) : r(i);
			} : void 0
		};
	}, Fo = (e, t) => ({
		filter: e?.filter || t?.filter ? (r) => {
			const i = e?.filter?.(r) ?? !0, a = (e) => !1 !== e && (t?.filter?.(r) ?? !0);
			return Pe(i) ? i.then(a) : a(i);
		} : void 0,
		sortBy: e?.sortBy || t?.sortBy ? (r) => {
			const i = e?.sortBy?.(r) ?? [], a = t?.sortBy?.(r) ?? [], s = (e, t) => [...Array.isArray(e) ? e : [e], ...Array.isArray(t) ? t : [t]];
			return Pe(i) || Pe(a) ? Promise.all([i, a]).then(([e, t]) => s(e, t)) : s(i, a);
		} : void 0
	}), Mo = async (e, t) => {
		let r = e;
		if (t?.filter) {
			const i = e.map((e) => t.filter(e));
			if (i.some((e) => Pe(e))) {
				const t = await Promise.all(i);
				r = e.filter((e, r) => t[r]);
			} else r = e.filter((e, t) => i[t]);
		}
		if (!t?.sortBy) return r;
		const i = r.map((e) => t.sortBy(e)), a = i.some((e) => Pe(e)) ? await Promise.all(i) : i;
		return r.map((e, t) => ({
			track: e,
			sortValue: a[t]
		})).sort((e, t) => {
			const r = Array.isArray(e.sortValue) ? e.sortValue : [e.sortValue], i = Array.isArray(t.sortValue) ? t.sortValue : [t.sortValue], a = Math.max(r.length, i.length);
			for (let s = 0; s < a; s++) {
				const e = r[s] ?? 0, t = i[s] ?? 0;
				if (e !== t) return e - t;
			}
			return 0;
		}).map((e) => e.track);
	}, Do = (e, t) => {
		const r = 1e6, i = 1.000000001, a = [
			12,
			15,
			20,
			24e3 / 1001,
			24,
			25,
			3e4 / 1001,
			30,
			48,
			50,
			6e4 / 1001,
			60,
			100,
			12e4 / 1001,
			120,
			144,
			240
		];
		if (e.length < 2) return null;
		const s = new Float64Array(e.length - 1);
		for (let T = 1; T < e.length; T++) {
			const t = e[T] - e[T - 1];
			if (!(t > 0)) return null;
			s[T - 1] = t;
		}
		const n = s.slice();
		n.sort();
		let o = n[Math.floor(.05 * n.length)];
		for (let T = 0; T < 6; T++) {
			let e = 0, t = 0;
			for (const a of s) {
				const r = Math.max(1, Math.round(a / o));
				Math.abs(a - r * o) >= i || (e += a, t += r);
			}
			if (0 === t) return null;
			const r = e / t;
			if (Math.abs(r - o) <= 1e-12 * Math.max(1, o)) {
				o = r;
				break;
			}
			o = r;
		}
		let c = 0, l = 0, d = 0;
		for (const T of s) {
			const e = Math.max(1, Math.round(T / o));
			Math.abs(T - e * o) >= i || (c++, l += T, d += e);
		}
		if (c / s.length < .98) return null;
		o = l / d;
		const u = 1 / Math.min(d, 1e3), h = Math.max(Number.EPSILON, o - u), f = o + u, m = t / f, p = t / h, g = t / o;
		let k = null, w = Infinity;
		for (const T of a) {
			if (T < m || T > p) continue;
			const e = Math.abs(T / g - 1);
			e < w && (k = T, w = e);
		}
		if (null === k) {
			const e = Oo(h, f, r), i = Oo(m, p, r);
			if (i && (!e || i.den < e.den || i.den === e.den && i.num <= e.num)) k = i.num / i.den;
			else {
				if (!e) return null;
				k = t * e.den / e.num;
			}
		}
		const y = t / k;
		let b = 0;
		for (const T of s) {
			const e = Math.max(1, Math.round(T / y));
			Math.abs(T - e * y) < i && b++;
		}
		return b / s.length < .98 ? null : k;
	}, Oo = (e, t, r) => {
		for (let i = 1; i <= r; i++) {
			const r = Math.floor(e * i) + 1;
			if (r / i < t) return Me({
				num: r,
				den: i
			});
		}
		return null;
	}, zo = (e) => {
		const t = [
			24 / 1.001,
			30 / 1.001,
			60 / 1.001,
			120 / 1.001
		], r = [
			12,
			15,
			20,
			24,
			25,
			30,
			48,
			50,
			60,
			100,
			120,
			144,
			240
		];
		for (const s of t) if (Math.abs(s / e - 1) <= 5e-4) return s;
		let i = e, a = Infinity;
		for (const s of r) {
			const t = Math.abs(s / e - 1);
			t <= .025 && t < a && (i = s, a = t);
		}
		return i;
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	Ie();
	var No = class e extends Ne {
		get disposed() {
			return this._disposed;
		}
		constructor(t) {
			if (super(), this._demuxerPromise = null, this._format = null, this._trackBackingsCache = null, this._backingToTrack = /* @__PURE__ */ new Map(), this._disposed = !1, this._nextSourceCacheAge = 0, this._sourceRefs = [], this._sourceCache = [], this._sourceCachePromises = [], this._onFormatDetermined = null, !t || "object" != typeof t) throw new TypeError("options must be an object.");
			if (!Array.isArray(t.formats) || t.formats.some((e) => !(e instanceof Ls))) throw new TypeError("options.formats must be an array of InputFormat.");
			if (!(t.source instanceof ms || t.source instanceof ps)) throw new TypeError("options.source must be a Source or SourceRef.");
			if (t.source instanceof ms && t.source._disposed) throw new TypeError("options.source must not be a disposed Source.");
			if (void 0 !== t.initInput && !(t.initInput instanceof e)) throw new TypeError("options.initInput, when provided, must be an Input.");
			void 0 !== t.formatOptions && ((e, t) => {
				if (!e || "object" != typeof e) throw new TypeError(`${t}, when provided, must be an object.`);
				if (void 0 !== e.isobmff) {
					if (!e.isobmff || "object" != typeof e.isobmff) throw new TypeError(`${t}.isobmff, when provided, must be an object.`);
					if (void 0 !== e.isobmff.resolveKeyId && "function" != typeof e.isobmff.resolveKeyId) throw new TypeError(`${t}.isobmff.resolveKeyId, when provided, must be a function.`);
				}
				if (void 0 !== e.hls) {
					if (!e.hls || "object" != typeof e.hls) throw new TypeError(`${t}.hls, when provided, must be an object.`);
					if (void 0 !== e.hls.offsetTimestampsByDateTime && "boolean" != typeof e.hls.offsetTimestampsByDateTime) throw new TypeError(`${t}.hls.offsetTimestampsByDateTime, when provided, must be a boolean.`);
				}
			})(t.formatOptions, "formatOptions"), this._formats = t.formats, this._initInput = t.initInput ?? null, this._formatOptions = t.formatOptions ?? {}, t.source instanceof ms ? this._rootRef = t.source.ref() : this._rootRef = t.source, this._sourceRefs.push(this._rootRef);
		}
		get _rootSource() {
			return this._rootRef.source;
		}
		async _getSourceUncached(e) {
			c(this._rootSource instanceof gs);
			const t = await this._rootSource._resolveRequest(e);
			return this._emit("source", {
				source: t.source,
				request: e,
				isRoot: e.isRoot
			}), t;
		}
		_getSourceCached(e, t = 1) {
			const r = this._sourceCache.find((r) => r.cacheGroup === t && ks(r.request, e));
			if (r) return r.age++, Promise.resolve(r.sourceRef.source.ref());
			const i = this._sourceCachePromises.find((r) => r.cacheGroup === t && ks(r.request, e));
			if (i) return i.promise.then((e) => e.sourceRef.source.ref());
			const a = (async () => {
				const r = await this._getSourceUncached(e);
				if (Re(this._sourceCache, (e) => e.cacheGroup === t && 1 === e.sourceRef.source._refCount) >= 4) {
					const e = Fe(this._sourceCache, (e) => e.cacheGroup === t && 1 === e.sourceRef.source._refCount ? e.age : Infinity);
					c(-1 !== e);
					const r = this._sourceCache[e];
					this._sourceCache.splice(e, 1), r.sourceRef.free(), G(this._sourceRefs, r.sourceRef);
				}
				this._sourceRefs.push(r);
				const i = this._sourceCachePromises.findIndex((t) => t.request === e);
				return c(-1 !== i), this._sourceCachePromises.splice(i, 1), {
					request: e,
					sourceRef: r,
					age: this._nextSourceCacheAge++,
					cacheGroup: t
				};
			})();
			return this._sourceCachePromises.push({
				request: e,
				cacheGroup: t,
				promise: a
			}), a.then((e) => {
				const t = e.sourceRef.source.ref();
				return this._sourceCache.push(e), t;
			});
		}
		_getDemuxer() {
			return this._demuxerPromise ??= (async () => {
				this._reader = new Wo(this._rootSource), this._emit("source", {
					source: this._rootSource,
					request: null,
					isRoot: !0
				});
				for (const e of this._formats) if (await e._canReadInput(this)) return this._format = e, this._onFormatDetermined?.(e), e._createDemuxer(this);
				throw new Uo();
			})();
		}
		get source() {
			return this._rootSource;
		}
		async getFormat() {
			return await this._getDemuxer(), c(this._format), this._format;
		}
		async canRead() {
			try {
				return await this._getDemuxer(), !0;
			} catch (e) {
				if (e instanceof Uo) return !1;
				throw e;
			}
		}
		async getFirstTimestamp(e) {
			e ??= await this.getTracks();
			const t = e.filter((e) => null !== e);
			if (0 === t.length) return 0;
			const r = await Promise.all(t.map((e) => e._backing.getFirstPacket({ metadataOnly: !0 }))), i = Math.min(...r.map((e) => e?.timestamp ?? Infinity));
			return i === Infinity ? 0 : i;
		}
		async computeDuration(e, t) {
			e ??= await this.getTracks();
			const r = e.filter((e) => null !== e);
			if (0 === r.length) return 0;
			const i = await Promise.all(r.map((e) => e.computeDuration(t)));
			return Math.max(...i);
		}
		async getDurationFromMetadata(e, t) {
			e ??= await this.getTracks();
			const r = e.filter((e) => null !== e), i = (await Promise.all(r.map((e) => e.getDurationFromMetadata(t)))).filter((e) => null !== e);
			return 0 === i.length ? null : Math.max(...i);
		}
		async getTracks(e) {
			return e &&= Ro(e), Mo((await this._getTrackBackings()).map((e) => this._wrapBackingAsTrack(e)), e);
		}
		async getVideoTracks(e) {
			return e &&= Ro(e), Mo((await this.getTracks()).filter((e) => e.isVideoTrack()), e);
		}
		async getAudioTracks(e) {
			return e &&= Ro(e), Mo((await this.getTracks()).filter((e) => e.isAudioTrack()), e);
		}
		async getPrimaryVideoTrack(e) {
			e &&= Ro(e);
			const t = Fo(e, { sortBy: async (e) => [
				Ao((await e.getDisposition()).default),
				Ao(await e.hasPairableAudioTrack()),
				Ao(!await e.hasOnlyKeyPackets()),
				Bo(await e.getBitrate())
			] });
			return (await this.getVideoTracks(t))[0] ?? null;
		}
		async getPrimaryAudioTrack(e) {
			e &&= Ro(e);
			const t = await this.getPrimaryVideoTrack(), r = Fo(e, { sortBy: async (e) => [
				Ao(!t || e.canBePairedWith(t)),
				Ao((await e.getDisposition()).default),
				Bo(await e.getBitrate())
			] });
			return (await this.getAudioTracks(r))[0] ?? null;
		}
		async _getTrackBackings() {
			const e = await this._getDemuxer();
			return this._trackBackingsCache ??= await e.getTrackBackings();
		}
		_wrapBackingAsTrack(e) {
			const t = this._backingToTrack.get(e);
			if (t) return t;
			const r = "video" === e.getType() ? new _o(this, e) : new Io(this, e);
			return this._backingToTrack.set(e, r), r;
		}
		async getMimeType() {
			return (await this._getDemuxer()).getMimeType();
		}
		async getMetadataTags() {
			return (await this._getDemuxer()).getMetadataTags();
		}
		dispose() {
			if (!this._disposed) {
				this._disposed = !0;
				for (const e of this._sourceRefs) e.free();
				this._sourceRefs.length = 0, this._demuxerPromise && this._demuxerPromise.then((e) => e.dispose()).catch(() => {});
			}
		}
		[Symbol.dispose]() {
			this.dispose();
		}
	}, Uo = class extends Error {
		constructor(e = "Input has an unsupported or unrecognizable format.") {
			super(e), this.name = "UnsupportedInputFormatError";
		}
	}, Lo = class extends Error {
		constructor(e = "Input has been disposed.") {
			super(e), this.name = "InputDisposedError";
		}
	}, Wo = class {
		constructor(e) {
			this.source = e;
		}
		get fileSize() {
			const e = this.source._getFileSize();
			if (void 0 === e) throw new Error("Reading file size too early; read required first.");
			return e;
		}
		get fileSizeNonStrict() {
			return this.source._getFileSize() ?? null;
		}
		requestSlice(e, t) {
			if (this.source._disposed) throw new Lo();
			if (e < 0) return null;
			if (null !== this.fileSizeNonStrict && e + t > this.fileSizeNonStrict) return null;
			if (0 === t) {
				const t = new Uint8Array(0);
				return new qo(t, E(t), 0, e, e);
			}
			const r = e + t, i = this.source._read(e, r, 0, hs);
			return Pe(i) ? i.then((t) => t ? new qo(t.bytes, t.view, t.offset, e, r) : null) : i ? new qo(i.bytes, i.view, i.offset, e, r) : null;
		}
		requestSliceRange(e, t, r) {
			if (this.source._disposed) throw new Lo();
			if (e < 0) return null;
			if (null !== this.fileSizeNonStrict) return this.requestSlice(e, re(this.fileSizeNonStrict - e, t, r));
			{
				const i = this.requestSlice(e, r), a = (i) => i || (c(null !== this.fileSizeNonStrict), this.requestSlice(e, re(this.fileSizeNonStrict - e, t, r)));
				return Pe(i) ? i.then(a) : a(i);
			}
		}
		requestEntireFile() {
			if (null !== this.fileSizeNonStrict) return this.requestSlice(0, this.fileSizeNonStrict);
			return (async () => {
				const e = [];
				let t = 0;
				for (;;) {
					if (1 === e.length && null !== this.fileSizeNonStrict) return this.requestSlice(0, this.fileSizeNonStrict);
					let r = this.requestSliceRange(t, 0, 1024);
					if (Pe(r) && (r = await r), !r || 0 === r.length) break;
					const i = Ho(r, r.length);
					e.push(i), t += r.length;
				}
				const r = new Uint8Array(t);
				let i = 0;
				for (const a of e) r.set(a, i), i += a.length;
				return new qo(r, E(r), 0, 0, t);
			})();
		}
	}, qo = class e {
		constructor(e, t, r, i, a) {
			this.bytes = e, this.view = t, this.offset = r, this.start = i, this.end = a, this.bufferPos = i - r;
		}
		static tempFromBytes(t) {
			return new e(t, E(t), 0, 0, t.length);
		}
		get length() {
			return this.end - this.start;
		}
		get filePos() {
			return this.offset + this.bufferPos;
		}
		set filePos(e) {
			this.bufferPos = e - this.offset;
		}
		get remainingLength() {
			return Math.max(this.end - this.filePos, 0);
		}
		skip(e) {
			this.bufferPos += e;
		}
		slice(t, r = this.end - t) {
			if (t < this.start || t + r > this.end) throw new RangeError("Slicing outside of original slice.");
			return new e(this.bytes, this.view, this.offset, t, t + r);
		}
	};
	const Vo = (e, t) => {
		if (e.filePos < e.start || e.filePos + t > e.end) throw new RangeError(`Tried reading [${e.filePos}, ${e.filePos + t}), but slice is [${e.start}, ${e.end}). This is likely an internal error, please report it alongside the file that caused it.`);
	}, Ho = (e, t) => {
		Vo(e, t);
		const r = e.bytes.subarray(e.bufferPos, e.bufferPos + t);
		return e.bufferPos += t, r;
	}, jo = (e) => (Vo(e, 1), e.view.getUint8(e.bufferPos++)), $o = (e, t) => {
		Vo(e, 2);
		const r = e.view.getUint16(e.bufferPos, t);
		return e.bufferPos += 2, r;
	}, Ko = (e) => {
		Vo(e, 2);
		const t = e.view.getUint16(e.bufferPos, !1);
		return e.bufferPos += 2, t;
	}, Xo = (e) => {
		Vo(e, 3);
		const t = ee(e.view, e.bufferPos, !1);
		return e.bufferPos += 3, t;
	}, Qo = (e) => {
		Vo(e, 2);
		const t = e.view.getInt16(e.bufferPos, !1);
		return e.bufferPos += 2, t;
	}, Go = (e, t) => {
		Vo(e, 4);
		const r = e.view.getUint32(e.bufferPos, t);
		return e.bufferPos += 4, r;
	}, Yo = (e) => {
		Vo(e, 4);
		const t = e.view.getUint32(e.bufferPos, !1);
		return e.bufferPos += 4, t;
	}, Zo = (e) => {
		Vo(e, 4);
		const t = e.view.getUint32(e.bufferPos, !0);
		return e.bufferPos += 4, t;
	}, Jo = (e) => {
		Vo(e, 4);
		const t = e.view.getInt32(e.bufferPos, !1);
		return e.bufferPos += 4, t;
	}, ec = (e, t) => {
		let r, i;
		return t ? (r = Go(e, !0), i = Go(e, !0)) : (i = Go(e, !1), r = Go(e, !1)), 4294967296 * i + r;
	}, tc = (e) => 4294967296 * Yo(e) + Yo(e), rc = (e) => 4294967296 * Jo(e) + Yo(e), ic = (e) => {
		const t = Zo(e);
		return 4294967296 * ((e) => {
			Vo(e, 4);
			const t = e.view.getInt32(e.bufferPos, !0);
			return e.bufferPos += 4, t;
		})(e) + t;
	}, ac = (e) => {
		Vo(e, 4);
		const t = e.view.getFloat32(e.bufferPos, !1);
		return e.bufferPos += 4, t;
	}, sc = (e) => {
		Vo(e, 8);
		const t = e.view.getFloat64(e.bufferPos, !1);
		return e.bufferPos += 8, t;
	}, nc = (e, t) => {
		Vo(e, t);
		let r = "";
		for (let i = 0; i < t; i++) r += String.fromCharCode(e.bytes[e.bufferPos++]);
		return r;
	}, oc = (e, t, r) => B.decode(Ho(e, t)).split("\n").map((e) => e.trim()).filter((e) => e.length > 0 && !r?.ignore?.(e));
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var cc, lc;
	(function(e) {
		e[e.Unsynchronisation = 128] = "Unsynchronisation", e[e.ExtendedHeader = 64] = "ExtendedHeader", e[e.ExperimentalIndicator = 32] = "ExperimentalIndicator", e[e.Footer = 16] = "Footer";
	})(cc || (cc = {})), function(e) {
		e[e.ISO_8859_1 = 0] = "ISO_8859_1", e[e.UTF_16_WITH_BOM = 1] = "UTF_16_WITH_BOM", e[e.UTF_16_BE_NO_BOM = 2] = "UTF_16_BE_NO_BOM", e[e.UTF_8 = 3] = "UTF_8";
	}(lc || (lc = {}));
	const dc = [
		"Blues",
		"Classic rock",
		"Country",
		"Dance",
		"Disco",
		"Funk",
		"Grunge",
		"Hip-hop",
		"Jazz",
		"Metal",
		"New age",
		"Oldies",
		"Other",
		"Pop",
		"Rhythm and blues",
		"Rap",
		"Reggae",
		"Rock",
		"Techno",
		"Industrial",
		"Alternative",
		"Ska",
		"Death metal",
		"Pranks",
		"Soundtrack",
		"Euro-techno",
		"Ambient",
		"Trip-hop",
		"Vocal",
		"Jazz & funk",
		"Fusion",
		"Trance",
		"Classical",
		"Instrumental",
		"Acid",
		"House",
		"Game",
		"Sound clip",
		"Gospel",
		"Noise",
		"Alternative rock",
		"Bass",
		"Soul",
		"Punk",
		"Space",
		"Meditative",
		"Instrumental pop",
		"Instrumental rock",
		"Ethnic",
		"Gothic",
		"Darkwave",
		"Techno-industrial",
		"Electronic",
		"Pop-folk",
		"Eurodance",
		"Dream",
		"Southern rock",
		"Comedy",
		"Cult",
		"Gangsta",
		"Top 40",
		"Christian rap",
		"Pop/funk",
		"Jungle music",
		"Native US",
		"Cabaret",
		"New wave",
		"Psychedelic",
		"Rave",
		"Showtunes",
		"Trailer",
		"Lo-fi",
		"Tribal",
		"Acid punk",
		"Acid jazz",
		"Polka",
		"Retro",
		"Musical",
		"Rock 'n' roll",
		"Hard rock",
		"Folk",
		"Folk rock",
		"National folk",
		"Swing",
		"Fast fusion",
		"Bebop",
		"Latin",
		"Revival",
		"Celtic",
		"Bluegrass",
		"Avantgarde",
		"Gothic rock",
		"Progressive rock",
		"Psychedelic rock",
		"Symphonic rock",
		"Slow rock",
		"Big band",
		"Chorus",
		"Easy listening",
		"Acoustic",
		"Humour",
		"Speech",
		"Chanson",
		"Opera",
		"Chamber music",
		"Sonata",
		"Symphony",
		"Booty bass",
		"Primus",
		"Porn groove",
		"Satire",
		"Slow jam",
		"Club",
		"Tango",
		"Samba",
		"Folklore",
		"Ballad",
		"Power ballad",
		"Rhythmic Soul",
		"Freestyle",
		"Duet",
		"Punk rock",
		"Drum solo",
		"A cappella",
		"Euro-house",
		"Dance hall",
		"Goa music",
		"Drum & bass",
		"Club-house",
		"Hardcore techno",
		"Terror",
		"Indie",
		"Britpop",
		"Negerpunk",
		"Polsk punk",
		"Beat",
		"Christian gangsta rap",
		"Heavy metal",
		"Black metal",
		"Crossover",
		"Contemporary Christian",
		"Christian rock",
		"Merengue",
		"Salsa",
		"Thrash metal",
		"Anime",
		"Jpop",
		"Synthpop",
		"Christmas",
		"Art rock",
		"Baroque",
		"Bhangra",
		"Big beat",
		"Breakbeat",
		"Chillout",
		"Downtempo",
		"Dub",
		"EBM",
		"Eclectic",
		"Electro",
		"Electroclash",
		"Emo",
		"Experimental",
		"Garage",
		"Global",
		"IDM",
		"Illbient",
		"Industro-Goth",
		"Jam Band",
		"Krautrock",
		"Leftfield",
		"Lounge",
		"Math rock",
		"New romantic",
		"Nu-breakz",
		"Post-punk",
		"Post-rock",
		"Psytrance",
		"Shoegaze",
		"Space rock",
		"Trop rock",
		"World music",
		"Neoclassical",
		"Audiobook",
		"Audio theatre",
		"Neue Deutsche Welle",
		"Podcast",
		"Indie rock",
		"G-Funk",
		"Dubstep",
		"Garage rock",
		"Psybient"
	], uc = (e, t) => {
		const r = e.filePos;
		t.raw ??= {}, t.raw.TAG ??= Ho(e, 125), e.filePos = r;
		const i = hc(e, 30);
		i && (t.title ??= i);
		const a = hc(e, 30);
		a && (t.artist ??= a);
		const s = hc(e, 30);
		s && (t.album ??= s);
		const n = hc(e, 4), o = Number.parseInt(n, 10);
		Number.isInteger(o) && o > 0 && (t.date ??= new Date(String(o)));
		const c = Ho(e, 30);
		let l;
		if (0 === c[28] && 0 !== c[29]) {
			const r = c[29];
			r > 0 && (t.trackNumber ??= r), e.skip(-30), l = hc(e, 28), e.skip(2);
		} else e.skip(-30), l = hc(e, 30);
		l && (t.comment ??= l);
		const d = jo(e);
		d < dc.length && (t.genre ??= dc[d]);
	}, hc = (e, t) => {
		const r = Ho(e, t), i = xe(r.indexOf(0), r.length), a = r.subarray(0, i);
		let s = "";
		for (let n = 0; n < a.length; n++) s += String.fromCharCode(a[n]);
		return s.trimEnd();
	}, fc = (e) => {
		const t = e.filePos, r = nc(e, 3), i = jo(e), a = jo(e), s = jo(e), n = Yo(e);
		if ("ID3" !== r || 255 === i || 255 === a || 2155905152 & n) return e.filePos = t, null;
		let o = Kr(n);
		return s & cc.Footer && (o += 10), {
			majorVersion: i,
			revision: a,
			flags: s,
			size: o
		};
	}, mc = (e, t, r) => {
		if (![
			2,
			3,
			4
		].includes(t.majorVersion)) return void qe._warn(`Unsupported ID3v2 major version: ${t.majorVersion}`);
		const i = new pc(t, Ho(e, t.flags & cc.Footer ? t.size - 10 : t.size));
		if (t.flags & cc.Unsynchronisation && 3 === t.majorVersion && i.ununsynchronizeAll(), t.flags & cc.ExtendedHeader) {
			const e = i.readU32();
			3 === t.majorVersion ? i.pos += e : i.pos += e - 4;
		}
		for (; i.pos <= i.bytes.length - i.frameHeaderSize();) {
			const e = i.readId3V2Frame();
			if (!e) break;
			const a = i.pos, s = i.pos + e.size;
			let n = !1, o = !1, c = !1;
			if (3 === t.majorVersion ? (n = !!(64 & e.flags), o = !!(128 & e.flags)) : 4 === t.majorVersion && (n = !!(4 & e.flags), o = !!(8 & e.flags), c = !!(2 & e.flags) || !!(t.flags & cc.Unsynchronisation)), n) qe._warn(`Skipping encrypted ID3v2 frame ${e.id}`), i.pos = s;
			else if (o) qe._warn(`Skipping compressed ID3v2 frame ${e.id}`), i.pos = s;
			else {
				if (c && i.ununsynchronizeRegion(i.pos, s), r.raw ??= {}, "TXXX" === e.id) {
					const e = r.raw.TXXX ??= {}, t = i.readId3V2TextEncoding(), a = i.readId3V2Text(t, s), n = i.readId3V2Text(t, s);
					e[a] ??= n;
				} else "T" === e.id[0] ? r.raw[e.id] ??= i.readId3V2EncodingAndText(s) : r.raw[e.id] ??= i.readBytes(e.size);
				switch (i.pos = a, e.id) {
					case "TIT2":
					case "TT2":
						r.title ??= i.readId3V2EncodingAndText(s);
						break;
					case "TIT3":
					case "TT3":
						r.description ??= i.readId3V2EncodingAndText(s);
						break;
					case "TPE1":
					case "TP1":
						r.artist ??= i.readId3V2EncodingAndText(s);
						break;
					case "TALB":
					case "TAL":
						r.album ??= i.readId3V2EncodingAndText(s);
						break;
					case "TPE2":
					case "TP2":
						r.albumArtist ??= i.readId3V2EncodingAndText(s);
						break;
					case "TRCK":
					case "TRK":
						{
							const e = i.readId3V2EncodingAndText(s).split("/"), t = Number.parseInt(e[0], 10), a = e[1] && Number.parseInt(e[1], 10);
							Number.isInteger(t) && t > 0 && (r.trackNumber ??= t), a && Number.isInteger(a) && a > 0 && (r.tracksTotal ??= a);
						}
						break;
					case "TPOS":
					case "TPA":
						{
							const e = i.readId3V2EncodingAndText(s).split("/"), t = Number.parseInt(e[0], 10), a = e[1] && Number.parseInt(e[1], 10);
							Number.isInteger(t) && t > 0 && (r.discNumber ??= t), a && Number.isInteger(a) && a > 0 && (r.discsTotal ??= a);
						}
						break;
					case "TCON":
					case "TCO":
						{
							const e = i.readId3V2EncodingAndText(s);
							let t = /^\((\d+)\)/.exec(e);
							if (t) {
								const e = Number.parseInt(t[1]);
								if (void 0 !== dc[e]) {
									r.genre ??= dc[e];
									break;
								}
							}
							if (t = /^\d+$/.exec(e), t) {
								const e = Number.parseInt(t[0]);
								if (void 0 !== dc[e]) {
									r.genre ??= dc[e];
									break;
								}
							}
							r.genre ??= e;
						}
						break;
					case "TDRC":
					case "TDAT":
						{
							const e = i.readId3V2EncodingAndText(s), t = new Date(e);
							Number.isNaN(t.getTime()) || (r.date ??= t);
						}
						break;
					case "TYER":
					case "TYE":
						{
							const e = i.readId3V2EncodingAndText(s), t = Number.parseInt(e, 10);
							Number.isInteger(t) && (r.date ??= new Date(String(t)));
						}
						break;
					case "TBPM":
					case "TBP":
						{
							const e = i.readId3V2EncodingAndText(s), t = Number.parseInt(e, 10);
							Number.isInteger(t) && (r.beatsPerMinute ??= t);
						}
						break;
					case "USLT":
					case "ULT":
						{
							const e = i.readU8();
							i.pos += 3, i.readId3V2Text(e, s), r.lyrics ??= i.readId3V2Text(e, s);
						}
						break;
					case "COMM":
					case "COM":
						{
							const e = i.readU8();
							i.pos += 3, i.readId3V2Text(e, s), r.comment ??= i.readId3V2Text(e, s);
						}
						break;
					case "APIC":
					case "PIC":
						{
							const e = i.readId3V2TextEncoding();
							let a;
							if (2 === t.majorVersion) {
								const e = i.readAscii(3);
								a = "PNG" === e ? "image/png" : "JPG" === e ? "image/jpeg" : "image/*";
							} else a = i.readId3V2Text(e, s);
							const n = i.readU8(), o = i.readId3V2Text(e, s).trimEnd(), c = s - i.pos;
							if (c >= 0) {
								const e = i.readBytes(c);
								r.images || (r.images = []), r.images.push({
									data: e,
									mimeType: a,
									kind: 3 === n ? "coverFront" : 4 === n ? "coverBack" : "unknown",
									description: o
								});
							}
						}
						break;
					default: i.pos += e.size;
				}
				i.pos = s;
			}
		}
	};
	var pc = class {
		constructor(e, t) {
			this.header = e, this.bytes = t, this.pos = 0, this.view = new DataView(t.buffer, t.byteOffset, t.byteLength);
		}
		frameHeaderSize() {
			return 2 === this.header.majorVersion ? 6 : 10;
		}
		ununsynchronizeAll() {
			const e = [];
			for (let t = 0; t < this.bytes.length; t++) {
				const r = this.bytes[t];
				e.push(r), 255 === r && t !== this.bytes.length - 1 && 0 === this.bytes[t] && t++;
			}
			this.bytes = new Uint8Array(e), this.view = new DataView(this.bytes.buffer);
		}
		ununsynchronizeRegion(e, t) {
			const r = [];
			for (let s = e; s < t; s++) {
				const e = this.bytes[s];
				r.push(e), 255 === e && s !== t - 1 && 0 === this.bytes[s + 1] && s++;
			}
			const i = this.bytes.subarray(0, e), a = this.bytes.subarray(t);
			this.bytes = new Uint8Array(i.length + r.length + a.length), this.bytes.set(i, 0), this.bytes.set(r, i.length), this.bytes.set(a, i.length + r.length), this.view = new DataView(this.bytes.buffer);
		}
		readBytes(e) {
			const t = this.bytes.subarray(this.pos, this.pos + e);
			return this.pos += e, t;
		}
		readU8() {
			const e = this.view.getUint8(this.pos);
			return this.pos += 1, e;
		}
		readU16() {
			const e = this.view.getUint16(this.pos, !1);
			return this.pos += 2, e;
		}
		readU24() {
			const e = this.view.getUint16(this.pos, !1), t = this.view.getUint8(this.pos + 2);
			return this.pos += 3, 256 * e + t;
		}
		readU32() {
			const e = this.view.getUint32(this.pos, !1);
			return this.pos += 4, e;
		}
		readAscii(e) {
			let t = "";
			for (let r = 0; r < e; r++) t += String.fromCharCode(this.view.getUint8(this.pos + r));
			return this.pos += e, t;
		}
		readId3V2Frame() {
			if (2 === this.header.majorVersion) {
				const e = this.readAscii(3);
				return "\0\0\0" === e ? null : {
					id: e,
					size: this.readU24(),
					flags: 0
				};
			}
			{
				const e = this.readAscii(4);
				if ("\0\0\0\0" === e) return null;
				const t = this.readU32();
				let r = 4 === this.header.majorVersion ? Kr(t) : t;
				const i = this.readU16(), a = this.pos, s = (e) => {
					const t = this.pos + e;
					if (t > this.bytes.length) return !1;
					if (t <= this.bytes.length - this.frameHeaderSize()) {
						this.pos += e;
						const t = this.readAscii(4);
						if ("\0\0\0\0" !== t && !/[0-9A-Z]{4}/.test(t)) return !1;
					}
					return !0;
				};
				if (!s(r)) {
					const e = 4 === this.header.majorVersion ? t : Kr(t);
					s(e) && (r = e);
				}
				return this.pos = a, {
					id: e,
					size: r,
					flags: i
				};
			}
		}
		readId3V2TextEncoding() {
			const e = this.readU8();
			if (e > 3) throw new Error(`Unsupported text encoding: ${e}`);
			return e;
		}
		readId3V2Text(e, t) {
			const r = this.pos, i = this.readBytes(t - this.pos);
			switch (e) {
				case lc.ISO_8859_1: {
					let e = "";
					for (let t = 0; t < i.length; t++) {
						const a = i[t];
						if (0 === a) {
							this.pos = r + t + 1;
							break;
						}
						e += String.fromCharCode(a);
					}
					return e;
				}
				case lc.UTF_16_WITH_BOM:
					if (255 === i[0] && 254 === i[1]) {
						const e = new I("utf-16le"), t = xe(i.findIndex((e, t) => 0 === e && 0 === i[t + 1] && t % 2 == 0), i.length);
						return this.pos = r + Math.min(t + 2, i.length), e.decode(i.subarray(2, t));
					}
					if (254 === i[0] && 255 === i[1]) {
						const e = new I("utf-16be"), t = xe(i.findIndex((e, t) => 0 === e && 0 === i[t + 1] && t % 2 == 0), i.length);
						return this.pos = r + Math.min(t + 2, i.length), e.decode(i.subarray(2, t));
					}
					{
						const e = xe(i.findIndex((e) => 0 === e), i.length);
						return this.pos = r + Math.min(e + 1, i.length), B.decode(i.subarray(0, e));
					}
				case lc.UTF_16_BE_NO_BOM: {
					const e = new I("utf-16be"), t = xe(i.findIndex((e, t) => 0 === e && 0 === i[t + 1] && t % 2 == 0), i.length);
					return this.pos = r + Math.min(t + 2, i.length), e.decode(i.subarray(0, t));
				}
				case lc.UTF_8: {
					const e = xe(i.findIndex((e) => 0 === e), i.length);
					return this.pos = r + Math.min(e + 1, i.length), B.decode(i.subarray(0, e));
				}
			}
		}
		readId3V2EncodingAndText(e) {
			if (this.pos >= e) return "";
			const t = this.readId3V2TextEncoding();
			return this.readId3V2Text(t, e);
		}
	}, gc = class {
		constructor(e) {
			this.mutex = new q(), this.trackTimestampInfo = /* @__PURE__ */ new WeakMap(), this.output = e;
		}
		onTrackClose(e) {}
		validateTimestamp(e, t, r) {
			let i = this.trackTimestampInfo.get(e);
			if (i) {
				if (r && (i.maxTimestampBeforeLastKeyPacket = i.maxTimestamp), null !== i.maxTimestampBeforeLastKeyPacket && t < i.maxTimestampBeforeLastKeyPacket) throw new Error(`Timestamps cannot be smaller than the largest timestamp of the previous GOP (a GOP begins with a key packet and ends right before the next key packet). Got ${t}s, but largest timestamp is ${i.maxTimestampBeforeLastKeyPacket}s.`);
				i.maxTimestamp = Math.max(i.maxTimestamp, t);
			} else {
				if (!r) throw new Error("First packet must be a key packet.");
				i = {
					maxTimestamp: t,
					maxTimestampBeforeLastKeyPacket: null
				}, this.trackTimestampInfo.set(e, i);
			}
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	const kc = /<(?:(\d{2}):)?(\d{2}):(\d{2}).(\d{3})>/g, wc = (e) => {
		const t = Math.floor(e / 36e5), r = Math.floor(e % 36e5 / 6e4), i = Math.floor(e % 6e4 / 1e3), a = e % 1e3;
		return t.toString().padStart(2, "0") + ":" + r.toString().padStart(2, "0") + ":" + i.toString().padStart(2, "0") + "." + a.toString().padStart(3, "0");
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var yc = class {
		constructor(e) {
			this.writer = e, this.helper = new Uint8Array(8), this.helperView = new DataView(this.helper.buffer), this.offsets = /* @__PURE__ */ new WeakMap();
		}
		writeU32(e) {
			this.helperView.setUint32(0, e, !1), this.writer.write(this.helper.subarray(0, 4));
		}
		writeU64(e) {
			this.helperView.setUint32(0, Math.floor(e / 2 ** 32), !1), this.helperView.setUint32(4, e, !1), this.writer.write(this.helper.subarray(0, 8));
		}
		writeAscii(e) {
			for (let t = 0; t < e.length; t++) this.helperView.setUint8(t % 8, e.charCodeAt(t)), t % 8 == 7 && this.writer.write(this.helper);
			e.length % 8 != 0 && this.writer.write(this.helper.subarray(0, e.length % 8));
		}
		writeBox(e) {
			if (this.offsets.set(e, this.writer.getPos()), e.contents && !e.children) this.writeBoxHeader(e, e.size ?? e.contents.byteLength + 8), this.writer.write(e.contents);
			else {
				const t = this.writer.getPos();
				if (this.writeBoxHeader(e, 0), e.contents && this.writer.write(e.contents), e.children) for (const a of e.children) a && this.writeBox(a);
				const r = this.writer.getPos(), i = e.size ?? r - t;
				this.writer.seek(t), this.writeBoxHeader(e, i), this.writer.seek(r);
			}
		}
		writeBoxHeader(e, t) {
			this.writeU32(e.largeSize ? 1 : t), this.writeAscii(e.type), e.largeSize && this.writeU64(t);
		}
		measureBoxHeader(e) {
			return 8 + (e.largeSize ? 8 : 0);
		}
		patchBox(e) {
			const t = this.offsets.get(e);
			c(void 0 !== t);
			const r = this.writer.getPos();
			this.writer.seek(t), this.writeBox(e), this.writer.seek(r);
		}
		measureBox(e) {
			if (e.contents && !e.children) return this.measureBoxHeader(e) + e.contents.byteLength;
			{
				let t = this.measureBoxHeader(e);
				if (e.contents && (t += e.contents.byteLength), e.children) for (const r of e.children) r && (t += this.measureBox(r));
				return t;
			}
		}
	};
	const bc = new Uint8Array(8), Tc = new DataView(bc.buffer), vc = (e) => [(e % 256 + 256) % 256], Sc = (e) => (Tc.setUint16(0, e, !1), [bc[0], bc[1]]), Pc = (e) => (Tc.setInt16(0, e, !1), [bc[0], bc[1]]), xc = (e) => (Tc.setUint32(0, e, !1), [
		bc[1],
		bc[2],
		bc[3]
	]), Cc = (e) => (Tc.setUint32(0, e, !1), [
		bc[0],
		bc[1],
		bc[2],
		bc[3]
	]), Ec = (e) => (Tc.setInt32(0, e, !1), [
		bc[0],
		bc[1],
		bc[2],
		bc[3]
	]), _c = (e) => (Tc.setUint32(0, Math.floor(e / 2 ** 32), !1), Tc.setUint32(4, e, !1), [
		bc[0],
		bc[1],
		bc[2],
		bc[3],
		bc[4],
		bc[5],
		bc[6],
		bc[7]
	]), Ic = (e) => (Tc.setInt32(0, Math.floor(e / 2 ** 32), !1), Tc.setUint32(4, e, !1), [
		bc[0],
		bc[1],
		bc[2],
		bc[3],
		bc[4],
		bc[5],
		bc[6],
		bc[7]
	]), Bc = (e) => (Tc.setInt16(0, 256 * e, !1), [bc[0], bc[1]]), Ac = (e) => (Tc.setInt32(0, 65536 * e, !1), [
		bc[0],
		bc[1],
		bc[2],
		bc[3]
	]), Rc = (e) => (Tc.setInt32(0, 2 ** 30 * e, !1), [
		bc[0],
		bc[1],
		bc[2],
		bc[3]
	]), Fc = (e, t) => {
		const r = [];
		let i = e;
		do {
			let e = 127 & i;
			i >>= 7, r.length > 0 && (e |= 128), r.push(e), void 0 !== t && t--;
		} while (i > 0 || t);
		return r.reverse();
	}, Mc = (e, t = !1) => {
		const r = Array(e.length).fill(null).map((t, r) => e.charCodeAt(r));
		return t && r.push(0), r;
	}, Dc = (e) => [
		Ac(e[0]),
		Ac(e[1]),
		Rc(e[2]),
		Ac(e[3]),
		Ac(e[4]),
		Rc(e[5]),
		Ac(e[6]),
		Ac(e[7]),
		Rc(e[8])
	], Oc = (e, t, r) => ({
		type: e,
		contents: t && new Uint8Array(t.flat(10)),
		children: r
	}), zc = (e, t, r, i, a) => Oc(e, [
		vc(t),
		xc(r),
		i ?? []
	], a), Nc = () => Oc("styp", [
		Mc("iso5"),
		Cc(0),
		Mc("iso5"),
		Mc("iso6"),
		Mc("mp41"),
		Mc("cmfc"),
		Mc("dash")
	]), Uc = (e, t) => {
		const r = Math.max(0, e.minWrittenTimestamp);
		let i = Math.max(0, e.maxWrittenEndTimestamp - r);
		return Number.isFinite(i) || (i = 0), zc("sidx", 1, 0, [
			Cc(1),
			Cc(hd),
			_c(md(r, hd)),
			_c(0),
			Sc(0),
			Sc(1),
			Cc(2147483647 & t),
			Cc(md(i, hd)),
			Cc(0)
		]);
	}, Lc = (e) => ({
		type: "mdat",
		largeSize: e
	}), Wc = (e) => Oc("moov", void 0, [
		qc(e.creationTime, e.trackDatas),
		...e.trackDatas.map((t) => Vc(t, e.creationTime)),
		e.isFragmented ? _l(e.trackDatas) : null,
		ql(e)
	]), qc = (e, t) => {
		const r = Math.max(0, ...t.map((e) => Math.max(0, md(pd(e), hd) + md(e.startTimestampOffset ?? 0, hd)))), i = Math.max(0, ...t.map((e) => e.track.id)) + 1, a = !v(e) || !v(r), s = a ? _c : Cc;
		return zc("mvhd", +a, 0, [
			s(e),
			s(e),
			Cc(hd),
			s(r),
			Ac(1),
			Bc(1),
			Array(10).fill(0),
			Dc(h),
			Array(24).fill(0),
			Cc(i)
		]);
	}, Vc = (e, t) => {
		const r = fd(e), i = null !== e.startTimestampOffset && 0 !== e.startTimestampOffset;
		return Oc("trak", void 0, [
			Hc(e, t),
			i ? jc(e) : null,
			$c(e, t),
			void 0 !== r.name ? Oc("udta", void 0, [Oc("name", [...A.encode(r.name)])]) : null
		]);
	}, Hc = (e, t) => {
		const r = Math.max(0, md(pd(e), hd) + md(e.startTimestampOffset ?? 0, hd)), i = !v(t) || !v(r), a = i ? _c : Cc;
		let s;
		if ("video" === e.type && e.track.metadata.transformationMatrix) s = e.track.metadata.transformationMatrix;
		else if ("video" === e.type) {
			const { rotation: t, flip: r } = e.track.metadata;
			s = f(y(g(t ?? 0), w(r ? -1 : 1, 1)), e.info.width, e.info.height);
		} else s = h;
		let n = 2;
		!1 !== e.track.metadata.disposition?.default && (n |= 1);
		const o = "video" === e.type ? 0 : "audio" === e.type ? 1 : "subtitle" === e.type ? 2 : J(e);
		return zc("tkhd", +i, n, [
			a(t),
			a(t),
			Cc(e.track.id),
			Cc(0),
			a(r),
			Array(8).fill(0),
			Sc(0),
			Sc(o),
			Bc("audio" === e.type ? 1 : 0),
			Sc(0),
			Dc(s),
			Ac("video" === e.type ? e.info.width : 0),
			Ac("video" === e.type ? e.info.height : 0)
		]);
	}, jc = (e) => {
		const t = e.startTimestampOffset;
		if (c(null !== t), t > 0) {
			const r = md(t, hd), i = md(pd(e), hd), a = !v(r) || !v(i), s = a ? _c : Cc, n = a ? Ic : Ec;
			return Oc("edts", void 0, [zc("elst", a ? 1 : 0, 0, [
				Cc(2),
				s(r),
				n(-1),
				Ac(1),
				s(i),
				n(0),
				Ac(1)
			])]);
		}
		{
			const i = md(-t, e.timescale), a = Math.max(0, md(pd(e), hd) + md(t, hd)), s = !(r = i, r >= -(2 ** 31) && r < 2 ** 31 && v(a)), n = s ? _c : Cc, o = s ? Ic : Ec;
			return Oc("edts", void 0, [zc("elst", s ? 1 : 0, 0, [
				Cc(1),
				n(a),
				o(i),
				Ac(1)
			])]);
		}
		var r;
	}, $c = (e, t) => Oc("mdia", void 0, [
		Kc(e, t),
		Gc(!0, Xc[e.type], Qc[e.type]),
		Yc(e)
	]), Kc = (e, t) => {
		const r = md(pd(e), e.timescale), i = !v(t) || !v(r), a = i ? _c : Cc;
		return zc("mdhd", +i, 0, [
			a(t),
			a(t),
			Cc(e.timescale),
			a(r),
			Sc(rd(e.track.metadata.languageCode ?? "und")),
			Sc(0)
		]);
	}, Xc = {
		video: "vide",
		audio: "soun",
		subtitle: "text"
	}, Qc = {
		video: "MediabunnyVideoHandler",
		audio: "MediabunnySoundHandler",
		subtitle: "MediabunnyTextHandler"
	}, Gc = (e, t, r, i = "\0\0\0\0") => zc("hdlr", 0, 0, [
		e ? Mc("mhlr") : Cc(0),
		Mc(t),
		Mc(i),
		Cc(0),
		Cc(0),
		Mc(r, !0)
	]), Yc = (e) => Oc("minf", void 0, [
		Zc[e.type](),
		Jc(),
		rl(e)
	]), Zc = {
		video: () => zc("vmhd", 0, 1, [
			Sc(0),
			Sc(0),
			Sc(0),
			Sc(0)
		]),
		audio: () => zc("smhd", 0, 0, [Sc(0), Sc(0)]),
		subtitle: () => zc("nmhd", 0, 0)
	}, Jc = () => Oc("dinf", void 0, [el()]), el = () => zc("dref", 0, 0, [Cc(1)], [tl()]), tl = () => zc("url ", 0, 1), rl = (e) => {
		const t = e.compositionTimeOffsetTable.length > 1 || e.compositionTimeOffsetTable.some((e) => 0 !== e.sampleCompositionTimeOffset);
		return Oc("stbl", void 0, [
			il(e),
			Tl(e),
			t ? Cl(e) : null,
			t ? El(e) : null,
			Sl(e),
			Pl(e),
			xl(e),
			vl(e)
		]);
	}, il = (e) => {
		let t;
		if ("video" === e.type) t = al(Gl(e.track.source._codec, e.info.decoderConfig.codec), e);
		else if ("audio" === e.type) {
			const r = Zl(e.track.source._codec, e.info.decoderConfig.codec, e.muxer.isQuickTime);
			c(r), t = ll(r, e);
		} else "subtitle" === e.type && (t = bl(ed[e.track.source._codec], e));
		return c(t), zc("stsd", 0, 0, [Cc(1)], [t]);
	}, al = (e, t) => {
		return Oc(e, [
			Array(6).fill(0),
			Sc(1),
			Sc(0),
			Sc(0),
			Array(12).fill(0),
			Sc(t.info.width),
			Sc(t.info.height),
			Cc(4718592),
			Cc(4718592),
			Cc(0),
			Sc(1),
			vc(18),
			Mc(st),
			Array(13).fill(0),
			Sc(t.info.hasAlphaChannel ? 32 : 24),
			Pc(65535)
		], [
			Yl[t.track.source._codec]?.(t) ?? null,
			nl(t),
			(r = t.info.decoderConfig.colorSpace, !r || null == r.primaries && null == r.transfer && null == r.matrix && null == r.fullRange ? null : ol(t)),
			sl(t)
		]);
		var r;
	}, sl = (e) => 0 === e.avgBitrate && 0 === e.maxBitrate ? null : Oc("btrt", [
		Cc(0),
		Cc(e.maxBitrate),
		Cc(e.avgBitrate)
	]), nl = (e) => e.info.pixelAspectRatio.num === e.info.pixelAspectRatio.den ? null : Oc("pasp", [Cc(e.info.pixelAspectRatio.num), Cc(e.info.pixelAspectRatio.den)]), ol = (e) => {
		const t = e.info.decoderConfig.colorSpace;
		return Oc("colr", [
			Mc(e.muxer.isQuickTime ? "nclc" : "nclx"),
			Sc(null != t?.primaries ? F[t.primaries] : 2),
			Sc(null != t?.transfer ? D[t.transfer] : 2),
			Sc(null != t?.matrix ? z[t.matrix] : 2),
			e.muxer.isQuickTime ? [] : vc((t?.fullRange ? 1 : 0) << 7)
		]);
	}, cl = (e) => {
		if (!e.info.decoderConfig) return null;
		const t = e.info.decoderConfig, r = t.codec.split("."), i = Number(r[1]), a = Number(r[2]), s = (Number(r[3]) << 4) + ((r[4] ? Number(r[4]) : 1) << 1) + (r[8] ? Number(r[8]) : Number(t.colorSpace?.fullRange ?? 0)), n = r[5] ? Number(r[5]) : t.colorSpace?.primaries ? F[t.colorSpace.primaries] : 1, o = r[6] ? Number(r[6]) : t.colorSpace?.transfer ? D[t.colorSpace.transfer] : 1, c = r[7] ? Number(r[7]) : t.colorSpace?.matrix ? z[t.colorSpace.matrix] : 1;
		return zc("vpcC", 1, 0, [
			vc(i),
			vc(a),
			vc(s),
			vc(n),
			vc(o),
			vc(c),
			Sc(0)
		]);
	}, ll = (e, t) => {
		let r, i = 0, a = 16;
		const s = pr.includes(t.track.source._codec);
		if (s) {
			const e = t.track.source._codec, { sampleSize: r } = Fr(e);
			a = 8 * r, a > 16 && (i = 1);
		}
		if (t.muxer.isQuickTime && (i = 1), 0 === i) r = [
			Array(6).fill(0),
			Sc(1),
			Sc(i),
			Sc(0),
			Cc(0),
			Sc(t.info.numberOfChannels),
			Sc(a),
			Sc(0),
			Sc(0),
			Sc(t.info.sampleRate < 65536 ? t.info.sampleRate : 0),
			Sc(0)
		];
		else {
			const e = s ? 0 : -2;
			r = [
				Array(6).fill(0),
				Sc(1),
				Sc(i),
				Sc(0),
				Cc(0),
				Sc(t.info.numberOfChannels),
				Sc(Math.min(a, 16)),
				Pc(e),
				Sc(0),
				Sc(t.info.sampleRate < 65536 ? t.info.sampleRate : 0),
				Sc(0),
				s ? [
					Cc(1),
					Cc(a / 8),
					Cc(t.info.numberOfChannels * a / 8)
				] : [
					Cc(0),
					Cc(0),
					Cc(0)
				],
				Cc(2)
			];
		}
		return Oc(e, r, [Jl(t.track.source._codec, t.muxer.isQuickTime)?.(t) ?? null, sl(t)]);
	}, dl = (e) => {
		let t;
		switch (e.track.source._codec) {
			case "aac":
				t = 64;
				break;
			case "mp3":
				t = 107;
				break;
			case "vorbis":
				t = 221;
				break;
			default: throw new Error(`Unhandled audio codec: ${e.track.source._codec}`);
		}
		let r = [
			...vc(t),
			...vc(21),
			...xc(0),
			...Cc(e.maxBitrate),
			...Cc(e.avgBitrate)
		];
		if (e.info.decoderConfig.description) {
			const t = C(e.info.decoderConfig.description);
			r = [
				...r,
				...vc(5),
				...Fc(t.byteLength),
				...t
			];
		}
		return r = [
			...Sc(1),
			...vc(0),
			...vc(4),
			...Fc(r.length),
			...r,
			...vc(6),
			...vc(1),
			...vc(2)
		], r = [
			...vc(3),
			...Fc(r.length),
			...r
		], zc("esds", 0, 0, r);
	}, ul = (e) => Oc("wave", void 0, [
		hl(e),
		fl(e),
		Oc("\0\0\0\0")
	]), hl = (e) => Oc("frma", [Mc(Zl(e.track.source._codec, e.info.decoderConfig.codec, e.muxer.isQuickTime))]), fl = (e) => {
		const { littleEndian: t } = Fr(e.track.source._codec);
		return Oc("enda", [Sc(+t)]);
	}, ml = (e) => {
		let t = e.info.numberOfChannels, r = 3840, i = e.info.sampleRate, a = 0, s = 0, n = new Uint8Array(0);
		const o = e.info.decoderConfig?.description;
		if (o) {
			c(o.byteLength >= 18);
			const e = Wt(C(o));
			t = e.outputChannelCount, r = e.preSkip, i = e.inputSampleRate, a = e.outputGain, s = e.channelMappingFamily, e.channelMappingTable && (n = e.channelMappingTable);
		}
		return Oc("dOps", [
			vc(0),
			vc(t),
			Sc(r),
			Cc(i),
			Pc(a),
			vc(s),
			...n
		]);
	}, pl = (e) => {
		const t = e.info.decoderConfig?.description;
		return c(t), zc("dfLa", 0, 0, [...C(t).subarray(4)]);
	}, gl = (e) => {
		const { littleEndian: t, sampleSize: r } = Fr(e.track.source._codec);
		return zc("pcmC", 0, 0, [vc(+t), vc(8 * r)]);
	}, kl = (e) => {
		c(e.info.primingPacket);
		const t = Xt(e.info.primingPacket.data);
		if (!t) throw new Error("Couldn't extract AC-3 frame info from the audio packet. Ensure the packets contain valid AC-3 sync frames (as specified in ETSI TS 102 366).");
		const r = new Uint8Array(3), i = new Ke(r);
		return i.writeBits(2, t.fscod), i.writeBits(5, t.bsid), i.writeBits(3, t.bsmod), i.writeBits(3, t.acmod), i.writeBits(1, t.lfeon), i.writeBits(5, t.bitRateCode), i.writeBits(5, 0), Oc("dac3", [...r]);
	}, wl = (e) => {
		c(e.info.primingPacket);
		const t = Yt(e.info.primingPacket.data);
		if (!t) throw new Error("Couldn't extract E-AC-3 frame info from the audio packet. Ensure the packets contain valid E-AC-3 sync frames (as specified in ETSI TS 102 366).");
		let r = 16;
		for (const n of t.substreams) r += 23, n.numDepSub > 0 ? r += 9 : r += 1;
		const i = Math.ceil(r / 8), a = new Uint8Array(i), s = new Ke(a);
		s.writeBits(13, t.dataRate), s.writeBits(3, t.substreams.length - 1);
		for (const n of t.substreams) s.writeBits(2, n.fscod), s.writeBits(5, n.bsid), s.writeBits(1, 0), s.writeBits(1, 0), s.writeBits(3, n.bsmod), s.writeBits(3, n.acmod), s.writeBits(1, n.lfeon), s.writeBits(3, 0), s.writeBits(4, n.numDepSub), n.numDepSub > 0 ? s.writeBits(9, n.chanLoc) : s.writeBits(1, 0);
		return Oc("dec3", [...a]);
	}, yl = (e) => {
		c(e.info.primingPacket);
		const t = cr(e.info.primingPacket.data);
		if (!t) throw new Error("Couldn't extract DTS frame info from the audio packet. Ensure the packets contain valid DTS frames as specified in ETSI TS 102 114.");
		return Oc("ddts", [...hr(t)]);
	}, bl = (e, t) => Oc(e, [Array(6).fill(0), Sc(1)], [td[t.track.source._codec](t), sl(t)]), Tl = (e) => zc("stts", 0, 0, [Cc(e.timeToSampleTable.length), e.timeToSampleTable.map((e) => [Cc(e.sampleCount), Cc(e.sampleDelta)])]), vl = (e) => {
		if (e.samples.every((e) => "key" === e.type)) return null;
		const t = [...e.samples.entries()].filter(([, e]) => "key" === e.type);
		return zc("stss", 0, 0, [Cc(t.length), t.map(([e]) => Cc(e + 1))]);
	}, Sl = (e) => zc("stsc", 0, 0, [Cc(e.compactlyCodedChunkTable.length), e.compactlyCodedChunkTable.map((e) => [
		Cc(e.firstChunk),
		Cc(e.samplesPerChunk),
		Cc(1)
	])]), Pl = (e) => {
		if ("audio" === e.type && e.info.requiresPcmTransformation) {
			const { sampleSize: t } = Fr(e.track.source._codec);
			return zc("stsz", 0, 0, [Cc(t * e.info.numberOfChannels), Cc(e.samples.reduce((t, r) => t + md(r.duration, e.timescale), 0))]);
		}
		return zc("stsz", 0, 0, [
			Cc(0),
			Cc(e.samples.length),
			e.samples.map((e) => Cc(e.size))
		]);
	}, xl = (e) => e.finalizedChunks.length > 0 && T(e.finalizedChunks).offset >= 2 ** 32 ? zc("co64", 0, 0, [Cc(e.finalizedChunks.length), e.finalizedChunks.map((e) => _c(e.offset))]) : zc("stco", 0, 0, [Cc(e.finalizedChunks.length), e.finalizedChunks.map((e) => Cc(e.offset))]), Cl = (e) => zc("ctts", 1, 0, [Cc(e.compositionTimeOffsetTable.length), e.compositionTimeOffsetTable.map((e) => [Cc(e.sampleCount), Ec(e.sampleCompositionTimeOffset)])]), El = (e) => {
		let t = Infinity, r = -Infinity, i = Infinity, a = -Infinity;
		c(e.compositionTimeOffsetTable.length > 0), c(e.samples.length > 0);
		for (let n = 0; n < e.compositionTimeOffsetTable.length; n++) {
			const i = e.compositionTimeOffsetTable[n];
			t = Math.min(t, i.sampleCompositionTimeOffset), r = Math.max(r, i.sampleCompositionTimeOffset);
		}
		for (let n = 0; n < e.samples.length; n++) {
			const t = e.samples[n];
			i = Math.min(i, md(t.timestamp, e.timescale)), a = Math.max(a, md(t.timestamp + t.duration, e.timescale));
		}
		const s = Math.max(-t, 0);
		return a >= 2 ** 31 ? null : zc("cslg", 0, 0, [
			Ec(s),
			Ec(t),
			Ec(r),
			Ec(i),
			Ec(a)
		]);
	}, _l = (e) => Oc("mvex", void 0, e.map(Il)), Il = (e) => zc("trex", 0, 0, [
		Cc(e.track.id),
		Cc(1),
		Cc(0),
		Cc(0),
		Cc(0)
	]), Bl = (e, t) => Oc("moof", void 0, [Al(e), ...t.map(Fl)]), Al = (e) => zc("mfhd", 0, 0, [Cc(e)]), Rl = (e) => {
		let t = 0, r = 0;
		const i = "delta" === e.type;
		return r |= +i, t |= i ? 1 : 2, t << 24 | r << 16;
	}, Fl = (e) => Oc("traf", void 0, [
		Ml(e),
		Dl(e),
		Ol(e)
	]), Ml = (e) => {
		c(e.currentChunk);
		let t = 0;
		t |= 8, t |= 16, t |= 32, t |= 131072;
		const r = e.currentChunk.samples[1] ?? e.currentChunk.samples[0], i = {
			duration: r.timescaleUnitsToNextSample,
			size: r.size,
			flags: Rl(r)
		};
		return zc("tfhd", 0, 131128, [
			Cc(e.track.id),
			Cc(i.duration),
			Cc(i.size),
			Cc(i.flags)
		]);
	}, Dl = (e) => (c(e.currentChunk), zc("tfdt", 1, 0, [_c(md(e.currentChunk.startTimestamp, e.timescale))])), Ol = (e) => {
		c(e.currentChunk);
		const t = e.currentChunk.samples.map((e) => e.timescaleUnitsToNextSample), r = e.currentChunk.samples.map((e) => e.size), i = e.currentChunk.samples.map(Rl), a = e.currentChunk.samples.map((t) => md(t.timestamp - t.decodeTimestamp, e.timescale)), s = new Set(t), n = new Set(r), o = new Set(i), l = new Set(a), d = 2 === o.size && i[0] !== i[1], u = s.size > 1, h = n.size > 1, f = !d && o.size > 1, m = l.size > 1 || [...l].some((e) => 0 !== e);
		let p = 0;
		return p |= 1, p |= 4 * +d, p |= 256 * +u, p |= 512 * +h, p |= 1024 * +f, p |= 2048 * +m, zc("trun", 1, p, [
			Cc(e.currentChunk.samples.length),
			Cc(e.currentChunk.offset - e.currentChunk.moofOffset || 0),
			d ? Cc(i[0]) : [],
			e.currentChunk.samples.map((e, s) => [
				u ? Cc(t[s]) : [],
				h ? Cc(r[s]) : [],
				f ? Cc(i[s]) : [],
				m ? Ec(a[s]) : []
			])
		]);
	}, zl = (e) => zc("tfra", 1, 0, [
		Cc(e.track.id),
		Cc(63),
		Cc(e.finalizedChunks.length),
		e.finalizedChunks.map((t) => [
			_c(md(t.samples[0].timestamp, e.timescale)),
			_c(t.moofOffset),
			Cc(t.trafIndex + 1),
			Cc(1),
			Cc(1)
		])
	]), Nl = () => zc("mfro", 0, 0, [Cc(0)]), Ul = () => Oc("vtte"), Ll = (e, t, r, i, a) => Oc("vttc", void 0, [
		null !== a ? Oc("vsid", [Ec(a)]) : null,
		null !== r ? Oc("iden", [...A.encode(r)]) : null,
		null !== t ? Oc("ctim", [...A.encode(wc(t))]) : null,
		null !== i ? Oc("sttg", [...A.encode(i)]) : null,
		Oc("payl", [...A.encode(e)])
	]), Wl = (e) => Oc("vtta", [...A.encode(e)]), ql = (e) => {
		const t = [], r = e.format._options.metadataFormat ?? "auto", i = e.output._metadataTags;
		if ("mdir" === r || "auto" === r && !e.isQuickTime) {
			const e = Kl(i);
			e && t.push(e);
		} else if ("mdta" === r) {
			const e = Xl(i);
			e && t.push(e);
		} else ("udta" === r || "auto" === r && e.isQuickTime) && Vl(t, e.output._metadataTags);
		return 0 === t.length ? null : Oc("udta", void 0, t);
	}, Vl = (e, t) => {
		for (const { key: r, value: i } of Ee(t)) switch (r) {
			case "title":
				e.push(Hl("©nam", i));
				break;
			case "description":
				e.push(Hl("©des", i));
				break;
			case "artist":
				e.push(Hl("©ART", i));
				break;
			case "album":
				e.push(Hl("©alb", i));
				break;
			case "albumArtist":
				e.push(Hl("albr", i));
				break;
			case "genre":
				e.push(Hl("©gen", i));
				break;
			case "date":
				e.push(Hl("©day", i.toISOString().slice(0, 10)));
				break;
			case "comment":
				e.push(Hl("©cmt", i));
				break;
			case "lyrics":
				e.push(Hl("©lyr", i));
				break;
			case "raw":
			case "discNumber":
			case "discsTotal":
			case "trackNumber":
			case "tracksTotal":
			case "beatsPerMinute":
			case "images": break;
			default: J(r);
		}
		if (t.raw) for (const r in t.raw) {
			const i = t.raw[r];
			null == i || 4 !== r.length || e.some((e) => e.type === r) || ("string" == typeof i ? e.push(Hl(r, i)) : i instanceof Uint8Array && e.push(Oc(r, Array.from(i))));
		}
	}, Hl = (e, t) => {
		const r = A.encode(t);
		return Oc(e, [
			Sc(r.length),
			Sc(rd("und")),
			Array.from(r)
		]);
	}, jl = {
		"image/jpeg": 13,
		"image/png": 14,
		"image/bmp": 27
	}, $l = (e, t) => {
		const r = [];
		for (const { key: i, value: a } of Ee(e)) switch (i) {
			case "title":
				r.push({
					key: t ? "title" : "©nam",
					value: Ql(a)
				});
				break;
			case "description":
				r.push({
					key: t ? "description" : "©des",
					value: Ql(a)
				});
				break;
			case "artist":
				r.push({
					key: t ? "artist" : "©ART",
					value: Ql(a)
				});
				break;
			case "album":
				r.push({
					key: t ? "album" : "©alb",
					value: Ql(a)
				});
				break;
			case "albumArtist":
				r.push({
					key: t ? "album_artist" : "aART",
					value: Ql(a)
				});
				break;
			case "comment":
				r.push({
					key: t ? "comment" : "©cmt",
					value: Ql(a)
				});
				break;
			case "genre":
				r.push({
					key: t ? "genre" : "©gen",
					value: Ql(a)
				});
				break;
			case "beatsPerMinute":
				t || r.push({
					key: "tmpo",
					value: Oc("data", [
						Cc(21),
						Cc(0),
						Sc(a)
					])
				});
				break;
			case "lyrics":
				r.push({
					key: t ? "lyrics" : "©lyr",
					value: Ql(a)
				});
				break;
			case "date":
				r.push({
					key: t ? "date" : "©day",
					value: Ql(a.toISOString().slice(0, 10))
				});
				break;
			case "images":
				for (const e of a) "coverFront" === e.kind && r.push({
					key: "covr",
					value: Oc("data", [
						Cc(jl[e.mimeType] ?? 0),
						Cc(0),
						Array.from(e.data)
					])
				});
				break;
			case "trackNumber":
				if (t) {
					const t = void 0 !== e.tracksTotal ? `${a}/${e.tracksTotal}` : a.toString();
					r.push({
						key: "track",
						value: Ql(t)
					});
				} else r.push({
					key: "trkn",
					value: Oc("data", [
						Cc(0),
						Cc(0),
						Sc(0),
						Sc(a),
						Sc(e.tracksTotal ?? 0),
						Sc(0)
					])
				});
				break;
			case "discNumber":
				t || r.push({
					key: "disc",
					value: Oc("data", [
						Cc(0),
						Cc(0),
						Sc(0),
						Sc(a),
						Sc(e.discsTotal ?? 0),
						Sc(0)
					])
				});
				break;
			case "tracksTotal":
			case "discsTotal":
			case "raw": break;
			default: J(i);
		}
		if (e.raw) for (const i in e.raw) {
			const a = e.raw[i];
			null == a || !t && 4 !== i.length || r.some((e) => e.key === i) || ("string" == typeof a ? r.push({
				key: i,
				value: Ql(a)
			}) : a instanceof Uint8Array ? r.push({
				key: i,
				value: Oc("data", [
					Cc(0),
					Cc(0),
					Array.from(a)
				])
			}) : a instanceof Ve && r.push({
				key: i,
				value: Oc("data", [
					Cc(jl[a.mimeType] ?? 0),
					Cc(0),
					Array.from(a.data)
				])
			}));
		}
		return r;
	}, Kl = (e) => {
		const t = $l(e, !1);
		return 0 === t.length ? null : zc("meta", 0, 0, void 0, [Gc(!1, "mdir", "", "appl"), Oc("ilst", void 0, t.map((e) => Oc(e.key, void 0, [e.value])))]);
	}, Xl = (e) => {
		const t = $l(e, !0);
		return 0 === t.length ? null : Oc("meta", void 0, [
			Gc(!1, "mdta", ""),
			zc("keys", 0, 0, [Cc(t.length)], t.map((e) => Oc("mdta", [...A.encode(e.key)]))),
			Oc("ilst", void 0, t.map((e, t) => Oc(String.fromCharCode(...Cc(t + 1)), void 0, [e.value])))
		]);
	}, Ql = (e) => Oc("data", [
		Cc(1),
		Cc(0),
		...A.encode(e)
	]), Gl = (e, t) => {
		switch (e) {
			case "avc": return t.startsWith("avc3") ? "avc3" : "avc1";
			case "hevc": return "hvc1";
			case "vp8": return "vp08";
			case "vp9": return "vp09";
			case "av1": return "av01";
			case "prores": return t;
		}
	}, Yl = {
		avc: (e) => e.info.decoderConfig && Oc("avcC", [...C(e.info.decoderConfig.description)]),
		hevc: (e) => e.info.decoderConfig && Oc("hvcC", [...C(e.info.decoderConfig.description)]),
		vp8: cl,
		vp9: cl,
		av1: (e) => Oc("av1C", ((e) => {
			const t = e.split("."), r = Number(t[1]), i = t[2], a = (r << 5) + Number(i.slice(0, -1)), s = "H" === i.slice(-1) ? 1 : 0, n = Number(t[3]);
			return [
				129,
				a,
				(s << 7) + ((8 === n ? 0 : 1) << 6) + ((12 === n ? 1 : 0) << 5) + ((t[4] ? Number(t[4]) : 0) << 4) + ((t[5] ? Number(t[5][0]) : 1) << 3) + ((t[5] ? Number(t[5][1]) : 1) << 2) + (t[5] ? Number(t[5][2]) : 0),
				0
			];
		})(e.info.decoderConfig.codec)),
		prores: null
	}, Zl = (e, t, r) => {
		switch (e) {
			case "aac":
			case "mp3":
			case "vorbis": return "mp4a";
			case "opus": return "Opus";
			case "flac": return "fLaC";
			case "ulaw": return "ulaw";
			case "alaw": return "alaw";
			case "pcm-u8": return "raw ";
			case "pcm-s8": return "sowt";
			case "ac3": return "ac-3";
			case "eac3": return "ec-3";
			case "dts": return t;
		}
		if (r) switch (e) {
			case "pcm-s16": return "sowt";
			case "pcm-s16be": return "twos";
			case "pcm-s24":
			case "pcm-s24be": return "in24";
			case "pcm-s32":
			case "pcm-s32be": return "in32";
			case "pcm-f32":
			case "pcm-f32be": return "fl32";
			case "pcm-f64":
			case "pcm-f64be": return "fl64";
		}
		else switch (e) {
			case "pcm-s16":
			case "pcm-s16be":
			case "pcm-s24":
			case "pcm-s24be":
			case "pcm-s32":
			case "pcm-s32be": return "ipcm";
			case "pcm-f32":
			case "pcm-f32be":
			case "pcm-f64":
			case "pcm-f64be": return "fpcm";
		}
	}, Jl = (e, t) => {
		switch (e) {
			case "aac":
			case "mp3":
			case "vorbis": return dl;
			case "opus": return ml;
			case "flac": return pl;
			case "ac3": return kl;
			case "eac3": return wl;
			case "dts": return yl;
		}
		if (t) switch (e) {
			case "pcm-s24":
			case "pcm-s24be":
			case "pcm-s32":
			case "pcm-s32be":
			case "pcm-f32":
			case "pcm-f32be":
			case "pcm-f64":
			case "pcm-f64be": return ul;
		}
		else switch (e) {
			case "pcm-s16":
			case "pcm-s16be":
			case "pcm-s24":
			case "pcm-s24be":
			case "pcm-s32":
			case "pcm-s32be":
			case "pcm-f32":
			case "pcm-f32be":
			case "pcm-f64":
			case "pcm-f64be": return gl;
		}
		return null;
	}, ed = { webvtt: "wvtt" }, td = { webvtt: (e) => Oc("vttC", [...A.encode(e.info.config.description)]) }, rd = (e) => {
		c(3 === e.length);
		let t = 0;
		for (let r = 0; r < 3; r++) t <<= 5, t += e.charCodeAt(r) - 96;
		return t;
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	var id = class {
		constructor(e, t) {
			if (this.finalized = !1, this.started = !1, this.pos = 0, this.trackedWrites = null, this.trackedStart = -1, this.trackedEnd = -1, e._writerAcquired) throw new Error("Can't have multiple Writers for the same Target.");
			this.target = e, e._setMonotonicity(t), e._writerAcquired = !0;
		}
		start() {
			c(!this.started), this.target._start(), this.started = !0;
		}
		write(e) {
			c(this.started && !this.finalized), this.maybeTrackWrites(e), this.target._write(e, this.pos), this.pos += e.byteLength;
		}
		seek(e) {
			this.pos = e;
		}
		getPos() {
			return this.pos;
		}
		async flush() {
			return c(this.started && !this.finalized), this.target._flush();
		}
		async finalize() {
			c(this.started && !this.finalized), await this.target._finalize(), this.finalized = !0;
		}
		maybeTrackWrites(e) {
			if (!this.trackedWrites) return;
			let t = this.getPos();
			if (t < this.trackedStart) {
				if (t + e.byteLength <= this.trackedStart) return;
				e = e.subarray(this.trackedStart - t), t = 0;
			}
			const r = t + e.byteLength - this.trackedStart;
			let i = this.trackedWrites.byteLength;
			for (; i < r;) i *= 2;
			if (i !== this.trackedWrites.byteLength) {
				const e = new Uint8Array(i);
				e.set(this.trackedWrites, 0), this.trackedWrites = e;
			}
			this.trackedWrites.set(e, t - this.trackedStart), this.trackedEnd = Math.max(this.trackedEnd, t + e.byteLength);
		}
		startTrackingWrites() {
			this.trackedWrites = new Uint8Array(1024), this.trackedStart = this.getPos(), this.trackedEnd = this.trackedStart;
		}
		stopTrackingWrites() {
			if (!this.trackedWrites) throw new Error("Internal error: Can't get tracked writes since nothing was tracked.");
			const e = {
				data: this.trackedWrites.subarray(0, this.trackedEnd - this.trackedStart),
				start: this.trackedStart,
				end: this.trackedEnd
			};
			return this.trackedWrites = null, e;
		}
	}, ad = class extends Ne {
		constructor() {
			super(...arguments), this._writerAcquired = !1, this._monotonicity = null, this.onwrite = null;
		}
		_setMonotonicity(e) {
			!1 !== this._monotonicity && (this._monotonicity = e);
		}
		_dispatchWrite(e, t) {
			this.onwrite?.(e, t), this._emit("write", {
				start: e,
				end: t
			});
		}
		slice(e) {
			if (!Number.isInteger(e) || e < 0) throw new TypeError("offset must be a non-negative integer.");
			return new dd(this, e);
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/ const sd = 65536, nd = 2 ** 32;
	var od = class extends ad {
		constructor(e = {}) {
			if (super(), this.buffer = null, this._maxPos = 0, !e || "object" != typeof e) throw new TypeError("BufferTarget options, when provided, must be an object.");
			if (void 0 !== e.onFinalize && "function" != typeof e.onFinalize) throw new TypeError("options.onFinalize, when provided, must be a function.");
			if (this._options = e, this._supportsResize = "resize" in /* @__PURE__ */ new ArrayBuffer(0), this._supportsResize) try {
				this._buffer = new ArrayBuffer(sd, { maxByteLength: nd });
			} catch {
				this._buffer = /* @__PURE__ */ new ArrayBuffer(sd), this._supportsResize = !1;
			}
			else this._buffer = /* @__PURE__ */ new ArrayBuffer(sd);
			this._bytes = new Uint8Array(this._buffer);
		}
		_ensureSize(e) {
			let t = this._buffer.byteLength;
			for (; t < e;) t *= 2;
			if (t !== this._buffer.byteLength) {
				if (t > nd) throw new Error("ArrayBuffer exceeded maximum size of 4294967296 bytes. Please consider using another target.");
				if (this._supportsResize) this._buffer.resize(t);
				else {
					const e = new ArrayBuffer(t), r = new Uint8Array(e);
					r.set(this._bytes, 0), this._buffer = e, this._bytes = r;
				}
			}
		}
		_start() {}
		_write(e, t) {
			this._ensureSize(t + e.byteLength), this._bytes.set(e, t), this._maxPos = Math.max(this._maxPos, t + e.byteLength), this._dispatchWrite(t, t + e.byteLength);
		}
		async _flush() {}
		async _finalize() {
			this.buffer = this._buffer.slice(0, this._maxPos), this._options.onFinalize && await this._options.onFinalize(this.buffer), this._emit("finalized");
		}
		async _close() {}
		_getSlice(e, t) {
			return this._bytes.slice(e, t);
		}
	};
	var cd = class extends ad {
		constructor(e, t = {}) {
			if (super(), this._sections = [], this._lastWriteEnd = 0, this._lastFlushEnd = 0, this._streamWriter = null, this._writeError = null, this._chunks = [], !(e instanceof WritableStream)) throw new TypeError("StreamTarget requires a WritableStream instance.");
			if (null != t && "object" != typeof t) throw new TypeError("StreamTarget options, when provided, must be an object.");
			if (void 0 !== t.chunked && "boolean" != typeof t.chunked) throw new TypeError("options.chunked, when provided, must be a boolean.");
			if (void 0 !== t.chunkSize && (!Number.isInteger(t.chunkSize) || t.chunkSize < 1024)) throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.");
			this._writable = e, this._options = t, this._chunked = t.chunked ?? !1, this._chunkSize = t.chunkSize ?? 16777216;
		}
		_start() {
			this._streamWriter = this._writable.getWriter();
		}
		_write(e, t) {
			if (t > this._lastWriteEnd) {
				const e = t - this._lastWriteEnd;
				this._write(new Uint8Array(e), this._lastWriteEnd);
			}
			this._sections.push({
				data: e.slice(),
				start: t
			}), this._lastWriteEnd = Math.max(this._lastWriteEnd, t + e.byteLength), this._dispatchWrite(t, t + e.byteLength);
		}
		async _flush() {
			if (null !== this._writeError) throw this._writeError;
			if (c(this._streamWriter), 0 === this._sections.length) return;
			const e = [], t = [...this._sections].sort((e, t) => e.start - t.start);
			e.push({
				start: t[0].start,
				size: t[0].data.byteLength
			});
			for (let r = 1; r < t.length; r++) {
				const i = e[e.length - 1], a = t[r];
				a.start <= i.start + i.size ? i.size = Math.max(i.size, a.start + a.data.byteLength - i.start) : e.push({
					start: a.start,
					size: a.data.byteLength
				});
			}
			for (const r of e) {
				r.data = new Uint8Array(r.size);
				for (const e of this._sections) r.start <= e.start && e.start < r.start + r.size && r.data.set(e.data, e.start - r.start);
				if (null !== this._streamWriter.desiredSize && this._streamWriter.desiredSize <= 0 && await this._streamWriter.ready, this._chunked) this._writeDataIntoChunks(r.data, r.start), this._tryToFlushChunks();
				else {
					if (!0 === this._monotonicity && r.start !== this._lastFlushEnd) throw new Error("Internal error: Monotonicity violation.");
					this._streamWriter.write({
						type: "write",
						data: r.data,
						position: r.start
					}).catch((e) => {
						this._writeError ??= e;
					}), this._lastFlushEnd = r.start + r.data.byteLength;
				}
			}
			this._sections.length = 0;
		}
		_writeDataIntoChunks(e, t) {
			let r = this._chunks.findIndex((e) => e.start <= t && t < e.start + this._chunkSize);
			-1 === r && (r = this._createChunk(t));
			const i = this._chunks[r], a = t - i.start, s = e.subarray(0, Math.min(this._chunkSize - a, e.byteLength));
			i.data.set(s, a);
			const n = {
				start: a,
				end: a + s.byteLength
			};
			if (this._insertSectionIntoChunk(i, n), 0 === i.written[0].start && i.written[0].end === this._chunkSize && (i.shouldFlush = !0), this._chunks.length > 2) {
				for (let e = 0; e < this._chunks.length - 1; e++) this._chunks[e].shouldFlush = !0;
				this._tryToFlushChunks();
			}
			s.byteLength < e.byteLength && this._writeDataIntoChunks(e.subarray(s.byteLength), t + s.byteLength);
		}
		_insertSectionIntoChunk(e, t) {
			let r = 0, i = e.written.length - 1, a = -1;
			for (; r <= i;) {
				const s = Math.floor(r + (i - r + 1) / 2);
				e.written[s].start <= t.start ? (r = s + 1, a = s) : i = s - 1;
			}
			for (e.written.splice(a + 1, 0, t), (-1 === a || e.written[a].end < t.start) && a++; a < e.written.length - 1 && e.written[a].end >= e.written[a + 1].start;) e.written[a].end = Math.max(e.written[a].end, e.written[a + 1].end), e.written.splice(a + 1, 1);
		}
		_createChunk(e) {
			const t = {
				start: Math.floor(e / this._chunkSize) * this._chunkSize,
				data: new Uint8Array(this._chunkSize),
				written: [],
				shouldFlush: !1
			};
			return this._chunks.push(t), this._chunks.sort((e, t) => e.start - t.start), this._chunks.indexOf(t);
		}
		_tryToFlushChunks(e = !1) {
			c(this._streamWriter);
			for (let t = 0; t < this._chunks.length; t++) {
				const r = this._chunks[t];
				if (r.shouldFlush || e) {
					for (const e of r.written) {
						const t = r.start + e.start;
						if (!0 === this._monotonicity && t !== this._lastFlushEnd) throw new Error("Internal error: Monotonicity violation.");
						let i;
						i = (0 !== e.start || e.end !== r.data.byteLength) && ke() ? r.data.slice(e.start, e.end) : r.data.subarray(e.start, e.end), this._streamWriter.write({
							type: "write",
							data: i,
							position: t
						}).catch((e) => {
							this._writeError ??= e;
						}), this._lastFlushEnd = r.start + e.end;
					}
					this._chunks.splice(t--, 1);
				}
			}
		}
		async _finalize() {
			if (this._chunked && this._tryToFlushChunks(!0), null !== this._writeError) throw this._writeError;
			c(this._streamWriter), await this._streamWriter.ready, await this._streamWriter.close(), this._emit("finalized");
		}
		async _close() {
			return this._streamWriter?.close();
		}
	}, ld = class extends ad {
		_start() {}
		_write(e, t) {
			this._dispatchWrite(t, t + e.byteLength);
		}
		async _flush() {}
		async _finalize() {
			this._emit("finalized");
		}
		async _close() {}
	}, dd = class extends ad {
		constructor(e, t) {
			super(), this._baseTarget = e, this._offset = t;
		}
		_start() {}
		_write(e, t) {
			this._baseTarget._write(e, this._offset + t), this._dispatchWrite(t, t + e.byteLength);
		}
		_flush() {
			return this._baseTarget._flush();
		}
		async _finalize() {
			this._emit("finalized");
		}
		async _close() {}
		_setMonotonicity(e) {
			super._setMonotonicity(e), this._baseTarget._setMonotonicity(e);
		}
	}, ud = class {
		constructor(e, t) {
			if (this.rootPath = e, this.getTarget = t, "string" != typeof e) throw new TypeError("rootPath must be a string.");
			if ("function" != typeof t) throw new TypeError("getTarget must be a function.");
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	const hd = 57600, fd = (e) => {
		const t = {}, r = e.track;
		return void 0 !== r.metadata.name && (t.name = r.metadata.name), t;
	}, md = (e, t, r = !0) => {
		const i = e * t;
		return r ? Math.round(i) : i;
	}, pd = (e) => {
		if (0 === e.samples.length) return 0;
		let t = Infinity, r = -Infinity;
		for (let i = 0; i < e.samples.length; i++) {
			const a = e.samples[i];
			a.timestamp < t && (t = a.timestamp), a.timestamp + a.duration > r && (r = a.timestamp + a.duration);
		}
		return t === Infinity ? 0 : r - t;
	};
	var gd = class extends gc {
		constructor(e, t) {
			super(e), this.writer = null, this.boxWriter = null, this.initWriter = null, this.initBoxWriter = null, this.auxTarget = new od(), this.auxWriter = new id(this.auxTarget, !1), this.auxBoxWriter = new yc(this.auxWriter), this.mdat = null, this.ftypSize = null, this.trackDatas = [], this.allTracksKnown = Q(), this.creationTime = Math.floor(Date.now() / 1e3) + 2082844800, this.finalizedChunks = [], this.wroteFragmentedHeader = !1, this.nextFragmentNumber = 1, this.maxWrittenTimestamp = -Infinity, this.minWrittenTimestamp = Infinity, this.maxWrittenEndTimestamp = -Infinity, this.segmentHeaderSize = null, this.format = t, this.formatOptions = { ...t._options }, this.isQuickTime = t instanceof Nd, this.isCmaf = t instanceof zd, this.minimumFragmentDuration = this.formatOptions.minimumFragmentDuration ?? (t instanceof zd ? Infinity : 1), this.auxWriter.start();
		}
		async start() {
			const e = await this.mutex.acquire();
			if (this.isCmaf ? (this.fastStart = "fragmented", this.isFragmented = !0) : (this.writer = await this.output._getRootWriter((e) => void 0 !== this.formatOptions.fastStart ? "fragmented" === this.formatOptions.fastStart : e instanceof od), this.boxWriter = new yc(this.writer), this.fastStart = this.formatOptions.fastStart ?? (this.writer.target instanceof od && "in-memory"), this.isFragmented = "fragmented" === this.fastStart), this.isCmaf) {
				if (!this.output._hasInitTarget()) throw new Error("CMAF outputs require the initTarget field in OutputOptions to be set; the init segment will be written to it.");
				const e = new id(await this.output._getInitTarget(), !0);
				e.start(), this.initWriter = e, this.initBoxWriter = new yc(e);
			}
			const t = this.output.tracks.some((e) => e.isVideoTrack() && "avc" === e.source._codec);
			{
				const e = this.initBoxWriter ?? this.boxWriter;
				if (c(e), this.formatOptions.onFtyp && e.writer.startTrackingWrites(), e.writeBox(((e) => {
					const t = 512;
					return e.isQuickTime ? Oc("ftyp", [
						Mc("qt  "),
						Cc(t),
						Mc("qt  ")
					]) : e.fragmented ? e.cmaf ? Oc("ftyp", [
						Mc("iso5"),
						Cc(t),
						Mc("iso5"),
						Mc("iso6"),
						Mc("mp41"),
						Mc("cmfc"),
						Mc("dash")
					]) : Oc("ftyp", [
						Mc("iso5"),
						Cc(t),
						Mc("iso5"),
						Mc("iso6"),
						Mc("mp41")
					]) : Oc("ftyp", [
						Mc("isom"),
						Cc(t),
						Mc("isom"),
						e.holdsAvc ? Mc("avc1") : [],
						Mc("mp41")
					]);
				})({
					isQuickTime: this.isQuickTime,
					holdsAvc: t,
					fragmented: this.isFragmented,
					cmaf: this.isCmaf
				})), this.formatOptions.onFtyp) {
					const { data: t, start: r } = e.writer.stopTrackingWrites();
					this.formatOptions.onFtyp(t, r);
				}
				this.ftypSize = e.writer.getPos(), this.isCmaf && await this.initWriter.flush();
			}
			if ("in-memory" === this.fastStart);
			else if ("reserve" === this.fastStart) {
				for (const r of this.output.tracks) if (void 0 === r.metadata.maximumPacketCount) throw new Error("All tracks must specify maximumPacketCount in their metadata when using fastStart: 'reserve'.");
			} else this.isFragmented || (c(this.writer), c(this.boxWriter), this.formatOptions.onMdat && this.writer.startTrackingWrites(), this.mdat = Lc(!0), this.boxWriter.writeBox(this.mdat));
			await this.writer?.flush();
			for (const r of this.output.tracks) r.isVideoTrack() && r.metadata.decoderConfig ? this.getVideoTrackData(r, r.metadata.primingPacket ?? null, { decoderConfig: r.metadata.decoderConfig }) : r.isAudioTrack() && r.metadata.decoderConfig && this.getAudioTrackData(r, r.metadata.primingPacket ?? null, { decoderConfig: r.metadata.decoderConfig });
			e();
		}
		allTracksAreKnown() {
			for (const e of this.output.tracks) if (!e.source._closed && !this.trackDatas.some((t) => t.track === e)) return !1;
			return !0;
		}
		async getMimeType() {
			await this.allTracksKnown.promise;
			const e = this.trackDatas.map((e) => "video" === e.type || "audio" === e.type ? e.info.decoderConfig.codec : { webvtt: "wvtt" }[e.track.source._codec]);
			return Jr({
				isQuickTime: this.isQuickTime,
				hasVideo: this.trackDatas.some((e) => "video" === e.type),
				hasAudio: this.trackDatas.some((e) => "audio" === e.type),
				codecStrings: e
			});
		}
		getVideoTrackData(e, t, r) {
			const i = this.trackDatas.find((t) => t.track === e);
			if (i) return i;
			Lr(r, e.source._codec), c(r), c(r.decoderConfig);
			const a = { ...r.decoderConfig };
			c(void 0 !== a.codedWidth), c(void 0 !== a.codedHeight);
			let s = !1;
			if ("avc" !== e.source._codec || a.description) {
				if ("hevc" === e.source._codec && !a.description) {
					if (!t) throw new Error("No HEVC description provided; you must therefore provide a priming packet.");
					const e = Ct(t.data);
					if (!e) throw new Error("Couldn't extract an HEVCDecoderConfigurationRecord from the HEVC packet. Make sure the packets are in Annex B format (as specified in ITU-T-REC-H.265) when not providing a description, or provide a description (must be an HEVCDecoderConfigurationRecord as specified in ISO 14496-15) and ensure the packets are in HEVC format.");
					a.description = ((e) => {
						const t = [];
						t.push(e.configurationVersion), t.push((3 & e.generalProfileSpace) << 6 | (1 & e.generalTierFlag) << 5 | 31 & e.generalProfileIdc), t.push(e.generalProfileCompatibilityFlags >>> 24 & 255), t.push(e.generalProfileCompatibilityFlags >>> 16 & 255), t.push(e.generalProfileCompatibilityFlags >>> 8 & 255), t.push(255 & e.generalProfileCompatibilityFlags), t.push(...e.generalConstraintIndicatorFlags), t.push(255 & e.generalLevelIdc), t.push(240 | e.minSpatialSegmentationIdc >> 8 & 15), t.push(255 & e.minSpatialSegmentationIdc), t.push(252 | 3 & e.parallelismType), t.push(252 | 3 & e.chromaFormatIdc), t.push(248 | 7 & e.bitDepthLumaMinus8), t.push(248 | 7 & e.bitDepthChromaMinus8), t.push(e.avgFrameRate >> 8 & 255), t.push(255 & e.avgFrameRate), t.push((3 & e.constantFrameRate) << 6 | (7 & e.numTemporalLayers) << 3 | (1 & e.temporalIdNested) << 2 | 3 & e.lengthSizeMinusOne), t.push(255 & e.arrays.length);
						for (const r of e.arrays) {
							t.push((1 & r.arrayCompleteness) << 7 | 63 & r.nalUnitType), t.push(r.nalUnits.length >> 8 & 255), t.push(255 & r.nalUnits.length);
							for (const e of r.nalUnits) {
								t.push(e.length >> 8 & 255), t.push(255 & e.length);
								for (let r = 0; r < e.length; r++) t.push(e[r]);
							}
						}
						return new Uint8Array(t);
					})(e), s = !0;
				}
			} else {
				if (!t) throw new Error("No AVC description provided; you must therefore provide a priming packet.");
				const e = gt(t.data);
				if (!e) throw new Error("Couldn't extract an AVCDecoderConfigurationRecord from the AVC packet. Make sure the packets are in Annex B format (as specified in ITU-T-REC-H.264) when not providing a description, or provide a description (must be an AVCDecoderConfigurationRecord as specified in ISO 14496-15) and ensure the packets are in AVCC format.");
				a.description = kt(e), s = !0;
			}
			const n = ((e, t) => {
				const r = e < 0 ? -1 : 1;
				let i = 0, a = 1, s = 1, n = 0, o = e = Math.abs(e);
				for (;;) {
					const e = Math.floor(o), c = e * s + i, l = e * n + a;
					if (l > t) return {
						num: r * s,
						den: n
					};
					if (i = s, a = n, s = c, n = l, o = 1 / (o - e), !isFinite(o)) break;
				}
				return {
					num: r * s,
					den: n
				};
			})(1 / (e.metadata.frameRate ?? 57600), 1e6).den, o = a.displayAspectWidth, l = a.displayAspectHeight, d = void 0 === o || void 0 === l ? {
				num: 1,
				den: 1
			} : Me({
				num: o * a.codedHeight,
				den: l * a.codedWidth
			}), u = "ap4h" === a.codec || "ap4x" === a.codec, h = {
				muxer: this,
				track: e,
				type: "video",
				info: {
					width: a.codedWidth,
					height: a.codedHeight,
					pixelAspectRatio: d,
					decoderConfig: a,
					requiresAnnexBTransformation: s,
					hasAlphaChannel: u
				},
				timescale: n,
				samples: [],
				sampleQueue: [],
				timestampProcessingQueue: [],
				timeToSampleTable: [],
				compositionTimeOffsetTable: [],
				lastTimescaleUnits: null,
				lastSample: null,
				startTimestampOffset: null,
				finalizedChunks: [],
				currentChunk: null,
				compactlyCodedChunkTable: [],
				closed: !1,
				avgBitrate: e.source._nominalBitrate ?? e.metadata.averageBitrate ?? 0,
				maxBitrate: e.source._nominalBitrate ?? e.metadata.bitrate ?? 0
			};
			return this.trackDatas.push(h), this.trackDatas.sort((e, t) => e.track.id - t.track.id), this.allTracksAreKnown() && this.allTracksKnown.resolve(), h;
		}
		getAudioTrackData(e, t, r) {
			const i = this.trackDatas.find((t) => t.track === e);
			if (i) return i;
			qr(r, e.source._codec), c(r), c(r.decoderConfig);
			const a = { ...r.decoderConfig };
			let s = !1;
			if ("aac" === e.source._codec && !a.description) {
				if (!t) throw new Error("No AAC description provided; you must therefore provide a priming packet.");
				const e = Oa(qo.tempFromBytes(t.data));
				if (!e) throw new Error("Couldn't parse ADTS header from the AAC packet. Make sure the packets are in ADTS format (as specified in ISO 13818-7) when not providing a description, or provide a description (must be an AudioSpecificConfig as specified in ISO 14496-3) and ensure the packets are raw AAC data.");
				const r = Xe[e.samplingFrequencyIndex], i = Qe[e.channelConfiguration];
				if (void 0 === r || void 0 === i) throw new Error("Invalid ADTS frame header.");
				a.description = Je({
					objectType: e.objectType,
					outputSampleRate: r,
					outputNumberOfChannels: i
				}), s = !0;
			}
			if (!t) {
				if ("ac3" === e.source._codec || "eac3" === e.source._codec) throw new Error("AC-3/E-AC-3 require a priming packet.");
				if ("dts" === e.source._codec) throw new Error("DTS requires a priming packet.");
			}
			const n = {
				muxer: this,
				track: e,
				type: "audio",
				info: {
					numberOfChannels: r.decoderConfig.numberOfChannels,
					sampleRate: r.decoderConfig.sampleRate,
					decoderConfig: a,
					requiresPcmTransformation: !this.isFragmented && pr.includes(e.source._codec),
					expectedNextPcmPacketTimestamp: null,
					requiresAdtsStripping: s,
					primingPacket: t
				},
				timescale: a.sampleRate,
				samples: [],
				sampleQueue: [],
				timestampProcessingQueue: [],
				timeToSampleTable: [],
				compositionTimeOffsetTable: [],
				lastTimescaleUnits: null,
				lastSample: null,
				startTimestampOffset: null,
				finalizedChunks: [],
				currentChunk: null,
				compactlyCodedChunkTable: [],
				closed: !1,
				avgBitrate: e.source._nominalBitrate ?? e.metadata.averageBitrate ?? 0,
				maxBitrate: e.source._nominalBitrate ?? e.metadata.bitrate ?? 0
			};
			return this.trackDatas.push(n), this.trackDatas.sort((e, t) => e.track.id - t.track.id), this.allTracksAreKnown() && this.allTracksKnown.resolve(), n;
		}
		getSubtitleTrackData(e, t) {
			const r = this.trackDatas.find((t) => t.track === e);
			if (r) return r;
			((e) => {
				if (!e) throw new TypeError("Subtitle metadata must be provided.");
				if ("object" != typeof e) throw new TypeError("Subtitle metadata must be an object.");
				if (!e.config) throw new TypeError("Subtitle metadata must include a config object.");
				if ("object" != typeof e.config) throw new TypeError("Subtitle metadata config must be an object.");
				if ("string" != typeof e.config.description) throw new TypeError("Subtitle metadata config description must be a string.");
			})(t), c(t), c(t.config);
			const i = {
				muxer: this,
				track: e,
				type: "subtitle",
				info: { config: t.config },
				timescale: 1e3,
				samples: [],
				sampleQueue: [],
				timestampProcessingQueue: [],
				timeToSampleTable: [],
				compositionTimeOffsetTable: [],
				lastTimescaleUnits: null,
				lastSample: null,
				startTimestampOffset: null,
				finalizedChunks: [],
				currentChunk: null,
				compactlyCodedChunkTable: [],
				closed: !1,
				avgBitrate: e.source._nominalBitrate ?? e.metadata.averageBitrate ?? 0,
				maxBitrate: e.source._nominalBitrate ?? e.metadata.bitrate ?? 0,
				lastCueEndTimestamp: null,
				cueQueue: [],
				nextSourceId: 0,
				cueToSourceId: /* @__PURE__ */ new WeakMap()
			};
			return this.trackDatas.push(i), this.trackDatas.sort((e, t) => e.track.id - t.track.id), this.allTracksAreKnown() && this.allTracksKnown.resolve(), i;
		}
		async addEncodedVideoPacket(e, t, r) {
			const i = await this.mutex.acquire();
			try {
				const i = this.getVideoTrackData(e, t, r);
				let a = t.data;
				if (i.info.requiresAnnexBTransformation) {
					const e = [...ct(a)].map((e) => a.subarray(e.offset, e.offset + e.length));
					if (0 === e.length) throw new Error("Failed to transform packet data. Make sure all packets are provided in Annex B format, as specified in ITU-T-REC-H.264 and ITU-T-REC-H.265.");
					a = pt(e, 4);
				}
				this.validateTimestamp(i.track, t.timestamp, "key" === t.type);
				const s = this.createSampleForTrack(i, a, t.timestamp, t.duration, t.type);
				await this.registerSample(i, s);
			} finally {
				i();
			}
		}
		async addEncodedAudioPacket(e, t, r) {
			const i = await this.mutex.acquire();
			try {
				const i = this.getAudioTrackData(e, t, r);
				let a = t.data;
				if (i.info.requiresAdtsStripping) {
					const e = Oa(qo.tempFromBytes(a));
					if (!e) throw new Error("Expected ADTS frame, didn't get one.");
					const t = null === e.crcCheck ? 7 : 9;
					a = a.subarray(t);
				}
				this.validateTimestamp(i.track, t.timestamp, "key" === t.type);
				let s = t.timestamp, n = t.duration;
				if (i.info.requiresPcmTransformation) {
					const e = Fr(i.info.decoderConfig.codec).sampleSize * i.info.numberOfChannels;
					if (n = a.byteLength / e / i.info.sampleRate, null !== i.info.expectedNextPcmPacketTimestamp) {
						const e = s - i.info.expectedNextPcmPacketTimestamp;
						if (e < .01) s = i.info.expectedNextPcmPacketTimestamp;
						else {
							const t = await this.padWithSilence(i, i.info.expectedNextPcmPacketTimestamp, e);
							s = i.info.expectedNextPcmPacketTimestamp + t;
						}
					}
					i.info.expectedNextPcmPacketTimestamp = s + n;
				}
				const o = this.createSampleForTrack(i, a, s, n, t.type);
				await this.registerSample(i, o);
			} finally {
				i();
			}
		}
		async padWithSilence(e, t, r) {
			const i = md(r, e.timescale);
			if (r = i / e.timescale, i > 0) {
				const { sampleSize: a, silentValue: s } = Fr(e.info.decoderConfig.codec), n = i * e.info.numberOfChannels, o = new Uint8Array(a * n).fill(s), c = this.createSampleForTrack(e, new Uint8Array(o.buffer), t, r, "key");
				await this.registerSample(e, c);
			}
			return r;
		}
		async addSubtitleCue(e, t, r) {
			const i = await this.mutex.acquire();
			try {
				const i = this.getSubtitleTrackData(e, r);
				this.validateTimestamp(i.track, t.timestamp, !0), "webvtt" === e.source._codec && (i.cueQueue.push(t), await this.processWebVTTCues(i, t.timestamp));
			} finally {
				i();
			}
		}
		async processWebVTTCues(e, t) {
			for (; e.cueQueue.length > 0;) {
				e.lastCueEndTimestamp ??= Math.min(0, e.cueQueue[0].timestamp);
				const r = /* @__PURE__ */ new Set([]);
				for (const l of e.cueQueue) c(l.timestamp <= t), c(e.lastCueEndTimestamp <= l.timestamp + l.duration), r.add(Math.max(l.timestamp, e.lastCueEndTimestamp)), r.add(l.timestamp + l.duration);
				const i = [...r].sort((e, t) => e - t), a = i[0], s = i[1] ?? a;
				if (t < s) break;
				if (e.lastCueEndTimestamp < a) {
					this.auxWriter.seek(0);
					const t = Ul();
					this.auxBoxWriter.writeBox(t);
					const r = this.auxTarget._getSlice(0, this.auxWriter.getPos()), i = this.createSampleForTrack(e, r, e.lastCueEndTimestamp, a - e.lastCueEndTimestamp, "key");
					await this.registerSample(e, i), e.lastCueEndTimestamp = a;
				}
				this.auxWriter.seek(0);
				for (let t = 0; t < e.cueQueue.length; t++) {
					const r = e.cueQueue[t];
					if (r.timestamp >= s) break;
					kc.lastIndex = 0;
					const i = kc.test(r.text), n = r.timestamp + r.duration;
					let o = e.cueToSourceId.get(r);
					if (void 0 === o && s < n && (o = e.nextSourceId++, e.cueToSourceId.set(r, o)), r.notes) {
						const e = Wl(r.notes);
						this.auxBoxWriter.writeBox(e);
					}
					const c = Ll(r.text, i ? a : null, r.identifier ?? null, r.settings ?? null, o ?? null);
					this.auxBoxWriter.writeBox(c), n === s && e.cueQueue.splice(t--, 1);
				}
				const n = this.auxTarget._getSlice(0, this.auxWriter.getPos()), o = this.createSampleForTrack(e, n, a, s - a, "key");
				await this.registerSample(e, o), e.lastCueEndTimestamp = s;
			}
		}
		createSampleForTrack(e, t, r, i, a) {
			return {
				timestamp: r,
				decodeTimestamp: r,
				duration: i,
				data: t,
				size: t.byteLength,
				type: a,
				timescaleUnitsToNextSample: md(i, e.timescale)
			};
		}
		processTimestamps(e, t) {
			if (0 === e.timestampProcessingQueue.length) return;
			if ("audio" === e.type && e.info.requiresPcmTransformation) {
				c(!this.isFragmented), e.startTimestampOffset ??= e.timestampProcessingQueue[0].timestamp;
				let t = 0;
				for (let r = 0; r < e.timestampProcessingQueue.length; r++) {
					const i = e.timestampProcessingQueue[r];
					t += md(i.duration, e.timescale);
				}
				if (0 === e.timeToSampleTable.length) e.timeToSampleTable.push({
					sampleCount: t,
					sampleDelta: 1
				});
				else T(e.timeToSampleTable).sampleCount += t;
				e.timestampProcessingQueue.length = 0;
				return;
			}
			const r = e.timestampProcessingQueue.map((e) => e.timestamp).sort((e, t) => e - t);
			this.isFragmented ? e.startTimestampOffset ??= Math.min(r[0], 0) : e.startTimestampOffset ??= r[0];
			for (let i = 0; i < e.timestampProcessingQueue.length; i++) {
				const t = e.timestampProcessingQueue[i];
				t.decodeTimestamp = r[i];
				const a = md(t.timestamp - t.decodeTimestamp, e.timescale), s = md(t.duration, e.timescale);
				if (null !== e.lastTimescaleUnits) {
					c(e.lastSample);
					const r = md(t.decodeTimestamp, e.timescale, !1), i = Math.round(r - e.lastTimescaleUnits);
					if (c(i >= 0), e.lastTimescaleUnits += i, e.lastSample.timescaleUnitsToNextSample = i, !this.isFragmented) {
						let t = T(e.timeToSampleTable);
						if (c(t), 1 === t.sampleCount) {
							t.sampleDelta = i;
							const r = e.timeToSampleTable[e.timeToSampleTable.length - 2];
							r && r.sampleDelta === i && (r.sampleCount++, e.timeToSampleTable.pop(), t = r);
						} else t.sampleDelta !== i && (t.sampleCount--, e.timeToSampleTable.push(t = {
							sampleCount: 1,
							sampleDelta: i
						}));
						t.sampleDelta === s ? t.sampleCount++ : e.timeToSampleTable.push({
							sampleCount: 1,
							sampleDelta: s
						});
						const r = T(e.compositionTimeOffsetTable);
						c(r), r.sampleCompositionTimeOffset === a ? r.sampleCount++ : e.compositionTimeOffsetTable.push({
							sampleCount: 1,
							sampleCompositionTimeOffset: a
						});
					}
				} else e.lastTimescaleUnits = md(t.decodeTimestamp, e.timescale, !1), this.isFragmented || (e.timeToSampleTable.push({
					sampleCount: 1,
					sampleDelta: s
				}), e.compositionTimeOffsetTable.push({
					sampleCount: 1,
					sampleCompositionTimeOffset: a
				}));
				e.lastSample = t;
			}
			if (e.timestampProcessingQueue.length = 0, c(e.lastSample), c(null !== e.lastTimescaleUnits), void 0 !== t && 0 === e.lastSample.timescaleUnitsToNextSample) {
				c("key" === t.type);
				const r = md(t.timestamp, e.timescale, !1), i = Math.round(r - e.lastTimescaleUnits);
				e.lastSample.timescaleUnitsToNextSample = i;
			}
		}
		async registerSample(e, t) {
			"key" === t.type && this.processTimestamps(e, t), e.timestampProcessingQueue.push(t), this.isFragmented ? (e.sampleQueue.push(t), await this.interleaveSamples()) : "reserve" === this.fastStart ? await this.registerSampleFastStartReserve(e, t) : await this.addSampleToTrack(e, t);
		}
		async addSampleToTrack(e, t) {
			if (!this.isFragmented && (e.samples.push(t), "reserve" === this.fastStart)) {
				const t = e.track.metadata.maximumPacketCount;
				if (c(void 0 !== t), e.samples.length > t) throw new Error(`Track #${e.track.id} has already reached the maximum packet count (${t}). Either add less packets or increase the maximum packet count.`);
			}
			let r = !1;
			if (e.currentChunk) {
				e.currentChunk.startTimestamp = Math.min(e.currentChunk.startTimestamp, t.timestamp);
				const i = t.timestamp - e.currentChunk.startTimestamp;
				if (this.isFragmented) {
					const a = this.trackDatas.every((r) => {
						if (e === r) return "key" === t.type;
						const i = r.sampleQueue[0];
						return i ? "key" === i.type : r.closed;
					});
					i >= this.minimumFragmentDuration && a && t.timestamp > this.maxWrittenTimestamp && (r = !0, await this.finalizeFragment());
				} else r = i >= .5;
			} else r = !0;
			r && (e.currentChunk && await this.finalizeCurrentChunk(e), e.currentChunk = {
				startTimestamp: t.timestamp,
				samples: [],
				offset: null,
				moofOffset: null,
				trafIndex: null
			}), c(e.currentChunk), e.currentChunk.samples.push(t), this.isFragmented && (this.maxWrittenTimestamp = Math.max(this.maxWrittenTimestamp, t.timestamp), this.maxWrittenEndTimestamp = Math.max(this.maxWrittenEndTimestamp, t.timestamp + t.duration), this.minWrittenTimestamp = Math.min(this.minWrittenTimestamp, t.timestamp));
		}
		async finalizeCurrentChunk(e) {
			if (c(!this.isFragmented), c(this.writer), !e.currentChunk) return;
			e.finalizedChunks.push(e.currentChunk), this.finalizedChunks.push(e.currentChunk);
			let t = e.currentChunk.samples.length;
			if ("audio" === e.type && e.info.requiresPcmTransformation && (t = e.currentChunk.samples.reduce((t, r) => t + md(r.duration, e.timescale), 0)), 0 !== e.compactlyCodedChunkTable.length && T(e.compactlyCodedChunkTable).samplesPerChunk === t || e.compactlyCodedChunkTable.push({
				firstChunk: e.finalizedChunks.length,
				samplesPerChunk: t
			}), "in-memory" !== this.fastStart) {
				e.currentChunk.offset = this.writer.getPos();
				for (const t of e.currentChunk.samples) c(t.data), this.writer.write(t.data), t.data = null;
				await this.writer.flush();
			} else e.currentChunk.offset = 0;
		}
		async interleaveSamples(e = !1) {
			if (c(this.isFragmented), e || this.allTracksAreKnown()) e: for (;;) {
				let t = null, r = Infinity;
				for (const a of this.trackDatas) {
					if (!e && 0 === a.sampleQueue.length && !a.closed) break e;
					a.sampleQueue.length > 0 && a.sampleQueue[0].timestamp < r && (t = a, r = a.sampleQueue[0].timestamp);
				}
				if (!t) break;
				const i = t.sampleQueue.shift();
				await this.addSampleToTrack(t, i);
			}
		}
		async finalizeFragment(e = !this.isCmaf) {
			if (c(this.isFragmented), !this.wroteFragmentedHeader) {
				this.wroteFragmentedHeader = !0;
				const e = this.initBoxWriter ?? this.boxWriter;
				c(e), this.formatOptions.onMoov && e.writer.startTrackingWrites(), this.ensureOneEnabledTrack();
				const t = Wc(this);
				if (e.writeBox(t), this.formatOptions.onMoov) {
					const { data: t, start: r } = e.writer.stopTrackingWrites();
					this.formatOptions.onMoov(t, r);
				}
				if (this.isCmaf) {
					c(this.initWriter), await this.initWriter.flush(), await this.initWriter.finalize(), this.writer = await this.output._getRootWriter(!0), this.boxWriter = new yc(this.writer);
					const e = this.boxWriter.measureBox(Nc()), t = this.boxWriter.measureBox(Uc(this, 0));
					this.segmentHeaderSize = e + t, this.writer.seek(this.segmentHeaderSize);
				}
			}
			c(this.writer), c(this.boxWriter);
			const t = this.trackDatas.filter((e) => e.currentChunk);
			if (0 === t.length) return void (e && await this.writer.flush());
			const r = this.nextFragmentNumber++, i = Bl(r, t), a = this.writer.getPos(), s = a + this.boxWriter.measureBox(i);
			let n = s + 8, o = Infinity;
			for (let f = 0; f < t.length; f++) {
				const e = t[f];
				c(e.currentChunk), c(null !== e.startTimestampOffset), e.currentChunk.offset = n, e.currentChunk.moofOffset = a, e.currentChunk.trafIndex = f, e.currentChunk.startTimestamp -= e.startTimestampOffset;
				for (const t of e.currentChunk.samples) n += t.size, t.timestamp -= e.startTimestampOffset, t.decodeTimestamp -= e.startTimestampOffset;
				o = Math.min(o, e.currentChunk.startTimestamp);
			}
			const l = n - s, d = l >= 2 ** 32;
			if (d) for (const c of t) c.currentChunk.offset += 8;
			this.formatOptions.onMoof && this.writer.startTrackingWrites();
			const u = Bl(r, t);
			if (this.boxWriter.writeBox(u), this.formatOptions.onMoof) {
				const { data: e, start: t } = this.writer.stopTrackingWrites();
				this.formatOptions.onMoof(e, t, o);
			}
			c(this.writer.getPos() === s), this.formatOptions.onMdat && this.writer.startTrackingWrites();
			const h = Lc(d);
			h.size = l, this.boxWriter.writeBox(h), this.writer.seek(s + (d ? 16 : 8));
			for (const c of t) for (const e of c.currentChunk.samples) this.writer.write(e.data), e.data = null;
			if (this.formatOptions.onMdat) {
				const { data: e, start: t } = this.writer.stopTrackingWrites();
				this.formatOptions.onMdat(e, t);
			}
			for (const c of t) c.finalizedChunks.push(c.currentChunk), this.finalizedChunks.push(c.currentChunk), c.currentChunk = null;
			e && await this.writer.flush();
		}
		async registerSampleFastStartReserve(e, t) {
			this.allTracksAreKnown() ? (this.mdat || await this.createFastStartReserveMdat(), await this.addSampleToTrack(e, t)) : e.sampleQueue.push(t);
		}
		async createFastStartReserveMdat() {
			c(this.writer), c(this.boxWriter), this.ensureOneEnabledTrack();
			const e = Wc(this), t = this.boxWriter.measureBox(e) + this.computeSampleTableSizeUpperBound() + 4096;
			c(null !== this.ftypSize), this.writer.seek(this.ftypSize + t), this.formatOptions.onMdat && this.writer.startTrackingWrites(), this.mdat = Lc(!0), this.boxWriter.writeBox(this.mdat);
			for (const r of this.trackDatas) {
				for (const e of r.sampleQueue) await this.addSampleToTrack(r, e);
				r.sampleQueue.length = 0;
			}
		}
		computeSampleTableSizeUpperBound() {
			c("reserve" === this.fastStart);
			let e = 0;
			for (const t of this.trackDatas) {
				const r = t.track.metadata.maximumPacketCount;
				c(void 0 !== r), e += 8 * Math.ceil(2 / 3 * r), e += 4 * r, e += 8 * Math.ceil(2 / 3 * r), e += 12 * Math.ceil(2 / 3 * r), e += 4 * r, e += 8 * r;
			}
			return e;
		}
		async onTrackClose(e) {
			const t = await this.mutex.acquire(), r = this.trackDatas.find((t) => t.track === e);
			r && (r.closed = !0, "subtitle" === r.type && "webvtt" === e.source._codec && await this.processWebVTTCues(r, Infinity), this.processTimestamps(r)), this.allTracksAreKnown() && this.allTracksKnown.resolve(), this.isFragmented && await this.interleaveSamples(), t();
		}
		ensureOneEnabledTrack() {
			for (const e of [
				"video",
				"audio",
				"subtitle"
			]) {
				const t = this.trackDatas.filter((t) => t.type === e);
				if (0 !== t.length && !t.some((e) => !1 !== e.track.metadata.disposition?.default)) {
					const e = t[0];
					e.track.metadata.disposition = {
						...e.track.metadata.disposition,
						default: !0
					};
				}
			}
		}
		async forceFragmentFinalization() {
			c(this.isFragmented);
			const e = await this.mutex.acquire();
			try {
				for (const e of this.trackDatas) "subtitle" === e.type && "webvtt" === e.track.source._codec && await this.processWebVTTCues(e, Infinity), this.processTimestamps(e);
				await this.interleaveSamples(!0), await this.finalizeFragment();
			} finally {
				e();
			}
		}
		async finalize() {
			const e = await this.mutex.acquire();
			this.allTracksKnown.resolve(), this.ensureOneEnabledTrack(), this.mdat || "reserve" !== this.fastStart || await this.createFastStartReserveMdat();
			for (const r of this.trackDatas) r.closed = !0, "subtitle" === r.type && "webvtt" === r.track.source._codec && await this.processWebVTTCues(r, Infinity), this.processTimestamps(r);
			if (this.isFragmented) await this.interleaveSamples(!0), await this.finalizeFragment(!1);
			else for (const r of this.trackDatas) {
				await this.finalizeCurrentChunk(r);
				const e = pd(r);
				if (e > 0) {
					let t = 0;
					for (const e of r.samples) t += e.size;
					r.avgBitrate = Math.round(8 * t / e);
				} else r.avgBitrate = 0;
				let t = 0, i = 0, a = 0;
				for (let s = 0; s < r.samples.length; s++) {
					const e = r.samples[s];
					for (i += e.size; e.decodeTimestamp - r.samples[t].decodeTimestamp >= 1;) i -= r.samples[t].size, t++;
					a = Math.max(a, i);
				}
				if (r.maxBitrate = 8 * a, null !== r.startTimestampOffset) for (let s = 0; s < r.samples.length; s++) {
					const e = r.samples[s];
					e.timestamp -= r.startTimestampOffset, e.decodeTimestamp -= r.startTimestampOffset;
				}
			}
			if (c(this.writer), c(this.boxWriter), "in-memory" === this.fastStart) {
				let e;
				this.mdat = Lc(!1);
				for (let r = 0; r < 2; r++) {
					const t = Wc(this), r = this.boxWriter.measureBox(t);
					e = this.boxWriter.measureBox(this.mdat);
					let i = this.writer.getPos() + r + e;
					for (const a of this.finalizedChunks) {
						a.offset = i;
						for (const { data: t } of a.samples) c(t), i += t.byteLength, e += t.byteLength;
					}
					if (i < 2 ** 32) break;
					e >= 2 ** 32 && (this.mdat.largeSize = !0);
				}
				this.formatOptions.onMoov && this.writer.startTrackingWrites();
				const t = Wc(this);
				if (this.boxWriter.writeBox(t), this.formatOptions.onMoov) {
					const { data: e, start: t } = this.writer.stopTrackingWrites();
					this.formatOptions.onMoov(e, t);
				}
				this.formatOptions.onMdat && this.writer.startTrackingWrites(), this.mdat.size = e, this.boxWriter.writeBox(this.mdat);
				for (const r of this.finalizedChunks) for (const e of r.samples) c(e.data), this.writer.write(e.data), e.data = null;
				if (this.formatOptions.onMdat) {
					const { data: e, start: t } = this.writer.stopTrackingWrites();
					this.formatOptions.onMdat(e, t);
				}
			} else if (this.isFragmented) if (this.isCmaf) {
				const e = null !== this.segmentHeaderSize ? this.writer.getPos() - this.segmentHeaderSize : 0;
				this.writer.seek(0), this.boxWriter.writeBox(Nc()), this.boxWriter.writeBox(Uc(this, e));
			} else {
				const e = this.writer.getPos(), r = (t = this.trackDatas, Oc("mfra", void 0, [...t.map(zl), Nl()]));
				this.boxWriter.writeBox(r);
				const i = this.writer.getPos() - e;
				this.writer.seek(this.writer.getPos() - 4), this.boxWriter.writeU32(i);
			}
			else {
				c(this.mdat);
				const e = this.boxWriter.offsets.get(this.mdat);
				c(void 0 !== e);
				const t = this.writer.getPos() - e;
				if (this.mdat.size = t, this.mdat.largeSize = t >= 2 ** 32, this.boxWriter.patchBox(this.mdat), this.formatOptions.onMdat) {
					const { data: e, start: t } = this.writer.stopTrackingWrites();
					this.formatOptions.onMdat(e, t);
				}
				const r = Wc(this);
				if ("reserve" === this.fastStart) {
					c(null !== this.ftypSize), this.writer.seek(this.ftypSize), this.formatOptions.onMoov && this.writer.startTrackingWrites(), this.boxWriter.writeBox(r);
					const e = this.boxWriter.offsets.get(this.mdat) - this.writer.getPos();
					this.boxWriter.writeBox({
						type: "free",
						size: e
					});
				} else this.formatOptions.onMoov && this.writer.startTrackingWrites(), this.boxWriter.writeBox(r);
				if (this.formatOptions.onMoov) {
					const { data: e, start: t } = this.writer.stopTrackingWrites();
					this.formatOptions.onMoov(e, t);
				}
			}
			var t;
			e();
		}
	}, kd = class {
		constructor(e) {
			this.sourceSampleRate = null, this.sourceNumberOfChannels = null, this.startTime = null, this.bufferStartFrame = 0, this.maxWrittenFrame = null, this.targetSampleRate = e.targetSampleRate, this.targetNumberOfChannels = e.targetNumberOfChannels, this.onSample = e.onSample, this.bufferSizeInFrames = Math.floor(5 * this.targetSampleRate), this.bufferSizeInSamples = this.bufferSizeInFrames * this.targetNumberOfChannels;
		}
		doChannelMixerSetup() {
			c(null !== this.sourceNumberOfChannels);
			const e = this.sourceNumberOfChannels, t = this.targetNumberOfChannels;
			this.channelMixer = 1 === e && 2 === t ? (t, r) => t[r * e] : 1 === e && 4 === t ? (t, r, i) => t[r * e] * +(i < 2) : 1 === e && 6 === t ? (t, r, i) => t[r * e] * +(2 === i) : 2 === e && 1 === t ? (t, r) => {
				const i = r * e;
				return .5 * (t[i] + t[i + 1]);
			} : 2 === e && 4 === t || 2 === e && 6 === t ? (t, r, i) => i < 2 ? t[r * e + i] : 0 : 4 === e && 1 === t ? (t, r) => {
				const i = r * e;
				return .25 * (t[i] + t[i + 1] + t[i + 2] + t[i + 3]);
			} : 4 === e && 2 === t ? (t, r, i) => {
				const a = r * e;
				return .5 * (t[a + i] + t[a + i + 2]);
			} : 4 === e && 6 === t ? (t, r, i) => {
				const a = r * e;
				return i < 2 ? t[a + i] : 2 === i || 3 === i ? 0 : t[a + i - 2];
			} : 6 === e && 1 === t ? (t, r) => {
				const i = r * e;
				return Math.SQRT1_2 * (t[i] + t[i + 1]) + t[i + 2] + .5 * (t[i + 4] + t[i + 5]);
			} : 6 === e && 2 === t ? (t, r, i) => {
				const a = r * e;
				return t[a + i] + Math.SQRT1_2 * (t[a + 2] + t[a + i + 4]);
			} : 6 === e && 4 === t ? (t, r, i) => {
				const a = r * e;
				return i < 2 ? t[a + i] + Math.SQRT1_2 * t[a + 2] : t[a + i + 2];
			} : (t, r, i) => i < e ? t[r * e + i] : 0;
		}
		ensureTempBufferSize(e) {
			let t = this.tempSourceBuffer.length;
			for (; t < e;) t *= 2;
			if (t !== this.tempSourceBuffer.length) {
				const e = new Float32Array(t);
				e.set(this.tempSourceBuffer), this.tempSourceBuffer = e;
			}
		}
		async add(e) {
			if (null === this.sourceSampleRate) {
				this.sourceSampleRate = e.sampleRate, this.sourceNumberOfChannels = e.numberOfChannels, this.startTime = e.timestamp;
				const t = Math.ceil(this.targetSampleRate / this.sourceSampleRate);
				this.bufferCapacityInFrames = this.bufferSizeInFrames + t, this.outputBuffer = new Float32Array(this.bufferCapacityInFrames * this.targetNumberOfChannels), this.tempSourceBuffer = new Float32Array(this.sourceSampleRate * this.sourceNumberOfChannels), this.doChannelMixerSetup();
			}
			c(null !== this.startTime);
			const t = e.numberOfFrames * e.numberOfChannels;
			this.ensureTempBufferSize(t);
			const r = e.allocationSize({
				planeIndex: 0,
				format: "f32"
			}), i = new Float32Array(this.tempSourceBuffer.buffer, 0, r / 4);
			e.copyTo(i, {
				planeIndex: 0,
				format: "f32"
			});
			const a = e.timestamp - this.startTime, s = a + e.duration, n = Math.floor((a - 1 / this.sourceSampleRate) * this.targetSampleRate) + 1, o = Math.ceil(s * this.targetSampleRate);
			for (let l = n; l < o; l++) {
				if (l < this.bufferStartFrame) continue;
				for (; l >= this.bufferStartFrame + this.bufferCapacityInFrames;) await this.finalizeCurrentBuffer(), this.bufferStartFrame += this.bufferSizeInFrames;
				const t = l - this.bufferStartFrame;
				c(t < this.bufferCapacityInFrames);
				const r = (l / this.targetSampleRate - a) * this.sourceSampleRate, s = Math.floor(r), n = Math.ceil(r), o = r - s;
				for (let a = 0; a < this.targetNumberOfChannels; a++) {
					let r = 0, c = 0;
					s >= 0 && s < e.numberOfFrames && (r = this.channelMixer(i, s, a)), n >= 0 && n < e.numberOfFrames && (c = this.channelMixer(i, n, a));
					const l = r + o * (c - r), d = t * this.targetNumberOfChannels + a;
					this.outputBuffer[d] += l;
				}
				null === this.maxWrittenFrame ? this.maxWrittenFrame = t : this.maxWrittenFrame = Math.max(this.maxWrittenFrame, t);
			}
		}
		async finalizeCurrentBuffer() {
			if (null === this.maxWrittenFrame) return;
			c(null !== this.startTime);
			const e = Math.min(this.maxWrittenFrame + 1, this.bufferSizeInFrames) * this.targetNumberOfChannels, t = new Float32Array(e);
			t.set(this.outputBuffer.subarray(0, e));
			const r = new zn({
				format: "f32",
				sampleRate: this.targetSampleRate,
				numberOfChannels: this.targetNumberOfChannels,
				timestamp: this.startTime + this.bufferStartFrame / this.targetSampleRate,
				data: t
			});
			await this.onSample(r), this.outputBuffer.copyWithin(0, this.bufferSizeInSamples), this.outputBuffer.fill(0, this.outputBuffer.length - this.bufferSizeInSamples), this.maxWrittenFrame = this.maxWrittenFrame >= this.bufferSizeInFrames ? this.maxWrittenFrame - this.bufferSizeInFrames : null;
		}
		async finalize() {
			for (; null !== this.maxWrittenFrame;) await this.finalizeCurrentBuffer(), this.bufferStartFrame += this.bufferSizeInFrames;
		}
	}, wd = function(e, t, r) {
		if (null != t) {
			if ("object" != typeof t && "function" != typeof t) throw new TypeError("Object expected.");
			var i, a;
			if (r) {
				if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
				i = t[Symbol.asyncDispose];
			}
			if (void 0 === i) {
				if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
				i = t[Symbol.dispose], r && (a = i);
			}
			if ("function" != typeof i) throw new TypeError("Object not disposable.");
			a && (i = function() {
				try {
					a.call(this);
				} catch (e) {
					return Promise.reject(e);
				}
			}), e.stack.push({
				value: t,
				dispose: i,
				async: r
			});
		} else r && e.stack.push({ async: !0 });
		return t;
	}, yd = function(e) {
		return function(t) {
			function r(r) {
				t.error = t.hasError ? new e(r, t.error, "An error was suppressed during disposal.") : r, t.hasError = !0;
			}
			var i, a = 0;
			return function e() {
				for (; i = t.stack.pop();) try {
					if (!i.async && 1 === a) return a = 0, t.stack.push(i), Promise.resolve().then(e);
					if (i.dispose) {
						var s = i.dispose.call(i.value);
						if (i.async) return a |= 2, Promise.resolve(s).then(e, function(t) {
							return r(t), e();
						});
					} else a |= 1;
				} catch (n) {
					r(n);
				}
				if (1 === a) return t.hasError ? Promise.reject(t.error) : Promise.resolve();
				if (t.hasError) throw t.error;
			}();
		};
	}("function" == typeof SuppressedError ? SuppressedError : function(e, t, r) {
		var i = new Error(r);
		return i.name = "SuppressedError", i.error = e, i.suppressed = t, i;
	}), bd = class {
		constructor() {
			this._connectedTrack = null, this._closingPromise = null, this._closed = !1, this._nominalBitrate = null;
		}
		_ensureValidAdd() {
			if (!this._connectedTrack) throw new Error("Source is not connected to an output track.");
			if ("canceled" === this._connectedTrack.output.state) throw new Error("Output has been canceled.");
			if ("finalizing" === this._connectedTrack.output.state || "finalized" === this._connectedTrack.output.state) throw new Error("Output has been finalized.");
			if ("pending" === this._connectedTrack.output.state) throw new Error("Output has not started.");
			if (this._closed) throw new Error("Source is closed.");
		}
		async _start() {}
		async _flushAndClose(e) {}
		close() {
			if (this._closingPromise) return;
			const e = this._connectedTrack;
			if (!e) throw new Error("Cannot call close without connecting the source to an output track.");
			if ("pending" === e.output.state) throw new Error("Cannot call close before output has been started.");
			this._closingPromise = (async () => {
				await this._flushAndClose(!1), this._closed = !0, "finalizing" !== e.output.state && "finalized" !== e.output.state && e.output._muxer.onTrackClose(e);
			})();
		}
		async _flushOrWaitForOngoingClose(e) {
			return this._closingPromise ??= (async () => {
				await this._flushAndClose(e), this._closed = !0;
			})();
		}
	}, Td = class extends bd {
		constructor(e) {
			if (super(), !mr.includes(e)) throw new TypeError(`Invalid video codec '${e}'. Must be one of: ${mr.join(", ")}.`);
			this._codec = e;
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/ const vd = (e, t) => {
		if (e.metadata.hasOnlyKeyPackets && "key" !== t.type) throw new Error("Cannot add non-key packets to a hasOnlyKeyPackets video track.");
	};
	var Sd = class extends Td {
		constructor(e) {
			super(e);
		}
		add(e, t) {
			if (!(e instanceof Zr)) throw new TypeError("packet must be an EncodedPacket.");
			if (e.isMetadataOnly) throw new TypeError("Metadata-only packets cannot be added.");
			if (void 0 !== t && (!t || "object" != typeof t)) throw new TypeError("meta, when provided, must be an object.");
			return this._ensureValidAdd(), vd(this._connectedTrack, e), this._connectedTrack.output._muxer.addEncodedVideoPacket(this._connectedTrack, e, t);
		}
	}, Pd = class {
		setError(e) {
			this.errorSet || (this.error = e, this.errorSet = !0);
		}
		constructor(e, t) {
			this.source = e, this.encodingConfig = t, this.ensureEncoderPromise = null, this.encoderInitialized = !1, this.encoder = null, this.encoderConfig = null, this.encodersReclaimed = !1, this.muxer = null, this.lastMultipleOfKeyFrameInterval = -1, this.emittedEncoderPackets = 0, this.codedWidth = null, this.codedHeight = null, this.outputWidth = null, this.outputHeight = null, this.frameRateLastSample = null, this.frameRateLastTimestamp = null, this.frameRateLastEndTimestamp = null, this.preciseTimings = [], this.customEncoder = null, this.customEncoderCallSerializer = new pe(), this.customEncoderQueueSize = 0, this.defaultEncodeOptions = {}, this.alphaEncoder = null, this.splitter = null, this.splitterCreationFailed = !1, this.alphaFrameQueue = [], this.error = null, this.errorSet = !1, this.lastMuxerPromise = Promise.resolve(), this.closed = !1;
		}
		async add(e, t, r) {
			const i = e;
			try {
				this.checkForEncoderError(), this.source._ensureValidAdd();
				const a = this.encodingConfig, s = a.sizeChangeBehavior ?? "deny";
				let n = !1;
				if (null !== this.codedWidth && null !== this.codedHeight) {
					if ((e.codedWidth !== this.codedWidth || e.codedHeight !== this.codedHeight) && (n = !0, "deny" === s)) throw new Error(`Video sample size must remain constant. Expected ${this.codedWidth}x${this.codedHeight}, got ${e.codedWidth}x${e.codedHeight}. To allow the sample size to change over time, set \`sizeChangeBehavior\` to a value other than 'deny' in the encoding options.`);
				} else this.codedWidth = e.codedWidth, this.codedHeight = e.codedHeight;
				if (void 0 !== a.transform?.width || void 0 !== a.transform?.height || void 0 !== a.transform?.rotate || void 0 !== a.transform?.flip || void 0 !== a.transform?.crop || !0 === a.transform?.force || n && "passThrough" !== s) {
					let r = a.transform?.width, i = a.transform?.height, o = a.transform?.fit ?? "fill";
					n && "passThrough" !== s && (c(this.outputWidth), c(this.outputHeight), c("deny" !== s), r = this.outputWidth, i = this.outputHeight, o = s);
					const l = await e.transform({
						width: r,
						height: i,
						roundDimensionsTo: 2,
						crop: a.transform?.crop,
						rotate: a.transform?.rotate,
						flip: a.transform?.flip,
						fit: o,
						alpha: a.alpha
					});
					null !== this.outputWidth && null !== this.outputHeight || (this.outputWidth = l.displayWidth, this.outputHeight = l.displayHeight), t && e.close(), e = l, t = !0;
				} else null !== this.outputWidth && null !== this.outputHeight || (this.outputWidth = e.codedWidth, this.outputHeight = e.codedHeight);
				const o = a.transform?.frameRate;
				if (void 0 !== o) {
					const a = e.timestamp + e.duration, s = oe(e.timestamp, o);
					if (null !== this.frameRateLastSample) {
						if (s <= this.frameRateLastTimestamp) return this.frameRateLastSample.close(), this.frameRateLastSample = e.clone(), void (this.frameRateLastEndTimestamp = a);
						await this.padFrameRate(s, r);
					}
					e === i && (e = e.clone(), t = !0), e.setTimestamp(s), e.setDuration(1 / o), this.frameRateLastSample?.close(), this.frameRateLastSample = e.clone(), this.frameRateLastTimestamp = s, this.frameRateLastEndTimestamp = a;
				}
				await this.processAndEncode(e, r);
			} finally {
				t && e.close();
			}
		}
		async processAndEncode(e, t) {
			const r = this.encodingConfig;
			let i;
			if (r.transform?.process) {
				let t = r.transform.process(e);
				if (Pe(t) && (t = await t), null === t) return;
				Array.isArray(t) || (t = [t]);
				const s = [];
				try {
					for (const r of t) r instanceof yn ? s.push(r) : "undefined" != typeof VideoFrame && r instanceof VideoFrame ? s.push(new yn(r)) : s.push(new yn(r, {
						timestamp: e.timestamp,
						duration: e.duration
					}));
				} catch (a) {
					for (const t of s) t !== e && t.close();
					for (const r of t) (r instanceof yn && r !== e || "undefined" != typeof VideoFrame && r instanceof VideoFrame) && r.close();
					throw a;
				}
				i = s;
			} else i = [e];
			try {
				for (const e of i) {
					if (this.encoderInitialized || (this.ensureEncoderPromise || this.ensureEncoder(e), this.encoderInitialized || await this.ensureEncoderPromise), c(this.encoderInitialized), this.closed) break;
					this.encodersReclaimed && this.recreateWebCodecsEncoders();
					const r = this.encodingConfig.keyFrameInterval ?? 2, i = Math.floor(e.timestamp / r), a = {
						...this.defaultEncodeOptions,
						...e.encodeOptions,
						...t
					}, s = {
						...a,
						keyFrame: void 0 !== a.keyFrame ? a.keyFrame : 0 === r || i !== this.lastMultipleOfKeyFrameInterval
					};
					if (this.lastMultipleOfKeyFrameInterval = i, this.encodingConfig.onEncodedSample?.(e), this.customEncoder) {
						this.customEncoderQueueSize++;
						const t = e.clone(), r = this.customEncoderCallSerializer.call(() => this.customEncoder.encode(t, s)).catch((e) => this.setError(e)).finally(() => {
							this.customEncoderQueueSize--, t.close();
						});
						this.customEncoderQueueSize >= 4 && await r;
					} else {
						c(this.encoder);
						const t = e.toVideoFrame(), r = K(this.preciseTimings, t.timestamp, (e) => e.microsecondTimestamp), i = -1 !== r ? this.preciseTimings[r] : null;
						if (i && i.microsecondTimestamp === t.timestamp ? (i.timestamp !== e.timestamp && (i.timestampIsValid = !1), i.duration !== e.duration && (i.durationIsValid = !1)) : (this.preciseTimings.splice(r + 1, 0, {
							microsecondTimestamp: t.timestamp,
							timestamp: e.timestamp,
							duration: e.duration,
							timestampIsValid: !0,
							durationIsValid: !0
						}), this.preciseTimings.length > 128 && this.preciseTimings.shift()), this.alphaEncoder) if (t.format && !t.format.includes("A") || this.splitterCreationFailed) {
							this.alphaFrameQueue.push(null);
							try {
								this.encoder.encode(t, s);
							} finally {
								t.close();
							}
						} else {
							this.splitter || (this.splitter = new Cd());
							const { colorFrame: e, alphaFrame: r } = await this.splitter.split(t);
							this.alphaFrameQueue.push(r);
							try {
								this.encoder.encode(e, s);
							} finally {
								e.close();
							}
						}
						else try {
							this.encoder.encode(t, s);
						} finally {
							t.close();
						}
						this.encoder.encodeQueueSize >= 4 && await new Promise((e) => this.encoder.addEventListener("dequeue", e, { once: !0 }));
					}
					await this.lastMuxerPromise;
				}
			} finally {
				for (const t of i) t !== e && t.close();
			}
		}
		async padFrameRate(e, t) {
			const r = this.encodingConfig.transform.frameRate;
			c(this.frameRateLastSample);
			const i = Math.round((e - this.frameRateLastTimestamp) * r);
			for (let s = 1; s < i; s++) {
				const e = {
					stack: [],
					error: void 0,
					hasError: !1
				};
				try {
					const i = wd(e, this.frameRateLastSample.clone(), !1);
					i.setTimestamp(this.frameRateLastTimestamp + s / r), i.setDuration(1 / r), await this.processAndEncode(i, t);
				} catch (a) {
					e.error = a, e.hasError = !0;
				} finally {
					yd(e);
				}
			}
		}
		ensureEncoder(e) {
			this.ensureEncoderPromise = (async () => {
				const t = io(this.encodingConfig.quality, this.encodingConfig.bitrate);
				c(void 0 !== t);
				const r = Kn({
					...this.encodingConfig,
					quality: t,
					width: e.codedWidth,
					height: e.codedHeight,
					squarePixelWidth: e.squarePixelWidth,
					squarePixelHeight: e.squarePixelHeight,
					framerate: this.source._connectedTrack?.metadata.frameRate
				});
				let i, a = null;
				for (const e of r) {
					const t = e.config;
					if (this.encodingConfig.onEncoderConfig?.(t), i = oo.find((e) => e.supports(this.encodingConfig.codec, t)), i) {
						a = e;
						break;
					}
					if ("undefined" != typeof VideoEncoder) {
						if (t.alpha = "discard", "keep" === this.encodingConfig.alpha && (t.latencyMode = "quality"), !(t.width % 2 != 1 && t.height % 2 != 1 || "avc" !== this.encodingConfig.codec && "hevc" !== this.encodingConfig.codec)) throw new Error(`The dimensions ${t.width}x${t.height} are not supported for codec '${this.encodingConfig.codec}'; both width and height must be even numbers. Make sure to round your dimensions to the nearest even number.`);
						try {
							if ((await VideoEncoder.isConfigSupported(t)).supported) {
								a = e;
								break;
							}
						} catch {}
					}
				}
				if (!a) {
					if ("undefined" == typeof VideoEncoder) throw new Error(ve("VideoEncoder"));
					const e = r[0].config, t = r.map(({ config: e, quantizer: t }) => null !== t ? `quantizer ${t}` : `${e.bitrate} bps`);
					throw new Error(`This specific encoder configuration (${e.codec}, ${t.join(" / ")}, ${e.width}x${e.height}, hardware acceleration: ${e.hardwareAcceleration ?? "no-preference"}) is not supported in this environment. Consider using another codec or changing your video parameters.`);
				}
				const s = a.config;
				null !== a.quantizer ? this.defaultEncodeOptions = to(this.encodingConfig.codec, a.quantizer) : this.source._nominalBitrate = s.bitrate ?? null, i ? (this.customEncoder = new i(), this.customEncoder.codec = this.encodingConfig.codec, this.customEncoder.config = s, this.customEncoder.onPacket = (e, t) => {
					if (!(e instanceof Zr)) throw new TypeError("The first argument passed to onPacket must be an EncodedPacket.");
					if (void 0 !== t && (!t || "object" != typeof t)) throw new TypeError("The second argument passed to onPacket must be an object or undefined.");
					vd(this.source._connectedTrack, e), this.encodingConfig.onEncodedPacket?.(e, t), this.lastMuxerPromise = this.muxer.addEncodedVideoPacket(this.source._connectedTrack, e, t).catch((e) => {
						this.setError(e);
					});
				}, this.customEncoder.onError = (e) => {
					this.setError(e);
				}, await this.customEncoder.init()) : (this.encoderConfig = s, this.createWebCodecsEncoders()), c(this.source._connectedTrack), this.muxer = this.source._connectedTrack.output._muxer, this.encoderInitialized = !0;
			})();
		}
		createWebCodecsEncoders() {
			const e = this.encoderConfig;
			c(e);
			const t = [], r = [];
			let i = 0, a = 0;
			const s = (e, t) => {
				((e) => e instanceof DOMException && "QuotaExceededError" === e.name && /reclaimed/i.test(e.message))(e) ? this.encodersReclaimed = !0 : (e.stack = t, this.setError(e));
			}, n = (/* @__PURE__ */ new Error("Encoding error")).stack;
			if (this.encoder = new VideoEncoder({
				output: (e, s) => {
					if (!this.alphaEncoder) return void this.addPacket(e, null, s);
					const n = this.alphaFrameQueue.shift();
					c(void 0 !== n), n ? (this.alphaEncoder.encode(n, {
						...this.defaultEncodeOptions,
						keyFrame: "key" === e.type
					}), a++, n.close(), t.push({
						chunk: e,
						meta: s
					})) : 0 === a ? this.addPacket(e, null, s) : (r.push(i + a), t.push({
						chunk: e,
						meta: s
					}));
				},
				error: (e) => s(e, n)
			}), this.encoder.configure(e), "keep" === this.encodingConfig.alpha) {
				const n = (/* @__PURE__ */ new Error("Encoding error")).stack;
				this.alphaEncoder = new VideoEncoder({
					output: (e, s) => {
						a--;
						const n = t.shift();
						for (c(void 0 !== n), this.addPacket(n.chunk, e, n.meta), i++; r.length > 0 && r[0] === i;) {
							r.shift();
							const e = t.shift();
							c(void 0 !== e), this.addPacket(e.chunk, null, e.meta);
						}
					},
					error: (e) => s(e, n)
				}), this.alphaEncoder.configure(e);
			}
		}
		addPacket(e, t, r) {
			const i = {};
			if (t) {
				const e = new Uint8Array(t.byteLength);
				t.copyTo(e), i.alpha = e;
			}
			let a = Zr.fromEncodedChunk(e, i);
			const s = K(this.preciseTimings, e.timestamp, (e) => e.microsecondTimestamp), n = -1 !== s ? this.preciseTimings[s] : null;
			let o = null;
			0 === this.emittedEncoderPackets && "delta" === a.type && r?.decoderConfig && (o = Ht(this.encodingConfig.codec, r.decoderConfig, a.data)), (n && n.microsecondTimestamp === e.timestamp || null !== o) && (a = a.clone({
				timestamp: n?.timestampIsValid ? n.timestamp : void 0,
				duration: n?.durationIsValid ? n.duration : void 0,
				type: o ?? void 0
			})), vd(this.source._connectedTrack, a), this.encodingConfig.onEncodedPacket?.(a, r), this.lastMuxerPromise = this.muxer.addEncodedVideoPacket(this.source._connectedTrack, a, r).catch((e) => {
				this.setError(e);
			}), this.emittedEncoderPackets++;
		}
		recreateWebCodecsEncoders() {
			c(this.encoder), "closed" !== this.encoder.state && this.encoder.close(), this.alphaEncoder && "closed" !== this.alphaEncoder.state && this.alphaEncoder.close(), this.alphaFrameQueue.forEach((e) => e?.close()), this.alphaFrameQueue.length = 0, this.encodersReclaimed = !1, this.lastMultipleOfKeyFrameInterval = -1, this.createWebCodecsEncoders();
		}
		async flushAndClose(e) {
			try {
				if (!e && (this.checkForEncoderError(), this.frameRateLastSample)) {
					const e = this.encodingConfig.transform.frameRate, t = oe(this.frameRateLastEndTimestamp, e);
					await this.padFrameRate(t);
				}
				this.closed = !0, e || (this.customEncoder ? this.customEncoderCallSerializer.call(() => this.customEncoder.flush()) : this.encoder && !this.encodersReclaimed && (await this.encoder.flush(), await this.alphaEncoder?.flush(), await Oe(25)));
			} finally {
				this.closed = !0, this.frameRateLastSample?.close(), this.frameRateLastSample = null, this.customEncoder ? await this.customEncoderCallSerializer.call(() => this.customEncoder.close()).catch((e) => this.setError(e)) : this.encoder && ("closed" !== this.encoder.state && this.encoder.close(), this.alphaEncoder && "closed" !== this.alphaEncoder.state && this.alphaEncoder.close(), this.alphaFrameQueue.forEach((e) => e?.close()), this.alphaFrameQueue.length = 0, this.splitter?.close());
			}
			e || this.checkForEncoderError();
		}
		getQueueSize() {
			return this.customEncoder ? this.customEncoderQueueSize : this.encoder?.encodeQueueSize ?? 0;
		}
		checkForEncoderError() {
			if (this.errorSet) throw this.error;
		}
	};
	let xd = null;
	var Cd = class {
		constructor() {
			this.worker = null, this.pendingRequests = /* @__PURE__ */ new Map(), this.nextRequestId = 0;
		}
		split(e) {
			if (!this.worker) {
				if (!xd) {
					const e = new Blob([`(${Ed.toString()})()`], { type: "application/javascript" });
					xd = URL.createObjectURL(e);
				}
				this.worker = new Worker(xd), this.worker.addEventListener("message", (e) => {
					const t = e.data, r = this.pendingRequests.get(t.id);
					r && (this.pendingRequests.delete(t.id), "error" in t ? r.reject(new Error(t.error)) : r.resolve({
						colorFrame: t.colorFrame,
						alphaFrame: t.alphaFrame
					}));
				}), this.worker.addEventListener("error", (e) => {
					const t = new Error(e.message || "Color/alpha splitter worker error.");
					for (const r of this.pendingRequests.values()) r.reject(t);
					this.pendingRequests.clear();
				});
			}
			const t = this.nextRequestId++, r = Q();
			return this.pendingRequests.set(t, r), this.worker.postMessage({
				id: t,
				sourceFrame: e
			}, { transfer: [e] }), r.promise;
		}
		close() {
			this.worker?.terminate(), this.worker = null;
			const e = /* @__PURE__ */ new Error("Color/alpha splitter closed.");
			for (const t of this.pendingRequests.values()) t.reject(e);
			this.pendingRequests.clear();
		}
	};
	const Ed = () => {
		let e = null, t = Promise.resolve();
		self.addEventListener("message", (e) => {
			const { id: i, sourceFrame: a } = e.data;
			t = t.then(async () => {
				try {
					const { colorFrame: e, alphaFrame: t } = await r(a);
					self.postMessage({
						id: i,
						colorFrame: e,
						alphaFrame: t
					}, { transfer: [e, t] });
				} catch (e) {
					self.postMessage({
						id: i,
						error: e.message
					});
				} finally {
					a.close();
				}
			});
		});
		const r = async (t) => {
			const r = t.format;
			if (!r) throw new Error("CPU color/alpha splitting requires a known VideoFrame format.");
			const s = t.allocationSize();
			if (e && e.byteLength === s || (e = new Uint8Array(s)), await t.copyTo(e), "RGBA" === r || "BGRA" === r) return i(e, r, t);
			if ("I420A" === r || "I420AP10" === r || "I420AP12" === r || "I422A" === r || "I422AP10" === r || "I422AP12" === r || "I444A" === r || "I444AP10" === r || "I444AP12" === r) return a(e, r, t);
			throw new Error(`CPU color/alpha splitting does not support format '${r}'.`);
		}, i = (e, t, r) => {
			const i = r.visibleRect?.width ?? r.codedWidth, a = r.visibleRect?.height ?? r.codedHeight, s = i * a, n = s + Math.ceil(i / 2) * Math.ceil(a / 2) * 2, o = new Uint8Array(n);
			for (let d = 0, u = 3; d < s; d++, u += 4) o[d] = e[u];
			o.fill(128, s);
			const c = new VideoFrame(e, {
				format: "RGBA" === t ? "RGBX" : "BGRX",
				codedWidth: i,
				codedHeight: a,
				timestamp: r.timestamp,
				duration: r.duration ?? void 0
			}), l = {
				format: "I420",
				codedWidth: i,
				codedHeight: a,
				timestamp: r.timestamp,
				duration: r.duration ?? void 0,
				transfer: [o.buffer]
			};
			return {
				colorFrame: c,
				alphaFrame: new VideoFrame(o, l)
			};
		}, a = (e, t, r) => {
			const i = r.visibleRect?.width ?? r.codedWidth, a = r.visibleRect?.height ?? r.codedHeight, s = t.includes("P10"), n = t.includes("P12"), o = s || n ? 2 : 1;
			let c, l;
			t.startsWith("I420") ? (c = Math.ceil(i / 2), l = Math.ceil(a / 2)) : t.startsWith("I422") ? (c = Math.ceil(i / 2), l = a) : (c = i, l = a);
			const d = i * a, u = d * o, h = d * o + 2 * (c * l * o), f = t.replace("A", ""), m = Math.ceil(i / 2) * Math.ceil(a / 2), p = new Uint8Array(u + m * o * 2), g = h;
			p.set(e.subarray(g, g + u), 0);
			const k = u, w = s ? 512 : n ? 2048 : 128;
			1 === o ? p.fill(w, k) : new Uint16Array(p.buffer, k, 2 * m).fill(w);
			const y = s ? "I420P10" : n ? "I420P12" : "I420", b = new VideoFrame(e.subarray(0, h), {
				format: f,
				codedWidth: i,
				codedHeight: a,
				timestamp: r.timestamp,
				duration: r.duration ?? void 0
			}), T = {
				format: y,
				codedWidth: i,
				codedHeight: a,
				timestamp: r.timestamp,
				duration: r.duration ?? void 0,
				transfer: [p.buffer]
			};
			return {
				colorFrame: b,
				alphaFrame: new VideoFrame(p, T)
			};
		};
	};
	var _d = class extends Td {
		constructor(e) {
			((e) => {
				if (!e || "object" != typeof e) throw new TypeError("Encoding config must be an object.");
				if (!mr.includes(e.codec)) throw new TypeError(`Invalid video codec '${e.codec}'. Must be one of: ${mr.join(", ")}.`);
				const t = e.bitrate;
				if (void 0 === e.quality && void 0 === t) throw new TypeError("config.quality must be provided.");
				if (void 0 !== e.quality && void 0 !== t) throw new TypeError("config.quality and config.bitrate cannot both be provided.");
				if (void 0 !== e.quality && !(e.quality instanceof Gn)) throw new TypeError("config.quality, when provided, must be a Quality.");
				if (void 0 !== t && !(t instanceof Gn) && (!Number.isInteger(t) || t <= 0)) throw new TypeError("config.bitrate, when provided, must be a positive integer or a quality.");
				if (void 0 !== e.keyFrameInterval && (!Number.isFinite(e.keyFrameInterval) || e.keyFrameInterval < 0)) throw new TypeError("config.keyFrameInterval, when provided, must be a non-negative number.");
				if (void 0 !== e.sizeChangeBehavior && ![
					"deny",
					"passThrough",
					"fill",
					"contain",
					"cover"
				].includes(e.sizeChangeBehavior)) throw new TypeError("config.sizeChangeBehavior, when provided, must be 'deny', 'passThrough', 'fill', 'contain' or 'cover'.");
				if (void 0 !== e.transform) {
					if ("object" != typeof e.transform || !e.transform) throw new TypeError("config.transform, when provided, must be an object.");
					if (void 0 !== e.transform.width && (!Number.isInteger(e.transform.width) || e.transform.width <= 0)) throw new TypeError("config.transform.width, when provided, must be a positive integer.");
					if (void 0 !== e.transform.height && (!Number.isInteger(e.transform.height) || e.transform.height <= 0)) throw new TypeError("config.transform.height, when provided, must be a positive integer.");
					if (void 0 !== e.transform.fit && ![
						"fill",
						"contain",
						"cover"
					].includes(e.transform.fit)) throw new TypeError("config.transform.fit, when provided, must be one of \"fill\", \"contain\", or \"cover\".");
					if (void 0 !== e.transform.width && void 0 !== e.transform.height && void 0 === e.transform.fit && ![
						"fill",
						"contain",
						"cover"
					].includes(e.sizeChangeBehavior)) throw new TypeError("When both config.transform.width and config.transform.height are provided, config.transform.fit must also be provided.");
					if (void 0 !== e.transform.fit && [
						"fill",
						"contain",
						"cover"
					].includes(e.sizeChangeBehavior) && e.transform.fit !== e.sizeChangeBehavior) throw new TypeError("config.transform.fit, when provided, cannot differ from config.sizeChangeBehavior when config.sizeChangeBehavior is 'fill', 'contain' or 'cover', as sizeChangeBehavior already determines the fitting algorithm.");
					if (void 0 !== e.transform.rotate && ![
						0,
						90,
						180,
						270
					].includes(e.transform.rotate)) throw new TypeError("config.transform.rotate, when provided, must be 0, 90, 180 or 270.");
					if (void 0 !== e.transform.flip && "boolean" != typeof e.transform.flip) throw new TypeError("config.transform.flip, when provided, must be a boolean.");
					if (void 0 !== e.transform.crop && En(e.transform.crop, "config.transform."), void 0 !== e.transform.process && "function" != typeof e.transform.process) throw new TypeError("config.transform.process, when provided, must be a function.");
					if (void 0 !== e.transform.frameRate && (!Number.isFinite(e.transform.frameRate) || e.transform.frameRate <= 0)) throw new TypeError("config.transform.frameRate, when provided, must be a finite positive number.");
					if (void 0 !== e.transform.force && "boolean" != typeof e.transform.force) throw new TypeError("config.transform.force, when provided, must be a boolean.");
				}
				if (void 0 !== e.onEncodedPacket && "function" != typeof e.onEncodedPacket) throw new TypeError("config.onEncodedPacket, when provided, must be a function.");
				if (void 0 !== e.onEncoderConfig && "function" != typeof e.onEncoderConfig) throw new TypeError("config.onEncoderConfig, when provided, must be a function.");
				if (void 0 !== e.onEncodedSample && "function" != typeof e.onEncodedSample) throw new TypeError("config.onEncodedSample, when provided, must be a function.");
				$n(e.codec, e);
			})(e), super(e.codec), this._encoder = new Pd(this, e);
		}
		add(e, t) {
			if (!(e instanceof yn)) throw new TypeError("videoSample must be a VideoSample.");
			return this._encoder.add(e, !1, t);
		}
		_flushAndClose(e) {
			return this._encoder.flushAndClose(e);
		}
	}, Id = class extends bd {
		constructor(e) {
			if (super(), !kr.includes(e)) throw new TypeError(`Invalid audio codec '${e}'. Must be one of: ${kr.join(", ")}.`);
			this._codec = e;
		}
	}, Bd = class extends Id {
		constructor(e) {
			super(e);
		}
		add(e, t) {
			if (!(e instanceof Zr)) throw new TypeError("packet must be an EncodedPacket.");
			if (e.isMetadataOnly) throw new TypeError("Metadata-only packets cannot be added.");
			if (void 0 !== t && (!t || "object" != typeof t)) throw new TypeError("meta, when provided, must be an object.");
			return this._ensureValidAdd(), this._connectedTrack.output._muxer.addEncodedAudioPacket(this._connectedTrack, e, t);
		}
	}, Ad = class {
		setError(e) {
			this.errorSet || (this.error = e, this.errorSet = !0);
		}
		constructor(e, t) {
			this.source = e, this.encodingConfig = t, this.ensureEncoderPromise = null, this.encoderInitialized = !1, this.encoder = null, this.muxer = null, this.lastNumberOfChannels = null, this.lastSampleRate = null, this.isPcmEncoder = !1, this.outputSampleSize = null, this.writeOutputValue = null, this.customEncoder = null, this.customEncoderCallSerializer = new pe(), this.customEncoderQueueSize = 0, this.lastEndSampleIndex = null, this.resampler = null, this.error = null, this.errorSet = !1, this.lastMuxerPromise = Promise.resolve(), this.closed = !1;
		}
		async add(e, t) {
			try {
				if (this.checkForEncoderError(), this.source._ensureValidAdd(), null !== this.lastNumberOfChannels && null !== this.lastSampleRate) {
					if (e.numberOfChannels !== this.lastNumberOfChannels || e.sampleRate !== this.lastSampleRate) throw new Error(`Audio parameters must remain constant. Expected ${this.lastNumberOfChannels} channels at ${this.lastSampleRate} Hz, got ${e.numberOfChannels} channels at ${e.sampleRate} Hz.`);
				} else this.lastNumberOfChannels = e.numberOfChannels, this.lastSampleRate = e.sampleRate;
				const r = this.encodingConfig;
				void 0 !== r.transform?.numberOfChannels || void 0 !== r.transform?.sampleRate ? (this.resampler || (this.resampler = new kd({
					targetNumberOfChannels: r.transform.numberOfChannels ?? e.numberOfChannels,
					targetSampleRate: r.transform.sampleRate ?? e.sampleRate,
					onSample: async (e) => {
						await this.processAndEncode(e, !0);
					}
				})), await this.resampler.add(e)) : await this.processAndEncode(e, t);
			} finally {
				t && e.close();
			}
		}
		async processAndEncode(e, t) {
			const r = this.encodingConfig;
			if (void 0 !== r.transform?.sampleFormat && ((e) => {
				switch (e) {
					case "u8-planar": return "u8";
					case "s16-planar": return "s16";
					case "s32-planar": return "s32";
					case "f32-planar": return "f32";
					default: return e;
				}
			})(e.format) !== r.transform.sampleFormat) {
				const i = ((e, t) => {
					const r = e.allocationSize({
						format: t,
						planeIndex: 0
					}), i = new ArrayBuffer(r);
					return e.copyTo(i, {
						format: t,
						planeIndex: 0
					}), new zn({
						data: i,
						format: t,
						numberOfChannels: e.numberOfChannels,
						sampleRate: e.sampleRate,
						timestamp: e.timestamp,
						duration: e.duration
					});
				})(e, r.transform.sampleFormat);
				t && e.close(), e = i, t = !0;
			}
			if (r.transform?.process) try {
				let t = r.transform.process(e);
				if (Pe(t) && (t = await t), null === t) return;
				Array.isArray(t) || (t = [t]);
				try {
					for (const e of t) if (!(e instanceof zn)) throw new TypeError("The audio process function must return an AudioSample, null, or an array of AudioSamples.");
					for (const e of t) await this.encodeSample(e, !0);
				} finally {
					for (const e of t) e instanceof zn && e.close();
				}
			} finally {
				t && e.close();
			}
			else await this.encodeSample(e, t);
		}
		async encodeSample(e, t) {
			try {
				if (this.encoderInitialized || (this.ensureEncoderPromise || this.ensureEncoder(e), this.encoderInitialized || await this.ensureEncoderPromise), c(this.encoderInitialized), this.closed) return;
				{
					const t = Math.round(e.timestamp * e.sampleRate), r = Math.round((e.timestamp + e.duration) * e.sampleRate);
					if (null === this.lastEndSampleIndex) this.lastEndSampleIndex = r;
					else {
						const r = t - this.lastEndSampleIndex;
						if (r >= 64) {
							const t = new zn({
								data: new Float32Array(r * e.numberOfChannels),
								format: "f32-planar",
								sampleRate: e.sampleRate,
								numberOfChannels: e.numberOfChannels,
								numberOfFrames: r,
								timestamp: this.lastEndSampleIndex / e.sampleRate
							});
							await this.encodeSample(t, !0);
						}
						this.lastEndSampleIndex += e.numberOfFrames;
					}
				}
				if (this.encodingConfig.onEncodedSample?.(e), this.customEncoder) {
					this.customEncoderQueueSize++;
					const t = e.clone(), r = this.customEncoderCallSerializer.call(() => this.customEncoder.encode(t)).catch((e) => this.setError(e)).finally(() => {
						this.customEncoderQueueSize--, t.close();
					});
					this.customEncoderQueueSize >= 4 && await r, await this.lastMuxerPromise;
				} else if (this.isPcmEncoder) await this.doPcmEncoding(e, t);
				else {
					c(this.encoder);
					const r = e.toAudioData();
					this.encoder.encode(r), r.close(), t && e.close(), this.encoder.encodeQueueSize >= 4 && await new Promise((e) => this.encoder.addEventListener("dequeue", e, { once: !0 })), await this.lastMuxerPromise;
				}
			} finally {
				t && e.close();
			}
		}
		async doPcmEncoding(e, t) {
			c(this.outputSampleSize), c(this.writeOutputValue);
			const { numberOfChannels: r, numberOfFrames: i, sampleRate: a, timestamp: s } = e, n = 2048, o = [];
			for (let c = 0; c < i; c += n) {
				const t = Math.min(n, e.numberOfFrames - c), i = t * r * this.outputSampleSize, a = new ArrayBuffer(i), s = new DataView(a);
				o.push({
					frameCount: t,
					view: s
				});
			}
			const l = "s32" === e.format || "s32-planar" === e.format, d = l ? "s32-planar" : "f32-planar", u = l ? 1 / 2147483648 : 1, h = e.allocationSize({
				planeIndex: 0,
				format: d
			}), f = l ? new Int32Array(h / 4) : new Float32Array(h / 4);
			for (let c = 0; c < r; c++) {
				e.copyTo(f, {
					planeIndex: c,
					format: d
				});
				for (let e = 0; e < o.length; e++) {
					const { frameCount: t, view: i } = o[e];
					for (let a = 0; a < t; a++) this.writeOutputValue(i, (a * r + c) * this.outputSampleSize, f[e * n + a] * u);
				}
			}
			t && e.close();
			const m = { decoderConfig: {
				codec: this.encodingConfig.codec,
				numberOfChannels: r,
				sampleRate: a
			} };
			for (let c = 0; c < o.length; c++) {
				const { frameCount: e, view: t } = o[c], r = t.buffer, i = c * n, l = new Zr(new Uint8Array(r), "key", s + i / a, e / a);
				this.encodingConfig.onEncodedPacket?.(l, m), await this.muxer.addEncodedAudioPacket(this.source._connectedTrack, l, m);
			}
		}
		ensureEncoder(e) {
			this.ensureEncoderPromise = (async () => {
				const { numberOfChannels: t, sampleRate: r } = e, i = io(this.encodingConfig.quality, this.encodingConfig.bitrate), a = Qn({
					numberOfChannels: t,
					sampleRate: r,
					...this.encodingConfig,
					quality: i
				});
				this.encodingConfig.onEncoderConfig?.(a), this.source._nominalBitrate = a.bitrate ?? null;
				const s = co.find((e) => e.supports(this.encodingConfig.codec, a));
				if (s) this.customEncoder = new s(), this.customEncoder.codec = this.encodingConfig.codec, this.customEncoder.config = a, this.customEncoder.onPacket = (e, t) => {
					if (!(e instanceof Zr)) throw new TypeError("The first argument passed to onPacket must be an EncodedPacket.");
					if (void 0 !== t && (!t || "object" != typeof t)) throw new TypeError("The second argument passed to onPacket must be an object or undefined.");
					this.encodingConfig.onEncodedPacket?.(e, t), this.lastMuxerPromise = this.muxer.addEncodedAudioPacket(this.source._connectedTrack, e, t).catch((e) => {
						this.setError(e);
					});
				}, this.customEncoder.onError = (e) => {
					this.setError(e);
				}, await this.customEncoder.init();
				else if (pr.includes(this.encodingConfig.codec)) this.initPcmEncoder();
				else {
					if ("undefined" == typeof AudioEncoder) throw new Error(ve("AudioEncoder"));
					let e;
					try {
						e = (await AudioEncoder.isConfigSupported(a)).supported ?? !1;
					} catch {
						e = !1;
					}
					if (!e) throw new Error(`This specific encoder configuration (${a.codec}, ${a.bitrate} bps, ${a.numberOfChannels} channels, ${a.sampleRate} Hz) is not supported in this environment. Consider using another codec or changing your audio parameters.`);
					const t = (/* @__PURE__ */ new Error("Encoding error")).stack;
					this.encoder = new AudioEncoder({
						output: (e, t) => {
							if ("aac" === this.encodingConfig.codec && t?.decoderConfig) {
								let e = !1;
								if (e = !t.decoderConfig.description || t.decoderConfig.description.byteLength < 2 || 0 === Ge(C(t.decoderConfig.description)).objectType, e) {
									const e = Number(T(a.codec.split(".")));
									t.decoderConfig.description = Je({
										objectType: e,
										outputNumberOfChannels: t.decoderConfig.numberOfChannels,
										outputSampleRate: t.decoderConfig.sampleRate
									});
								}
							}
							let r = Zr.fromEncodedChunk(e);
							r = r.clone({
								timestamp: se(r.timestamp, a.sampleRate),
								duration: null != e.duration ? se(r.duration, a.sampleRate) : void 0
							}), this.encodingConfig.onEncodedPacket?.(r, t), this.lastMuxerPromise = this.muxer.addEncodedAudioPacket(this.source._connectedTrack, r, t).catch((e) => {
								this.setError(e);
							});
						},
						error: (e) => {
							e.stack = t, this.setError(e);
						}
					}), this.encoder.configure(a);
				}
				c(this.source._connectedTrack), this.muxer = this.source._connectedTrack.output._muxer, this.encoderInitialized = !0;
			})();
		}
		initPcmEncoder() {
			this.isPcmEncoder = !0;
			const e = this.encodingConfig.codec, { dataType: t, sampleSize: r, littleEndian: i } = Fr(e);
			switch (this.outputSampleSize = r, r) {
				case 1:
					"unsigned" === t ? this.writeOutputValue = (e, t, r) => e.setUint8(t, re(Math.round(128 * r) + 128, 0, 255)) : "signed" === t ? this.writeOutputValue = (e, t, r) => {
						e.setInt8(t, re(Math.round(128 * r), -128, 127));
					} : "ulaw" === t ? this.writeOutputValue = (e, t, r) => {
						const i = re(Math.round(32768 * r), -32768, 32767);
						e.setUint8(t, ((e) => {
							let t = e >> 2, r = 4096, i = 0, a = 12, s = 0;
							for (t < 0 && (t = -t, i = 128), t += 33, t > 8191 && (t = 8191); (t & r) !== r && a >= 5;) r >>= 1, a--;
							return s = t >> a - 4 & 15, 255 & ~(i | a - 5 << 4 | s);
						})(i));
					} : "alaw" === t ? this.writeOutputValue = (e, t, r) => {
						const i = re(Math.round(32768 * r), -32768, 32767);
						e.setUint8(t, ((e) => {
							let t = 2048, r = 0, i = 11, a = 0, s = e >> 3;
							for (s < 0 ? s = -s - 1 : r = 128, s > 4095 && (s = 4095); (s & t) !== t && i >= 5;) t >>= 1, i--;
							return a = s >> (4 === i ? 1 : i - 4) & 15, 85 ^ (r | i - 4 << 4 | a);
						})(i));
					} : c(!1);
					break;
				case 2:
					"unsigned" === t ? this.writeOutputValue = (e, t, r) => e.setUint16(t, re(Math.round(32768 * r) + 32768, 0, 65535), i) : "signed" === t ? this.writeOutputValue = (e, t, r) => e.setInt16(t, re(Math.round(32768 * r), -32768, 32767), i) : c(!1);
					break;
				case 3:
					"unsigned" === t ? this.writeOutputValue = (e, t, r) => te(e, t, re(Math.round(8388608 * r) + 8388608, 0, 16777215), i) : "signed" === t ? this.writeOutputValue = (e, t, r) => ((e, t, r, i) => {
						(r = re(r, -8388608, 8388607)) < 0 && (r = r + 16777216 & 16777215), te(e, t, r, i);
					})(e, t, re(Math.round(8388608 * r), -8388608, 8388607), i) : c(!1);
					break;
				case 4:
					"unsigned" === t ? this.writeOutputValue = (e, t, r) => e.setUint32(t, re(Math.round(2147483648 * r) + 2147483648, 0, 4294967295), i) : "signed" === t ? this.writeOutputValue = (e, t, r) => e.setInt32(t, re(Math.round(2147483648 * r), -2147483648, 2147483647), i) : "float" === t ? this.writeOutputValue = (e, t, r) => e.setFloat32(t, r, i) : c(!1);
					break;
				case 8:
					"float" === t ? this.writeOutputValue = (e, t, r) => e.setFloat64(t, r, i) : c(!1);
					break;
				default: J(r), c(!1);
			}
		}
		async flushAndClose(e) {
			try {
				e || (this.checkForEncoderError(), this.resampler && await this.resampler.finalize()), this.closed = !0, e || (this.customEncoder ? this.customEncoderCallSerializer.call(() => this.customEncoder.flush()) : this.encoder && await this.encoder.flush());
			} finally {
				this.closed = !0, this.resampler = null, this.customEncoder ? await this.customEncoderCallSerializer.call(() => this.customEncoder.close()).catch((e) => this.setError(e)) : this.encoder && "closed" !== this.encoder.state && this.encoder.close();
			}
			e || this.checkForEncoderError();
		}
		getQueueSize() {
			return this.customEncoder ? this.customEncoderQueueSize : this.isPcmEncoder ? 0 : this.encoder?.encodeQueueSize ?? 0;
		}
		checkForEncoderError() {
			if (this.errorSet) throw this.error;
		}
	}, Rd = class extends Id {
		constructor(e) {
			((e) => {
				if (!e || "object" != typeof e) throw new TypeError("Encoding config must be an object.");
				if (!kr.includes(e.codec)) throw new TypeError(`Invalid audio codec '${e.codec}'. Must be one of: ${kr.join(", ")}.`);
				const t = e.bitrate;
				if (void 0 === e.quality && void 0 === t && !pr.includes(e.codec) && "flac" !== e.codec) throw new TypeError("config.quality must be provided for compressed audio codecs.");
				if (void 0 !== e.quality && void 0 !== t) throw new TypeError("config.quality and config.bitrate cannot both be provided.");
				if (void 0 !== e.quality && !(e.quality instanceof Gn)) throw new TypeError("config.quality, when provided, must be a Quality.");
				if (void 0 !== t && !(t instanceof Gn) && (!Number.isInteger(t) || t <= 0)) throw new TypeError("config.bitrate, when provided, must be a positive integer or a quality.");
				if (void 0 !== e.transform) {
					if ("object" != typeof e.transform || !e.transform) throw new TypeError("config.transform, when provided, must be an object.");
					if (void 0 !== e.transform.numberOfChannels && (!Number.isInteger(e.transform.numberOfChannels) || e.transform.numberOfChannels <= 0)) throw new TypeError("config.transform.numberOfChannels, when provided, must be a positive integer.");
					if (void 0 !== e.transform.sampleRate && (!Number.isInteger(e.transform.sampleRate) || e.transform.sampleRate <= 0)) throw new TypeError("config.transform.sampleRate, when provided, must be a positive integer.");
					if (void 0 !== e.transform.sampleFormat && ![
						"u8",
						"s16",
						"s32",
						"f32"
					].includes(e.transform.sampleFormat)) throw new TypeError("config.transform.sampleFormat, when provided, must be one of: u8, s16, s32, f32.");
					if (void 0 !== e.transform.process && "function" != typeof e.transform.process) throw new TypeError("config.transform.process, when provided, must be a function.");
				}
				if (void 0 !== e.onEncodedPacket && "function" != typeof e.onEncodedPacket) throw new TypeError("config.onEncodedPacket, when provided, must be a function.");
				if (void 0 !== e.onEncoderConfig && "function" != typeof e.onEncoderConfig) throw new TypeError("config.onEncoderConfig, when provided, must be a function.");
				if (void 0 !== e.onEncodedSample && "function" != typeof e.onEncodedSample) throw new TypeError("config.onEncodedSample, when provided, must be a function.");
				Xn(e.codec, e);
			})(e), super(e.codec), this._encoder = new Ad(this, e);
		}
		add(e) {
			if (!(e instanceof zn)) throw new TypeError("audioSample must be an AudioSample.");
			return this._encoder.add(e, !1);
		}
		_flushAndClose(e) {
			return this._encoder.flushAndClose(e);
		}
	}, Fd = class extends bd {
		constructor(e) {
			if (super(), !wr.includes(e)) throw new TypeError(`Invalid subtitle codec '${e}'. Must be one of: ${wr.join(", ")}.`);
			this._codec = e;
		}
	}, Md = class {
		get supportsVideoRotationMetadata() {
			return this.supportsVideoTransformationMetadata;
		}
		getSupportedVideoCodecs() {
			return this.getSupportedCodecs().filter((e) => mr.includes(e));
		}
		getSupportedAudioCodecs() {
			return this.getSupportedCodecs().filter((e) => kr.includes(e));
		}
		getSupportedSubtitleCodecs() {
			return this.getSupportedCodecs().filter((e) => wr.includes(e));
		}
		_codecUnsupportedHint(e) {
			return "";
		}
		_isFragmentedIsobmff() {
			return !1;
		}
	}, Dd = class extends Md {
		constructor(e = {}) {
			if (!e || "object" != typeof e) throw new TypeError("options must be an object.");
			if (void 0 !== e.fastStart && ![
				!1,
				"in-memory",
				"reserve",
				"fragmented"
			].includes(e.fastStart)) throw new TypeError("options.fastStart, when provided, must be false, 'in-memory', 'reserve', or 'fragmented'.");
			if (void 0 !== e.minimumFragmentDuration && (!Be(e.minimumFragmentDuration) || e.minimumFragmentDuration < 0)) throw new TypeError("options.minimumFragmentDuration, when provided, must be a non-negative number.");
			if (void 0 !== e.onFtyp && "function" != typeof e.onFtyp) throw new TypeError("options.onFtyp, when provided, must be a function.");
			if (void 0 !== e.onMoov && "function" != typeof e.onMoov) throw new TypeError("options.onMoov, when provided, must be a function.");
			if (void 0 !== e.onMdat && "function" != typeof e.onMdat) throw new TypeError("options.onMdat, when provided, must be a function.");
			if (void 0 !== e.onMoof && "function" != typeof e.onMoof) throw new TypeError("options.onMoof, when provided, must be a function.");
			if (void 0 !== e.metadataFormat && ![
				"mdir",
				"mdta",
				"udta",
				"auto"
			].includes(e.metadataFormat)) throw new TypeError("options.metadataFormat, when provided, must be either 'auto', 'mdir', 'mdta', or 'udta'.");
			super(), this._options = e;
		}
		getSupportedTrackCounts() {
			const e = 2 ** 32 - 1;
			return {
				video: {
					min: 0,
					max: e
				},
				audio: {
					min: 0,
					max: e
				},
				subtitle: {
					min: 0,
					max: e
				},
				total: {
					min: 0,
					max: e
				}
			};
		}
		get supportsVideoTransformationMetadata() {
			return !0;
		}
		get supportsTimestampedMediaData() {
			return !0;
		}
		get negativeTimestampSupport() {
			return "full";
		}
		_createMuxer(e) {
			return new gd(e, this);
		}
		_isFragmentedIsobmff() {
			return "fragmented" === this._options.fastStart;
		}
	}, Od = class extends Dd {
		constructor(e) {
			super(e);
		}
		get _name() {
			return "MP4";
		}
		get fileExtension() {
			return ".mp4";
		}
		get mimeType() {
			return "video/mp4";
		}
		getSupportedCodecs() {
			return [
				...mr,
				...gr,
				"pcm-s16",
				"pcm-s16be",
				"pcm-s24",
				"pcm-s24be",
				"pcm-s32",
				"pcm-s32be",
				"pcm-f32",
				"pcm-f32be",
				"pcm-f64",
				"pcm-f64be",
				...wr
			];
		}
		_codecUnsupportedHint(e) {
			return new Nd().getSupportedCodecs().includes(e) ? " Switching to MOV will grant support for this codec." : "";
		}
	}, zd = class extends Dd {
		constructor(e) {
			super(e);
		}
		get _name() {
			return "CMAF";
		}
		get fileExtension() {
			return ".m4s";
		}
		get mimeType() {
			return "video/mp4";
		}
		getSupportedCodecs() {
			return [
				...mr,
				...gr,
				"pcm-s16",
				"pcm-s16be",
				"pcm-s24",
				"pcm-s24be",
				"pcm-s32",
				"pcm-s32be",
				"pcm-f32",
				"pcm-f32be",
				"pcm-f64",
				"pcm-f64be",
				...wr
			];
		}
	}, Nd = class extends Dd {
		constructor(e) {
			super(e);
		}
		get _name() {
			return "MOV";
		}
		get fileExtension() {
			return ".mov";
		}
		get mimeType() {
			return "video/quicktime";
		}
		getSupportedCodecs() {
			return [...mr, ...kr];
		}
		_codecUnsupportedHint(e) {
			return new Od().getSupportedCodecs().includes(e) ? " Switching to MP4 will grant support for this codec." : "";
		}
	};
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/
	const Ud = [
		"video",
		"audio",
		"subtitle"
	];
	var Ld = class e {
		constructor(e, t, r, i, a) {
			this.id = e, this.output = t, this.type = r, this.source = i, this.metadata = a;
		}
		isVideoTrack() {
			return "video" === this.type;
		}
		isAudioTrack() {
			return "audio" === this.type;
		}
		isSubtitleTrack() {
			return "subtitle" === this.type;
		}
		canBePairedWith(t) {
			if (!(t instanceof e)) throw new TypeError("other must be an OutputTrack.");
			if (this === t) return !1;
			const r = ze(this.metadata.group), i = ze(t.metadata.group);
			for (const e of r) {
				if (this.type !== t.type && i.some((t) => e === t)) return !0;
				if (i.some((t) => e._pairedGroups.has(t))) return !0;
			}
			return !1;
		}
	}, Wd = class extends Ld {
		constructor(e, t, r, i) {
			super(e, t, "video", r, i);
		}
	}, qd = class extends Ld {
		constructor(e, t, r, i) {
			super(e, t, "audio", r, i);
		}
	}, Vd = class extends Ld {
		constructor(e, t, r, i) {
			super(e, t, "subtitle", r, i);
		}
	}, Hd = class e {
		constructor() {
			this._pairedGroups = /* @__PURE__ */ new Set();
		}
		pairWith(t) {
			if (!(t instanceof e)) throw new TypeError("other must be an OutputTrackGroup.");
			if (this === t) throw new TypeError("Cannot pair a group with itself.");
			this._pairedGroups.add(t), t._pairedGroups.add(this);
		}
	};
	const jd = (e) => {
		if (!e || "object" != typeof e) throw new TypeError("metadata must be an object.");
		if (void 0 !== e.languageCode && !de(e.languageCode)) throw new TypeError("metadata.languageCode, when provided, must be a three-letter, ISO 639-2/T language code.");
		if (void 0 !== e.name && "string" != typeof e.name) throw new TypeError("metadata.name, when provided, must be a string.");
		if (void 0 !== e.disposition && ((e) => {
			if (!e || "object" != typeof e) throw new TypeError("disposition must be an object.");
			if (void 0 !== e.default && "boolean" != typeof e.default) throw new TypeError("disposition.default must be a boolean.");
			if (void 0 !== e.primary && "boolean" != typeof e.primary) throw new TypeError("disposition.primary must be a boolean.");
			if (void 0 !== e.forced && "boolean" != typeof e.forced) throw new TypeError("disposition.forced must be a boolean.");
			if (void 0 !== e.original && "boolean" != typeof e.original) throw new TypeError("disposition.original must be a boolean.");
			if (void 0 !== e.commentary && "boolean" != typeof e.commentary) throw new TypeError("disposition.commentary must be a boolean.");
			if (void 0 !== e.hearingImpaired && "boolean" != typeof e.hearingImpaired) throw new TypeError("disposition.hearingImpaired must be a boolean.");
			if (void 0 !== e.visuallyImpaired && "boolean" != typeof e.visuallyImpaired) throw new TypeError("disposition.visuallyImpaired must be a boolean.");
		})(e.disposition), void 0 !== e.maximumPacketCount && (!Number.isInteger(e.maximumPacketCount) || e.maximumPacketCount < 0)) throw new TypeError("metadata.maximumPacketCount, when provided, must be a non-negative integer.");
		if (void 0 !== e.bitrate && (!Number.isFinite(e.bitrate) || e.bitrate < 0)) throw new TypeError("metadata.bitrate, when provided, must be a non-negative number.");
		if (void 0 !== e.averageBitrate && (!Number.isFinite(e.averageBitrate) || e.averageBitrate < 0)) throw new TypeError("metadata.averageBitrate, when provided, must be a non-negative number.");
		if (void 0 !== e.group && !(e.group instanceof Hd) && (!Array.isArray(e.group) || e.group.some((e) => !(e instanceof Hd)))) throw new TypeError("metadata.group, when provided, must be an OutputTrackGroup instance or an array of OutputTrackGroup instances.");
	};
	var $d = class extends Ne {
		get target() {
			const e = "Output.target cannot be used when using PathedTarget with an async callback. Use the 'target' event instead.";
			if (this._rootTargetPromise) throw new TypeError(e);
			const t = this._getRootTarget();
			if (Pe(t)) throw new TypeError(e);
			return t;
		}
		constructor(e) {
			if (super(), this.state = "pending", this.defaultTrackGroup = new Hd(), this.tracks = [], this._onFinalize = null, this._unfinalizedTargets = /* @__PURE__ */ new Set(), this._rootWriterPromise = null, this._startPromise = null, this._cancelPromise = null, this._finalizePromise = null, this._mutex = new q(), this._metadataTags = {}, this._rootTarget = null, this._rootTargetPromise = null, this._firstMediaStreamTimestamp = null, !e || "object" != typeof e) throw new TypeError("options must be an object.");
			if (!(e.format instanceof Md)) throw new TypeError("options.format must be an OutputFormat.");
			if (!(e.target instanceof ad || e.target instanceof ud)) throw new TypeError("options.target must be a Target or a PathedTarget.");
			if (e.target instanceof ad && this._rememberTarget(e.target), void 0 !== e.initTarget && !(e.initTarget instanceof ad) && "function" != typeof e.initTarget) throw new Error("options.initTarget, when provided, must be a Target or a function that returns or resolves to a Target.");
			if (void 0 !== e.onFinalize && "function" != typeof e.onFinalize) throw new TypeError("options.onFinalize, when provided, must be a function.");
			this.format = e.format, this._target = e.target, this._onFinalize = e.onFinalize ?? null, this._initTarget = e.initTarget ?? null, this._initTarget instanceof ad && this._rememberTarget(this._initTarget), this._muxer = e.format._createMuxer(this);
		}
		_getTargetValidated(e) {
			c(this._target instanceof ud);
			const t = this._target.getTarget(e), r = (e) => {
				if (!(e instanceof ad)) throw new TypeError("getTarget must return a Target.");
				return e;
			};
			return Pe(t) ? t.then(r) : r(t);
		}
		async _getTarget(e) {
			c(this._target instanceof ud);
			const t = await this._getTargetValidated(e);
			return this._emit("target", {
				target: t,
				request: e,
				isRoot: e.isRoot
			}), "canceled" === this.state ? await t._close() : this._rememberTarget(t), t;
		}
		_rememberTarget(e) {
			this._unfinalizedTargets.add(e), e.on("finalized", () => this._unfinalizedTargets.delete(e), { once: !0 });
		}
		async _getInitTarget() {
			if (c(null !== this._initTarget), this._initTarget instanceof ad) return this._initTarget;
			const e = await this._initTarget();
			return "canceled" === this.state ? await e._close() : this._rememberTarget(e), e;
		}
		_hasInitTarget() {
			return null !== this._initTarget;
		}
		_getRootTarget() {
			if (this._rootTarget) return this._rootTarget;
			if (this._rootTargetPromise) return this._rootTargetPromise;
			if (this._target instanceof ad) return this._emit("target", {
				target: this._target,
				request: null,
				isRoot: !0
			}), this._rootTarget = this._target, this._target;
			const e = {
				path: this._target.rootPath,
				isRoot: !0,
				mimeType: this.format.mimeType
			}, t = this._getTargetValidated(e), r = (t) => ("canceled" === this.state ? t._close() : this._rememberTarget(t), this._emit("target", {
				target: t,
				request: e,
				isRoot: !0
			}), this._rootTarget = t, t);
			return Pe(t) ? this._rootTargetPromise = t.then(r) : r(t);
		}
		_getRootWriter(e) {
			return this._rootWriterPromise ??= (async () => {
				const t = await this._getRootTarget(), r = new id(t, "boolean" == typeof e ? e : e(t));
				return r.start(), r;
			})();
		}
		addVideoTrack(e, t = {}) {
			if (!(e instanceof Td)) throw new TypeError("source must be a VideoSource.");
			if (jd(t), void 0 !== t.rotation && ![
				0,
				90,
				180,
				270
			].includes(t.rotation)) throw new TypeError(`Invalid video rotation: ${t.rotation}. Has to be 0, 90, 180 or 270.`);
			if (void 0 !== t.flip && "boolean" != typeof t.flip) throw new TypeError("metadata.flip, when provided, must be a boolean.");
			if (!(void 0 === t.transformationMatrix || Array.isArray(t.transformationMatrix) && 9 === t.transformationMatrix.length && t.transformationMatrix.every((e) => Number.isFinite(e)))) throw new TypeError("metadata.transformationMatrix, when provided, must be an array of 9 finite numbers.");
			if (void 0 !== t.frameRate && (!Number.isFinite(t.frameRate) || t.frameRate <= 0)) throw new TypeError(`Invalid video frame rate: ${t.frameRate}. Must be a positive number.`);
			if (void 0 !== t.hasOnlyKeyPackets && "boolean" != typeof t.hasOnlyKeyPackets) throw new TypeError("metadata.hasOnlyKeyPackets, when provided, must be a boolean.");
			if (void 0 !== t.canBeTransparent && "boolean" != typeof t.canBeTransparent) throw new TypeError("metadata.canBeTransparent, when provided, must be a boolean.");
			if (void 0 !== t.decoderConfig && Lr({ decoderConfig: t.decoderConfig }, e._codec), void 0 !== t.primingPacket) {
				if (!(t.primingPacket instanceof Zr)) throw new TypeError("metadata.primingPacket, when provided, must be an EncodedPacket.");
				if (void 0 === t.decoderConfig) throw new TypeError("metadata.primingPacket can only be provided alongside metadata.decoderConfig.");
			}
			const r = { ...t };
			return r.group ??= this.defaultTrackGroup, this._addTrack(new Wd(this.tracks.length + 1, this, e, r));
		}
		addAudioTrack(e, t = {}) {
			if (!(e instanceof Id)) throw new TypeError("source must be an AudioSource.");
			if (jd(t), void 0 !== t.decoderConfig && qr({ decoderConfig: t.decoderConfig }, e._codec), void 0 !== t.primingPacket) {
				if (!(t.primingPacket instanceof Zr)) throw new TypeError("metadata.primingPacket, when provided, must be an EncodedPacket.");
				if (void 0 === t.decoderConfig) throw new TypeError("metadata.primingPacket can only be provided alongside metadata.decoderConfig.");
			}
			const r = { ...t };
			return r.group ??= this.defaultTrackGroup, this._addTrack(new qd(this.tracks.length + 1, this, e, r));
		}
		addSubtitleTrack(e, t = {}) {
			if (!(e instanceof Fd)) throw new TypeError("source must be a SubtitleSource.");
			jd(t);
			const r = { ...t };
			return r.group ??= this.defaultTrackGroup, this._addTrack(new Vd(this.tracks.length + 1, this, e, r));
		}
		setMetadataTags(e) {
			if (je(e), "pending" !== this.state) throw new Error("Cannot set metadata tags after output has been started or canceled.");
			this._metadataTags = e;
		}
		_addTrack(e) {
			if ("pending" !== this.state) throw new Error("Cannot add track after output has been started or canceled.");
			if (e.source._connectedTrack) throw new Error("Source is already used for a track.");
			const t = this.format.getSupportedTrackCounts(), r = this.tracks.reduce((t, r) => t + (r.type === e.type ? 1 : 0), 0), i = t[e.type].max;
			if (r === i) throw new Error(0 === i ? `${this.format._name} does not support ${e.type} tracks.` : `${this.format._name} does not support more than ${i} ${e.type} track${1 === i ? "" : "s"}.`);
			const a = t.total.max;
			if (this.tracks.length === a) throw new Error(`${this.format._name} does not support more than ${a} tracks${1 === a ? "" : "s"} in total.`);
			if (e.isVideoTrack()) {
				const t = this.format.getSupportedVideoCodecs();
				if (0 === t.length) throw new Error(`${this.format._name} does not support video tracks.` + this.format._codecUnsupportedHint(e.source._codec));
				if (!t.includes(e.source._codec)) throw new Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported video codecs are: ${t.map((e) => `'${e}'`).join(", ")}.` + this.format._codecUnsupportedHint(e.source._codec));
			} else if (e.isAudioTrack()) {
				const t = this.format.getSupportedAudioCodecs();
				if (0 === t.length) throw new Error(`${this.format._name} does not support audio tracks.` + this.format._codecUnsupportedHint(e.source._codec));
				if (!t.includes(e.source._codec)) throw new Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported audio codecs are: ${t.map((e) => `'${e}'`).join(", ")}.` + this.format._codecUnsupportedHint(e.source._codec));
			} else if (e.isSubtitleTrack()) {
				const t = this.format.getSupportedSubtitleCodecs();
				if (0 === t.length) throw new Error(`${this.format._name} does not support subtitle tracks.` + this.format._codecUnsupportedHint(e.source._codec));
				if (!t.includes(e.source._codec)) throw new Error(`Codec '${e.source._codec}' cannot be contained within ${this.format._name}. Supported subtitle codecs are: ${t.map((e) => `'${e}'`).join(", ")}.` + this.format._codecUnsupportedHint(e.source._codec));
			}
			return this.tracks.push(e), e.source._connectedTrack = e, e;
		}
		hasEnoughTracks() {
			const e = this.format.getSupportedTrackCounts();
			for (const r of Ud) if (this.tracks.reduce((e, t) => e + (t.type === r ? 1 : 0), 0) < e[r].min) return !1;
			const t = e.total.min;
			return !(this.tracks.length < t);
		}
		async start() {
			const e = this.format.getSupportedTrackCounts();
			for (const r of Ud) {
				const t = this.tracks.reduce((e, t) => e + (t.type === r ? 1 : 0), 0), i = e[r].min;
				if (t < i) throw new Error(i === e[r].max ? `${this.format._name} requires exactly ${i} ${r} track${1 === i ? "" : "s"}.` : `${this.format._name} requires at least ${i} ${r} track${1 === i ? "" : "s"}.`);
			}
			const t = e.total.min;
			if (this.tracks.length < t) throw new Error(t === e.total.max ? `${this.format._name} requires exactly ${t} track${1 === t ? "" : "s"}.` : `${this.format._name} requires at least ${t} track${1 === t ? "" : "s"}.`);
			if ("canceled" === this.state) throw new Error("Output has been canceled.");
			return this._startPromise ? (qe._warn("Output has already been started."), this._startPromise) : this._startPromise = (async () => {
				this.state = "started";
				const e = this._mutex.acquire();
				try {
					await this._muxer.start();
					const e = this.tracks.map((e) => e.source._start());
					await Promise.all(e);
				} finally {
					(await e)();
				}
			})();
		}
		getMimeType() {
			return this._muxer.getMimeType();
		}
		async cancel() {
			return "canceled" === this.state ? this._cancelPromise ?? void 0 : "finalizing" !== this.state && "finalized" !== this.state ? this._cancelPromise = (async () => {
				this.state = "canceled";
				const e = await this._mutex.acquire();
				try {
					const e = this.tracks.map((e) => e.source._flushOrWaitForOngoingClose(!0));
					await Promise.all(e), await Promise.all([...this._unfinalizedTargets].map((e) => e._close())), this._unfinalizedTargets.clear();
				} finally {
					e();
				}
			})() : void ("finalized" === this.state && qe._warn("Output has already been finalized."));
		}
		async finalize() {
			if ("pending" === this.state) throw new Error("Cannot finalize before starting.");
			if ("canceled" === this.state) throw new Error("Cannot finalize after canceling.");
			return this._finalizePromise ? (qe._warn("Output has already been finalized."), this._finalizePromise) : this._finalizePromise = (async () => {
				this.state = "finalizing";
				const e = await this._mutex.acquire();
				try {
					const e = this.tracks.map((e) => e.source._flushOrWaitForOngoingClose(!1));
					if (await Promise.all(e), await this._muxer.finalize(), this._rootWriterPromise) {
						const e = await this._rootWriterPromise;
						e.finalized || (await e.flush(), await e.finalize());
					}
					this._onFinalize && await this._onFinalize(), this.state = "finalized";
				} catch (t) {
					throw this.state = "canceled", t;
				} finally {
					await Promise.all([...this._unfinalizedTargets].map((e) => e._close().catch(() => {}))), this._unfinalizedTargets.clear(), e();
				}
			})();
		}
	}, Kd = function(e, t, r) {
		if (null != t) {
			if ("object" != typeof t && "function" != typeof t) throw new TypeError("Object expected.");
			var i, a;
			if (r) {
				if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
				i = t[Symbol.asyncDispose];
			}
			if (void 0 === i) {
				if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
				i = t[Symbol.dispose], r && (a = i);
			}
			if ("function" != typeof i) throw new TypeError("Object not disposable.");
			a && (i = function() {
				try {
					a.call(this);
				} catch (e) {
					return Promise.reject(e);
				}
			}), e.stack.push({
				value: t,
				dispose: i,
				async: r
			});
		} else r && e.stack.push({ async: !0 });
		return t;
	}, Xd = function(e) {
		return function(t) {
			function r(r) {
				t.error = t.hasError ? new e(r, t.error, "An error was suppressed during disposal.") : r, t.hasError = !0;
			}
			var i, a = 0;
			return function e() {
				for (; i = t.stack.pop();) try {
					if (!i.async && 1 === a) return a = 0, t.stack.push(i), Promise.resolve().then(e);
					if (i.dispose) {
						var s = i.dispose.call(i.value);
						if (i.async) return a |= 2, Promise.resolve(s).then(e, function(t) {
							return r(t), e();
						});
					} else a |= 1;
				} catch (n) {
					r(n);
				}
				if (1 === a) return t.hasError ? Promise.reject(t.error) : Promise.resolve();
				if (t.hasError) throw t.error;
			}();
		};
	}("function" == typeof SuppressedError ? SuppressedError : function(e, t, r) {
		var i = new Error(r);
		return i.name = "SuppressedError", i.error = e, i.suppressed = t, i;
	});
	/*!
	* Copyright (c) 2026-present, Vanilagy and contributors
	*
	* This Source Code Form is subject to the terms of the Mozilla Public
	* License, v. 2.0. If a copy of the MPL was not distributed with this
	* file, You can obtain one at https://mozilla.org/MPL/2.0/.
	*/ const Qd = (e) => {
		if (!e || "object" != typeof e) throw new TypeError("options.video, when provided, must be an object.");
		if (void 0 !== e?.discard && "boolean" != typeof e.discard) throw new TypeError("options.video.discard, when provided, must be a boolean.");
		if (void 0 !== e?.forceTranscode && "boolean" != typeof e.forceTranscode) throw new TypeError("options.video.forceTranscode, when provided, must be a boolean.");
		if (void 0 !== e?.codec && !mr.includes(e.codec)) throw new TypeError(`options.video.codec, when provided, must be one of: ${mr.join(", ")}.`);
		const t = e?.bitrate;
		if (void 0 !== e?.quality && !(e.quality instanceof Gn)) throw new TypeError("options.video.quality, when provided, must be a Quality.");
		if (void 0 !== e?.quality && void 0 !== t) throw new TypeError("options.video.quality and options.video.bitrate cannot both be provided.");
		if (void 0 !== t && !(t instanceof Gn) && (!Number.isInteger(t) || t <= 0)) throw new TypeError("options.video.bitrate, when provided, must be a positive integer or a quality.");
		if (void 0 !== e?.width && (!Number.isInteger(e.width) || e.width <= 0)) throw new TypeError("options.video.width, when provided, must be a positive integer.");
		if (void 0 !== e?.height && (!Number.isInteger(e.height) || e.height <= 0)) throw new TypeError("options.video.height, when provided, must be a positive integer.");
		if (void 0 !== e?.fit && ![
			"fill",
			"contain",
			"cover"
		].includes(e.fit)) throw new TypeError("options.video.fit, when provided, must be one of 'fill', 'contain', or 'cover'.");
		if (void 0 !== e?.width && void 0 !== e.height && void 0 === e.fit) throw new TypeError("When both options.video.width and options.video.height are provided, options.video.fit must also be provided.");
		if (void 0 !== e?.rotate && ![
			0,
			90,
			180,
			270
		].includes(e.rotate)) throw new TypeError("options.video.rotate, when provided, must be 0, 90, 180 or 270.");
		if (void 0 !== e?.flip && "boolean" != typeof e.flip) throw new TypeError("options.video.flip, when provided, must be a boolean.");
		if (void 0 !== e?.allowTransformationMetadata && "boolean" != typeof e.allowTransformationMetadata) throw new TypeError("options.video.allowTransformationMetadata, when provided, must be a boolean.");
		if (void 0 !== e?.allowRotationMetadata && "boolean" != typeof e.allowRotationMetadata) throw new TypeError("options.video.allowRotationMetadata, when provided, must be a boolean.");
		if (void 0 !== e?.crop && En(e.crop, "options.video."), void 0 !== e?.frameRate && (!Number.isFinite(e.frameRate) || e.frameRate <= 0)) throw new TypeError("options.video.frameRate, when provided, must be a finite positive number.");
		if (void 0 !== e?.alpha && !["discard", "keep"].includes(e.alpha)) throw new TypeError("options.video.alpha, when provided, must be either 'discard' or 'keep'.");
		if (void 0 !== e?.keyFrameInterval && (!Number.isFinite(e.keyFrameInterval) || e.keyFrameInterval < 0)) throw new TypeError("options.video.keyFrameInterval, when provided, must be a non-negative number.");
		if (void 0 !== e?.process && "function" != typeof e.process) throw new TypeError("options.video.process, when provided, must be a function.");
		if (void 0 !== e?.processedWidth && (!Number.isInteger(e.processedWidth) || e.processedWidth <= 0)) throw new TypeError("options.video.processedWidth, when provided, must be a positive integer.");
		if (void 0 !== e?.processedHeight && (!Number.isInteger(e.processedHeight) || e.processedHeight <= 0)) throw new TypeError("options.video.processedHeight, when provided, must be a positive integer.");
		if (void 0 !== e?.hardwareAcceleration && ![
			"no-preference",
			"prefer-hardware",
			"prefer-software"
		].includes(e.hardwareAcceleration)) throw new TypeError("options.video.hardwareAcceleration, when provided, must be 'no-preference', 'prefer-hardware' or 'prefer-software'.");
		if (void 0 !== e?.group && !(e.group instanceof Hd || Array.isArray(e.group) && e.group.every((e) => e instanceof Hd))) throw new TypeError("options.video.group, when provided, must be an OutputTrackGroup or an array of OutputTrackGroups.");
	}, Gd = (e) => {
		if (!e || "object" != typeof e) throw new TypeError("options.audio, when provided, must be an object.");
		if (void 0 !== e?.discard && "boolean" != typeof e.discard) throw new TypeError("options.audio.discard, when provided, must be a boolean.");
		if (void 0 !== e?.forceTranscode && "boolean" != typeof e.forceTranscode) throw new TypeError("options.audio.forceTranscode, when provided, must be a boolean.");
		if (void 0 !== e?.codec && !kr.includes(e.codec)) throw new TypeError(`options.audio.codec, when provided, must be one of: ${kr.join(", ")}.`);
		const t = e?.bitrate;
		if (void 0 !== e?.quality && !(e.quality instanceof Gn)) throw new TypeError("options.audio.quality, when provided, must be a Quality.");
		if (void 0 !== e?.quality && void 0 !== t) throw new TypeError("options.audio.quality and options.audio.bitrate cannot both be provided.");
		if (void 0 !== t && !(t instanceof Gn) && (!Number.isInteger(t) || t <= 0)) throw new TypeError("options.audio.bitrate, when provided, must be a positive integer or a quality.");
		if (void 0 !== e?.numberOfChannels && (!Number.isInteger(e.numberOfChannels) || e.numberOfChannels <= 0)) throw new TypeError("options.audio.numberOfChannels, when provided, must be a positive integer.");
		if (void 0 !== e?.sampleRate && (!Number.isInteger(e.sampleRate) || e.sampleRate <= 0)) throw new TypeError("options.audio.sampleRate, when provided, must be a positive integer.");
		if (void 0 !== e?.sampleFormat && ![
			"u8",
			"s16",
			"s32",
			"f32"
		].includes(e.sampleFormat)) throw new TypeError("options.audio.sampleFormat, when provided, must be one of: u8, s16, s32, f32.");
		if (void 0 !== e?.process && "function" != typeof e.process) throw new TypeError("options.audio.process, when provided, must be a function.");
		if (void 0 !== e?.processedNumberOfChannels && (!Number.isInteger(e.processedNumberOfChannels) || e.processedNumberOfChannels <= 0)) throw new TypeError("options.audio.processedNumberOfChannels, when provided, must be a positive integer.");
		if (void 0 !== e?.processedSampleRate && (!Number.isInteger(e.processedSampleRate) || e.processedSampleRate <= 0)) throw new TypeError("options.audio.processedSampleRate, when provided, must be a positive integer.");
		if (void 0 !== e?.group && !(e.group instanceof Hd || Array.isArray(e.group) && e.group.every((e) => e instanceof Hd))) throw new TypeError("options.audio.group, when provided, must be an OutputTrackGroup or an array of OutputTrackGroups.");
	}, Yd = 48e3;
	var Zd = class e {
		get state() {
			return this._state;
		}
		static async init(t) {
			const r = new e(t);
			return await r._init(), r;
		}
		constructor(e) {
			if (this._state = "idle", this._timestampOffset = 0, this._timestampOffsetAdjusted = !1, this._copyTimestampPossible = /* @__PURE__ */ new Map(), this._copyStartPackets = /* @__PURE__ */ new Map(), this._nextOutputTrackId = 0, this._outputTrackIds = [], this._outputOwnTrackGroups = [], this._trackPumps = [], this._composable = !1, this._executed = !1, this._executionUntil = Infinity, this._pauseRequested = !1, this._synchronizer = new eu(this), this._totalDuration = null, this._maxTimestamps = /* @__PURE__ */ new Map(), this.onProgress = void 0, this._computeProgress = !1, this._lastProgress = 0, this.isValid = !1, this.utilizedTracks = [], this.discardedTracks = [], !e || "object" != typeof e) throw new TypeError("options must be an object.");
			if (!(e.input instanceof No)) throw new TypeError("options.input must be an Input.");
			if (!(e.output instanceof $d)) throw new TypeError("options.output must be an Output.");
			if (void 0 !== e.tracks && "all" !== e.tracks && "primary" !== e.tracks) throw new TypeError("options.tracks, when provided, must be either 'all' or 'primary'.");
			if (void 0 !== e.composable && "boolean" != typeof e.composable) throw new TypeError("options.composable, when provided, must be a boolean.");
			if (void 0 !== e.copy && !1 !== e.copy) {
				if (!e.copy || "object" != typeof e.copy) throw new TypeError("options.copy, when provided, must be an object or false.");
				if (void 0 !== e.copy.mode && !["forced", "preferred"].includes(e.copy.mode)) throw new TypeError("options.copy.mode, when provided, must be 'forced' or 'preferred'.");
				if (void 0 !== e.copy.shiftTolerance && (!Be(e.copy.shiftTolerance) || e.copy.shiftTolerance < 0)) throw new TypeError("options.copy.shiftTolerance, when provided, must be a non-negative number.");
				if (void 0 !== e.copy.boundaryPolicy && !["expand", "shrink"].includes(e.copy.boundaryPolicy)) throw new TypeError("options.copy.boundaryPolicy, when provided, must be 'expand' or 'shrink'.");
				if (void 0 !== e.copy.boundaryTolerance && (!Be(e.copy.boundaryTolerance) || e.copy.boundaryTolerance < 0)) throw new TypeError("options.copy.boundaryTolerance, when provided, must be a non-negative number.");
			}
			const t = e.composable ?? !1;
			if (t) {
				if (void 0 !== e.tags) throw new TypeError("options.tags cannot be set by a composable conversion; set metadata directly on the output instead.");
				if ("pending" !== e.output.state) throw new TypeError("options.output must not have been started yet.");
			} else if (e.output.tracks.length > 0 || Object.keys(e.output._metadataTags).length > 0 || "pending" !== e.output.state) throw new TypeError("options.output must be fresh: no tracks or metadata tags added and not started.");
			if (void 0 !== e.video && "function" != typeof e.video) if (Array.isArray(e.video)) for (const r of e.video) Qd(r);
			else Qd(e.video);
			if (void 0 !== e.audio && "function" != typeof e.audio) if (Array.isArray(e.audio)) for (const r of e.audio) Gd(r);
			else Gd(e.audio);
			if (void 0 !== e.trim && (!e.trim || "object" != typeof e.trim)) throw new TypeError("options.trim, when provided, must be an object.");
			if (void 0 !== e.trim?.start && !Number.isFinite(e.trim.start)) throw new TypeError("options.trim.start, when provided, must be a finite number.");
			if (void 0 !== e.trim?.end && !Be(e.trim.end)) throw new TypeError("options.trim.end, when provided, must be a number.");
			if (void 0 !== e.trim?.start && void 0 !== e.trim.end && e.trim.start >= e.trim.end) throw new TypeError("options.trim.start must be less than options.trim.end.");
			if (void 0 !== e.tags && ("object" != typeof e.tags || !e.tags) && "function" != typeof e.tags) throw new TypeError("options.tags, when provided, must be an object or a function.");
			if ("object" == typeof e.tags && je(e.tags), void 0 !== e.showWarnings && "boolean" != typeof e.showWarnings) throw new TypeError("options.showWarnings, when provided, must be a boolean.");
			this._options = e, this._copyMode = !1 !== e.copy && (e.copy?.mode ?? "preferred"), this._copyTimestampShiftTolerance = !1 === e.copy ? 0 : e.copy?.shiftTolerance ?? 0, this._copyBoundaryPolicy = !1 === e.copy ? "expand" : e.copy?.boundaryPolicy ?? "expand", this._copyBoundaryTolerance = !1 === e.copy ? Infinity : e.copy?.boundaryTolerance ?? Infinity, this._composable = t, this.input = e.input, this.output = e.output;
		}
		async _init() {
			const e = await this.input.getFormat();
			let t, r = this._options.tracks;
			void 0 === r && (r = e.name.includes("(HLS)") ? "primary" : "all"), "all" === r ? t = await this.input.getTracks() : "primary" === r ? t = [await this.input.getPrimaryVideoTrack(), await this.input.getPrimaryAudioTrack()].filter((e) => null !== e) : (J(r), c(!1));
			const i = this.output.format.getSupportedTrackCounts();
			let a = 1, s = 1;
			const n = [], o = [];
			for (const l of t) {
				let e;
				if (l.isVideoTrack()) if (this._options.video) if ("function" == typeof this._options.video) {
					const t = await this._options.video(l, a) ?? {};
					if (Array.isArray(t)) for (const e of t) Qd(e);
					else Qd(t);
					e = Array.isArray(t) ? t : [t], a++;
				} else e = Array.isArray(this._options.video) ? this._options.video : [this._options.video];
				else e = [{}];
				else if (l.isAudioTrack()) if (this._options.audio) if ("function" == typeof this._options.audio) {
					const t = await this._options.audio(l, s) ?? {};
					if (Array.isArray(t)) for (const e of t) Gd(e);
					else Gd(t);
					e = Array.isArray(t) ? t : [t], s++;
				} else e = Array.isArray(this._options.audio) ? this._options.audio : [this._options.audio];
				else e = [{}];
				else c(!1);
				const t = e.filter((e) => e.discard);
				for (const i of t) this.discardedTracks.push({
					track: l,
					reason: "discarded_by_user",
					trackOptions: i
				});
				if (e.length === t.length) {
					0 === e.length && this.discardedTracks.push({
						track: l,
						reason: "discarded_by_user",
						trackOptions: {}
					});
					continue;
				}
				const r = e.filter((e) => !e.discard);
				n.push(l), o.push(r);
			}
			void 0 !== this._options.trim?.start ? this._startTimestamp = this._options.trim.start : this._startTimestamp = Math.max(await this.input.getFirstTimestamp(n), 0), this._endTimestamp = Math.max(this._options.trim?.end ?? Infinity, this._startTimestamp), this._timestampOffset = -this._startTimestamp;
			for (let l = 0; l < n.length; l++) {
				const e = n[l], t = o[l];
				for (const r of t) {
					if (this.output.tracks.length === i.total.max) {
						this.discardedTracks.push({
							track: e,
							reason: "max_track_count_reached",
							trackOptions: r
						});
						continue;
					}
					if (this.output.tracks.reduce((t, r) => t + (r.type === e.type ? 1 : 0), 0) === i[e.type].max) {
						this.discardedTracks.push({
							track: e,
							reason: "max_track_count_of_type_reached",
							trackOptions: r
						});
						continue;
					}
					const t = this._nextOutputTrackId++;
					e.isVideoTrack() ? await this._processVideoTrack(e, r, t) : e.isAudioTrack() ? await this._processAudioTrack(e, r, t) : c(!1);
				}
			}
			for (let l = 0; l < this.utilizedTracks.length - 1; l++) for (let e = l + 1; e < this.utilizedTracks.length; e++) {
				const t = this.utilizedTracks[l], r = this.utilizedTracks[e], i = this._outputOwnTrackGroups[l], a = this._outputOwnTrackGroups[e];
				c(void 0 !== i), c(void 0 !== a), i && a && t.canBePairedWith(r) && i.pairWith(a);
			}
			if (!this._composable) {
				const t = await this.input.getMetadataTags();
				let r;
				if (this._options.tags) {
					const e = "function" == typeof this._options.tags ? await this._options.tags(t) : this._options.tags;
					je(e), r = e;
				} else r = t;
				const i = e.mimeType === this.output.format.mimeType;
				t.raw !== r.raw || i || delete r.raw, this.output.setMetadataTags(r);
			}
			if (this._composable ? this.isValid = !0 : this.isValid = this.output.hasEnoughTracks() && this.output.tracks.length > 0, this._options.showWarnings ?? 1) {
				const e = [], t = this.discardedTracks.filter((e) => "discarded_by_user" !== e.reason);
				t.length > 0 && e.push("Some tracks had to be discarded from the conversion:", t), this.isValid || (e.length > 0 && e.push("\n\n"), e.push(this._getInvalidityExplanation().join(""))), e.length > 0 && qe._warn(...e);
			}
		}
		_getInvalidityExplanation() {
			const e = [];
			if (0 === this.discardedTracks.length) e.push("Due to missing tracks, this conversion cannot be executed.");
			else {
				const t = this.discardedTracks.every((e) => "discarded_by_user" === e.reason || "no_encodable_target_codec" === e.reason) && this.discardedTracks.some((e) => "no_encodable_target_codec" === e.reason);
				if (e.push("Due to discarded tracks, this conversion cannot be executed."), t) {
					const t = this.discardedTracks.flatMap((e) => {
						if ("discarded_by_user" === e.reason) return [];
						let t;
						return t = "video" === e.track.type ? this.output.format.getSupportedVideoCodecs() : "audio" === e.track.type ? this.output.format.getSupportedAudioCodecs() : this.output.format.getSupportedSubtitleCodecs(), t.filter((t) => !e.trackOptions.codec || t === e.trackOptions.codec);
					}), r = [...new Set(t)];
					1 === r.length ? e.push(`\nTracks were discarded because your environment is not able to encode '${r[0]}' with the provided parameters.`) : e.push(`\nTracks were discarded because your environment is not able to encode any of the codecs ${r.map((e) => `'${e}'`).join(", ")} with the provided parameters.`), r.includes("mp3") && e.push("\nThe @mediabunny/mp3-encoder extension package provides support for encoding MP3."), r.includes("aac") && e.push("\nThe @mediabunny/aac-encoder extension package provides support for encoding AAC."), (r.includes("ac3") || r.includes("eac3")) && e.push("\nThe @mediabunny/ac3 extension package provides support for encoding and decoding AC-3/E-AC-3."), r.includes("flac") && e.push("\nThe @mediabunny/flac-encoder extension package provides support for encoding FLAC.");
				} else e.push("\nCheck the discardedTracks field for more info.");
			}
			return e;
		}
		async execute(e = {}) {
			if (!e || "object" != typeof e) throw new TypeError("options must be an object.");
			if (void 0 !== e.until && ("number" != typeof e.until || Number.isNaN(e.until))) throw new TypeError("options.until, when provided, must be a number.");
			if (void 0 !== e.pauseSignal && !(e.pauseSignal instanceof AbortSignal)) throw new TypeError("options.pauseSignal, when provided, must be an AbortSignal.");
			if (!this.isValid) throw new Error("Cannot execute this conversion because its output configuration is invalid. Make sure to always check the isValid field before executing a conversion.\n" + this._getInvalidityExplanation().join(""));
			if ("executing" === this._state) throw new Error("Cannot call execute() while a previous call to execute() is still running.");
			if ("canceled" === this._state) throw new Jd();
			if ("done" === this._state) return;
			if (this._composable && "pending" === this.output.state) throw new Error("A composable conversion requires the output to be started. Call start() on the output before executing the conversion.");
			this._state = "executing", this._executionUntil = e.until ?? Infinity, this._pauseRequested = e.pauseSignal?.aborted ?? !1;
			const t = () => {
				"executing" === this._state && (this._pauseRequested = !0, this._synchronizer.resolveAll());
			};
			e.pauseSignal?.addEventListener("abort", t);
			for (const a of this._trackPumps) a.done || (a.resolvers = Q());
			if (this._executed) for (const a of this._trackPumps) a.wake?.();
			else {
				this._executed = !0;
				for (const e of this._outputTrackIds) this._synchronizer.declareTrack(e);
				if (this.onProgress) {
					const e = [...new Set(this.utilizedTracks)].map(async (e) => await e.isLive() ? Infinity : await e.getDurationFromMetadata() ?? await e.computeDuration()), t = Math.max(0, ...await Promise.all(e));
					this._computeProgress = !0, this._totalDuration = Math.min(t - this._startTimestamp, this._endTimestamp - this._startTimestamp);
					for (const r of this._outputTrackIds) this._maxTimestamps.set(r, 0);
					this.onProgress?.(0, 0);
				}
				this._composable || await this.output.start();
				for (const e of this._trackPumps) e.start();
			}
			try {
				await Promise.all(this._trackPumps.map((e) => e.resolvers.promise));
			} catch (i) {
				throw "canceled" !== this._state && this.cancel(), i;
			} finally {
				e.pauseSignal?.removeEventListener("abort", t);
			}
			if ("canceled" === this._state) throw new Jd();
			const r = this._trackPumps.every((e) => e.done);
			if (this._state = r ? "done" : "idle", r && (this._composable || await this.output.finalize(), this._computeProgress)) {
				const e = Math.min(...this._maxTimestamps.values());
				this.onProgress?.(1, e);
			}
		}
		async cancel() {
			if ("done" !== this._state) if ("canceled" !== this._state) {
				this._state = "canceled";
				for (const e of this._trackPumps) e.wake?.();
				this._synchronizer.resolveAll(), this._composable || await this.output.cancel();
			} else qe._warn("Conversion already canceled.");
		}
		async _processVideoTrack(e, t, r) {
			const i = await e.getCodec();
			if (!i) return void this.discardedTracks.push({
				track: e,
				reason: "unknown_source_codec",
				trackOptions: t
			});
			let a;
			const { rotation: s, flip: n } = b(await e.getRotation(), await e.getFlip(), t.rotate ?? 0, t.flip ?? !1);
			let o = s, l = n, d = t.rotate || t.flip ? null : await e.getTransformationMatrix();
			const u = this.output.format.supportsVideoTransformationMetadata && (t.allowTransformationMetadata ?? t.allowRotationMetadata ?? !0), h = await e.getSquarePixelWidth(), f = await e.getSquarePixelHeight(), [m, p] = s % 180 == 0 ? [h, f] : [f, h];
			let g = t.crop;
			g && (g = Cn(g, m, p));
			const [k, w] = g ? [g.width, g.height] : [m, p];
			let y = k, T = w;
			const v = y / T;
			void 0 !== t.width && void 0 === t.height ? (y = Ue(t.width), T = Ue(Math.round(y / v))) : void 0 === t.width && void 0 !== t.height ? (T = Ue(t.height), y = Ue(Math.round(T * v))) : void 0 !== t.width && void 0 !== t.height && (y = Ue(t.width), T = Ue(t.height));
			let S = this.output.format.getSupportedVideoCodecs();
			const P = t.alpha ?? "discard";
			let x = !this._copyMode || !!t.forceTranscode || !!t.frameRate || void 0 !== t.keyFrameInterval || void 0 !== t.process || void 0 !== t.quality || void 0 !== t.bitrate || !S.includes(i) || t.codec && t.codec !== i || y !== k || T !== w || 0 !== s && !u || n && !u || !!g, C = null;
			if (!x) {
				const t = new fo(e);
				let r = await t.getKeyPacket(this._startTimestamp, { verifyKeyPackets: !0 }) ?? await t.getFirstKeyPacket({ verifyKeyPackets: !0 });
				if (r && r.timestamp < this._startTimestamp && r.timestamp + r.duration <= this._startTimestamp && "shrink" === this._copyBoundaryPolicy && (r = await t.getNextKeyPacket(r, { verifyKeyPackets: !0 })), C = r, r) {
					const e = "shrink" === this._copyBoundaryPolicy ? Math.max(r.timestamp, this._startTimestamp) : r.timestamp;
					if (("shrink" === this._copyBoundaryPolicy ? e - this._startTimestamp : Math.max(this._startTimestamp - e, 0)) > this._copyBoundaryTolerance) x = !0;
					else if (this.output.format.supportsTimestampedMediaData) {
						if ("full" !== this.output.format.negativeTimestampSupport && e < this._startTimestamp) {
							const t = Math.min(this._startTimestamp - e, this._copyTimestampShiftTolerance);
							e + t >= this._startTimestamp || "prefer-non-negative" === this.output.format.negativeTimestampSupport && "forced" === this._copyMode ? this._timestampOffset = Math.max(this._timestampOffset, -this._startTimestamp + t) : x = !0;
						}
					} else if (this._timestampOffsetAdjusted) e + this._timestampOffset !== 0 && (x = !0);
					else {
						const t = re(this._startTimestamp - e, -this._copyTimestampShiftTolerance, this._copyTimestampShiftTolerance);
						e + t === this._startTimestamp ? (this._timestampOffset = -this._startTimestamp + t, this._timestampOffsetAdjusted = !0) : x = !0;
					}
				}
			}
			if (x && "forced" === this._copyMode) return void this.discardedTracks.push({
				track: e,
				reason: "cannot_copy",
				trackOptions: t
			});
			if (x) {
				if (!await e.canDecode()) return void this.discardedTracks.push({
					track: e,
					reason: "undecodable_source_codec",
					trackOptions: t
				});
				t.codec && (S = S.filter((e) => e === t.codec));
				const i = io(t.quality, t.bitrate) ?? new Gn("high"), m = await (async (e, t) => {
					for (const r of e) if (await ro(r, t)) return r;
					return null;
				})(S, {
					width: t.process && t.processedWidth ? t.processedWidth : y,
					height: t.process && t.processedHeight ? t.processedHeight : T,
					quality: i
				});
				if (!m) return void this.discardedTracks.push({
					track: e,
					reason: "no_encodable_target_codec",
					trackOptions: t
				});
				const p = {
					codec: m,
					quality: i,
					keyFrameInterval: t.keyFrameInterval,
					sizeChangeBehavior: t.fit ?? "passThrough",
					alpha: P,
					hardwareAcceleration: t.hardwareAcceleration,
					transform: {}
				};
				c(p.transform);
				let b = y !== k || T !== w || 0 !== s && (!u || void 0 !== t.process) || n && (!u || void 0 !== t.process) || !!g || h !== await e.getCodedWidth() || f !== await e.getCodedHeight();
				if (!b) {
					const t = {
						stack: [],
						error: void 0,
						hasError: !1
					};
					try {
						const r = new $d({
							format: new Od(),
							target: new ld()
						}), i = new _d(p);
						r.addVideoTrack(i), await r.start();
						const a = Kd(t, await new To(e).getSample(await e.getFirstTimestamp()), !1);
						if (a) try {
							await i.add(a), a.close(), await r.finalize();
						} catch (M) {
							qe._warn("An error occurred when probing encoder support. Falling back to rerender path.", M), r.cancel(), b = !0, p.transform.force = !0;
						}
						else await r.cancel();
					} catch (D) {
						t.error = D, t.hasError = !0;
					} finally {
						Xd(t);
					}
				}
				t.frameRate && (p.transform.frameRate = t.frameRate), t.process && (p.transform.process = t.process), b && (o = 0, l = !1, d = null, p.transform.width = y, p.transform.height = T, p.transform.fit = t.fit ?? "fill", p.transform.rotate = t.rotate, p.transform.flip = t.flip, p.transform.crop = g, p.transform.alpha = P);
				let v = null;
				p.onEncodedSample = (e) => {
					v = e.timestamp;
				};
				const x = new _d(p);
				a = x, this._registerTrackPump(async (t) => {
					const i = new To(e);
					for await (const e of i.samples(this._startTimestamp, this._endTimestamp)) {
						const i = {
							stack: [],
							error: void 0,
							hasError: !1
						};
						try {
							const a = Kd(i, e, !1);
							if ("canceled" === this._state) break;
							const s = Math.max(this._startTimestamp, a.timestamp), n = Math.min(this._endTimestamp, a.timestamp + a.duration);
							if (s >= n) continue;
							a.setTimestamp(s + this._timestampOffset), a.setDuration(n - s), this._reportProgress(r, a.timestamp + a.duration), await x.add(a), a.close(), null !== v && (this._synchronizer.shouldWait(r, v) && await this._synchronizer.wait(v), await this._checkpoint(t, v));
						} catch (a) {
							i.error = a, i.hasError = !0;
						} finally {
							Xd(i);
						}
					}
					x.close(), this._synchronizer.closeTrack(r);
				});
			} else {
				const t = new Sd(i);
				a = t, this._registerTrackPump(async (i) => {
					const a = new fo(e), s = { decoderConfig: await e.getDecoderConfig() ?? void 0 };
					let n = null;
					if (C) for await (const e of a.packets(C, void 0, { verifyKeyPackets: !0 })) {
						if ("canceled" === this._state) break;
						if (e.timestamp >= this._endTimestamp) {
							if ("shrink" === this._copyBoundaryPolicy) break;
							{
								let t = e, r = !1;
								const i = 6;
								for (let e = 0; e < i; e++) {
									const e = await a.getNextPacket(t, { metadataOnly: !0 });
									if (!e) break;
									if (e.timestamp < this._endTimestamp) {
										r = !0;
										break;
									}
									t = e;
								}
								if (!r) break;
							}
						}
						let o = e.timestamp, c = e.timestamp + e.duration;
						"shrink" === this._copyBoundaryPolicy && (o = Math.max(o, this._startTimestamp), c = Math.min(c, this._endTimestamp), c = Math.max(c, o)), o += this._timestampOffset, c += this._timestampOffset;
						let l = e.type;
						"key" === l && null !== n && o < n && (l = "delta"), n = Math.max(n ?? -Infinity, o);
						const d = e.clone({
							timestamp: o,
							duration: c - o,
							sideData: "discard" === P ? {} : e.sideData,
							type: l
						});
						this._reportProgress(r, d.timestamp + d.duration), await t.add(d, s), this._synchronizer.shouldWait(r, d.timestamp) && await this._synchronizer.wait(d.timestamp), await this._checkpoint(i, d.timestamp);
					}
					t.close(), this._synchronizer.closeTrack(r);
				});
			}
			let E = null;
			t.group || this._composable || (E = new Hd());
			const _ = await e.getLanguageCode(), I = await e.getName(), B = await e.getDisposition(), A = x ? null : await e.getBitrate(), R = x ? null : await e.getAverageBitrate(), F = "keep" === P && await e.canBeTransparent();
			this.output.addVideoTrack(a, {
				frameRate: t.frameRate,
				languageCode: de(_) ? _ : void 0,
				name: I ?? void 0,
				disposition: B,
				rotation: o,
				flip: l,
				transformationMatrix: d ?? void 0,
				canBeTransparent: F,
				group: E ?? t.group,
				bitrate: A ?? void 0,
				averageBitrate: R ?? void 0
			}), this.utilizedTracks.push(e), this._outputTrackIds.push(r), this._outputOwnTrackGroups.push(E);
		}
		async _processAudioTrack(e, t, r) {
			const i = await e.getCodec();
			if (!i) return void this.discardedTracks.push({
				track: e,
				reason: "unknown_source_codec",
				trackOptions: t
			});
			let a;
			const s = await e.getNumberOfChannels(), n = await e.getSampleRate();
			let o = t.numberOfChannels ?? s, l = t.sampleRate ?? n, d = this.output.format.getSupportedAudioCodecs(), u = !(this._copyMode && !t.forceTranscode && !t.quality && !t.bitrate && o === s && l === n && d.includes(i) && (!t.codec || t.codec === i) && void 0 === t.process && void 0 === t.sampleFormat), h = null;
			if (!u) {
				const t = new fo(e);
				let r = await t.getKeyPacket(this._startTimestamp) ?? await t.getFirstKeyPacket();
				r && ("shrink" === this._copyBoundaryPolicy && r.timestamp < this._startTimestamp || "expand" === this._copyBoundaryPolicy && r.timestamp + r.duration <= this._startTimestamp) && (r = await t.getNextKeyPacket(r));
				const a = gr.includes(i) && "flac" !== i;
				if (r && "expand" === this._copyBoundaryPolicy && a) {
					const i = await t.getKeyPacket(r.timestamp - 1 / await e.getTimeResolution());
					i && (r = i);
				}
				if (h = r, r) if (("shrink" === this._copyBoundaryPolicy ? Math.max(r.timestamp - this._startTimestamp, 0) : Math.max(this._startTimestamp - r.timestamp, 0)) > this._copyBoundaryTolerance) u = !0;
				else if (this.output.format.supportsTimestampedMediaData) {
					if ("full" !== this.output.format.negativeTimestampSupport && r.timestamp < this._startTimestamp) {
						const e = Math.min(this._startTimestamp - r.timestamp, this._copyTimestampShiftTolerance);
						r.timestamp + e >= this._startTimestamp || "prefer-non-negative" === this.output.format.negativeTimestampSupport && "forced" === this._copyMode ? this._timestampOffset = Math.max(this._timestampOffset, -this._startTimestamp + e) : u = !0;
					}
				} else if (this._timestampOffsetAdjusted) r.timestamp + this._timestampOffset !== 0 && (u = !0);
				else {
					const e = re(this._startTimestamp - r.timestamp, -this._copyTimestampShiftTolerance, this._copyTimestampShiftTolerance);
					r.timestamp + e === this._startTimestamp ? (this._timestampOffset = -this._startTimestamp + e, this._timestampOffsetAdjusted = !0) : u = !0;
				}
			}
			if (u && "forced" === this._copyMode) return void this.discardedTracks.push({
				track: e,
				reason: "cannot_copy",
				trackOptions: t
			});
			if (u) {
				if (!await e.canDecode()) return void this.discardedTracks.push({
					track: e,
					reason: "undecodable_source_codec",
					trackOptions: t
				});
				let i = null;
				t.codec && (d = d.filter((e) => e === t.codec));
				const u = io(t.quality, t.bitrate) ?? new Gn("high"), h = await ao(d, {
					numberOfChannels: t.process && t.processedNumberOfChannels ? t.processedNumberOfChannels : o,
					sampleRate: t.process && t.processedSampleRate ? t.processedSampleRate : l,
					quality: u
				});
				if (h.some((e) => gr.includes(e)) || !d.some((e) => gr.includes(e)) || 2 === o && l === Yd) i = h[0] ?? null;
				else {
					const e = (await ao(d, {
						numberOfChannels: 2,
						sampleRate: Yd,
						quality: u
					})).find((e) => gr.includes(e));
					e && (i = e, o = 2, l = Yd);
				}
				if (null === i) return void this.discardedTracks.push({
					track: e,
					reason: "no_encodable_target_codec",
					trackOptions: t
				});
				const f = {
					codec: i,
					quality: u,
					transform: {
						sampleFormat: t.sampleFormat,
						process: t.process
					}
				};
				c(f.transform), o !== s && (f.transform.numberOfChannels = o), l !== n && (f.transform.sampleRate = l);
				let m = null;
				f.onEncodedSample = (e) => {
					m = e.timestamp;
				};
				const p = new Rd(f);
				a = p, this._registerTrackPump(async (t) => {
					let i = null;
					const a = new Po(e);
					for await (const e of a.samples(this._startTimestamp, this._endTimestamp)) {
						const a = {
							stack: [],
							error: void 0,
							hasError: !1
						};
						try {
							const c = Kd(a, e, !1);
							if ("canceled" === this._state) break;
							let l, d = 0, u = c.numberOfFrames;
							if (c.timestamp < this._startTimestamp && (d = Math.round((this._startTimestamp - c.timestamp) * c.sampleRate)), c.timestamp + c.duration > this._endTimestamp && (u = Math.round((this._endTimestamp - c.timestamp) * c.sampleRate)), d >= u) {
								c.close();
								continue;
							}
							if (d > 0 || u < c.numberOfFrames) {
								const e = c.trim(d, u);
								if (c.close(), l = e, 0 === e.numberOfFrames) {
									e.close();
									continue;
								}
							} else l = c;
							const h = Kd(a, l, !1);
							if (h.setTimestamp(h.timestamp + this._timestampOffset), null === i && (i = h.timestamp > 0 && !this.output.format.supportsTimestampedMediaData), i) {
								const e = {
									stack: [],
									error: void 0,
									hasError: !1
								};
								try {
									const a = h.timestamp, o = Math.round(a * n), l = Nn(c.format), d = new Uint8Array(l * o * s);
									"u8" !== c.format && "u8-planar" !== c.format || d.fill(128);
									const u = Kd(e, new zn({
										data: d,
										format: c.format,
										numberOfChannels: s,
										sampleRate: n,
										timestamp: 0
									}), !1);
									await this._registerAudioSample(t, u, p, r, () => m), i = !1;
								} catch (o) {
									e.error = o, e.hasError = !0;
								} finally {
									Xd(e);
								}
							}
							await this._registerAudioSample(t, h, p, r, () => m);
						} catch (c) {
							a.error = c, a.hasError = !0;
						} finally {
							Xd(a);
						}
					}
					p.close(), this._synchronizer.closeTrack(r);
				});
			} else {
				const t = new Bd(i);
				a = t, this._registerTrackPump(async (i) => {
					const a = new fo(e), s = { decoderConfig: await e.getDecoderConfig() ?? void 0 };
					let n = null;
					if (h) for await (const e of a.packets(h)) {
						if ("canceled" === this._state) break;
						if (e.timestamp >= this._endTimestamp) break;
						if ("shrink" === this._copyBoundaryPolicy && e.timestamp + e.duration > this._endTimestamp) break;
						const a = e.timestamp + this._timestampOffset;
						if (null !== n && a < n) continue;
						n = a;
						const o = e.clone({
							timestamp: a,
							duration: e.duration
						});
						this._reportProgress(r, o.timestamp + o.duration), await t.add(o, s), this._synchronizer.shouldWait(r, o.timestamp) && await this._synchronizer.wait(o.timestamp), await this._checkpoint(i, o.timestamp);
					}
					t.close(), this._synchronizer.closeTrack(r);
				});
			}
			let f = null;
			t.group || this._composable || (f = new Hd());
			const m = await e.getLanguageCode(), p = await e.getName(), g = await e.getDisposition(), k = u ? null : await e.getBitrate(), w = u ? null : await e.getAverageBitrate();
			this.output.addAudioTrack(a, {
				languageCode: de(m) ? m : void 0,
				name: p ?? void 0,
				disposition: g,
				group: f ?? t.group,
				bitrate: k ?? void 0,
				averageBitrate: w ?? void 0
			}), this.utilizedTracks.push(e), this._outputTrackIds.push(r), this._outputOwnTrackGroups.push(f);
		}
		async _registerAudioSample(e, t, r, i, a) {
			this._reportProgress(i, t.timestamp + t.duration), await r.add(t), t.close();
			const s = a();
			null !== s && (this._synchronizer.shouldWait(i, s) && await this._synchronizer.wait(s), await this._checkpoint(e, s));
		}
		_registerTrackPump(e) {
			const t = {
				done: !1,
				resolvers: Q(),
				wake: null,
				start: () => {
					e(t).then(() => {
						t.done = !0, t.resolvers.resolve();
					}, (e) => {
						t.resolvers.reject(e);
					});
				}
			};
			this._trackPumps.push(t);
		}
		async _checkpoint(e, t) {
			for (; "canceled" !== this._state && (t >= this._executionUntil || this._pauseRequested);) {
				e.resolvers.resolve();
				const { promise: t, resolve: r } = Q();
				e.wake = r, await t;
			}
		}
		_reportProgress(e, t) {
			if (!this._computeProgress) return;
			c(null !== this._totalDuration), this._maxTimestamps.set(e, Math.max(t, this._maxTimestamps.get(e)));
			const r = Math.min(...this._maxTimestamps.values()), i = re(r / this._totalDuration, 0, 1);
			i !== this._lastProgress && (this._lastProgress = i, this.onProgress?.(i, r));
		}
	}, Jd = class extends Error {
		constructor(e = "Conversion has been canceled.") {
			super(e), this.name = "ConversionCanceledError";
		}
	};
	var eu = class {
		constructor(e) {
			this.maxTimestamps = /* @__PURE__ */ new Map(), this.resolvers = [], this.conversion = e;
		}
		declareTrack(e) {
			this.maxTimestamps.set(e, -Infinity);
		}
		shouldWait(e, t) {
			const r = this.maxTimestamps.get(e);
			c(void 0 !== r), this.maxTimestamps.set(e, Math.max(t, r));
			const i = this.computeMinAndMaybeResolve();
			return !("canceled" === this.conversion._state || this.conversion._pauseRequested || t >= this.conversion._executionUntil) && t - i > 1;
		}
		wait(e) {
			const { promise: t, resolve: r } = Q();
			return this.resolvers.push({
				timestamp: e,
				resolve: r
			}), t;
		}
		closeTrack(e) {
			this.maxTimestamps.delete(e), this.computeMinAndMaybeResolve();
		}
		resolveAll() {
			for (const e of this.resolvers) e.resolve();
			this.resolvers.length = 0;
		}
		computeMinAndMaybeResolve() {
			let e = Infinity;
			for (const [, t] of this.maxTimestamps) e = Math.min(e, t);
			for (let t = 0; t < this.resolvers.length; t++) {
				const r = this.resolvers[t];
				r.timestamp - e < 1 && (r.resolve(), this.resolvers.splice(t, 1), t--);
			}
			return e;
		}
	};
	const tu = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u20E3\u{1F1E6}-\u{1F1FF}]/u, ru = {
		white: [
			1,
			1,
			1
		],
		black: [
			0,
			0,
			0
		],
		red: [
			1,
			0,
			0
		],
		lime: [
			0,
			1,
			0
		],
		blue: [
			0,
			0,
			1
		],
		yellow: [
			1,
			1,
			0
		],
		cyan: [
			0,
			1,
			1
		],
		aqua: [
			0,
			1,
			1
		],
		magenta: [
			1,
			0,
			1
		],
		fuchsia: [
			1,
			0,
			1
		]
	};
	function iu(e) {
		const t = String(e || "#ffffff").trim().toLowerCase();
		if (!t) return [
			1,
			1,
			1
		];
		const r = ru[t];
		if (r) return r;
		if (t.startsWith("#")) {
			const e = t.slice(1);
			return /^[0-9a-f]{3}$/.test(e) || /^[0-9a-f]{4}$/.test(e) ? 4 === e.length && "f" !== e[3] ? null : [
				17 * parseInt(e[0], 16) / 255,
				17 * parseInt(e[1], 16) / 255,
				17 * parseInt(e[2], 16) / 255
			] : /^[0-9a-f]{6}$/.test(e) || /^[0-9a-f]{8}$/.test(e) ? 8 === e.length && "ff" !== e.slice(6, 8) ? null : [
				parseInt(e.slice(0, 2), 16) / 255,
				parseInt(e.slice(2, 4), 16) / 255,
				parseInt(e.slice(4, 6), 16) / 255
			] : null;
		}
		const i = /^rgba?\(\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)(?:\s*,\s*([0-9]*\.?[0-9]+))?\s*\)$/.exec(t);
		if (i) {
			if (void 0 !== i[4] && Number(i[4]) < .999) return null;
			const e = (e) => Math.max(0, Math.min(255, e)) / 255;
			return [
				e(Number(i[1])),
				e(Number(i[2])),
				e(Number(i[3]))
			];
		}
		return null;
	}
	function au(e) {
		return function(e) {
			return !e.stroke && !tu.test(e.text) && null !== iu(e.color);
		}(e) ? `m\0${e.size}\0${e.font}\0${e.text}` : `c\0${e.size}\0${e.stroke ? "1" : "0"}\0${e.color}\0${e.font}\0${e.text}`;
	}
	function su(e) {
		return e <= 0 ? 0 : e >= 1 ? 1 : e;
	}
	function nu(e, t) {
		if ("speedup" === t) return e * e;
		const r = 1 - e;
		return 1 - r * r;
	}
	var ou = class {
		entries;
		maxSpriteBatchNeeded;
		active = [];
		nextInsertIdx = 0;
		lastQueryTime = -Infinity;
		constructor(e) {
			const t = [...e].sort((e, t) => e.startTime - t.startTime || (e.layer || 0) - (t.layer || 0));
			this.entries = t.map((e) => {
				const t = Math.max(0, Number(e.animation?.duration) || 0), r = Number(e.animation?.moveDuration) || 0, i = Number(e.animation?.delay) || 0, a = "speedup" === e.animation?.easing ? "speedup" : "speeddown", s = {
					text: e.content?.text ?? "",
					font: e.content?.font ?? "",
					size: Number(e.content?.size) || 24,
					color: e.content?.color || "#ffffff",
					stroke: Boolean(e.content?.stroke)
				}, n = Number(e.transform?.yRotate) || 0, o = 0 === n ? 0 : 360 - n, c = Number(e.transform?.zRotate) || 0;
				return {
					item: e,
					startTime: e.startTime,
					endTime: e.startTime + t,
					duration: t,
					moveDuration: r,
					delay: i,
					easing: a,
					startX: Number(e.transform?.start?.x) || 0,
					startY: Number(e.transform?.start?.y) || 0,
					endX: Number(e.transform?.end?.x) || 0,
					endY: Number(e.transform?.end?.y) || 0,
					zRotateRad: c * Math.PI / 180,
					yRotateRad: o * Math.PI / 180,
					opacityFrom: Number(e.opacity?.from ?? 1),
					opacityTo: Number(e.opacity?.to ?? 1),
					spriteKey: au(s),
					colorRgb: iu(s.color) ?? [
						1,
						1,
						1
					],
					spriteSpec: s
				};
			}), this.maxSpriteBatchNeeded = this.entries.length;
		}
		evaluateAt(e, t) {
			if (t.length = 0, 0 === this.entries.length) return t;
			e < this.lastQueryTime && (this.active.length = 0, this.nextInsertIdx = 0), this.lastQueryTime = e;
			let r = 0;
			for (let i = 0; i < this.active.length; i += 1) {
				const t = this.active[i];
				t.endTime >= e && (this.active[r] = t, r += 1);
			}
			for (this.active.length = r; this.nextInsertIdx < this.entries.length;) {
				const t = this.entries[this.nextInsertIdx];
				if (t.startTime > e) break;
				t.endTime >= e && this.active.push(t), this.nextInsertIdx += 1;
			}
			for (let i = 0; i < this.active.length; i += 1) {
				const r = this.active[i], a = e - r.startTime;
				let s;
				s = r.moveDuration <= 0 ? 1 : a <= r.delay ? 0 : su((a - r.delay) / r.moveDuration);
				const n = nu(s, r.easing), o = r.startX + (r.endX - r.startX) * n, c = r.startY + (r.endY - r.startY) * n, l = r.duration > 0 ? su(a / r.duration) : 1, d = su(r.opacityFrom + (r.opacityTo - r.opacityFrom) * l);
				d <= .001 || !r.spriteSpec.text || t.push({
					entry: r,
					x: o,
					y: c,
					opacity: d
				});
			}
			return t;
		}
		collectUniqueSpritesInRange(e, t, r, i = Infinity) {
			const a = [];
			for (let s = 0; s < this.entries.length; s += 1) {
				const n = this.entries[s];
				if (n.startTime > t) break;
				if (!(n.endTime < e) && n.spriteSpec.text && !r.has(n.spriteKey) && (r.add(n.spriteKey), a.push({
					key: n.spriteKey,
					spec: n.spriteSpec
				}), a.length >= i)) break;
			}
			return a;
		}
	};
	function cu(e, t, r) {
		const i = e.createShader(t);
		if (!i) throw new Error("Failed to create WebGL2 shader");
		if (e.shaderSource(i, r), e.compileShader(i), !e.getShaderParameter(i, e.COMPILE_STATUS)) {
			const t = e.getShaderInfoLog(i) || "Unknown shader compile error";
			throw e.deleteShader(i), new Error(t);
		}
		return i;
	}
	function lu(e, t, r) {
		const i = cu(e, e.VERTEX_SHADER, t), a = cu(e, e.FRAGMENT_SHADER, r), s = e.createProgram();
		if (!s) throw e.deleteShader(i), e.deleteShader(a), /* @__PURE__ */ new Error("Failed to create WebGL2 program");
		if (e.attachShader(s, i), e.attachShader(s, a), e.linkProgram(s), e.deleteShader(i), e.deleteShader(a), !e.getProgramParameter(s, e.LINK_STATUS)) {
			const t = e.getProgramInfoLog(s) || "Unknown program link error";
			throw e.deleteProgram(s), new Error(t);
		}
		return s;
	}
	var du = class {
		canvas;
		outputWidth;
		outputHeight;
		screenWidth;
		screenHeight;
		gl;
		maxTextureSize;
		videoProgram;
		videoVao;
		videoVbo;
		videoTex;
		videoTexLoc;
		videoLastSampleTimestamp = null;
		lastVideoOrientationKey = "";
		videoQuadData = new Float32Array(24);
		danmakuProgram;
		danmakuVao;
		danmakuVbo;
		danmakuQuadData = new Float32Array(24);
		uScreenSizeLoc;
		uTranslateLoc;
		uZRotateLoc;
		uYRotateLoc;
		uDanmakuTexLoc;
		uOpacityLoc;
		uIsMaskLoc;
		uColorLoc;
		spriteCache = /* @__PURE__ */ new Map();
		spriteCacheBytes = 0;
		maxSpriteCacheBytes;
		scratchCanvas = null;
		scratchCtx = null;
		forceScratchCanvasVideoUpload = !1;
		constructor(e, t, r, i, a, s = 536870912) {
			this.canvas = e, this.outputWidth = t, this.outputHeight = r, this.screenWidth = i, this.screenHeight = a;
			const n = e.getContext("webgl2", {
				alpha: !1,
				antialias: !1,
				depth: !1,
				stencil: !1,
				preserveDrawingBuffer: !0,
				powerPreference: "high-performance"
			});
			if (!n) throw new Error("WebGL2 context unavailable");
			this.gl = n, this.maxTextureSize = Number(n.getParameter(n.MAX_TEXTURE_SIZE)) || 4096, this.maxSpriteCacheBytes = s, n.viewport(0, 0, t, r), n.disable(n.DEPTH_TEST), n.disable(n.CULL_FACE), n.clearColor(0, 0, 0, 1), this.videoProgram = lu(n, "#version 300 es\nin vec2 a_pos;\nin vec2 a_uv;\nout vec2 v_uv;\nvoid main() {\n  gl_Position = vec4(a_pos, 0.0, 1.0);\n  v_uv = a_uv;\n}", "#version 300 es\nprecision highp float;\nuniform sampler2D u_tex;\nin vec2 v_uv;\nout vec4 outColor;\nvoid main() {\n  outColor = vec4(texture(u_tex, v_uv).rgb, 1.0);\n}"), this.videoTexLoc = n.getUniformLocation(this.videoProgram, "u_tex");
			const o = n.createVertexArray(), c = n.createBuffer(), l = n.createTexture();
			if (!o || !c || !l) throw new Error("Failed to allocate WebGL2 video resources");
			this.videoVao = o, this.videoVbo = c, this.videoTex = l, n.bindVertexArray(this.videoVao), n.bindBuffer(n.ARRAY_BUFFER, this.videoVbo), n.bufferData(n.ARRAY_BUFFER, this.videoQuadData.byteLength, n.DYNAMIC_DRAW);
			const d = n.getAttribLocation(this.videoProgram, "a_pos"), u = n.getAttribLocation(this.videoProgram, "a_uv");
			n.enableVertexAttribArray(d), n.vertexAttribPointer(d, 2, n.FLOAT, !1, 16, 0), n.enableVertexAttribArray(u), n.vertexAttribPointer(u, 2, n.FLOAT, !1, 16, 8), n.bindTexture(n.TEXTURE_2D, this.videoTex), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_MIN_FILTER, n.LINEAR), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_MAG_FILTER, n.LINEAR), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_WRAP_S, n.CLAMP_TO_EDGE), n.texParameteri(n.TEXTURE_2D, n.TEXTURE_WRAP_T, n.CLAMP_TO_EDGE), this.danmakuProgram = lu(n, "#version 300 es\nin vec2 a_localPos;\nin vec2 a_uv;\n\nuniform vec2 u_screenSize;\nuniform vec2 u_translate;\nuniform float u_zRotateRad;\nuniform float u_yRotateRad;\n\nout vec2 v_uv;\n\nvoid main() {\n  // CSS right-to-left transform order: translate3d(x, y, 0) * rotateZ(rz) * rotateY(ry)\n  float cosY = cos(u_yRotateRad);\n  float sinY = sin(u_yRotateRad);\n  float px = a_localPos.x * cosY;\n  float py = a_localPos.y;\n  float pz = -a_localPos.x * sinY;\n\n  float cosZ = cos(u_zRotateRad);\n  float sinZ = sin(u_zRotateRad);\n  float rx = px * cosZ - py * sinZ;\n  float ry = px * sinZ + py * cosZ;\n  float rz = pz;\n\n  float worldX = rx + u_translate.x;\n  float worldY = ry + u_translate.y;\n\n  float dx = worldX - u_screenSize.x * 0.5;\n  float dy = worldY - u_screenSize.y * 0.5;\n  float w = 1.0 - rz / 500.0;\n\n  float clipX = dx / (u_screenSize.x * 0.5);\n  float clipY = -dy / (u_screenSize.y * 0.5);\n  gl_Position = vec4(clipX, clipY, 0.0, w);\n  v_uv = a_uv;\n}", "#version 300 es\nprecision highp float;\nuniform sampler2D u_tex;\nuniform float u_opacity;\nuniform int u_isMask;\nuniform vec3 u_color;\nin vec2 v_uv;\nout vec4 outColor;\nvoid main() {\n  if (u_isMask != 0) {\n    float a = texture(u_tex, v_uv).r;\n    outColor = vec4(u_color * a, a) * u_opacity;\n  } else {\n    outColor = texture(u_tex, v_uv) * u_opacity;\n  }\n}"), this.uScreenSizeLoc = n.getUniformLocation(this.danmakuProgram, "u_screenSize"), this.uTranslateLoc = n.getUniformLocation(this.danmakuProgram, "u_translate"), this.uZRotateLoc = n.getUniformLocation(this.danmakuProgram, "u_zRotateRad"), this.uYRotateLoc = n.getUniformLocation(this.danmakuProgram, "u_yRotateRad"), this.uDanmakuTexLoc = n.getUniformLocation(this.danmakuProgram, "u_tex"), this.uOpacityLoc = n.getUniformLocation(this.danmakuProgram, "u_opacity"), this.uIsMaskLoc = n.getUniformLocation(this.danmakuProgram, "u_isMask"), this.uColorLoc = n.getUniformLocation(this.danmakuProgram, "u_color");
			const h = n.createVertexArray(), f = n.createBuffer();
			if (!h || !f) throw new Error("Failed to allocate WebGL2 danmaku resources");
			this.danmakuVao = h, this.danmakuVbo = f, n.bindVertexArray(this.danmakuVao), n.bindBuffer(n.ARRAY_BUFFER, this.danmakuVbo), n.bufferData(n.ARRAY_BUFFER, this.danmakuQuadData.byteLength, n.STREAM_DRAW);
			const m = n.getAttribLocation(this.danmakuProgram, "a_localPos"), p = n.getAttribLocation(this.danmakuProgram, "a_uv");
			n.enableVertexAttribArray(m), n.vertexAttribPointer(m, 2, n.FLOAT, !1, 16, 0), n.enableVertexAttribArray(p), n.vertexAttribPointer(p, 2, n.FLOAT, !1, 16, 8), n.useProgram(this.danmakuProgram), n.uniform2f(this.uScreenSizeLoc, this.screenWidth, this.screenHeight), n.uniform1i(this.uDanmakuTexLoc, 0), n.useProgram(this.videoProgram), n.uniform1i(this.videoTexLoc, 0), n.bindVertexArray(null);
		}
		hasSprite(e) {
			const t = this.spriteCache.get(e);
			return !!t && (this.spriteCache.delete(e), this.spriteCache.set(e, t), !0);
		}
		uploadSprite(e, t) {
			const r = this.spriteCache.get(e.key);
			if (r) return this.spriteCache.delete(e.key), void this.spriteCache.set(e.key, r);
			const i = "r8" === e.format ? e.pixelWidth * e.pixelHeight : e.pixelWidth * e.pixelHeight * 4;
			if (this.spriteCache.size > 0 && this.spriteCacheBytes + i > this.maxSpriteCacheBytes) for (const n of this.spriteCache.keys()) {
				if (this.spriteCacheBytes + i <= this.maxSpriteCacheBytes) break;
				if (t?.has(n)) continue;
				const e = this.spriteCache.get(n);
				this.spriteCache.delete(n), e && (this.spriteCacheBytes -= e.byteSize, this.gl.deleteTexture(e.texture));
			}
			const a = this.gl, s = a.createTexture();
			if (!s) throw new Error("Failed to create WebGL2 texture for danmaku sprite");
			a.activeTexture(a.TEXTURE0), a.bindTexture(a.TEXTURE_2D, s), a.texParameteri(a.TEXTURE_2D, a.TEXTURE_MIN_FILTER, a.LINEAR), a.texParameteri(a.TEXTURE_2D, a.TEXTURE_MAG_FILTER, a.LINEAR), a.texParameteri(a.TEXTURE_2D, a.TEXTURE_WRAP_S, a.CLAMP_TO_EDGE), a.texParameteri(a.TEXTURE_2D, a.TEXTURE_WRAP_T, a.CLAMP_TO_EDGE), a.pixelStorei(a.UNPACK_FLIP_Y_WEBGL, !1), "r8" === e.format ? (a.pixelStorei(a.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !1), a.pixelStorei(a.UNPACK_ALIGNMENT, 1), a.texImage2D(a.TEXTURE_2D, 0, a.R8, e.pixelWidth, e.pixelHeight, 0, a.RED, a.UNSIGNED_BYTE, e.data)) : (a.pixelStorei(a.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !0), a.pixelStorei(a.UNPACK_ALIGNMENT, 4), a.texImage2D(a.TEXTURE_2D, 0, a.RGBA, e.pixelWidth, e.pixelHeight, 0, a.RGBA, a.UNSIGNED_BYTE, e.data)), this.spriteCache.set(e.key, {
				texture: s,
				format: e.format,
				offsetX: e.offsetX,
				offsetY: e.offsetY,
				logicalWidth: e.logicalWidth,
				logicalHeight: e.logicalHeight,
				byteSize: i
			}), this.spriteCacheBytes += i;
		}
		updateVideoQuadGeometry(e) {
			const t = `${e.displayWidth}x${e.displayHeight}:${e.rotation}:${e.flip ? 1 : 0}`;
			if (t === this.lastVideoOrientationKey) return;
			this.lastVideoOrientationKey = t;
			const r = Math.min(this.outputWidth / e.displayWidth, this.outputHeight / e.displayHeight), i = e.displayWidth * r, a = e.displayHeight * r, s = (this.outputWidth - i) / 2, n = (this.outputHeight - a) / 2, o = s + i, c = n + a, l = s / this.outputWidth * 2 - 1, d = o / this.outputWidth * 2 - 1, u = 1 - n / this.outputHeight * 2, h = 1 - c / this.outputHeight * 2;
			let f = 0, m = 0, p = 1, g = 0, k = 1, w = 1, y = 0, b = 1;
			this.forceScratchCanvasVideoUpload || (90 === e.rotation ? (f = 0, m = 1, p = 0, g = 0, k = 1, w = 0, y = 1, b = 1) : 180 === e.rotation ? (f = 1, m = 1, p = 0, g = 1, k = 0, w = 0, y = 1, b = 0) : 270 === e.rotation && (f = 1, m = 0, p = 1, g = 1, k = 0, w = 1, y = 0, b = 0), e.flip && ([f, p] = [p, f], [m, g] = [g, m], [y, k] = [k, y], [b, w] = [w, b]));
			const T = this.videoQuadData;
			T[0] = l, T[1] = u, T[2] = f, T[3] = m, T[4] = l, T[5] = h, T[6] = y, T[7] = b, T[8] = d, T[9] = u, T[10] = p, T[11] = g, T[12] = d, T[13] = u, T[14] = p, T[15] = g, T[16] = l, T[17] = h, T[18] = y, T[19] = b, T[20] = d, T[21] = h, T[22] = k, T[23] = w;
			const v = this.gl;
			v.bindBuffer(v.ARRAY_BUFFER, this.videoVbo), v.bufferSubData(v.ARRAY_BUFFER, 0, T);
		}
		ensureScratchCanvas(e, t) {
			if (!this.scratchCanvas) {
				if ("undefined" != typeof OffscreenCanvas) this.scratchCanvas = new OffscreenCanvas(e, t);
				else {
					const r = document.createElement("canvas");
					r.width = e, r.height = t, this.scratchCanvas = r;
				}
				this.scratchCtx = this.scratchCanvas.getContext("2d");
			}
			if (this.scratchCanvas.width === e && this.scratchCanvas.height === t || (this.scratchCanvas.width = e, this.scratchCanvas.height = t), !this.scratchCtx) throw new Error("Failed to create 2D scratch canvas for video upload");
			return {
				canvas: this.scratchCanvas,
				ctx: this.scratchCtx
			};
		}
		renderFrame(e, t) {
			const r = this.gl;
			if (r.disable(r.BLEND), r.clear(r.COLOR_BUFFER_BIT), e) {
				if (r.activeTexture(r.TEXTURE0), r.bindTexture(r.TEXTURE_2D, this.videoTex), this.videoLastSampleTimestamp !== e.timestamp) {
					this.videoLastSampleTimestamp = e.timestamp, r.pixelStorei(r.UNPACK_FLIP_Y_WEBGL, !1), r.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !1);
					let t = !1;
					if (!this.forceScratchCanvasVideoUpload) {
						let i = null;
						try {
							i = e.toVideoFrame(), r.texImage2D(r.TEXTURE_2D, 0, r.RGBA, r.RGBA, r.UNSIGNED_BYTE, i), t = !0;
						} catch {
							this.forceScratchCanvasVideoUpload = !0, this.lastVideoOrientationKey = "";
						} finally {
							i?.close();
						}
					}
					if (!t) {
						const { canvas: t, ctx: i } = this.ensureScratchCanvas(e.displayWidth, e.displayHeight);
						i.clearRect(0, 0, t.width, t.height), e.draw(i, 0, 0, t.width, t.height), r.texImage2D(r.TEXTURE_2D, 0, r.RGBA, r.RGBA, r.UNSIGNED_BYTE, t);
					}
				}
				this.updateVideoQuadGeometry({
					displayWidth: e.displayWidth,
					displayHeight: e.displayHeight,
					rotation: e.rotation,
					flip: e.flip
				}), r.useProgram(this.videoProgram), r.bindVertexArray(this.videoVao), r.drawArrays(r.TRIANGLES, 0, 6);
			}
			if (t.length > 0) {
				r.enable(r.BLEND), r.blendFunc(r.ONE, r.ONE_MINUS_SRC_ALPHA), r.useProgram(this.danmakuProgram), r.bindVertexArray(this.danmakuVao), r.activeTexture(r.TEXTURE0);
				let e = "", i = -1;
				for (let a = 0; a < t.length; a += 1) {
					const s = t[a], n = this.spriteCache.get(s.entry.spriteKey);
					if (!n) continue;
					const o = n.offsetX, c = n.offsetY, l = o + n.logicalWidth, d = c + n.logicalHeight, u = `${o},${c},${l},${d}`;
					if (u !== e) {
						e = u;
						const t = this.danmakuQuadData;
						t[0] = o, t[1] = c, t[2] = 0, t[3] = 0, t[4] = o, t[5] = d, t[6] = 0, t[7] = 1, t[8] = l, t[9] = c, t[10] = 1, t[11] = 0, t[12] = l, t[13] = c, t[14] = 1, t[15] = 0, t[16] = o, t[17] = d, t[18] = 0, t[19] = 1, t[20] = l, t[21] = d, t[22] = 1, t[23] = 1, r.bindBuffer(r.ARRAY_BUFFER, this.danmakuVbo), r.bufferSubData(r.ARRAY_BUFFER, 0, t);
					}
					const h = "r8" === n.format ? 1 : 0;
					if (h !== i && (i = h, r.uniform1i(this.uIsMaskLoc, h)), 1 === h) {
						const [e, t, i] = s.entry.colorRgb;
						r.uniform3f(this.uColorLoc, e, t, i);
					}
					r.bindTexture(r.TEXTURE_2D, n.texture), r.uniform2f(this.uTranslateLoc, s.x, s.y), r.uniform1f(this.uZRotateLoc, s.entry.zRotateRad), r.uniform1f(this.uYRotateLoc, s.entry.yRotateRad), r.uniform1f(this.uOpacityLoc, s.opacity), r.drawArrays(r.TRIANGLES, 0, 6);
				}
			}
		}
		dispose() {
			const e = this.gl;
			for (const t of this.spriteCache.values()) e.deleteTexture(t.texture);
			this.spriteCache.clear(), this.spriteCacheBytes = 0, e.deleteTexture(this.videoTex), e.deleteBuffer(this.videoVbo), e.deleteVertexArray(this.videoVao), e.deleteProgram(this.videoProgram), e.deleteBuffer(this.danmakuVbo), e.deleteVertexArray(this.danmakuVao), e.deleteProgram(this.danmakuProgram);
		}
	};
	function uu(e, t, r) {
		for (let i = 0; i < t.length; i += 1) {
			const a = t[i];
			e.uploadSprite({
				key: a.key,
				format: a.format,
				pixelWidth: a.pixelWidth,
				pixelHeight: a.pixelHeight,
				offsetX: a.offsetX,
				offsetY: a.offsetY,
				logicalWidth: a.logicalWidth,
				logicalHeight: a.logicalHeight,
				data: new Uint8Array(a.dataBuffer)
			}, r);
		}
	}
	function hu(e, t, r) {
		const i = Math.pow(e * t / 2073600, .95);
		return Math.min(5e8, Math.max(3e7, Math.ceil(3e7 * i * r / 30)));
	}
	function fu(e, t, r, i) {
		return new Gn("near-lossless" === e ? {
			bitrate: hu(t, r, i),
			bitrateMode: "variable"
		} : e);
	}
	const mu = self;
	let pu = null, gu = null, ku = null, wu = null, yu = Promise.resolve(), bu = null, Tu = 30, vu = null, Su = null, Pu = null, xu = null, Cu = null, Eu = Promise.resolve(), _u = !1, Iu = !1, Bu = !1, Au = 0, Ru = 0, Fu = 1;
	const Mu = /* @__PURE__ */ new Map();
	function Du(e) {
		mu.postMessage({
			type: "finalizing-stage",
			stage: e
		});
	}
	function Ou(e, t) {
		mu.postMessage({
			type: "chunk",
			position: e,
			data: t.buffer
		}, [t.buffer]);
	}
	function zu() {
		if ("undefined" == typeof navigator) return !1;
		const e = navigator.userAgent;
		return /AppleWebKit/i.test(e) && !/(Chrome|Chromium|CriOS|Edg|OPR)/i.test(e);
	}
	async function Nu(e) {
		if ("undefined" == typeof VideoEncoder) throw new Error("macOS WebView 不支持 WebCodecs 视频编码");
		const t = function(e, t, r, i) {
			if ("near-lossless" === e) return hu(t, r, i);
			const a = {
				low: .25,
				high: .75,
				"very-high": 1
			}[e], s = .3 * Math.exp(2.5538 * a), n = 3e6 * Math.pow(t * r / 2073600, .95);
			return 1e3 * Math.ceil(n * s / 1e3);
		}(e.quality, e.width, e.height, e.fps), r = e.width > 4096 || e.height > 4096 ? [
			"avc1.64003c",
			"avc1.64003e",
			"avc1.4d003c",
			"avc1.640034",
			"avc1.640033",
			"avc1.4d0033",
			"avc1.420033"
		] : [
			"avc1.640033",
			"avc1.4d0033",
			"avc1.420033"
		], i = [...r.map((r) => ({
			codec: r,
			width: e.width,
			height: e.height,
			bitrate: t,
			framerate: e.fps,
			hardwareAcceleration: "prefer-hardware",
			alpha: "discard"
		})), ...r.map((r) => ({
			codec: r,
			width: e.width,
			height: e.height,
			bitrate: t,
			framerate: e.fps,
			alpha: "discard"
		}))];
		let a = null;
		for (const n of i) try {
			const e = await VideoEncoder.isConfigSupported(n);
			if (e.supported && e.config) {
				a = e.config;
				break;
			}
		} catch {}
		if (!a) throw new Error("macOS WebView 无法配置 H.264 编码器");
		const s = new VideoEncoder({
			output: (e, t) => {
				if (!ku || _u) return;
				const r = Zr.fromEncodedChunk(e);
				yu = yu.then(async () => {
					if (bu) throw bu;
					await ku.add(r, t);
				}).catch((e) => {
					bu ??= e, _u || Iu || mu.postMessage({
						type: "error",
						message: e instanceof Error ? e.message : String(e)
					});
				});
			},
			error: (e) => {
				bu ??= e, _u || Iu || mu.postMessage({
					type: "error",
					message: e.message
				});
			}
		});
		return s.configure(a), s;
	}
	async function Uu(e) {
		_u = !1, Iu = !1, Bu = zu(), yu = Promise.resolve(), bu = null, Tu = e.fps, Au = e.width, Ru = e.height;
		const t = new cd(function(e, t = 1048576) {
			const r = new Uint8Array(t);
			let i = 0, a = 0;
			const s = () => {
				if (a <= 0) return;
				const t = new Uint8Array(a);
				t.set(r.subarray(0, a));
				const s = i;
				i = 0, a = 0, e(s, t);
			};
			return new WritableStream({
				write(n) {
					if ("write" !== n.type || 0 === n.data.byteLength) return;
					const o = n.data, c = n.position;
					if (a > 0 && c !== i + a && s(), a > 0 && a + o.byteLength > t && s(), o.byteLength >= t) {
						const t = new Uint8Array(o.byteLength);
						t.set(o), e(c, t);
						return;
					}
					0 === a && (i = c), r.set(o, a), a += o.byteLength;
				},
				close() {
					s();
				},
				abort() {
					i = 0, a = 0;
				}
			});
		}(Ou), Bu ? { chunked: !1 } : {
			chunked: !0,
			chunkSize: 4194304
		});
		if (pu = new $d({
			format: new Od({ fastStart: !1 }),
			target: t
		}), Bu) ku = new Sd("avc"), pu.addVideoTrack(ku, { frameRate: e.fps }), wu = await Nu(e);
		else {
			const t = await async function(e, t, r, i) {
				const a = fu(i, e, t, r), s = e > 4096 || t > 4096, n = [
					{
						codec: "avc",
						quality: a,
						hardwareAcceleration: "prefer-hardware"
					},
					...("near-lossless" === i ? hu(e, t, r) : 0) > 24e7 ? [{
						codec: "avc",
						quality: new Gn({
							bitrate: 24e7,
							bitrateMode: "variable"
						}),
						hardwareAcceleration: "prefer-hardware"
					}] : [],
					...s ? [{
						codec: "hevc",
						quality: a,
						hardwareAcceleration: "prefer-hardware"
					}] : [],
					{
						codec: "avc",
						quality: a,
						hardwareAcceleration: "no-preference"
					}
				];
				for (const o of n) if (await ro(o.codec, {
					width: e,
					height: t,
					frameRate: r,
					quality: o.quality,
					hardwareAcceleration: o.hardwareAcceleration
				}).catch(() => !1)) return o;
				return null;
			}(e.width, e.height, e.fps, e.quality);
			gu = new _d({
				codec: t?.codec ?? "avc",
				quality: t?.quality ?? fu(e.quality, e.width, e.height, e.fps),
				hardwareAcceleration: t?.hardwareAcceleration ?? "prefer-hardware",
				keyFrameInterval: 2
			}), pu.addVideoTrack(gu, { frameRate: e.fps });
		}
		let r = !1;
		if (e.mediaUrl) {
			Pu = new No({
				source: new Ts(e.mediaUrl),
				formats: dn
			});
			const t = await Pu.getPrimaryAudioTrack();
			if (r = Boolean(t), t && (xu = await Zd.init({
				input: Pu,
				output: pu,
				tracks: "primary",
				video: { discard: !0 },
				audio: {},
				trim: {
					start: e.startMs / 1e3,
					end: e.endMs / 1e3
				},
				composable: !0,
				showWarnings: !1
			}), xu.discardedTracks.some((e) => e.track === t))) throw new Error("源视频音轨无法加入 MP4");
		}
		mu.postMessage({
			type: e.readyMessageType,
			hasAudio: r
		}), await pu.start(), xu && (Cu = xu.execute(), Cu.catch((e) => {
			_u || mu.postMessage({
				type: "error",
				message: e instanceof Error ? e.message : String(e)
			});
		}));
	}
	async function Lu(e, t) {
		try {
			const r = Math.max(1, Math.round(2 * Tu));
			wu.encode(e, { keyFrame: 0 === t || t % r === 0 });
		} finally {
			e.close();
		}
		if (((t + 1) % Math.max(8, Math.min(20, Math.round(Tu / 2))) === 0 || wu.encodeQueueSize >= 6) && (await wu.flush(), await yu, bu)) throw bu;
	}
	async function Wu(e, t) {
		const r = await gu.add(e).then(() => ({ ok: !0 }), (e) => ({
			ok: !1,
			error: e
		}));
		if (e.close(), !r.ok) throw r.error;
	}
	async function qu(e) {
		if ((Bu ? !wu : !gu) || _u) return e.bitmap?.close(), void e.frame?.close();
		let t;
		mu.postMessage({
			type: "frame-stage",
			index: e.index,
			stage: "received"
		});
		try {
			if (e.frame) t = e.frame;
			else {
				if (!e.bitmap) return;
				t = function(e, t, r) {
					const i = Math.round(1e3 * t), a = Math.max(1, Math.round(1e3 * r));
					if (e.width === Au && e.height === Ru) try {
						return new VideoFrame(e, {
							timestamp: i,
							duration: a
						});
					} catch {}
					if (!vu || !Su) throw new Error("视频帧画布未就绪");
					return Su.drawImage(e, 0, 0, vu.width, vu.height), new VideoFrame(vu, {
						timestamp: i,
						duration: a
					});
				}(e.bitmap, e.timestampMs, e.durationMs);
			}
		} finally {
			e.bitmap?.close();
		}
		if (Bu) return await Lu(t, e.index), mu.postMessage({
			type: "frame-stage",
			index: e.index,
			stage: "submitted"
		}), void mu.postMessage({
			type: "frame-added",
			index: e.index
		});
		const r = new yn(t, {
			timestamp: e.timestampMs / 1e3,
			duration: Math.max(0, e.durationMs / 1e3)
		});
		mu.postMessage({
			type: "frame-stage",
			index: e.index,
			stage: "submitted"
		}), await Wu(r, e.index), mu.postMessage({
			type: "frame-added",
			index: e.index
		});
	}
	async function Vu(e) {
		if (pu && !_u) {
			Iu = !0;
			try {
				if (Bu) {
					if (Du("正在确认最后一个视频包"), wu && "configured" === wu.state && await wu.flush(), await yu, bu) throw bu;
					ku?.close();
				} else Du("正在关闭视频编码器"), gu?.close();
				Du("正在等待音频转换"), await Cu, Du("正在完成 MP4 封装"), await pu.finalize(), Du("MP4 封装完成"), Pu?.dispose(), e && mu.postMessage({ type: "complete" });
			} finally {
				wu && "closed" !== wu.state && wu.close();
			}
		}
	}
	async function Hu(e) {
		_u = !1, Iu = !1, Bu = zu(), "aborted" === await async function(e, t) {
			if ("undefined" == typeof OffscreenCanvas || "undefined" == typeof VideoFrame) return t.onFallback("offscreen-canvas-or-videoframe-unavailable"), "fallback";
			const r = new OffscreenCanvas(e.width, e.height);
			let i;
			try {
				i = new du(r, e.width, e.height, e.screenWidth, e.screenHeight);
			} catch (l) {
				return t.onFallback(l instanceof Error ? l.message : "worker-webgl2-unavailable"), "fallback";
			}
			let a = null, s = null, n = null, o = null, c = Math.max(0, e.mediaDuration);
			try {
				i.renderFrame(null, []);
				try {
					await t.encoderSink.probeCanvas(r);
				} catch (l) {
					return t.onFallback(l instanceof Error ? l.message : "direct-encoder-probe-failed"), "fallback";
				}
				if (t.isAborted()) return "aborted";
				if (e.mediaUrl) try {
					a = new No({
						source: new Ts(e.mediaUrl),
						formats: dn
					});
					const r = await a.getPrimaryVideoTrack();
					if (r) {
						if (!await r.canDecode()) return t.onFallback("video-track-undecodable"), "fallback";
						const i = await r.computeDuration() || await r.getDurationFromMetadata();
						"number" == typeof i && Number.isFinite(i) && i > 0 && (c = i);
						const a = new To(r), n = Math.max(0, e.startMs / 1e3), l = c > 0 ? Math.max(0, Math.min(n, Math.max(0, c - .1))) : n;
						s = a.samples(l, Infinity)[Symbol.asyncIterator]();
						const d = await s.next();
						if (d.done && c > 0) return t.onFallback("video-sample-stream-empty"), "fallback";
						o = d.done ? null : d.value;
					}
				} catch (l) {
					return t.onFallback(l instanceof Error ? l.message : "direct-media-probe-failed"), "fallback";
				}
				if (t.isAborted()) return "aborted";
				await t.encoderSink.startMuxer(r);
				const d = new ou(e.danmakus), u = Math.max(1, e.endMs - e.startMs), h = 1e3 / e.fps, f = Math.max(1, Math.ceil(u * e.fps / 1e3)), m = Math.max(24, Math.min(90, Math.round(1.5 * e.fps))), p = Math.max(1, Math.round(e.fps / 20)), g = /* @__PURE__ */ new Set(), k = [], w = /* @__PURE__ */ new Set();
				let y = 0, b = null;
				const T = (e) => {
					d.evaluateAt(e, k), w.clear();
					for (let t = 0; t < k.length; t += 1) w.add(k[t].entry.spriteKey);
				}, v = (r, a) => {
					if (r >= f) return null;
					const s = Math.min(f, a), n = e.startMs + r * h, o = Math.min(e.endMs, e.startMs + Math.max(r, s - 1) * h), c = d.collectUniqueSpritesInRange(n, o, g).filter((e) => !i.hasSprite(e.key));
					return 0 === c.length ? {
						endFrame: s,
						promise: Promise.resolve([])
					} : {
						endFrame: s,
						promise: t.requestSprites(i.maxTextureSize, c)
					};
				}, S = v(0, m);
				if (S) {
					const r = await S.promise;
					t.isAborted() || (T(Math.max(e.startMs, Math.min(e.endMs - .001, e.startMs))), uu(i, r, w)), y = S.endFrame;
				}
				y < f && (b = v(y, y + m));
				for (let a = 0; a < f; a += 1) {
					if (t.isAborted()) return "aborted";
					const l = a * h, d = Math.min(h, Math.max(0, e.endMs - e.startMs - l)), u = Math.max(e.startMs, Math.min(e.endMs - .001, e.startMs + l));
					if (T(u), a >= y) {
						if (b) {
							const e = await b.promise;
							if (t.isAborted()) return "aborted";
							uu(i, e, w), y = b.endFrame, b = null;
						}
						y < f && (b = v(y, y + m));
					}
					if (s) {
						const e = c > 0 ? Math.max(0, Math.min(u / 1e3, c)) : Math.max(0, u / 1e3);
						for (; null !== o && o.timestamp <= e + 1e-4;) {
							n?.close(), n = o;
							const e = await s.next();
							o = e.done ? null : e.value;
						}
					}
					if (k.length > 0) {
						let e = null, r = null;
						for (let t = 0; t < k.length; t += 1) {
							const a = k[t].entry;
							i.hasSprite(a.spriteKey) || (e || (e = [], r = /* @__PURE__ */ new Set()), r.has(a.spriteKey) || (r.add(a.spriteKey), e.push({
								key: a.spriteKey,
								spec: a.spriteSpec
							})));
						}
						if (e) {
							if (b) {
								const r = await b.promise;
								if (t.isAborted()) return "aborted";
								uu(i, r, w), y = b.endFrame, b = null, e = e.filter((e) => !i.hasSprite(e.key));
							}
							if (e.length > 0) {
								const r = await t.requestSprites(i.maxTextureSize, e);
								if (t.isAborted()) return "aborted";
								uu(i, r, w);
							}
						}
					}
					if (t.isAborted()) return "aborted";
					const g = n ?? o;
					i.renderFrame(g, k), await t.encoderSink.encodeCanvasFrame(r, a, l, d), 0 !== a && (a + 1) % p !== 0 && a !== f - 1 || t.onProgress("rendering", a + 1, f);
				}
				return t.isAborted() ? "aborted" : (t.onProgress("finalizing", f, f), await t.encoderSink.finish(), "completed");
			} finally {
				n?.close(), o?.close();
				try {
					await s?.return?.();
				} catch {}
				try {
					a?.dispose();
				} catch {}
				i.dispose();
			}
		}(e, {
			encoderSink: {
				probeCanvas: async (t) => {
					if (new VideoFrame(t, {
						timestamp: 0,
						duration: Math.max(1, Math.round(1e6 / e.fps))
					}).close(), Bu) {
						const t = await Nu(e);
						"closed" !== t.state && t.close();
					}
				},
				startMuxer: async () => {
					await Uu({
						...e,
						readyMessageType: "direct-ready"
					});
				},
				encodeCanvasFrame: async (e, t, r, i) => {
					Bu ? await Lu(new VideoFrame(e, {
						timestamp: Math.round(1e3 * r),
						duration: Math.max(1, Math.round(1e3 * i))
					}), t) : await Wu(new yn(e, {
						timestamp: r / 1e3,
						duration: Math.max(0, i / 1e3)
					}));
				},
				finish: async () => {
					await Vu(!0);
				}
			},
			requestSprites: (e, t) => {
				if (_u) return Promise.reject(/* @__PURE__ */ new Error("视频导出已取消"));
				const r = Fu++;
				return new Promise((i, a) => {
					Mu.set(r, {
						resolve: i,
						reject: a
					}), mu.postMessage({
						type: "request-sprites",
						requestId: r,
						maxTextureSize: e,
						items: t
					});
				});
			},
			onFallback: (e) => {
				mu.postMessage({
					type: "direct-fallback",
					reason: e
				});
			},
			onProgress: (e, t, r) => {
				mu.postMessage({
					type: "direct-progress",
					phase: e,
					completedFrames: t,
					totalFrames: r
				});
			},
			isAborted: () => _u
		}) && await ju();
	}
	async function ju() {
		_u = !0, function(e) {
			for (const [, t] of Mu) t.reject(new Error(e));
			Mu.clear();
		}("视频导出已取消"), await Eu, await xu?.cancel().catch(() => {}), wu && "closed" !== wu.state && wu.close(), await pu?.cancel().catch(() => {}), Pu?.dispose(), mu.postMessage({ type: "canceled" });
	}
	mu.onmessage = (e) => {
		const t = e.data;
		if ("start" === t.type) (async function(e) {
			if (vu = new OffscreenCanvas(e.width, e.height), Su = vu.getContext("2d", { alpha: !1 }), !Su) throw new Error("无法创建视频帧画布");
			await Uu({
				...e,
				readyMessageType: "ready"
			});
		})(t).catch((e) => {
			mu.postMessage({
				type: "error",
				message: e instanceof Error ? e.message : String(e)
			});
		});
		else if ("start-direct" === t.type) Hu(t).catch((e) => {
			_u || mu.postMessage({
				type: "error",
				message: e instanceof Error ? e.message : String(e)
			});
		});
		else if ("sprites" === t.type) {
			const e = Mu.get(t.requestId);
			e && (Mu.delete(t.requestId), e.resolve(t.sprites));
		} else "frame" === t.type ? Eu = Eu.then(() => qu(t)).catch((e) => {
			_u = !0, mu.postMessage({
				type: "error",
				message: e instanceof Error ? e.message : String(e)
			});
		}) : "finish" === t.type ? async function() {
			await Eu, await Vu(!0);
		}().catch((e) => {
			mu.postMessage({
				type: "error",
				message: e instanceof Error ? e.message : String(e)
			});
		}) : "cancel" === t.type && ju();
	};
})();
