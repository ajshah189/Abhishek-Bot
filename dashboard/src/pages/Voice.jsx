import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Send, Loader2, ChevronLeft } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const API_BASE = 'https://abhishek-assistant-telegram-727365940229.asia-southeast1.run.app';
const API_KEY = 'abhishek-voice-2026';
const USER_ID = '7307120782';

const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

const WA_LINK_RE = /\n\n👉 \[Tap to send on WhatsApp\]\((https:\/\/wa\.me\/[^)]+)\)/;

function ReplyBubble({ text, typing, onDone }) {
  const waMatch = text.match(WA_LINK_RE);
  const cleanText = waMatch ? text.slice(0, text.indexOf('\n\n👉 [Tap to send on WhatsApp]')).trim() : text;
  const waUrl = waMatch?.[1];

  return (
    <div style={{ alignSelf: 'flex-start', background: '#1a1a2e', border: '1px solid rgba(233,69,96,0.25)', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', maxWidth: '85%', fontSize: 14, color: '#cbd5e0', lineHeight: 1.5 }}>
      {typing ? <TypingText text={cleanText} onDone={onDone} /> : cleanText}
      {waUrl && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            marginTop: 10,
            padding: '8px 14px',
            background: '#25D366',
            color: '#fff',
            borderRadius: 20,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 13,
            textAlign: 'center'
          }}
        >
          👉 Tap to send on WhatsApp
        </a>
      )}
    </div>
  );
}

function TypingText({ text, onDone }) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    if (!text) return;
    setDisplayed('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        onDone?.();
      }
    }, 12);
    return () => clearInterval(interval);
  }, [text]);
  return <span>{displayed}<span className="typing-cursor">|</span></span>;
}

export default function Voice() {
  const [status, setStatus] = useState('idle'); // idle | recording | processing | done
  const [history, setHistory] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const historyEndRef = useRef(null);

  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  async function startRecording() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        submitAudio(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setStatus('recording');
    } catch (err) {
      setError('Microphone access denied. Allow mic in browser settings.');
      setStatus('idle');
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setStatus('processing');
    }
  }

  async function submitAudio(blob) {
    setStatus('processing');
    setLastTranscript('');
    setLastReply('');
    try {
      const form = new FormData();
      form.append('audio', blob, 'voice.webm');
      form.append('userId', USER_ID);

      const res = await fetch(`${API_BASE}/api/voice`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY },
        body: form
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const { transcript, reply } = await res.json();
      setLastTranscript(transcript);
      setLastReply(reply);
      setTyping(true);
      setStatus('done');
      setHistory(h => [...h.slice(-9), { transcript, reply }]);
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  }

  async function submitText(e) {
    e?.preventDefault();
    const msg = textInput.trim();
    if (!msg) return;
    setTextInput('');
    setError('');
    setStatus('processing');
    setLastTranscript(msg);
    setLastReply('');
    try {
      const res = await fetch(`${API_BASE}/api/text`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, userId: USER_ID })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { reply } = await res.json();
      setLastReply(reply);
      setTyping(true);
      setStatus('done');
      setHistory(h => [...h.slice(-9), { transcript: msg, reply }]);
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  }

  const handleMicClick = () => {
    if (status === 'idle' || status === 'done') startRecording();
    else if (status === 'recording') stopRecording();
  };

  const statusLabel = {
    idle: 'Tap to speak',
    recording: 'Listening...',
    processing: 'Processing...',
    done: lastTranscript ? `"${lastTranscript}"` : 'Done'
  }[status];

  return (
    <div style={{ background: '#0d0d1a', minHeight: '100dvh', display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>

      {/* Top bar — hidden in standalone */}
      {!isStandalone && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#1a1a2e' }}>
          <NavLink to="/" style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontSize: 14 }}>
            <ChevronLeft size={18} /> Dashboard
          </NavLink>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 15, marginLeft: 'auto' }}>Voice Assistant</span>
        </div>
      )}

      {/* Conversation history */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {history.length === 0 && status === 'idle' && (
          <div style={{ margin: 'auto', textAlign: 'center', color: '#4a5568' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎙️</div>
            <div style={{ fontSize: 15 }}>Your AI chief-of-staff</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Ask anything — tasks, expenses, calendar, habits</div>
          </div>
        )}
        {history.map((item, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ alignSelf: 'flex-end', background: '#2d2d44', borderRadius: '16px 16px 4px 16px', padding: '10px 14px', maxWidth: '80%', fontSize: 14, color: '#e2e8f0' }}>
              {item.transcript}
            </div>
            <ReplyBubble text={item.reply} typing={false} />
          </div>
        ))}

        {/* Current in-progress exchange */}
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

        {status === 'done' && lastTranscript && lastReply && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ alignSelf: 'flex-end', background: '#2d2d44', borderRadius: '16px 16px 4px 16px', padding: '10px 14px', maxWidth: '80%', fontSize: 14, color: '#e2e8f0' }}>
              {lastTranscript}
            </div>
            <ReplyBubble text={lastReply} typing={typing} onDone={() => setTyping(false)} />
          </div>
        )}

        <div ref={historyEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin: '0 20px 8px', padding: '10px 14px', background: 'rgba(233,69,96,0.15)', border: '1px solid rgba(233,69,96,0.3)', borderRadius: 10, fontSize: 13, color: '#fc8fa3' }}>
          {error}
        </div>
      )}

      {/* Status label + Mic button */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 20px 8px', gap: 16 }}>
        <div style={{ fontSize: 13, color: status === 'recording' ? '#e94560' : '#64748b', letterSpacing: '0.02em', minHeight: 20, textAlign: 'center', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {statusLabel}
        </div>

        <button
          onClick={handleMicClick}
          disabled={status === 'processing'}
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            border: 'none',
            cursor: status === 'processing' ? 'default' : 'pointer',
            background: status === 'recording' ? '#c0304a' : '#e94560',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
            : status === 'recording'
            ? <MicOff size={32} color="#fff" />
            : <Mic size={32} color="#fff" />
          }
        </button>
      </div>

      {/* Text input fallback */}
      <form onSubmit={submitText} style={{ display: 'flex', gap: 8, padding: '8px 16px 20px', alignItems: 'center' }}>
        <input
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          placeholder="Type instead..."
          disabled={status === 'processing' || status === 'recording'}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 24,
            padding: '10px 16px',
            color: '#fff',
            fontSize: 14,
            outline: 'none'
          }}
        />
        <button
          type="submit"
          disabled={!textInput.trim() || status === 'processing' || status === 'recording'}
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: 'none',
            background: '#e94560',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            opacity: !textInput.trim() ? 0.4 : 1,
            flexShrink: 0
          }}
        >
          <Send size={18} color="#fff" />
        </button>
      </form>

      <style>{`
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(233,69,96,0.5), 0 0 0 0 rgba(233,69,96,0.25); }
          70%  { box-shadow: 0 0 0 16px rgba(233,69,96,0), 0 0 0 32px rgba(233,69,96,0); }
          100% { box-shadow: 0 0 0 0 rgba(233,69,96,0), 0 0 0 0 rgba(233,69,96,0); }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .typing-cursor { animation: blink 1s step-end infinite; }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
