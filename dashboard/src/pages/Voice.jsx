import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Send, Loader2, ChevronLeft, Volume2, VolumeX, Square, RefreshCw } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { USER_ID } from '../config/firebase.js';

const API_BASE = import.meta.env.VITE_API_BASE || '';
const API_KEY  = import.meta.env.VITE_VOICE_API_KEY || '';

const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

// ── TTS ───────────────────────────────────────────────────────────────────────
let cachedVoice = null;

function pickVoice() {
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis?.getVoices() || [];
  cachedVoice = voices.find(v => v.lang.includes('en-IN')) ||
                voices.find(v => v.lang.startsWith('en-')) ||
                voices[0] || null;
  return cachedVoice;
}

function speakText(text, { onStart, onEnd } = {}) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-IN';
  utt.rate = 1.1;
  utt.pitch = 1.0;
  const v = pickVoice();
  if (v) utt.voice = v;
  utt.onstart = onStart;
  utt.onend   = onEnd;
  utt.onerror = onEnd;
  window.speechSynthesis.speak(utt);
}

// ── Action button ─────────────────────────────────────────────────────────────
function ActionButton({ label, url }) {
  const isCall = url.startsWith('tel:');
  const isSms  = url.startsWith('sms:');
  const isMap  = url.includes('maps.google') || url.includes('maps/dir');
  const isWA   = url.includes('wa.me');
  const bg = isCall ? '#2ecc71' : isSms ? '#3498db' : isMap ? '#e67e22' : isWA ? '#25D366' : '#e94560';
  return (
    <a
      href={url}
      target={isCall || isSms ? '_self' : '_blank'}
      rel="noopener noreferrer"
      style={{ display: 'block', marginTop: 10, padding: '9px 16px', background: bg, color: '#fff', borderRadius: 20, textDecoration: 'none', fontWeight: 600, fontSize: 13, textAlign: 'center' }}
    >
      {label}
    </a>
  );
}

// ── Reply bubble ──────────────────────────────────────────────────────────────
function ReplyBubble({ text, typing, onDone, quickAction, whatsappLink }) {
  return (
    <div style={{ alignSelf: 'flex-start', background: '#1a1a2e', border: '1px solid rgba(233,69,96,0.25)', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', maxWidth: '85%', fontSize: 14, color: '#cbd5e0', lineHeight: 1.5 }}>
      {typing ? <TypingText text={text} onDone={onDone} /> : text}
      {whatsappLink?.url && <ActionButton label="👉 Tap to send on WhatsApp" url={whatsappLink.url} />}
      {quickAction?.url && <ActionButton label={quickAction.label} url={quickAction.url} />}
    </div>
  );
}

// ── Typing animation ──────────────────────────────────────────────────────────
function TypingText({ text, onDone }) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    if (!text) return;
    setDisplayed('');
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(iv); onDone?.(); }
    }, 12);
    return () => clearInterval(iv);
  }, [text]);
  return <span>{displayed}<span className="typing-cursor">|</span></span>;
}

// ── Waveform bars ─────────────────────────────────────────────────────────────
function Waveform({ bars }) {
  if (!bars?.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 40 }}>
      {bars.map((h, i) => (
        <div key={i} style={{ width: 4, borderRadius: 2, background: '#e94560', height: Math.max(4, h * 36), opacity: 0.6 + h * 0.4, transition: 'height 0.06s ease' }} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Voice() {
  const [status,          setStatus]         = useState('idle'); // idle|recording|processing|done
  const [history,         setHistory]        = useState([]);
  const [textInput,       setTextInput]      = useState('');
  const [lastTranscript,  setLastTranscript] = useState('');
  const [lastReply,       setLastReply]      = useState('');
  const [lastQuickAction, setLastQuickAction]= useState(null);
  const [lastWALink,      setLastWALink]     = useState(null);
  const [typing,          setTyping]         = useState(false);
  const [error,           setError]          = useState('');
  const [speaking,        setSpeaking]       = useState(false);
  const [waveformBars,    setWaveformBars]   = useState([]);
  const [ttsEnabled,      setTtsEnabled]     = useState(() => localStorage.getItem('tts') !== 'off');
  const [continuous,      setContinuous]     = useState(() => localStorage.getItem('continuous') === 'on');

  // Refs that need to be fresh inside async callbacks / rAF loops
  const mediaRecorderRef = useRef(null);
  const streamRef        = useRef(null);
  const chunksRef        = useRef([]);
  const audioCtxRef      = useRef(null);
  const analyserRef      = useRef(null);
  const vadFrameRef      = useRef(null);
  const silenceStartRef  = useRef(null);
  const historyEndRef    = useRef(null);
  const ttsEnabledRef    = useRef(ttsEnabled);
  const continuousRef    = useRef(continuous);
  const statusRef        = useRef('idle');
  const startRecRef      = useRef(null); // filled below

  useEffect(() => { ttsEnabledRef.current = ttsEnabled; }, [ttsEnabled]);
  useEffect(() => { continuousRef.current = continuous; }, [continuous]);

  function setStatusBoth(s) { statusRef.current = s; setStatus(s); }

  // Pre-load voices
  useEffect(() => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => { cachedVoice = null; pickVoice(); };
    return () => {
      window.speechSynthesis.cancel();
      cancelAnimationFrame(vadFrameRef.current);
      audioCtxRef.current?.close();
    };
  }, []);

  useEffect(() => { historyEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history]);

  // ── After a reply arrives: type it + speak it + maybe auto-restart mic ──────
  function handleReply(reply, quickAction, whatsappLink, transcript) {
    setLastReply(reply);
    setLastQuickAction(quickAction || null);
    setLastWALink(whatsappLink || null);
    setTyping(true);
    setStatusBoth('done');
    setHistory(h => [...h.slice(-9), { transcript, reply, quickAction: quickAction || null, whatsappLink: whatsappLink || null }]);

    if (ttsEnabledRef.current && reply) {
      const charDelay = Math.min(reply.length * 12, 600);
      setTimeout(() => {
        speakText(reply, {
          onStart: () => setSpeaking(true),
          onEnd: () => {
            setSpeaking(false);
            if (continuousRef.current) {
              setTimeout(() => startRecRef.current?.(), 500);
            }
          }
        });
      }, charDelay);
    }
  }

  // ── VAD setup ────────────────────────────────────────────────────────────────
  const SILENCE_THRESHOLD = 15;
  const SILENCE_DURATION  = 1500;
  const BAR_COUNT         = 20;

  function startVAD(stream, recorder) {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    silenceStartRef.current = null;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const step = Math.floor(data.length / BAR_COUNT);

    function tick() {
      analyser.getByteFrequencyData(data);
      const bars = Array.from({ length: BAR_COUNT }, (_, i) => data[i * step] / 255);
      setWaveformBars(bars);

      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      if (avg < SILENCE_THRESHOLD) {
        if (!silenceStartRef.current) silenceStartRef.current = Date.now();
        if (Date.now() - silenceStartRef.current > SILENCE_DURATION) {
          if (recorder.state === 'recording') {
            recorder.stop();
            stream.getTracks().forEach(t => t.stop());
          }
          ctx.close();
          setWaveformBars([]);
          return;
        }
      } else {
        silenceStartRef.current = null;
      }
      vadFrameRef.current = requestAnimationFrame(tick);
    }
    vadFrameRef.current = requestAnimationFrame(tick);
  }

  // ── Recording ────────────────────────────────────────────────────────────────
  async function startRecording() {
    if (statusRef.current === 'recording' || statusRef.current === 'processing') return;
    setError('');
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        cancelAnimationFrame(vadFrameRef.current);
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        setWaveformBars([]);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        submitAudio(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setStatusBoth('recording');
      startVAD(stream, recorder);
    } catch {
      setError('Microphone access denied. Allow mic in browser settings.');
      setStatusBoth('idle');
    }
  }
  startRecRef.current = startRecording;

  function stopRecordingManually() {
    cancelAnimationFrame(vadFrameRef.current);
    const rec = mediaRecorderRef.current;
    if (rec?.state === 'recording') {
      streamRef.current?.getTracks().forEach(t => t.stop());
      rec.stop();
      setStatusBoth('processing');
    }
  }

  // ── API calls ────────────────────────────────────────────────────────────────
  async function submitAudio(blob) {
    setStatusBoth('processing');
    setLastTranscript('');
    setLastReply('');
    try {
      const form = new FormData();
      form.append('audio', blob, 'voice.webm');
      form.append('userId', USER_ID);
      const res = await fetch(`${API_BASE}/api/voice`, { method: 'POST', headers: { 'x-api-key': API_KEY }, body: form });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const { transcript, reply, quickAction, whatsappLink } = await res.json();
      setLastTranscript(transcript);
      handleReply(reply, quickAction, whatsappLink, transcript);
    } catch (err) {
      setError(err.message);
      setStatusBoth('idle');
    }
  }

  async function submitText(e) {
    e?.preventDefault();
    const msg = textInput.trim();
    if (!msg) return;
    setTextInput('');
    setError('');
    setStatusBoth('processing');
    setLastTranscript(msg);
    setLastReply('');
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    try {
      const res = await fetch(`${API_BASE}/api/text`, { method: 'POST', headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, userId: USER_ID }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
      const { reply, quickAction, whatsappLink } = await res.json();
      handleReply(reply, quickAction, whatsappLink, msg);
    } catch (err) {
      setError(err.message);
      setStatusBoth('idle');
    }
  }

  // ── UI helpers ───────────────────────────────────────────────────────────────
  const handleMicClick = () => {
    if (status === 'recording') stopRecordingManually();
    else if (status !== 'processing') startRecording();
  };

  const toggleTTS = () => {
    const next = !ttsEnabled;
    setTtsEnabled(next);
    localStorage.setItem('tts', next ? 'on' : 'off');
    if (!next) { window.speechSynthesis?.cancel(); setSpeaking(false); }
  };

  const toggleContinuous = () => {
    const next = !continuous;
    setContinuous(next);
    localStorage.setItem('continuous', next ? 'on' : 'off');
  };

  const statusLabel = speaking ? '🔊 Speaking...'
    : status === 'recording'   ? 'Listening...'
    : status === 'processing'  ? 'Processing...'
    : status === 'done' && lastTranscript
      ? `"${lastTranscript.length > 42 ? lastTranscript.slice(0, 42) + '…' : lastTranscript}"`
      : 'Tap to speak';

  const labelColor = speaking ? '#f59e0b' : status === 'recording' ? '#e94560' : '#64748b';

  return (
    <div style={{ background: '#0d0d1a', minHeight: '100dvh', display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#1a1a2e', flexShrink: 0 }}>
        {!isStandalone && (
          <NavLink to="/" style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontSize: 14 }}>
            <ChevronLeft size={18} /> Dashboard
          </NavLink>
        )}
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 15, marginLeft: isStandalone ? 0 : 'auto' }}>Voice Assistant</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={toggleContinuous} title={continuous ? 'Auto-listen on (tap to toggle)' : 'Auto-listen off (tap to toggle)'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: continuous ? '#e94560' : '#4a5568', padding: 6 }}>
            <RefreshCw size={17} />
          </button>
          <button onClick={toggleTTS} title={ttsEnabled ? 'Voice replies on' : 'Voice replies off'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: ttsEnabled ? '#e94560' : '#4a5568', padding: 6 }}>
            {ttsEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
        </div>
      </div>

      {/* Conversation history */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {history.length === 0 && status === 'idle' && !speaking && (
          <div style={{ margin: 'auto', textAlign: 'center', color: '#4a5568' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎙️</div>
            <div style={{ fontSize: 15, color: '#6b7280' }}>Your AI chief-of-staff</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Ask anything — tasks, expenses, calendar, habits</div>
            <div style={{ fontSize: 12, marginTop: 12, color: '#374151', lineHeight: 1.8 }}>
              Try: <em>"good morning"</em> · <em>"start work"</em> · <em>"end of day"</em>
            </div>
          </div>
        )}

        {history.map((item, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ alignSelf: 'flex-end', background: '#2d2d44', borderRadius: '16px 16px 4px 16px', padding: '10px 14px', maxWidth: '80%', fontSize: 14, color: '#e2e8f0' }}>
              {item.transcript}
            </div>
            <ReplyBubble text={item.reply} typing={false} quickAction={item.quickAction} whatsappLink={item.whatsappLink} />
          </div>
        ))}

        {status === 'processing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lastTranscript && (
              <div style={{ alignSelf: 'flex-end', background: '#2d2d44', borderRadius: '16px 16px 4px 16px', padding: '10px 14px', maxWidth: '80%', fontSize: 14, color: '#e2e8f0' }}>
                {lastTranscript}
              </div>
            )}
            <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', color: '#94a3b8', fontSize: 14 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Thinking...
            </div>
          </div>
        )}

        {(status === 'done' || speaking) && lastTranscript && lastReply && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ alignSelf: 'flex-end', background: '#2d2d44', borderRadius: '16px 16px 4px 16px', padding: '10px 14px', maxWidth: '80%', fontSize: 14, color: '#e2e8f0' }}>
              {lastTranscript}
            </div>
            <ReplyBubble text={lastReply} typing={typing} onDone={() => setTyping(false)} quickAction={lastQuickAction} whatsappLink={lastWALink} />
          </div>
        )}

        <div ref={historyEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin: '0 20px 8px', padding: '10px 14px', background: 'rgba(233,69,96,0.15)', border: '1px solid rgba(233,69,96,0.3)', borderRadius: 10, fontSize: 13, color: '#fc8fa3', flexShrink: 0 }}>
          {error}
        </div>
      )}

      {/* Waveform during recording */}
      {status === 'recording' && waveformBars.length > 0 && (
        <div style={{ padding: '0 20px 4px', flexShrink: 0 }}>
          <Waveform bars={waveformBars} />
        </div>
      )}

      {/* Status + mic area */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 20px 8px', gap: 12, flexShrink: 0 }}>
        <div style={{ fontSize: 13, color: labelColor, letterSpacing: '0.02em', minHeight: 20, textAlign: 'center', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {statusLabel}
        </div>

        {speaking ? (
          <>
            <button onClick={() => { window.speechSynthesis?.cancel(); setSpeaking(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 20, color: '#f59e0b', fontSize: 12, cursor: 'pointer' }}>
              <Square size={12} /> Stop
            </button>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(245,158,11,0.1)', border: '2px solid rgba(245,158,11,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'speak-pulse 1.2s ease-in-out infinite' }}>
              <Volume2 size={32} color="#f59e0b" />
            </div>
          </>
        ) : (
          <button
            onClick={handleMicClick}
            disabled={status === 'processing'}
            style={{
              width: 80, height: 80, borderRadius: '50%', border: 'none',
              cursor: status === 'processing' ? 'default' : 'pointer',
              background: status === 'recording' ? '#c0304a' : '#e94560',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: status === 'recording'
                ? '0 0 0 12px rgba(233,69,96,0.2), 0 0 0 24px rgba(233,69,96,0.08)'
                : '0 4px 20px rgba(233,69,96,0.4)',
              animation: status === 'recording' ? 'pulse-ring 1.4s ease-out infinite' : 'none',
              transition: 'background 0.2s, box-shadow 0.2s',
              opacity: status === 'processing' ? 0.5 : 1
            }}
            aria-label={status === 'recording' ? 'Stop recording' : 'Start recording'}
          >
            {status === 'processing'
              ? <Loader2 size={32} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
              : status === 'recording' ? <MicOff size={32} color="#fff" />
              : <Mic size={32} color="#fff" />}
          </button>
        )}
      </div>

      {/* Text input */}
      <form onSubmit={submitText} style={{ display: 'flex', gap: 8, padding: '6px 16px 20px', alignItems: 'center', flexShrink: 0 }}>
        <input
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          placeholder="Type instead..."
          disabled={status === 'processing' || status === 'recording'}
          style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: '10px 16px', color: '#fff', fontSize: 14, outline: 'none' }}
        />
        <button type="submit" disabled={!textInput.trim() || status === 'processing' || status === 'recording'}
          style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: '#e94560', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: !textInput.trim() ? 0.4 : 1, flexShrink: 0 }}>
          <Send size={18} color="#fff" />
        </button>
      </form>

      <style>{`
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(233,69,96,0.5), 0 0 0 0 rgba(233,69,96,0.25); }
          70%  { box-shadow: 0 0 0 16px rgba(233,69,96,0), 0 0 0 32px rgba(233,69,96,0); }
          100% { box-shadow: 0 0 0 0 rgba(233,69,96,0), 0 0 0 0 rgba(233,69,96,0); }
        }
        @keyframes speak-pulse {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50%       { transform: scale(1.07); opacity: 1; }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .typing-cursor { animation: blink 1s step-end infinite; }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
