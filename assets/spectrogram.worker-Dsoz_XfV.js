(function() {
	const e = {
		low: {
			fftSamples: 2048,
			noverlap: 1
		},
		medium: {
			fftSamples: 1024,
			noverlap: 1
		},
		high: {
			fftSamples: 512,
			noverlap: 256
		},
		ultra: {
			fftSamples: 256,
			noverlap: 128
		}
	}, t = 1e3 * Math.log(10) / 107.939, n = 4 === new Uint8Array(new Uint32Array([16909060]).buffer)[0], r = self;
	let o = 0, a = null, s = 0, l = 0, c = 1e4;
	const i = /* @__PURE__ */ new Map(), u = /* @__PURE__ */ new Map(), f = /* @__PURE__ */ new Map();
	let h = "", M = /* @__PURE__ */ new Uint32Array(256);
	const d = {
		low: /* @__PURE__ */ new Map(),
		medium: /* @__PURE__ */ new Map(),
		high: /* @__PURE__ */ new Map(),
		ultra: /* @__PURE__ */ new Map()
	};
	function m() {
		d.low.clear(), d.medium.clear(), d.high.clear(), d.ultra.clear();
	}
	function g(e) {
		return t * Math.log10(1 + .00437 * e);
	}
	function p(e) {
		return (Math.pow(10, e / t) - 1) / .00437;
	}
	function y(e, t, r, o) {
		return n ? ((255 & o) << 24 | (255 & r) << 16 | (255 & t) << 8 | 255 & e) >>> 0 : ((255 & e) << 24 | (255 & t) << 16 | (255 & r) << 8 | 255 & o) >>> 0;
	}
	function w(e) {
		const t = e / 255;
		let n, r, o;
		if (t < .25) {
			const e = t / .25;
			n = 0, r = Math.round(127 * e), o = 255;
		} else if (t < .45) {
			const e = (t - .25) / .2;
			n = 0, r = Math.round(127 + 128 * e), o = Math.round(255 * (1 - e));
		} else if (t < .65) {
			const e = (t - .45) / .2;
			n = Math.round(255 * e), r = 255, o = 0;
		} else if (t < .85) {
			const e = (t - .65) / .2;
			n = 255, r = Math.round(255 * (1 - .5 * e)), o = 0;
		} else {
			const e = (t - .85) / .15;
			n = 255, r = Math.round(128 * (1 - e)), o = 0;
		}
		return y(n, r, o, 255);
	}
	function I(t, n) {
		if (!a || s <= 0 || l <= 0) return null;
		const r = d[t], o = function(e, t) {
			if (!e.has(t)) return;
			const n = e.get(t);
			return e.delete(t), e.set(t, n), n;
		}(r, n);
		if (o) return o;
		const f = n * c, h = Math.min(l, f + c);
		if (h <= f) return null;
		const M = a, m = M.length, y = Math.max(0, Math.floor(f / 1e3 * s)), w = Math.min(m, Math.ceil(h / 1e3 * s));
		if (w <= y) return null;
		const { fftSamples: I, noverlap: v } = e[t], A = function(e, t) {
			const n = Math.min(t || Math.max(0, Math.round(.5 * e)), .5 * e), r = Math.max(64, .25 * e);
			return Math.max(r, e - n);
		}(I, v), b = I >> 1, k = Math.max(1, Math.ceil((w - y) / A)), x = function(e) {
			const t = i.get(e);
			if (t) return t;
			const n = new Float32Array(e), r = new Float32Array(e), o = new Float32Array(e), a = new Uint32Array(e), s = 1 / (e - 1);
			for (let i = 0; i < e; i++) o[i] = .5 * (1 - Math.cos(2 * Math.PI * i * s));
			let l = 1, c = e >> 1;
			for (; l < e;) {
				for (let e = 0; e < l; e++) a[e + l] = a[e] + c;
				l <<= 1, c >>= 1;
			}
			n[0] = 0, r[0] = 1;
			for (let i = 1; i < e; i++) n[i] = Math.sin(-Math.PI / i), r[i] = Math.cos(-Math.PI / i);
			const u = {
				fftSize: e,
				sinTable: n,
				cosTable: r,
				windowValues: o,
				reverseTable: a,
				real: new Float32Array(e),
				imag: new Float32Array(e),
				spectrum: new Float32Array(e >> 1)
			};
			return i.set(e, u), u;
		}(I), U = function(e, t) {
			const n = `${e}_${t}`, r = u.get(n);
			if (r) return r;
			const o = e >> 1, a = t / e, s = g(0), l = g(t / 2) - s, c = new Int32Array(o), i = new Float32Array(o), f = new Float32Array(o);
			for (let u = 0; u < o; u++) {
				const e = p(s + u / o * l), t = Math.floor(e / a), n = (e - t * a) / a;
				c[u] = t, i[u] = t >= 0 && t < o ? 1 - n : 0, f[u] = t + 1 >= 0 && t + 1 < o ? n : 0;
			}
			const h = {
				binIndex: c,
				weight0: i,
				weight1: f
			};
			return u.set(n, h), h;
		}(I, s), { sinTable: q, cosTable: C, windowValues: F, reverseTable: S, real: K, imag: T, spectrum: D } = x, { binIndex: $, weight0: z, weight1: B } = U, P = new Uint8Array(k * b), R = 2 / I;
		let V = 0;
		for (let e = y; e < w && V < k; e += A) {
			if (e + I <= m) for (let n = 0; n < I; n++) {
				const t = S[n];
				K[n] = M[e + t] * F[t], T[n] = 0;
			}
			else for (let n = 0; n < I; n++) {
				const t = S[n], r = e + t;
				K[n] = r < m ? M[r] * F[t] : 0, T[n] = 0;
			}
			for (let e = 1; e < I; e <<= 1) {
				const t = C[e], n = q[e];
				let r = 1, o = 0;
				const a = e << 1;
				for (let s = 0; s < e; s++) {
					for (let t = s; t < I; t += a) {
						const n = t + e, a = r * K[n] - o * T[n], s = r * T[n] + o * K[n];
						K[n] = K[t] - a, T[n] = T[t] - s, K[t] += a, T[t] += s;
					}
					const l = r;
					r = l * t - o * n, o = l * n + o * t;
				}
			}
			for (let e = 0; e < b; e++) {
				const t = K[e], n = T[e];
				D[e] = R * Math.sqrt(t * t + n * n);
			}
			const t = V * b;
			for (let e = 0; e < b; e++) {
				const n = $[e], r = z[e], o = B[e];
				let a = 0;
				0 !== r && (a += D[n] * r), 0 !== o && (a += D[n + 1] * o);
				const s = 20 * Math.log10(a > 1e-12 ? a : 1e-12);
				P[t + e] = s <= -85 ? 0 : s >= -5 ? 255 : Math.round(3.1875 * (s - -85));
			}
			V++;
		}
		const _ = {
			magnitudes: P,
			frameCount: V,
			binCount: b,
			startMs: f,
			endMs: h
		};
		return function(e, t, n, r) {
			for (e.has(t) && e.delete(t), e.set(t, n); e.size > r;) {
				const t = e.keys().next();
				if (t.done) break;
				e.delete(t.value);
			}
		}(r, n, _, 64), _;
	}
	function v(e, t, n) {
		const r = e.frameCount, o = e.binCount, a = Math.min(o, Math.max(1, Math.round(n))), s = new Uint8ClampedArray(/* @__PURE__ */ new ArrayBuffer(r * a * 4)), l = new Uint32Array(s.buffer), c = e.magnitudes;
		if (o <= a) for (let i = 0; i < r; i++) {
			const e = i * o;
			for (let n = 0; n < o; n++) l[(o - 1 - n) * r + i] = t[c[e + n]];
		}
		else {
			const { starts: e, ends: n } = function(e, t) {
				const n = `${e}_${t}`, r = f.get(n);
				if (r) return r;
				const o = new Int32Array(t), a = new Int32Array(t);
				for (let l = 0; l < t; l++) {
					const n = t - 1 - l, r = Math.floor(n * e / t), s = Math.max(r + 1, Math.min(e, Math.floor((n + 1) * e / t)));
					o[l] = r, a[l] = s;
				}
				const s = {
					starts: o,
					ends: a
				};
				return f.set(n, s), s;
			}(o, a);
			for (let s = 0; s < r; s++) {
				const i = s * o;
				for (let o = 0; o < a; o++) {
					const a = e[o], u = n[o];
					let f = 0;
					for (let e = a; e < u; e++) f += c[i + e];
					const h = Math.round(f / (u - a));
					l[o * r + s] = t[h];
				}
			}
		}
		return {
			rgba: s,
			width: r,
			height: a
		};
	}
	async function A(e) {
		const { requestId: t, generation: n, level: c, chunkIndex: i, colorScheme: u, customColorRgb: f, colorKey: d, targetHeight: m } = e;
		if (n !== o || !a || l <= 0 || s <= 0) {
			const e = {
				type: "chunk-result",
				requestId: t,
				generation: n,
				level: c,
				chunkIndex: i,
				colorKey: d,
				empty: !0
			};
			r.postMessage(e);
			return;
		}
		try {
			const e = I(c, i);
			if (!e || e.frameCount <= 0) {
				const e = {
					type: "chunk-result",
					requestId: t,
					generation: n,
					level: c,
					chunkIndex: i,
					colorKey: d,
					empty: !0
				};
				r.postMessage(e);
				return;
			}
			const { rgba: a, width: s, height: l } = v(e, function(e, t, n) {
				if (e === h) return M;
				const r = /* @__PURE__ */ new Uint32Array(256);
				if ("customize" === t && n) {
					const [e, t, o] = n;
					r[0] = 0;
					for (let n = 1; n < 256; n++) r[n] = y(e, t, o, n);
				} else for (let o = 0; o < 256; o++) r[o] = w(o);
				return h = e, M = r, r;
			}(d, u, f), m);
			if ("function" == typeof createImageBitmap && "function" == typeof ImageData) try {
				const u = new ImageData(new Uint8ClampedArray(a.buffer), s, l), f = await createImageBitmap(u);
				if (n !== o) {
					f.close();
					const e = {
						type: "chunk-result",
						requestId: t,
						generation: n,
						level: c,
						chunkIndex: i,
						colorKey: d,
						empty: !0
					};
					r.postMessage(e);
					return;
				}
				const h = {
					type: "chunk-result",
					requestId: t,
					generation: n,
					level: c,
					chunkIndex: i,
					colorKey: d,
					empty: !1,
					startMs: e.startMs,
					endMs: e.endMs,
					width: s,
					height: l,
					bitmap: f
				};
				r.postMessage(h, [f]);
				return;
			} catch {}
			const g = {
				type: "chunk-result",
				requestId: t,
				generation: n,
				level: c,
				chunkIndex: i,
				colorKey: d,
				empty: !1,
				startMs: e.startMs,
				endMs: e.endMs,
				width: s,
				height: l,
				pixels: a.buffer
			};
			r.postMessage(g, [a.buffer]);
		} catch (g) {
			const e = {
				type: "chunk-error",
				requestId: t,
				generation: n,
				level: c,
				chunkIndex: i,
				message: g instanceof Error ? g.message : String(g)
			};
			r.postMessage(e);
		}
	}
	r.onmessage = (e) => {
		const t = e.data;
		if (t) return "set-audio" === t.type ? (o = t.generation, a = t.pcm, s = t.sampleRate, l = t.durationMs, c = t.chunkDurationMs > 0 ? t.chunkDurationMs : 1e4, void m()) : "clear-audio" === t.type ? (o = t.generation, a = null, s = 0, l = 0, void m()) : void ("render-chunk" === t.type && A(t));
	};
})();
