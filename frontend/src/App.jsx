import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom';
import { socket } from './socket';
import { QRCodeSVG } from 'qrcode.react';

// Audio Context for SFX
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const playTone = (freq, type, duration) => {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(); gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
};
const SFX = {
  join: () => { playTone(440, 'sine', 0.1); setTimeout(() => playTone(880, 'sine', 0.2), 100); },
  start: () => { playTone(300, 'square', 0.1); setTimeout(() => playTone(400, 'square', 0.3), 150); },
  turn: () => playTone(600, 'triangle', 0.2),
  tick: () => playTone(800, 'sine', 0.05),
  alert: () => { playTone(200, 'sawtooth', 0.3); setTimeout(() => playTone(150, 'sawtooth', 0.5), 300); }
};

function ImposterLogo() {
  return (
    <div className="relative flex flex-col items-center justify-center select-none cursor-default group w-full max-w-5xl mx-auto mb-8">
      <style>{`
        .logo-text {
          font-size: clamp(2.5rem, 14vw, 11rem);
          line-height: 0.9;
          font-family: 'Impact', 'Arial Black', sans-serif;
          letter-spacing: 0.04em;
          transform: scaleY(1.05); /* Slightly condensed look */
        }
        
        .hidden-identity {
          position: absolute;
          inset: 0;
          color: #991b1b;
          z-index: 1;
          opacity: 0;
          transform: translateX(0px);
          transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease;
        }

        .lens-flare {
          position: absolute;
          left: -10%;
          right: -10%;
          height: 1px;
          background: #ef4444;
          box-shadow: 0 0 10px 2px #ef4444, 0 0 20px 5px #dc2626, 0 0 40px 10px rgba(220, 38, 38, 0.5);
          opacity: 0;
          z-index: 30;
          mix-blend-mode: screen;
        }
        
        @media (prefers-reduced-motion: no-preference) {
          .hidden-identity { animation: identity-shift 10s infinite; }
          .lens-flare { animation: scan-pass 10s infinite; }
          .main-letter { animation: letter-glitch 10s infinite; }
          
          .group:hover .hidden-identity {
            transform: translateX(-6px) scale(1.02);
            opacity: 0.8;
            filter: blur(1px);
          }
          .group:hover .lens-flare {
            opacity: 0.8;
            top: 50%;
            transition: top 0.2s ease, opacity 0.2s ease;
          }
        }
        
        @keyframes identity-shift {
          0%, 30%, 50%, 100% { transform: translateX(0); opacity: 0; filter: blur(0px); }
          35% { transform: translateX(5px) translateY(-2px) scale(1.01); opacity: 0.6; filter: blur(1px); }
          38% { transform: translateX(-3px) translateY(1px) scale(1.02); opacity: 0.8; filter: blur(0px); }
          42% { transform: translateX(2px) translateY(0); opacity: 0.4; filter: blur(2px); }
        }

        @keyframes scan-pass {
          0%, 30% { top: 0%; opacity: 0; }
          35% { opacity: 1; transform: scaleY(3); }
          40% { top: 50%; opacity: 1; transform: scaleY(5); }
          45% { opacity: 1; transform: scaleY(2); }
          50%, 100% { top: 100%; opacity: 0; }
        }

        @keyframes letter-glitch {
          0%, 36%, 44%, 100% { transform: translateY(0); }
          38% { transform: translateY(-4px) skewX(-5deg); }
          40% { transform: translateY(2px) skewX(5deg); }
          42% { transform: translateY(0); }
        }
      `}</style>
      
      {/* Main Wordmark Container */}
      <div className="relative logo-text font-black text-[#f8fafc] drop-shadow-[0_15px_25px_rgba(0,0,0,0.9)] px-2 z-10 w-full text-center flex justify-center mb-6">
        
        {/* Hidden Dark Red Duplicate */}
        <div className="hidden-identity flex justify-center w-full pointer-events-none" aria-hidden="true">
          <span className="tracking-tighter">IMPOSTER</span>
        </div>
        
        {/* Scanning Flare */}
        <div className="lens-flare pointer-events-none" aria-hidden="true"></div>
        
        {/* Foreground Text with Red O */}
        <div className="relative z-10 flex justify-center tracking-tighter w-full">
          <span>I</span><span className="main-letter">M</span><span>P</span>
          <span className="text-[#dc2626] drop-shadow-[0_0_20px_rgba(220,38,38,0.7)] relative z-20">O</span>
          <span>S</span><span className="main-letter">T</span><span>E</span><span>R</span>
        </div>
      </div>

      {/* GAME Integration */}
      <div className="flex items-center justify-center gap-4 relative z-10 w-full max-w-[70%] px-4 mb-8">
        <div className="h-[2px] flex-1 bg-[#991b1b]"></div>
        <div className="text-2xl md:text-4xl lg:text-5xl font-black tracking-[0.5em] text-[#dc2626] uppercase drop-shadow-[0_0_10px_rgba(220,38,38,0.4)]">
          GAME
        </div>
        <div className="h-[2px] flex-1 bg-[#991b1b]"></div>
      </div>

      {/* Tagline */}
      <div className="text-[10px] md:text-xs lg:text-sm font-bold tracking-[0.6em] uppercase text-slate-400">
        Think. <span className="text-[#dc2626]">Trust.</span> Survive.
      </div>
    </div>
  );
}

// UI Components
function CosmicBackground({ variant = 'default' }) {
  const styles = {
    default: "bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#450a0a] via-[#050505] to-[#000000]",
    danger: "bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-rose-900/40 via-[#0B0C10] to-[#0B0C10]",
    success: "bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/30 via-[#0B0C10] to-[#0B0C10]"
  };
  return (
    <div className={`absolute inset-0 ${styles[variant]} overflow-hidden pointer-events-none z-0`}>
      {/* Subtle moving environment light */}
      <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[60vw] h-[40vw] bg-red-900/10 rounded-full blur-[100px] animate-[pulse_15s_ease-in-out_infinite] mix-blend-screen pointer-events-none"></div>
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')] opacity-[0.15] mix-blend-overlay"></div>
      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,#000_100%)] opacity-80 pointer-events-none"></div>
    </div>
  );
}

function GlassCard({ children, className = '' }) {
  return (
    <div className={`bg-[#121826]/80 backdrop-blur-xl border border-[#1E293B] rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-6 md:p-8 relative overflow-hidden ${className}`}>
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-50"></div>
      {children}
    </div>
  );
}

function NeonButton({ onClick, children, variant = 'primary', className = '', disabled = false }) {
  const baseStyle = "relative w-full py-4 font-bold rounded-2xl text-xl md:text-2xl transition-all duration-300 overflow-hidden shadow-lg hover:-translate-y-[2px] active:translate-y-[1px] group ";
  const variants = {
    primary: "bg-gradient-to-b from-cyan-500 to-blue-600 text-white border border-cyan-400/50 hover:shadow-[0_4px_30px_rgba(6,182,212,0.6)]",
    danger: "bg-gradient-to-b from-rose-500 to-red-600 text-white border border-rose-400/50 hover:shadow-[0_4px_30px_rgba(244,63,94,0.6)]",
    outline: "bg-transparent text-cyan-400 border-2 border-cyan-500/50 hover:bg-cyan-500/10 hover:shadow-[0_4px_20px_rgba(6,182,212,0.3)]",
    secondary: "bg-[#1E293B] text-slate-300 border border-slate-700 hover:bg-[#334155]"
  };
  const disabledStyle = "opacity-50 cursor-not-allowed saturate-0 transform-none";
  
  return (
    <button 
      onClick={onClick} 
      disabled={disabled} 
      className={`${baseStyle} ${variants[variant]} ${disabled ? disabledStyle : ''} ${className}`}
    >
      {!disabled && <div className="absolute inset-0 -translate-x-[150%] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-25deg] transition-transform duration-700 ease-out group-hover:translate-x-[150%] pointer-events-none"></div>}
      <span className="relative z-10">{children}</span>
    </button>
  );
}

function Timer({ turn, onTick }) {
  const [timeLeft, setTimeLeft] = useState(0);
  
  useEffect(() => {
    if (!turn || !turn.deadline) return setTimeLeft(0);
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((turn.deadline - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 5 && remaining > 0 && onTick) onTick();
    }, 200);
    return () => clearInterval(interval);
  }, [turn, onTick]);

  if (!turn || turn.isWaitingForReady) return null; // Timer hidden until started

  const isWarning = timeLeft <= 10;
  return (
    <div className={`flex items-center gap-2 font-mono font-black text-2xl ${isWarning ? 'text-rose-500 animate-pulse drop-shadow-[0_0_10px_rgba(244,63,94,0.8)]' : 'text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]'}`}>
      ⏱ {timeLeft}s
    </div>
  );
}

function HostLanding() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#000000] text-slate-50 relative overflow-hidden group/landing">
      <CosmicBackground />
      <div className="relative z-10 w-full max-w-4xl space-y-12 text-center animate-in fade-in duration-1000 flex flex-col items-center mt-12">
        
        <ImposterLogo />
        
        <div className="flex flex-col gap-4 w-full max-w-xs mx-auto pt-8">
          <button onClick={() => { SFX.join(); nav('/create'); }} className="w-full relative px-8 py-4 bg-[#991b1b] hover:bg-[#b91c1c] text-white text-sm font-bold tracking-[0.2em] uppercase rounded-2xl transition-all duration-300 hover:-translate-y-1 shadow-[0_0_20px_rgba(153,27,27,0.4)] hover:shadow-[0_4px_30px_rgba(220,38,38,0.6)]">
            Host Game
          </button>
        </div>
      </div>
      
      <div className="absolute bottom-6 font-mono text-[10px] text-slate-700 tracking-widest flex items-center gap-2">
        <span className="w-1 h-1 rounded-full bg-red-700 animate-[pulse_3s_ease-in-out_infinite]"></span> SYSTEM ONLINE
      </div>
    </div>
  );
}

function CreateGame() {
  const nav = useNavigate();
  const [config, setConfig] = useState({ maxPlayers: 8, imposters: 1, rounds: 3, genre: 'tech' });
  const [isCreating, setIsCreating] = useState(false);
  const genres = ['AI', 'IT', 'Tech', 'Cybersecurity', 'General Knowledge', 'Science', 'Movies', 'History'];

  const createRoom = () => {
    SFX.join();
    setIsCreating(true);
    if (!socket.connected) {
      const triggerCreate = () => { socket.emit('create_room', config); socket.off('connect', triggerCreate); };
      socket.on('connect', triggerCreate);
      socket.connect();
    } else {
      socket.emit('create_room', config);
    }
  };

  useEffect(() => {
    const handleRoomCreated = (id) => nav(`/host/${id}`);
    socket.on('room_created', handleRoomCreated);
    return () => socket.off('room_created', handleRoomCreated);
  }, [nav]);

  if (isCreating) {
    return (
      <div className="min-h-screen bg-[#0B0C10] flex items-center justify-center relative">
        <CosmicBackground />
        <div className="text-center z-10 space-y-6">
          <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto shadow-[0_0_30px_rgba(6,182,212,0.5)]"></div>
          <h2 className="text-3xl font-black text-white tracking-widest uppercase">INITIALIZING ROOM...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-[#0B0C10] text-white flex items-center justify-center relative">
      <CosmicBackground />
      <GlassCard className="w-full max-w-2xl z-10">
        <h2 className="text-3xl font-black text-center mb-2 text-white">Create Your Game</h2>
        <p className="text-slate-400 text-center text-sm mb-8">Set up the perfect game for your crew</p>
        
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-[#0F172A] p-4 rounded-2xl border border-slate-800">
            <label className="font-bold text-slate-300">Number of Players</label>
            <select className="bg-[#1E293B] text-white font-bold py-2 px-4 rounded-xl outline-none focus:ring-2 focus:ring-cyan-500" value={config.maxPlayers} onChange={e=>setConfig({...config, maxPlayers: +e.target.value})}>
              {[3,4,5,6,7,8,9,10,11,12].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="flex items-center justify-between bg-[#0F172A] p-4 rounded-2xl border border-slate-800">
            <label className="font-bold text-slate-300">Imposters</label>
            <select className="bg-[#1E293B] text-white font-bold py-2 px-4 rounded-xl outline-none focus:ring-2 focus:ring-cyan-500" value={config.imposters} onChange={e=>setConfig({...config, imposters: +e.target.value})}>
              {[1,2].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="flex items-center justify-between bg-[#0F172A] p-4 rounded-2xl border border-slate-800">
            <label className="font-bold text-slate-300">Rounds</label>
            <select className="bg-[#1E293B] text-white font-bold py-2 px-4 rounded-xl outline-none focus:ring-2 focus:ring-cyan-500" value={config.rounds} onChange={e=>setConfig({...config, rounds: +e.target.value})}>
              {[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="bg-[#0F172A] p-5 rounded-2xl border border-slate-800">
            <label className="block font-bold text-slate-300 mb-4">Genre</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {genres.map(g => (
                <button key={g} onClick={()=>setConfig({...config, genre: g.toLowerCase()})}
                  className={`flex items-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition-all border ${config.genre === g.toLowerCase() ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'bg-transparent text-slate-400 border-slate-700 hover:border-slate-500'}`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${config.genre === g.toLowerCase() ? 'border-cyan-400' : 'border-slate-600'}`}>
                    {config.genre === g.toLowerCase() && <div className="w-2 h-2 bg-cyan-400 rounded-full" />}
                  </div>
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="mt-10">
          <NeonButton onClick={createRoom}>Create Room</NeonButton>
          <p className="text-center text-slate-500 text-xs mt-4">Get ready for a mind-bending experience!</p>
        </div>
      </GlassCard>
    </div>
  );
}

function HostView({ room }) {
  const nav = useNavigate();
  const startGame = () => { SFX.start(); socket.emit('force_start', room.id); };

  if (room.state === 'LOBBY_OPEN') {
    const publicUrl = import.meta.env.VITE_PUBLIC_GAME_URL || window.location.origin;
    const joinUrl = `${publicUrl}/${room.id}`;
    
    return (
      <div className="min-h-screen bg-[#0B0C10] p-4 md:p-8 flex items-center justify-center relative">
        <CosmicBackground />
        <GlassCard className="w-full max-w-4xl z-10 flex flex-col md:flex-row gap-8">
          
          <div className="w-full md:w-1/2 flex flex-col items-center text-center space-y-6">
            <div className="flex items-center gap-2 text-emerald-400 font-bold bg-emerald-500/10 px-4 py-2 rounded-full border border-emerald-500/20">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
              Room Created!
            </div>
            <p className="text-slate-400">Share this with your players</p>
            
            <div className="bg-[#0F172A] p-6 rounded-3xl border border-slate-800 w-full flex flex-col items-center shadow-inner">
              <div className="text-slate-400 text-sm font-bold tracking-widest uppercase mb-2">ROOM CODE</div>
              <div className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-6 drop-shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                {room.id}
              </div>
              <div className="bg-white p-4 rounded-xl mb-4">
                <QRCodeSVG value={joinUrl} size={180} level="H" includeMargin={false} />
              </div>
              <p className="text-slate-400 text-sm font-bold">Scan QR to Join</p>
            </div>
            
            <div className="w-full bg-[#0F172A] border border-slate-800 p-3 rounded-xl flex items-center justify-between text-sm">
              <span className="text-slate-400 truncate pl-2 font-mono">Join: {joinUrl}</span>
              <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-300" onClick={() => navigator.clipboard.writeText(joinUrl)}>📋</button>
            </div>
          </div>

          <div className="w-full md:w-1/2 space-y-6 flex flex-col">
            <div className="flex justify-between items-end border-b border-slate-800 pb-2">
              <h2 className="text-xl font-bold text-white">Players ({room.players.length} / {room.config.maxPlayers})</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto min-h-[200px]">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {[...Array(room.config.maxPlayers)].map((_, i) => {
                  const p = room.players[i];
                  return p ? (
                    <div key={p.id} className="flex items-center gap-3 animate-in slide-in-from-left-4">
                      <span className="text-slate-500 font-mono text-sm">{i+1}.</span>
                      <span className="font-bold text-cyan-400 truncate">{p.name}</span>
                      {i === 0 && <span className="text-amber-400 text-xs" title="Host/First Player">👑</span>}
                    </div>
                  ) : (
                    <div key={`empty-${i}`} className="flex items-center gap-3 opacity-30">
                      <span className="text-slate-500 font-mono text-sm">{i+1}.</span>
                      <span className="font-bold text-slate-500">—</span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="pt-4 shrink-0">
              <NeonButton onClick={startGame} disabled={room.players.length < 3}>
                {room.players.length < 3 ? 'Waiting for players...' : 'Start Game'}
              </NeonButton>
              <p className="text-center text-slate-500 text-xs mt-4">Room will start once all players join</p>
            </div>
          </div>
        </GlassCard>
      </div>
    );
  }

  // Active Game Host View (Dashboard)
  if (['ROLE_REVEAL', 'ROUND_CLUES', 'VOTING', 'ROUND_WAIT'].includes(room.state)) {
    const activePlayer = room.players.find(p => p.id === room.turn?.activePlayerId);
    
    return (
      <div className="min-h-screen bg-[#0B0C10] p-4 md:p-6 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center bg-[#121826]/80 backdrop-blur border border-[#1E293B] p-4 rounded-2xl shrink-0 mb-4 shadow-lg">
          <div className="flex items-center gap-4">
            <span className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">MISSION CONTROL</span>
            <span className="px-3 py-1 bg-slate-800 rounded-lg text-slate-300 font-bold text-sm">ROOM {room.id}</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-slate-300 font-bold uppercase text-sm">
              Phase: <span className="text-white">{room.state.replace('_', ' ')}</span>
            </div>
            <div className="text-slate-300 font-bold uppercase text-sm">
              Round: <span className="text-cyan-400 text-lg">{room.currentRound} / {room.config.rounds}</span>
            </div>
          </div>
        </div>
        
        {/* Main Dashboard */}
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left Column: Game State */}
          <GlassCard className="flex-[2] flex flex-col !p-0">
            <div className="p-4 border-b border-slate-800 bg-[#0F172A] flex justify-between items-center shrink-0">
              <h3 className="font-bold text-slate-300 uppercase tracking-widest text-sm">Live Feed</h3>
              {room.state === 'VOTING' && (
                <span className="text-rose-400 font-bold text-sm bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                  {room.votesSubmitted.length} / {room.players.length} VOTES
                </span>
              )}
            </div>
            
            <div className="flex-1 bg-[#090b10] p-6 flex flex-col items-center justify-center relative overflow-hidden">
              {room.state === 'ROLE_REVEAL' && (
                <div className="text-center space-y-4">
                  <div className="text-6xl">🕵️‍♂️</div>
                  <h2 className="text-2xl font-bold text-cyan-400">PLAYERS ARE VIEWING ROLES</h2>
                  <p className="text-slate-400">Round timer will begin automatically when the first player is ready.</p>
                </div>
              )}
              
              {room.state === 'ROUND_CLUES' && (
                <div className="w-full h-full flex gap-6">
                  <div className="flex-1 bg-transparent flex flex-col relative">
                    <div className="p-3 border-b border-slate-700/50 font-bold text-slate-400 text-xs tracking-[0.2em] uppercase text-center mb-4">Evidence Log</div>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                      {room.chat.length === 0 ? <div className="text-slate-500 italic text-center text-sm">Waiting for first clue...</div> : 
                        room.chat.map((c, i) => (
                          <div key={i} className="border-l-2 border-cyan-500 pl-4 py-1">
                            <span className="text-cyan-400 font-bold text-[10px] tracking-widest uppercase block mb-1 opacity-80">{c.senderName}</span>
                            <span className="text-slate-200 font-mono text-sm leading-relaxed">&quot;{c.text}&quot;</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                  <div className="w-64 shrink-0 flex flex-col gap-4 border-l border-slate-800 pl-6 justify-center">
                    <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest text-center mb-2">Subject of Inquiry</div>
                    <div className="text-3xl font-black text-white truncate text-center mb-6">{activePlayer?.name || '---'}</div>
                    <div className="flex justify-center scale-150 transform origin-center"><Timer turn={room.turn} /></div>
                  </div>
                </div>
              )}

              {room.state === 'VOTING' && (
                <div className="text-center space-y-6">
                  <div className="text-rose-500 font-black text-3xl">VOTING IN PROGRESS</div>
                  <Timer turn={room.turn} />
                </div>
              )}
            </div>
          </GlassCard>

          {/* Right Column: Player Status List */}
          <GlassCard className="flex-1 flex flex-col !p-0">
            <div className="p-4 border-b border-slate-800 bg-[#0F172A] shrink-0">
              <h3 className="font-bold text-slate-300 uppercase tracking-widest text-sm">Crew Status</h3>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-2 bg-[#090b10]">
              {room.players.map(p => {
                const isTurn = room.state === 'ROUND_CLUES' && room.turn?.activePlayerId === p.id;
                const hasVoted = room.state === 'VOTING' && room.votesSubmitted.includes(p.id);
                return (
                  <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border ${isTurn ? 'bg-cyan-500/10 border-cyan-500/50' : 'bg-[#0F172A] border-slate-800'}`}>
                    <span className="font-bold text-white truncate">{p.name}</span>
                    {isTurn && <span className="text-xs bg-cyan-500 text-white px-2 py-1 rounded-md font-bold animate-pulse">ACTIVE</span>}
                    {hasVoted && <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-2 py-1 rounded-md font-bold">VOTED</span>}
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>
      </div>
    );
  }

  // Host Final Leaderboard (Detailed Breakdown)
  if (room.state === 'GAME_END') {
    // Sort logic already done by server
    const winner = room.leaderboard[0];
    return (
      <div className="min-h-screen bg-[#0B0C10] p-4 md:p-8 flex flex-col items-center overflow-y-auto relative">
        <CosmicBackground variant="success" />
        
        <div className="z-10 w-full max-w-5xl flex flex-col items-center">
          <div className="text-amber-400 text-6xl mb-4 drop-shadow-[0_0_20px_rgba(251,191,36,0.5)]">👑</div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-2 tracking-tighter">GAME COMPLETE!</h1>
          <h2 className="text-2xl font-bold text-amber-400 mb-10">{winner.name} Wins!</h2>
          
          <GlassCard className="w-full !p-0 overflow-hidden mb-8">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0F172A] text-slate-400 text-xs font-bold uppercase tracking-widest border-b border-slate-800">
                    <th className="p-4 w-12 text-center">#</th>
                    <th className="p-4">Player</th>
                    <th className="p-4">Role</th>
                    {[...Array(room.config.rounds)].map((_, i) => (
                      <th key={i} className="p-4 text-center w-16">R{i+1}</th>
                    ))}
                    <th className="p-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 bg-[#090b10]">
                    {room.leaderboard.map((p, idx) => (
                      <tr key={p.id} className="hover:bg-slate-800/50 transition-colors animate-in slide-in-from-right-4 duration-500" style={{animationDelay: `${idx * 150}ms`, animationFillMode: 'both'}}>
                        <td className={`p-4 text-center font-black ${idx===0 ? 'text-amber-400' : 'text-slate-500'}`}>{idx+1}</td>
                        <td className="p-4 font-bold text-white flex items-center gap-2">
                          {p.name} {idx===0 && <span className="text-amber-400 text-sm">👑</span>}
                        </td>
                        <td className="p-4 relative group">
                          <div className="absolute inset-0 bg-[#0B0C10] flex items-center px-4 animate-out fade-out duration-1000 delay-[2000ms] fill-mode-forwards z-10 text-slate-600 font-bold text-[10px] tracking-widest uppercase">CLASSIFIED</div>
                          <span className={`relative z-0 px-3 py-1 rounded-md text-[10px] font-bold tracking-widest ${p.role === 'imposter' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                            {p.role.toUpperCase()}
                          </span>
                        </td>
                        {[...Array(room.config.rounds)].map((_, i) => {
                          const score = p.roundScores?.[i+1] || 0;
                          return (
                            <td key={i} className={`p-4 text-center font-mono font-bold text-sm ${score > 0 ? 'text-cyan-400' : 'text-slate-600'}`}>
                              +{score}
                            </td>
                          );
                        })}
                        <td className="p-4 text-right font-black text-2xl text-white">{p.score}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
          
          <div className="flex gap-4 w-full max-w-md">
            <NeonButton onClick={() => { sessionStorage.clear(); nav('/'); }}>New Game</NeonButton>
          </div>
        </div>
      </div>
    );
  }
  
  return null;
}

// Player Screens
function PlayerJoin() {
  const { roomId } = useParams();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const joinRoom = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    SFX.join();
    if (!socket.connected) {
      const triggerJoin = () => { socket.emit('join_room', roomId.toUpperCase(), name); socket.off('connect', triggerJoin); };
      socket.on('connect', triggerJoin);
      socket.connect();
    } else {
      socket.emit('join_room', roomId.toUpperCase(), name);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0C10] p-6 flex flex-col items-center justify-center relative overflow-hidden">
      <CosmicBackground />
      
      <div className="mb-12 relative z-10 w-full flex justify-center transform scale-75 md:scale-100 origin-bottom">
        <ImposterLogo />
      </div>

      <GlassCard className="w-full max-w-sm z-10 flex flex-col items-center">
        <div className="bg-[#0F172A] w-full p-4 rounded-2xl border border-slate-800 text-center mb-6">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">ROOM CODE</div>
          <div className="text-3xl font-black text-cyan-400 tracking-widest">{roomId.toUpperCase()}</div>
        </div>
        
        <form onSubmit={joinRoom} className="space-y-6 w-full">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">👤</div>
            <input 
              type="text" 
              className="w-full bg-[#0F172A] border border-slate-700 rounded-xl pl-12 pr-4 py-4 text-white font-bold text-lg focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all placeholder:text-slate-600"
              placeholder="Enter your name..."
              value={name} 
              onChange={e => setName(e.target.value)} 
              maxLength={12}
            />
          </div>
          {error && <div className="text-rose-400 text-sm font-bold bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 text-center">{error}</div>}
          <NeonButton onClick={joinRoom} disabled={!name.trim()}>Join Game</NeonButton>
        </form>
      </GlassCard>
    </div>
  );
}

function PlayerView({ room, privateRole, onAcknowledgeRole }) {
  const myPlayer = room.players.find(p => p.id === socket.playerId);
  const [clue, setClue] = useState('');

  if (!myPlayer) return <div className="min-h-screen bg-[#0B0C10] text-white flex items-center justify-center p-6 text-center font-bold">You were removed from the room.</div>;

  if (room.state === 'LOBBY_OPEN') {
    return (
      <div className="min-h-screen bg-[#0B0C10] p-4 flex flex-col items-center justify-center relative">
        <CosmicBackground />
        <GlassCard className="w-full max-w-sm z-10 space-y-6">
          <div className="flex items-center gap-3 justify-center mb-2">
            <div className="w-5 h-5 rounded-full border-2 border-slate-500 border-t-cyan-400 animate-spin"></div>
            <h2 className="text-lg font-bold text-white tracking-widest uppercase">WAITING FOR HOST</h2>
          </div>
          <p className="text-slate-400 text-sm text-center">The game will start soon...</p>
          
          <div className="flex justify-between items-center bg-[#0F172A] p-4 rounded-xl border border-slate-800">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">ROOM CODE</span>
            <span className="text-xl font-black text-cyan-400">{room.id}</span>
          </div>

          <div className="bg-[#0F172A] p-4 rounded-xl border border-slate-800 min-h-[200px]">
            <div className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4">PLAYERS ({room.players.length}/{room.config.maxPlayers})</div>
            <div className="grid grid-cols-2 gap-y-3">
              {[...Array(room.config.maxPlayers)].map((_, i) => {
                const p = room.players[i];
                return p ? (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="text-slate-600 font-mono text-xs">{i+1}.</span>
                    <span className={`font-bold text-sm truncate ${p.id === socket.playerId ? 'text-white' : 'text-cyan-400'}`}>{p.name}</span>
                  </div>
                ) : (
                  <div key={`empty-${i}`} className="flex items-center gap-2 opacity-30">
                    <span className="text-slate-600 font-mono text-xs">{i+1}.</span>
                    <span className="font-bold text-sm text-slate-500">—</span>
                  </div>
                );
              })}
            </div>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (!myPlayer.roleAcknowledged) {
    const isImposter = privateRole?.role === 'imposter';
    
    // Self-contained Role Reveal Sequence
    const [revealStep, setRevealStep] = useState(0);
    useEffect(() => {
      if (revealStep === 0) {
        const t = setTimeout(() => { SFX.alert(); setRevealStep(1); }, 2500);
        return () => clearTimeout(t);
      }
    }, [revealStep]);

    if (revealStep === 0) {
      return (
        <div className="min-h-screen p-4 flex flex-col items-center justify-center relative bg-[#0B0C10] overflow-hidden">
          <CosmicBackground />
          <div className="z-10 text-center animate-pulse">
            <div className="text-slate-500 font-bold tracking-[0.4em] mb-12 uppercase text-sm">Your Identity</div>
            <div className="text-8xl font-black text-slate-700 animate-[bounce_1s_infinite]">?</div>
          </div>
        </div>
      );
    }

    return (
      <div className={`min-h-screen p-4 flex items-center justify-center relative bg-[#0B0C10]`}>
        <CosmicBackground variant={isImposter ? 'danger' : 'success'} />
        
        <GlassCard className={`w-full max-w-sm z-10 text-center animate-in zoom-in duration-1000 flex flex-col items-center !bg-[#050505]/90 border ${isImposter ? '!border-rose-900 shadow-[0_0_80px_rgba(244,63,94,0.15)]' : '!border-emerald-900 shadow-[0_0_80px_rgba(52,211,153,0.15)]'}`}>
          <div className={`text-[10px] font-bold tracking-[0.3em] uppercase mb-16 ${isImposter ? 'text-rose-500/50' : 'text-emerald-500/50'}`}>IDENTITY CONFIRMED</div>
          
          {isImposter && (
             <div className="text-slate-400 text-xs font-bold tracking-widest uppercase mb-2">YOU ARE THE</div>
          )}
          
          <h2 className={`text-4xl md:text-5xl font-black tracking-tighter mb-8 ${isImposter ? 'text-rose-500 drop-shadow-[0_0_20px_rgba(244,63,94,0.5)]' : 'text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.5)]'}`}>
            {isImposter ? 'IMPOSTER' : 'CREW MEMBER'}
          </h2>
          
          <div className={`text-[10px] font-bold tracking-[0.3em] mb-12 uppercase ${isImposter ? 'text-rose-200' : 'text-emerald-200'}`}>
             {isImposter ? 'BLEND IN. SURVIVE.' : "FIND WHO DOESN'T BELONG"}
          </div>

          {!isImposter && privateRole?.word && (
            <div className="w-full space-y-4 mb-8">
              <div className="bg-[#0F172A]/50 p-6 rounded-xl border border-slate-800">
                <div className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-2">SECRET WORD</div>
                <div className="text-3xl font-black text-white">{privateRole.word}</div>
              </div>
              
              {privateRole.wordDescription && (
                <div className="bg-emerald-900/10 border border-emerald-500/20 p-4 rounded-xl text-left">
                  <div className="text-emerald-500/50 text-[10px] font-bold tracking-widest uppercase mb-2">DID YOU KNOW?</div>
                  <div className="text-emerald-100/90 text-sm font-medium leading-relaxed">{privateRole.wordDescription}</div>
                </div>
              )}
            </div>
          )}
          
          <NeonButton onClick={() => { SFX.start(); onAcknowledgeRole(); }} variant={isImposter ? 'danger' : 'primary'} className="mt-4">
            Next
          </NeonButton>
        </GlassCard>
      </div>
    );
  }

  if (room.state === 'ROUND_CLUES') {
    const isMyTurn = room.turn?.activePlayerId === socket.playerId;
    const activePlayer = room.players.find(p => p.id === room.turn?.activePlayerId);

    useEffect(() => {
      if (isMyTurn && room.turn?.isWaitingForReady) socket.emit('player_ready_for_turn');
    }, [isMyTurn, room.turn?.isWaitingForReady]);

    return (
      <div className="h-[100dvh] bg-[#0B0C10] flex flex-col relative overflow-hidden">
        <CosmicBackground />
        
        {/* Top Bar */}
        <div className="relative z-10 flex justify-between items-center p-4 bg-[#121826]/80 backdrop-blur border-b border-[#1E293B] shadow-md shrink-0">
          <div className="flex items-center gap-2 text-slate-300 font-bold text-sm">
            <span className="text-cyan-400">⏱</span> ROUND {room.currentRound} / {room.config.rounds}
          </div>
          <Timer turn={room.turn} />
        </div>

        {/* Immersive Mobile Layout */}
        <div className="relative z-10 flex-1 flex flex-col md:flex-row min-h-0 w-full max-w-5xl mx-auto md:p-4 gap-4">
          
          {/* Main Action Area */}
          <div className="shrink-0 p-4 md:p-0 md:w-1/2 flex flex-col justify-end md:justify-center order-1">
            <GlassCard className="w-full flex flex-col items-center text-center">
              {isMyTurn ? (
                <div className="w-full space-y-4 animate-in fade-in zoom-in duration-300">
                  <div className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-6 py-2 rounded-full font-black tracking-widest text-lg inline-block">YOUR TURN</div>
                  <p className="text-slate-400 text-sm">Give a clue related to the word.</p>
                  
                  <div className="relative">
                    <textarea 
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-xl p-4 text-white font-bold text-lg focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all resize-none h-24"
                      placeholder="Type your clue here..."
                      value={clue}
                      onChange={e => setClue(e.target.value)}
                      maxLength={100}
                    />
                    <div className="absolute bottom-3 right-3 text-xs text-slate-500 font-mono">{clue.length}/100</div>
                  </div>
                  
                  <NeonButton onClick={() => { socket.emit('submit_clue', clue); setClue(''); }} disabled={!clue.trim() || room.turn?.turnResolved}>
                    Submit Clue
                  </NeonButton>
                </div>
              ) : (
                <div className="py-6 space-y-3 w-full">
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-10 h-10 bg-[#0F172A] rounded-full flex items-center justify-center text-xl border border-slate-700 shadow-inner">👤</div>
                    <div className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-4 py-1 rounded-full font-bold tracking-widest text-sm inline-block">
                      {activePlayer?.name}'S TURN
                    </div>
                  </div>
                  <p className="text-slate-500 text-sm">Waiting for them to submit a clue...</p>
                </div>
              )}
            </GlassCard>
          </div>

          {/* Chat Feed */}
          <div className="flex-1 min-h-0 p-4 pt-0 md:p-0 md:w-1/2 order-2">
            <ChatFeed chat={room.chat} />
          </div>
        </div>
      </div>
    );
  }

  if (room.state === 'VOTING') {
    const hasVoted = room.votesSubmitted.includes(socket.playerId);
    const [voteFor, setVoteFor] = useState('');
    const [confidence, setConfidence] = useState(50);
    
    if (hasVoted) return (
      <div className="min-h-screen bg-[#0B0C10] flex items-center justify-center p-6 text-center relative">
        <CosmicBackground variant="success" />
        <GlassCard className="w-full max-w-sm space-y-6 z-10 py-10">
          <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-4xl border border-emerald-500/30 mx-auto">✓</div>
          <h2 className="text-2xl font-black text-white">VOTE SUBMITTED</h2>
          <p className="text-slate-400 font-bold text-sm">Waiting for other players...</p>
        </GlassCard>
      </div>
    );

    return (
      <div className="h-[100dvh] bg-[#0B0C10] flex flex-col relative overflow-hidden">
        <CosmicBackground variant="danger" />
        
        <div className="relative z-10 flex justify-between items-center p-4 bg-[#121826]/80 backdrop-blur border-b border-[#1E293B] shrink-0">
          <div className="text-slate-400 font-bold text-sm tracking-widest">ROUND {room.currentRound} / {room.config.rounds}</div>
          <Timer turn={room.turn} />
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto p-4 flex flex-col items-center">
          <div className="w-full max-w-md space-y-6">
            <div className="text-center py-4">
              <h2 className="text-xl md:text-2xl font-black text-slate-300 mb-2 uppercase tracking-[0.3em]">Who do you trust?</h2>
              <p className="text-slate-500 text-xs tracking-widest uppercase">Select your accusation</p>
            </div>
            
            <GlassCard className="!p-4 bg-[#050505]/90 border-slate-800">
              <div className="space-y-3">
                {room.players.map(p => {
                  if (p.id === socket.playerId) return null;
                  const isSelected = voteFor === p.id;
                  return (
                    <button key={p.id} onClick={() => { SFX.turn(); setVoteFor(p.id); }}
                      className={`w-full flex items-center justify-between p-5 rounded-xl border transition-all text-left group ${isSelected ? 'bg-rose-500/10 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.1)]' : 'bg-[#0B0C10] border-slate-800 hover:border-slate-600'}`}>
                      <div className="flex flex-col">
                        <span className={`font-black text-xl tracking-wide ${isSelected ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>{p.name}</span>
                        {isSelected && <span className="text-rose-500 text-[10px] font-bold tracking-[0.3em] uppercase mt-1 animate-pulse">Accusation</span>}
                      </div>
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'border-rose-500' : 'border-slate-700'}`}>
                        {isSelected && <div className="w-3 h-3 bg-rose-500 rounded-full"></div>}
                      </div>
                    </button>
                  );
                })}
              </div>

              {room.currentRound >= 2 && voteFor && (
                <div className="mt-8 pt-8 border-t border-slate-800 animate-in fade-in slide-in-from-bottom-2">
                  <div className="text-center mb-6">
                    <label className="text-slate-400 font-bold text-xs uppercase tracking-[0.2em]">How confident are you?</label>
                  </div>
                  
                  <div className="relative px-2 mb-8">
                    <input type="range" min="50" max="100" step="10" value={confidence} onChange={e => { SFX.tick(); setConfidence(e.target.value); }}
                      className="w-full accent-cyan-500 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer relative z-10" />
                    <div className="flex justify-between absolute left-0 w-full px-2 top-4 pointer-events-none text-[10px] font-bold text-slate-600">
                      <span>50</span><span>60</span><span>70</span><span>80</span><span>90</span><span>100</span>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <span className={`text-sm font-black tracking-[0.3em] uppercase ${confidence < 70 ? 'text-slate-400' : confidence < 90 ? 'text-cyan-400' : 'text-rose-400'}`}>
                      {confidence < 70 ? 'Uncertain' : confidence < 90 ? 'Confident' : 'Certain'}
                    </span>
                  </div>
                </div>
              )}
            </GlassCard>

            <div className="pt-2 pb-8 w-full">
              <NeonButton onClick={() => { SFX.alert(); socket.emit('submit_vote', { voteFor, confidence: Number(confidence) }); }} disabled={!voteFor} variant="danger">
                Confirm
              </NeonButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (room.state === 'ROUND_WAIT') {
    return (
      <div className="min-h-screen bg-[#0B0C10] flex items-center justify-center p-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-cyan-900/30 via-[#0B0C10] to-[#0B0C10] z-0"></div>
        <div className="absolute bottom-0 left-0 w-full h-32 bg-cyan-500/10 blur-3xl rounded-full transform scale-y-50 translate-y-1/2"></div>
        
        <div className="z-10 space-y-4 animate-in slide-in-from-bottom-10 duration-700">
          <h2 className="text-4xl font-black text-white tracking-tight">ROUND {room.currentRound} COMPLETE</h2>
          <p className="text-slate-400 text-lg">Get ready for the next round!</p>
          <div className="mt-12 flex justify-center">
            <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  if (room.state === 'GAME_END') {
    const me = room.leaderboard.find(p => p.id === socket.playerId);
    const myRank = room.leaderboard.findIndex(p => p.id === socket.playerId) + 1;
    const isWinner = myRank === 1;
    
    return (
      <div className="min-h-screen bg-[#0B0C10] p-4 md:p-8 flex flex-col items-center justify-center relative">
        <CosmicBackground variant={isWinner ? "success" : "default"} />
        
        <div className="z-10 w-full max-w-sm space-y-12 mt-8 animate-in slide-in-from-bottom-8 duration-1000">
          <div className="text-center space-y-4">
            <div className={`text-6xl md:text-7xl font-black tracking-tighter ${isWinner ? 'text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.3)]' : 'text-slate-300'}`}>
              {me?.score || 0}
            </div>
            <div className="text-slate-500 font-bold tracking-[0.4em] text-xs uppercase">Total Points</div>
          </div>
          
          <div className="text-center">
            <h1 className={`text-xl font-black tracking-[0.2em] uppercase ${isWinner ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isWinner ? 'YOU SAW THROUGH THE LIE' : 'DECEPTION PREVAILED'}
            </h1>
          </div>
          
          <GlassCard className="!p-0 overflow-hidden bg-[#050505]/90 border-slate-800">
            <div className="p-4 border-b border-slate-800 text-center">
              <span className="text-slate-400 font-bold tracking-[0.3em] uppercase text-[10px]">Final Standing</span>
            </div>
            <div className="divide-y divide-slate-800/50">
              {room.leaderboard.slice(0, 3).map((p, idx) => {
                const isMe = p.id === socket.playerId;
                return (
                  <div key={p.id} className={`flex justify-between items-center px-6 py-4 animate-in slide-in-from-right-4 duration-500 ${isMe ? 'bg-cyan-500/10' : ''}`} style={{animationDelay: `${idx * 150}ms`, animationFillMode: 'both'}}>
                    <div className="flex items-center gap-4">
                      <span className={`font-black text-sm ${idx===0 ? 'text-amber-400' : 'text-slate-500'}`}>{idx+1}</span>
                      <span className={`font-bold tracking-wide ${isMe ? 'text-white' : 'text-slate-300'}`}>{p.name}</span>
                    </div>
                    <span className="font-black text-white">{p.score}</span>
                  </div>
                );
              })}
            </div>
          </GlassCard>
          
          <div className="text-center pt-8 text-slate-500 font-bold tracking-[0.3em] text-[10px] uppercase animate-pulse">
            Wait for host
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Main App component
// ChatFeed Component (Evidence Board Style)
function ChatFeed({ chat }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  return (
    <GlassCard className="h-full flex flex-col p-0 overflow-hidden bg-transparent border-0 shadow-none relative">
      <div className="absolute inset-0 border border-slate-700/30 rounded-2xl pointer-events-none"></div>
      <div className="p-4 border-b border-slate-700/30 bg-[#0B0C10]/50 backdrop-blur-md">
        <h3 className="font-bold text-slate-400 uppercase tracking-[0.2em] text-xs text-center">Evidence Log</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
        {chat.length === 0 ? (
          <div className="text-center text-slate-600 italic text-sm mt-10">Waiting for evidence...</div>
        ) : (
          chat.map((c, i) => (
            <div key={i} className="animate-in slide-in-from-right-4 duration-300">
              <div className="bg-[#0F172A]/80 border-l-2 border-cyan-500 pl-4 pr-3 py-3 rounded-r-lg shadow-sm">
                <span className="text-cyan-400 font-bold text-[10px] uppercase tracking-widest block mb-1 opacity-80">{c.senderName}</span>
                <span className="text-slate-200 font-mono text-sm leading-relaxed">&quot;{c.text}&quot;</span>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </GlassCard>
  );
}

function HostRouteWrapper({ room }) {
  const { roomId } = useParams();

  useEffect(() => {
    if (!roomId) return;
    
    const joinAsHost = () => {
      socket.emit('join_host', roomId.toUpperCase());
    };

    if (socket.connected) {
      joinAsHost();
    }
    
    socket.on('connect', joinAsHost);
    
    // Ensure socket tries to connect if not already connected (e.g. on refresh)
    if (!socket.connected) {
      socket.connect();
    }
    
    return () => {
      socket.off('connect', joinAsHost);
    };
  }, [roomId]);

  if (!room) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return <HostView room={room} />;
}

// Main App component
export default function App() {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState(null);
  const [privateRole, setPrivateRole] = useState(null);

  useEffect(() => {
    socket.on('join_success', (data) => {
      sessionStorage.setItem('imposter_token', data.token);
      socket.auth = { token: data.token };
    });

    socket.on('sync_state', (state) => {
      setRoom(prev => {
        if (prev) {
           const me = prev.players.find(p => p.id === socket.playerId);
           if (me) {
             const newMe = state.players.find(p => p.id === socket.playerId);
             if (newMe) newMe.roleAcknowledged = me.roleAcknowledged;
           }
        }
        return state;
      });
      setError(null);
    });

    socket.on('private_role', (data) => {
      setPrivateRole(data);
      setRoom(prev => {
        if (!prev) return prev;
        const newRoom = {...prev};
        const me = newRoom.players.find(p => p.id === socket.playerId);
        if (me) me.roleAcknowledged = false;
        return newRoom;
      });
    });

    socket.on('error', (err) => setError(err));
    socket.on('connect_error', (err) => setError(`Connection failed: ${err.message}. Check backend URL.`));

    return () => {
      socket.off('join_success');
      socket.off('sync_state');
      socket.off('private_role');
      socket.off('error');
      socket.off('connect_error');
    };
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem('imposter_token');
    if (token && !socket.connected) {
      socket.auth = { token };
      socket.connect();
      socket.emit('resume_session');
    }
  }, []);

  const handleAcknowledgeRole = () => {
    SFX.turn();
    setRoom(prev => {
      const newRoom = {...prev};
      const me = newRoom.players.find(p => p.id === socket.playerId);
      if (me) me.roleAcknowledged = true;
      return newRoom;
    });
  };

  return (
    <div className="bg-[#0B0C10] min-h-screen text-slate-50 font-sans selection:bg-cyan-500/30">
      {error && (
        <div className="fixed top-0 left-0 w-full bg-rose-600/90 backdrop-blur-md text-white p-4 z-50 text-center font-bold shadow-[0_4px_30px_rgba(244,63,94,0.5)] border-b border-rose-500 animate-in slide-in-from-top-4 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-2xl px-2 opacity-70 hover:opacity-100">&times;</button>
        </div>
      )}
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HostLanding />} />
          <Route path="/create" element={<CreateGame />} />
          <Route path="/host/:roomId" element={<HostRouteWrapper room={room} />} />
          <Route path="/:roomId" element={room ? <PlayerView room={room} privateRole={privateRole} onAcknowledgeRole={handleAcknowledgeRole} /> : <PlayerJoin />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
