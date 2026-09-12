import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom';
import { socket } from './socket';

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

// Sub-components
function GlassCard({ children, className = '' }) {
  return (
    <div className={`bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] p-6 ${className}`}>
      {children}
    </div>
  );
}

function NeonButton({ onClick, children, variant = 'primary', className = '', disabled = false }) {
  const baseStyle = "relative w-full py-4 font-bold rounded-2xl text-xl transition-all duration-200 overflow-hidden group ";
  const variants = {
    primary: "bg-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] hover:bg-cyan-400",
    danger: "bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.4)] hover:shadow-[0_0_30px_rgba(244,63,94,0.6)] hover:bg-rose-400",
    success: "bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_30px_rgba(16,185,129,0.6)] hover:bg-emerald-400",
    secondary: "bg-slate-700 text-white shadow-lg hover:bg-slate-600"
  };
  const disabledStyle = "opacity-50 cursor-not-allowed saturate-0";
  
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${baseStyle} ${disabled ? disabledStyle : variants[variant]} ${className}`}
    >
      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
      <span className="relative z-10">{children}</span>
    </button>
  );
}

function Timer({ turn, onTick, small = false }) {
  const [timeLeft, setTimeLeft] = useState(0);
  
  useEffect(() => {
    if (!turn || !turn.deadline) {
      setTimeLeft(0);
      return;
    }
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((turn.deadline - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 5 && remaining > 0 && onTick) onTick();
    }, 200);
    return () => clearInterval(interval);
  }, [turn, onTick]);

  if (!turn || turn.isWaitingForReady) return <div className="text-cyan-400 font-mono animate-pulse">WAITING...</div>;

  const isWarning = timeLeft <= 10;
  return (
    <div className={`font-mono font-black ${small ? 'text-2xl' : 'text-5xl md:text-7xl'} ${isWarning ? 'text-rose-500 animate-pulse' : 'text-cyan-400'} drop-shadow-[0_0_15px_currentColor]`}>
      {timeLeft}s
    </div>
  );
}

function ChatFeed({ chat }) {
  const feedRef = useRef(null);
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [chat]);

  return (
    <div className="flex flex-col h-full bg-slate-950/50 rounded-2xl border border-slate-800 overflow-hidden shadow-inner">
      <div className="bg-slate-800/80 px-4 py-3 font-bold text-slate-300 border-b border-slate-700 text-sm tracking-wider uppercase">
        Clue Feed
      </div>
      <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {chat.length === 0 ? (
          <div className="text-slate-500 text-center italic mt-10">No clues submitted yet...</div>
        ) : (
          chat.map((msg, i) => (
            <div key={i} className="animate-in slide-in-from-right-4 duration-300">
              <div className="text-cyan-400 text-xs font-bold mb-1 uppercase tracking-wider">{msg.senderName}</div>
              <div className="bg-slate-800/90 text-white px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-700 shadow-md inline-block max-w-[90%]">
                "{msg.text}"
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Host Screens
function HostLanding() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-900/20 via-slate-950 to-slate-950 z-0"></div>
      
      <div className="relative z-10 w-full max-w-md space-y-12 text-center">
        <div className="space-y-4">
          <div className="text-8xl drop-shadow-[0_0_30px_rgba(6,182,212,0.5)]">🛸</div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter">
            IMPOSTER<br/><span className="text-rose-500 drop-shadow-[0_0_20px_rgba(244,63,94,0.6)]">GAME</span>
          </h1>
          <p className="text-cyan-200/60 font-medium tracking-widest uppercase text-sm">Find the imposter among you.</p>
        </div>
        
        <NeonButton onClick={() => { SFX.join(); nav('/create'); }}>
          START GAME (HOST)
        </NeonButton>

        {import.meta.env.VITE_BACKEND_URL && (
          <div className="text-xs text-slate-600 font-mono mt-8">Connected via {import.meta.env.VITE_BACKEND_URL}</div>
        )}
      </div>
    </div>
  );
}

function CreateGame() {
  const nav = useNavigate();
  const [config, setConfig] = useState({ maxPlayers: 8, imposters: 1, rounds: 3, genre: 'tech' });
  const genres = ['AI', 'IT', 'Tech', 'Cybersecurity', 'Locations', 'General'];

  const createRoom = () => {
    SFX.join();
    socket.auth = { isHost: true };
    const triggerCreate = () => { socket.emit('create_room', config); socket.off('connect', triggerCreate); };
    socket.on('connect', triggerCreate);
    if (socket.connected) socket.disconnect();
    socket.connect();
  };

  useEffect(() => {
    const handleRoomCreated = (id) => nav(`/host/${id}`);
    socket.on('room_created', handleRoomCreated);
    return () => socket.off('room_created', handleRoomCreated);
  }, [nav]);

  return (
    <div className="min-h-screen p-6 bg-slate-950 text-white flex items-center justify-center relative">
      <div className="absolute inset-0 opacity-20 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9IiMzMzMiLz48L3N2Zz4=')]"></div>
      
      <GlassCard className="w-full max-w-xl z-10">
        <h2 className="text-3xl font-black text-center mb-8 tracking-tight text-cyan-400">CONFIGURE GAME</h2>
        
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
              <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Players</label>
              <select className="w-full bg-transparent text-xl font-bold text-white focus:outline-none" value={config.maxPlayers} onChange={(e)=>setConfig({...config, maxPlayers: +e.target.value})}>
                {[3,4,5,6,7,8,9,10,11,12].map(n=><option key={n} value={n} className="bg-slate-800">{n}</option>)}
              </select>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
              <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Imposters</label>
              <select className="w-full bg-transparent text-xl font-bold text-white focus:outline-none" value={config.imposters} onChange={(e)=>setConfig({...config, imposters: +e.target.value})}>
                {[1,2].map(n=><option key={n} value={n} className="bg-slate-800">{n}</option>)}
              </select>
            </div>
          </div>
          
          <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2">Rounds</label>
            <div className="flex gap-2">
              {[1,2,3].map(r => (
                <button key={r} onClick={()=>setConfig({...config, rounds: r})} 
                  className={`flex-1 py-3 rounded-xl font-bold transition-all ${config.rounds === r ? 'bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50">
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-3">Topic Genre</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {genres.map(g => (
                <button key={g} onClick={()=>setConfig({...config, genre: g.toLowerCase()})}
                  className={`py-2 px-2 rounded-lg text-sm font-bold transition-all ${config.genre === g.toLowerCase() ? 'bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.4)]' : 'bg-slate-900 text-slate-400 hover:bg-slate-700'}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="mt-10">
          <NeonButton onClick={createRoom}>CREATE ROOM</NeonButton>
        </div>
      </GlassCard>
    </div>
  );
}

function HostView({ room }) {
  const nav = useNavigate();
  const startGame = () => { SFX.start(); socket.emit('force_start', room.id); };

  if (room.state === 'LOBBY_OPEN') {
    const joinUrl = `${window.location.protocol}//${window.location.host}/${room.id}`;
    return (
      <div className="min-h-screen bg-slate-950 p-4 md:p-8 flex flex-col md:flex-row gap-8 items-center justify-center">
        <GlassCard className="w-full md:w-1/3 flex flex-col items-center text-center space-y-6">
          <h2 className="text-cyan-400 font-bold uppercase tracking-widest text-sm">Join Room</h2>
          <div className="text-6xl md:text-8xl font-black tracking-tighter text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">{room.id}</div>
          <div className="bg-white p-4 rounded-2xl">
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(joinUrl)}`} alt="QR" className="w-48 h-48 md:w-64 md:h-64" />
          </div>
          <div className="text-slate-400 font-mono text-sm">{joinUrl}</div>
        </GlassCard>

        <div className="w-full md:w-1/2 space-y-6">
          <div className="flex justify-between items-end">
            <h2 className="text-3xl font-black text-white">PLAYERS</h2>
            <span className="text-cyan-400 font-bold">{room.players.length} / {room.config.maxPlayers}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {room.players.map(p => (
              <div key={p.id} className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 flex items-center gap-3 animate-in slide-in-from-bottom-4">
                <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-xl shrink-0">👾</div>
                <span className="font-bold text-white text-lg truncate">{p.name}</span>
              </div>
            ))}
            {[...Array(Math.max(0, room.config.maxPlayers - room.players.length))].map((_, i) => (
              <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-center gap-3 border-dashed">
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-700 text-xl shrink-0">?</div>
                <span className="font-bold text-slate-700 text-lg truncate">Waiting...</span>
              </div>
            ))}
          </div>
          <div className="pt-8">
            <NeonButton onClick={startGame} disabled={room.players.length < 3}>
              {room.players.length < 3 ? 'WAITING FOR PLAYERS...' : 'START GAME'}
            </NeonButton>
          </div>
        </div>
      </div>
    );
  }

  if (room.state === 'ROLE_REVEAL' || room.state === 'ROUND_CLUES') {
    const activePlayer = room.players.find(p => p.id === room.turn?.activePlayerId);
    return (
      <div className="min-h-screen bg-slate-950 p-4 md:p-8 flex flex-col h-screen overflow-hidden">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <div className="text-slate-400 font-bold tracking-widest">ROUND {room.currentRound} / {room.config.rounds}</div>
          <div className="text-slate-400 font-bold tracking-widest">ROOM {room.id}</div>
        </div>
        
        <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0">
          <div className="w-full md:w-2/3 flex-1 min-h-0 h-full">
            <ChatFeed chat={room.chat} />
          </div>
          <div className="w-full md:w-1/3 flex flex-col gap-6 shrink-0">
            <GlassCard className="flex flex-col items-center justify-center text-center py-10">
              <h3 className="text-cyan-400 font-bold tracking-widest text-sm mb-4">CURRENT TURN</h3>
              <div className="text-4xl font-black text-white mb-6 truncate w-full px-4">{activePlayer?.name || '---'}</div>
              <Timer turn={room.turn} />
            </GlassCard>
          </div>
        </div>
      </div>
    );
  }

  if (room.state === 'VOTING') {
    const votedCount = room.votesSubmitted.length;
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center">
        <GlassCard className="w-full max-w-2xl text-center space-y-8">
          <div className="text-rose-500 font-bold tracking-widest text-xl animate-pulse">VOTING PHASE</div>
          <h2 className="text-5xl font-black text-white">WHO IS THE IMPOSTER?</h2>
          <Timer turn={room.turn} />
          
          <div className="w-full bg-slate-800 rounded-full h-4 overflow-hidden mt-8">
            <div className="bg-cyan-500 h-full transition-all duration-500" style={{ width: `${(votedCount / room.players.length) * 100}%` }}></div>
          </div>
          <div className="text-slate-400 font-bold">{votedCount} / {room.players.length} VOTES SUBMITTED</div>
        </GlassCard>
      </div>
    );
  }

  if (room.state === 'ROUND_WAIT') {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center justify-center space-y-8">
        <div className="text-8xl animate-bounce">⏳</div>
        <h2 className="text-5xl font-black text-white text-center">ROUND COMPLETE</h2>
        <p className="text-xl text-cyan-400 font-bold animate-pulse text-center">PREPARING NEXT ROUND...</p>
      </div>
    );
  }

  if (room.state === 'GAME_END') {
    return (
      <div className="min-h-screen bg-slate-950 p-4 md:p-8 flex flex-col items-center overflow-y-auto">
        <div className="text-amber-500 font-bold tracking-widest text-2xl mb-2 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">🏆 GAME COMPLETE</div>
        <h1 className="text-4xl md:text-6xl font-black text-white mb-10 text-center">FINAL LEADERBOARD</h1>
        
        <div className="w-full max-w-5xl space-y-4">
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-slate-800/50 rounded-xl text-slate-400 font-bold text-sm tracking-wider uppercase">
            <div className="col-span-1">#</div>
            <div className="col-span-3">Player</div>
            <div className="col-span-2">Role</div>
            {[...Array(room.config.rounds)].map((_, i) => (
              <div key={i} className="col-span-1 text-center">R{i+1}</div>
            ))}
            <div className="col-span-3 text-right">Total</div>
          </div>
          
          {room.leaderboard.map((p, idx) => (
            <GlassCard key={p.id} className={`!p-0 overflow-hidden ${idx===0 ? 'border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.2)]' : ''}`}>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 md:p-6 items-center">
                <div className="col-span-1 flex items-center gap-2">
                  <span className={`text-3xl font-black ${idx===0 ? 'text-amber-500' : idx===1 ? 'text-slate-300' : idx===2 ? 'text-amber-700' : 'text-slate-600'}`}>#{idx+1}</span>
                </div>
                
                <div className="col-span-3 font-bold text-xl text-white truncate">{p.name}</div>
                
                <div className="col-span-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold inline-block ${p.role === 'imposter' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                    {p.role.toUpperCase()}
                  </span>
                </div>
                
                <div className="col-span-12 md:col-span-3 flex md:contents gap-4 my-4 md:my-0">
                  {[...Array(room.config.rounds)].map((_, i) => {
                    const score = p.roundScores?.[i+1] || 0;
                    return (
                      <div key={i} className="flex-1 md:col-span-1 flex flex-col md:items-center">
                        <span className="md:hidden text-xs text-slate-500 font-bold">R{i+1}</span>
                        <span className={`font-mono font-bold ${score > 0 ? 'text-cyan-400' : 'text-slate-500'}`}>+{score}</span>
                      </div>
                    );
                  })}
                </div>
                
                <div className="col-span-12 md:col-span-3 md:text-right flex justify-between md:block items-center border-t border-slate-800 pt-4 md:border-0 md:pt-0">
                  <span className="md:hidden text-slate-400 font-bold uppercase tracking-wider text-sm">Total</span>
                  <span className="text-4xl font-black text-white">{p.score}</span>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
        
        <div className="mt-12 flex gap-4 w-full max-w-md">
          <NeonButton onClick={() => { sessionStorage.clear(); nav('/'); }} variant="secondary">NEW GAME</NeonButton>
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
    const triggerJoin = () => { socket.emit('join_room', roomId.toUpperCase(), name); socket.off('connect', triggerJoin); };
    socket.on('connect', triggerJoin);
    if (socket.connected) socket.disconnect();
    socket.connect();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 z-0"></div>
      
      <GlassCard className="w-full max-w-sm z-10">
        <div className="text-center mb-8">
          <div className="text-cyan-400 font-bold uppercase tracking-widest text-sm mb-2">JOIN ROOM</div>
          <div className="text-5xl font-black text-white tracking-tighter">{roomId.toUpperCase()}</div>
        </div>
        
        <form onSubmit={joinRoom} className="space-y-6">
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-2 ml-1">Your Name</label>
            <input 
              type="text" 
              className="w-full bg-slate-800/80 border border-slate-600 rounded-2xl px-5 py-4 text-white font-bold text-xl focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all placeholder:text-slate-600"
              placeholder="e.g. Rahul"
              value={name} 
              onChange={e => setName(e.target.value)} 
              maxLength={12}
            />
          </div>
          {error && <div className="text-rose-400 text-sm font-bold bg-rose-500/10 p-3 rounded-lg">{error}</div>}
          <NeonButton onClick={joinRoom} disabled={!name.trim()}>JOIN GAME</NeonButton>
        </form>
      </GlassCard>
    </div>
  );
}

function PlayerView({ room, privateRole, onAcknowledgeRole }) {
  const myPlayer = room.players.find(p => p.id === socket.playerId);
  const [clue, setClue] = useState('');

  if (!myPlayer) return <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6 text-center text-xl font-bold">You were removed from the room.</div>;

  if (room.state === 'LOBBY_OPEN') {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center justify-center text-center space-y-8">
        <div className="w-24 h-24 bg-cyan-500/20 rounded-full flex items-center justify-center text-4xl mb-4 border border-cyan-500/30">👾</div>
        <h2 className="text-4xl font-black text-white">YOU'RE IN!</h2>
        <p className="text-slate-400 text-lg">Waiting for host to start...</p>
        <div className="bg-slate-900 px-6 py-3 rounded-full border border-slate-800 text-slate-300 font-bold uppercase tracking-widest text-sm">
          {room.players.length} Players joined
        </div>
      </div>
    );
  }

  // If role is revealed but player hasn't acknowledged it yet
  if (!myPlayer.roleAcknowledged) {
    const isImposter = privateRole?.role === 'imposter';
    return (
      <div className={`min-h-screen p-6 flex items-center justify-center relative ${isImposter ? 'bg-rose-950' : 'bg-slate-950'}`}>
        <div className={`absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] ${isImposter ? 'from-rose-900/40 via-rose-950 to-slate-950' : 'from-cyan-900/20 via-slate-950 to-slate-950'} z-0`}></div>
        
        <GlassCard className={`w-full max-w-sm z-10 text-center animate-in zoom-in duration-500 ${isImposter ? '!border-rose-500/50 shadow-[0_0_50px_rgba(244,63,94,0.3)]' : '!border-cyan-500/50 shadow-[0_0_50px_rgba(6,182,212,0.2)]'}`}>
          <div className="text-7xl mb-6">{isImposter ? '😈' : '🕵️'}</div>
          <h2 className={`text-3xl font-black tracking-tight mb-2 ${isImposter ? 'text-rose-400' : 'text-cyan-400'}`}>
            {isImposter ? 'YOU ARE THE IMPOSTER' : 'YOU ARE CREW'}
          </h2>
          
          {!isImposter && privateRole?.word && (
            <div className="mt-8 space-y-4">
              <div className="text-slate-400 text-xs font-bold uppercase tracking-widest">Secret Word</div>
              <div className="text-4xl font-black text-white bg-slate-800/80 py-4 rounded-xl border border-slate-700">{privateRole.word}</div>
              
              {privateRole.wordDescription && (
                <div className="mt-6 bg-emerald-900/30 border border-emerald-500/30 p-4 rounded-xl text-left">
                  <div className="text-emerald-400 text-xs font-bold tracking-widest mb-2 flex items-center gap-2">
                    <span>💡</span> DID YOU KNOW?
                  </div>
                  <p className="text-emerald-100 text-sm leading-relaxed">{privateRole.wordDescription}</p>
                </div>
              )}
            </div>
          )}

          {isImposter && (
            <div className="mt-8 text-rose-200/70 text-sm font-medium p-4 bg-rose-950/50 rounded-xl border border-rose-900/50">
              Blend in. Figure out the word from other players' clues. Do not get caught.
            </div>
          )}
          
          <div className="mt-10">
            <NeonButton onClick={onAcknowledgeRole} variant={isImposter ? 'danger' : 'primary'}>
              I'M READY
            </NeonButton>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (room.state === 'ROUND_CLUES') {
    const isMyTurn = room.turn?.activePlayerId === socket.playerId;
    const activePlayer = room.players.find(p => p.id === room.turn?.activePlayerId);

    // Fire player_ready_for_turn if it's my turn and server is waiting
    useEffect(() => {
      if (isMyTurn && room.turn?.isWaitingForReady) {
        socket.emit('player_ready_for_turn');
      }
    }, [isMyTurn, room.turn?.isWaitingForReady]);

    return (
      <div className="min-h-screen bg-slate-950 p-4 md:p-8 flex flex-col md:flex-row gap-4 h-screen overflow-hidden">
        {/* Mobile: Top Info */}
        <div className="md:hidden flex justify-between items-center bg-slate-900 p-4 rounded-2xl border border-slate-800 shrink-0">
          <div className="font-bold text-slate-300">R{room.currentRound}</div>
          <Timer turn={room.turn} small />
          <div className={`font-bold ${privateRole?.role === 'imposter' ? 'text-rose-400' : 'text-cyan-400'}`}>
            {privateRole?.role === 'imposter' ? 'IMPOSTER' : 'CREW'}
          </div>
        </div>

        {/* Clue Feed */}
        <div className="flex-1 md:w-2/3 min-h-0 order-2 md:order-1 h-full">
          <ChatFeed chat={room.chat} />
        </div>
        
        {/* Input / Turn Status */}
        <div className="md:w-1/3 shrink-0 order-1 md:order-2 space-y-4">
          <GlassCard className="hidden md:flex flex-col items-center justify-center py-8">
            <div className="text-cyan-400 font-bold tracking-widest text-sm mb-4">TIME REMAINING</div>
            <Timer turn={room.turn} />
          </GlassCard>

          <GlassCard className="flex flex-col items-center justify-center p-6 text-center">
            {isMyTurn ? (
              <div className="w-full space-y-6 animate-in slide-in-from-bottom-4">
                <div className="text-amber-400 font-black tracking-widest text-xl drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]">YOUR TURN!</div>
                <input 
                  type="text"
                  className="w-full bg-slate-800 border-2 border-amber-500/50 rounded-xl px-4 py-4 text-white font-bold text-lg focus:outline-none focus:border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                  placeholder="Type your clue..."
                  value={clue}
                  onChange={e => setClue(e.target.value)}
                  maxLength={40}
                  onKeyDown={e => { if (e.key === 'Enter' && clue.trim()) { socket.emit('submit_clue', clue); setClue(''); } }}
                />
                <NeonButton 
                  onClick={() => { socket.emit('submit_clue', clue); setClue(''); }} 
                  disabled={!clue.trim() || room.turn?.turnResolved}
                  variant="primary"
                >
                  SUBMIT CLUE
                </NeonButton>
              </div>
            ) : (
              <div className="py-6 space-y-4">
                <div className="text-slate-400 font-bold uppercase tracking-widest text-sm">WAITING FOR</div>
                <div className="text-3xl font-black text-white truncate px-2">{activePlayer?.name || '---'}</div>
                <div className="text-slate-500 text-sm mt-4">Think of your clue...</div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    );
  }

  if (room.state === 'VOTING') {
    const hasVoted = room.votesSubmitted.includes(socket.playerId);
    const [voteFor, setVoteFor] = useState('');
    const [confidence, setConfidence] = useState(50);
    
    if (hasVoted) return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-8">
        <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center text-5xl border border-emerald-500/30">✓</div>
        <h2 className="text-3xl font-black text-white">VOTE LOCKED IN</h2>
        <p className="text-slate-400 font-bold">Waiting for others...</p>
      </div>
    );

    return (
      <div className="min-h-screen bg-slate-950 p-4 md:p-6 flex flex-col h-screen overflow-hidden">
        <GlassCard className="flex-1 overflow-y-auto max-w-lg mx-auto w-full flex flex-col">
          <div className="text-center mb-6 shrink-0">
            <h2 className="text-3xl font-black text-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.3)] mb-2">VOTE NOW</h2>
            <div className="text-slate-400 font-bold text-sm">Who is the Imposter?</div>
            <div className="mt-4"><Timer turn={room.turn} small /></div>
          </div>
          
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto min-h-0 px-2 py-4">
            {room.players.map(p => {
              if (p.id === socket.playerId) return null;
              const isSelected = voteFor === p.id;
              return (
                <button key={p.id} onClick={() => { SFX.turn(); setVoteFor(p.id); }}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all font-bold text-lg ${isSelected ? 'bg-rose-500/20 border-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.3)]' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                  {p.name}
                </button>
              );
            })}
          </div>

          {room.currentRound >= 2 && voteFor && (
            <div className="shrink-0 mt-6 bg-slate-900 p-4 rounded-xl border border-slate-800 animate-in fade-in slide-in-from-bottom-4">
              <label className="block text-center text-cyan-400 font-bold mb-4">CONFIDENCE: {confidence}%</label>
              <input type="range" min="0" max="100" step="10" value={confidence} onChange={e => setConfidence(e.target.value)}
                className="w-full accent-cyan-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
            </div>
          )}

          <div className="shrink-0 mt-6">
            <NeonButton onClick={() => socket.emit('submit_vote', { voteFor, confidence: Number(confidence) })} disabled={!voteFor} variant="danger">
              CONFIRM VOTE
            </NeonButton>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (room.state === 'ROUND_WAIT') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
        <GlassCard className="w-full max-w-sm space-y-6">
          <div className="text-6xl animate-bounce">⏱️</div>
          <h2 className="text-3xl font-black text-white">GET READY</h2>
          <p className="text-cyan-400 font-bold uppercase tracking-widest text-sm">Round {room.currentRound + 1} starting soon</p>
        </GlassCard>
      </div>
    );
  }

  if (room.state === 'GAME_END') {
    return (
      <div className="min-h-screen bg-slate-950 p-4 md:p-8 flex flex-col items-center">
        <div className="text-rose-500 font-bold tracking-widest text-xl mb-6">GAME COMPLETE</div>
        
        <div className="w-full max-w-lg space-y-4">
          {room.leaderboard.map((p, idx) => (
            <div key={p.id} className={`p-4 rounded-2xl border ${p.id === socket.playerId ? 'bg-cyan-900/30 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.2)]' : 'bg-slate-800/50 border-slate-700'}`}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <span className={`text-2xl font-black ${idx===0 ? 'text-amber-500' : 'text-slate-500'}`}>#{idx+1}</span>
                  <span className="font-bold text-white text-lg truncate max-w-[150px] md:max-w-[200px]">{p.name} {p.id === socket.playerId && '(YOU)'}</span>
                </div>
                <div className="text-3xl font-black text-white">{p.score}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
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
        // preserve roleAcknowledged state
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
    <div className="bg-slate-950 min-h-screen text-slate-50 font-sans selection:bg-cyan-500/30">
      {error && (
        <div className="fixed top-0 left-0 w-full bg-rose-600/90 backdrop-blur text-white p-4 z-50 text-center font-bold shadow-lg border-b border-rose-500 animate-in slide-in-from-top-4 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xl px-2 opacity-70 hover:opacity-100">&times;</button>
        </div>
      )}
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HostLanding />} />
          <Route path="/create" element={<CreateGame />} />
          <Route path="/host/:roomId" element={room ? <HostView room={room} /> : <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-cyan-400 text-xl font-bold animate-pulse">Loading Room...</div></div>} />
          <Route path="/:roomId" element={room ? <PlayerView room={room} privateRole={privateRole} onAcknowledgeRole={handleAcknowledgeRole} /> : <PlayerJoin />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
