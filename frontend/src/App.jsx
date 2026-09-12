import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { socket } from './socket';

// Synth SFX Engine
const SFX = {
  playTone: (freq, type, duration, vol = 0.1) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  },
  join: () => SFX.playTone(880, 'sine', 0.2),
  start: () => SFX.playTone(110, 'sawtooth', 3.0, 0.3), 
  turn: () => SFX.playTone(523.25, 'square', 0.1),
  vote: () => SFX.playTone(440, 'triangle', 0.5),
  win: () => { 
    SFX.playTone(523.25, 'sine', 0.1); 
    setTimeout(()=>SFX.playTone(659.25, 'sine', 0.1), 150); 
    setTimeout(()=>SFX.playTone(783.99, 'sine', 0.4), 300);
  }
};

export default function App() {
  const [gameState, setGameState] = useState(null);
  const [localDeadline, setLocalDeadline] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [error, setError] = useState('');
  const [myPlayerId, setMyPlayerId] = useState('');
  const [privateRole, setPrivateRole] = useState(null);
  const [roleAcknowledged, setRoleAcknowledged] = useState(false);
  const [lastState, setLastState] = useState('');

  useEffect(() => {
    const onJoinSuccess = (data) => { 
      setMyPlayerId(data.playerId); 
      sessionStorage.setItem(`imposterToken_${data.roomId}`, data.token);
      SFX.join();
      setError(''); 
    };

    const onError = (msg) => {
      setError(msg);
      // Clean up stale sessions on invalid tokens or missing rooms
      if (msg === 'Invalid token' || msg === 'Room not found') {
        const pathRoom = window.location.pathname.replace('/', '').toUpperCase();
        if (pathRoom) {
          sessionStorage.removeItem(`imposterToken_${pathRoom}`);
          setMyPlayerId('');
        }
      }
    };

    const onSyncState = (state) => {
      setGameState(state);
      if (state.turn && state.turn.remainingMs > 0) setLocalDeadline(Date.now() + state.turn.remainingMs);
      else setLocalDeadline(0);
    };

    const onPrivateRole = (data) => {
       setPrivateRole(data);
       setRoleAcknowledged(false); 
    };

    const onConnectError = (err) => {
      setError(`Connection failed: ${err.message}. Check backend URL.`);
    };

    socket.on('join_success', onJoinSuccess);
    socket.on('error', onError);
    socket.on('connect_error', onConnectError);
    socket.on('sync_state', onSyncState);
    socket.on('private_role', onPrivateRole);

    return () => {
      socket.off('join_success', onJoinSuccess); 
      socket.off('error', onError); 
      socket.off('connect_error', onConnectError);
      socket.off('sync_state', onSyncState); 
      socket.off('private_role', onPrivateRole);
    };
  }, []);

  useEffect(() => {
    if (gameState && gameState.state !== lastState) {
      if (gameState.state === 'ROLE_REVEAL' || (gameState.state === 'ROUND_CLUES' && lastState === 'LOBBY_OPEN')) SFX.start();
      if (gameState.state === 'ROUND_CLUES' && lastState !== 'LOBBY_OPEN') SFX.turn();
      if (gameState.state === 'VOTING') SFX.vote();
      if (gameState.state === 'GAME_END') SFX.win();
      setLastState(gameState.state);
    }
  }, [gameState?.state, lastState]);

  useEffect(() => {
    if (localDeadline === 0) return;
    let frameId;
    const tick = () => {
      const remaining = Math.max(0, localDeadline - Date.now());
      setTimeRemaining(Math.ceil(remaining / 1000));
      if (remaining > 0) frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [localDeadline]);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-b from-[#0a0f1d] to-[#050810] text-[#e2e8f0] font-sans selection:bg-blue-500/30 flex flex-col relative overflow-x-hidden">
        
        <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none -z-10"></div>
        <div className="fixed bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-purple-600/10 rounded-full blur-[150px] pointer-events-none -z-10"></div>
        
        <div className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-6 flex flex-col z-10">
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl shadow-lg mb-6 flex items-center justify-between gap-3 backdrop-blur-md animate-in slide-in-from-top-4">
              <div className="flex items-center gap-3">
                <span className="text-xl">⚠️</span>
                <p className="font-bold">{error}</p>
              </div>
              <button onClick={() => setError('')} className="text-red-300 hover:text-white font-bold text-lg">×</button>
            </div>
          )}
          <Routes>
            <Route path="/" element={<HostLanding />} />
            <Route path="/create" element={<CreateGame />} />
            <Route path="/host/:roomId" element={<HostView gameState={gameState} timeRemaining={timeRemaining} />} />
            <Route path="/:roomId" element={<PlayerFlow gameState={gameState} myPlayerId={myPlayerId} setMyPlayerId={setMyPlayerId} privateRole={privateRole} timeRemaining={timeRemaining} roleAcknowledged={roleAcknowledged} setRoleAcknowledged={setRoleAcknowledged} />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

// ----------------------------------------------------------------------------------
// COMPONENTS
// ----------------------------------------------------------------------------------

function HostLanding() {
  const nav = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] animate-in fade-in duration-700">
      <div className="text-center space-y-6 flex flex-col items-center">
        <div className="relative mb-8">
           <div className="text-9xl relative z-10 drop-shadow-[0_0_30px_rgba(239,68,68,0.3)]">👨‍🚀</div>
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-8xl text-red-500 -z-10 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite] opacity-50">👨‍🚀</div>
        </div>
        
        <h1 className="text-6xl md:text-8xl font-black tracking-tight text-white drop-shadow-md">
          IMPOSTER<br/><span className="text-red-500">GAME</span>
        </h1>
        <p className="text-lg text-[#94a3b8] font-medium tracking-wide max-w-md mx-auto mt-4">
          Same people. Different clues.<br/>Find the Imposter!
        </p>
        
        <div className="pt-8 w-full max-w-xs">
          <button 
            onClick={() => { SFX.join(); nav('/create'); }} 
            className="w-full py-4 bg-[#f43f5e] hover:bg-[#e11d48] text-white font-bold rounded-2xl text-xl shadow-[0_8px_0_#9f1239] hover:translate-y-1 hover:shadow-[0_4px_0_#9f1239] transition-all"
          >
            Start the Game (Host)
          </button>
        </div>

        <p className="text-xs text-gray-600 mt-10">Target Backend: {import.meta.env.VITE_BACKEND_URL || 'NONE (Using Local fallback)'}</p>
      </div>
    </div>
  );
}

function CreateGame() {
  const nav = useNavigate();
  const [config, setConfig] = useState({ maxPlayers: 8, imposters: 1, rounds: 3, genre: 'general' });
  
  useEffect(() => {
    const handleRoomCreated = (id) => nav(`/host/${id}`);
    socket.on('room_created', handleRoomCreated);
    return () => socket.off('room_created', handleRoomCreated);
  }, [nav]);

  const createRoom = () => {
    SFX.join();
    socket.auth = { isHost: true };
    
    const triggerCreate = () => {
      socket.emit('create_room', config);
      socket.off('connect', triggerCreate);
    };

    socket.on('connect', triggerCreate);
    if (socket.connected) {
      socket.disconnect();
    }
    socket.connect();
  };

  const genres = ['AI', 'IT', 'Tech', 'Cybersecurity', 'Locations', 'General', 'Science', 'Movies', 'History'];

  return (
    <div className="max-w-md mx-auto w-full animate-in zoom-in-95 duration-500 mt-6">
      <div className="bg-[#111827] border border-[#1f2937] rounded-[32px] p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-block bg-[#1e40af]/20 p-3 rounded-full mb-4">
             <span className="text-3xl">⚙️</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-wide">CREATE GAME</h2>
          <p className="text-[#64748b] text-sm mt-1">Set up your game configuration</p>
        </div>
        
        <div className="space-y-5">
          <div className="flex justify-between items-center bg-[#1e293b] p-4 rounded-2xl">
            <label className="text-sm font-bold text-[#94a3b8]">Number of Players</label>
            <select 
              value={config.maxPlayers} 
              onChange={e=>setConfig({...config, maxPlayers:parseInt(e.target.value)})}
              className="bg-[#0f172a] border border-[#334155] rounded-xl px-4 py-2 text-white font-bold outline-none"
            >
               {[3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          
          <div className="flex justify-between items-center bg-[#1e293b] p-4 rounded-2xl">
            <label className="text-sm font-bold text-[#94a3b8]">Imposters</label>
            <select 
              value={config.imposters} 
              onChange={e=>setConfig({...config, imposters:parseInt(e.target.value)})}
              className="bg-[#0f172a] border border-[#334155] rounded-xl px-4 py-2 text-white font-bold outline-none"
            >
               {[1,2].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          
          <div className="flex justify-between items-center bg-[#1e293b] p-4 rounded-2xl">
            <label className="text-sm font-bold text-[#94a3b8]">Rounds</label>
            <select 
              value={config.rounds} 
              onChange={e=>setConfig({...config, rounds:parseInt(e.target.value)})}
              className="bg-[#0f172a] border border-[#334155] rounded-xl px-4 py-2 text-white font-bold outline-none"
            >
               {[1,2,3].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          
          <div className="pt-2">
            <label className="text-sm font-bold text-[#94a3b8] block mb-3 pl-1">Genre (Select one)</label>
            <div className="flex flex-wrap gap-2">
              {genres.map(g => {
                const isSelected = config.genre === g.toLowerCase();
                return (
                  <button
                    key={g}
                    onClick={() => setConfig({...config, genre: g.toLowerCase()})}
                    className={`py-2 px-4 rounded-xl text-sm font-bold transition-all ${isSelected ? 'bg-[#3b82f6] text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'bg-[#1e293b] text-[#94a3b8] hover:bg-[#334155]'}`}
                  >
                    {isSelected && <span className="mr-1">✓</span>} {g}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        
        <div className="mt-10">
          <button 
            onClick={createRoom} 
            className="w-full py-4 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold rounded-2xl text-xl shadow-[0_6px_0_#1d4ed8] hover:translate-y-1 hover:shadow-[0_2px_0_#1d4ed8] transition-all"
          >
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
}

function HostView({ gameState, timeRemaining }) {
  const { roomId } = useParams();
  
  useEffect(() => {
    if (roomId) {
      socket.auth = { isHost: true };
      if (socket.connected) socket.disconnect();
      socket.connect();
      
      const onConnect = () => {
        socket.emit('join_host', roomId.toUpperCase());
      };
      
      socket.on('connect', onConnect);
      return () => socket.off('connect', onConnect);
    }
  }, [roomId]);
  
  if (!gameState) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#334155] border-t-[#3b82f6]"></div>
      <p className="text-[#94a3b8] font-bold tracking-widest">CONNECTING TO ROOM...</p>
    </div>
  );

  if (gameState.state === 'LOBBY_OPEN') {
    const joined = gameState.players.filter(p => p.active).length;
    const max = gameState.config.maxPlayers;
    const allJoined = joined >= max;
    const joinUrl = `${window.location.origin}/${roomId}`;

    return (
      <div className="max-w-md mx-auto w-full animate-in fade-in duration-500 mt-6">
        <div className="bg-[#111827] border border-[#1f2937] rounded-[32px] p-8 shadow-2xl flex flex-col items-center">
          
          <div className="flex items-center gap-2 mb-2">
             <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-black font-bold text-xs">✓</div>
             <h2 className="text-xl font-bold text-white tracking-wide">ROOM CREATED!</h2>
          </div>
          <p className="text-[#64748b] text-sm mb-8">Share this with your players</p>

          <h3 className="text-lg font-bold text-[#94a3b8] mb-2">ROOM: <span className="text-[#3b82f6] text-3xl font-black">{roomId}</span></h3>
          
          <div className="bg-white p-4 rounded-2xl shadow-lg mb-4">
             <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&margin=0&data=${encodeURIComponent(joinUrl)}`} alt="QR Code" className="w-48 h-48 rounded-lg" />
          </div>
          <p className="text-sm font-bold text-[#94a3b8] mb-2">Scan QR to Join</p>
          <p className="text-xs text-[#64748b] mb-2">or</p>
          
          <div className="bg-[#1e293b] rounded-xl px-4 py-3 flex items-center gap-2 mb-8 w-full justify-center">
            <span className="text-[#94a3b8] font-bold">Join:</span>
            <span className="text-white font-bold tracking-wide">{window.location.host}/{roomId}</span>
          </div>

          <div className="w-full text-left mb-6">
            <p className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-3">Players ({joined} / {max} Joined)</p>
            <div className="grid grid-cols-2 gap-y-3 gap-x-6">
              {Array.from({length: max}).map((_, i) => {
                 const p = gameState.players[i];
                 const isActive = p?.active;
                 return (
                   <div key={i} className="flex items-center gap-2">
                     <span className="text-[#64748b] text-sm font-mono">{i+1}.</span>
                     <span className={`text-sm font-bold truncate ${isActive ? 'text-[#34d399]' : 'text-[#475569]'}`}>
                       {isActive ? p.name : '—'}
                     </span>
                     {isActive && <div className="w-2 h-2 bg-[#34d399] rounded-full shadow-[0_0_8px_#34d399]"></div>}
                   </div>
                 );
              })}
            </div>
          </div>
          
          <button 
            onClick={() => { SFX.start(); socket.emit('force_start', roomId); }} 
            className={`w-full py-4 rounded-2xl font-bold text-lg transition-all ${allJoined ? 'bg-[#3b82f6] hover:bg-[#2563eb] text-white shadow-[0_6px_0_#1d4ed8] hover:translate-y-1 hover:shadow-[0_2px_0_#1d4ed8]' : 'bg-[#1e293b] text-[#64748b] cursor-not-allowed'}`}
          >
            {allJoined ? 'Start Game' : `Start Game (${max} needed)`}
          </button>
        </div>
      </div>
    );
  }
  
  if (gameState.state === 'GAME_END') {
    return (
      <div className="max-w-md mx-auto w-full mt-6 animate-in zoom-in duration-500">
        <div className="bg-[#111827] border border-[#1f2937] rounded-[32px] p-8 shadow-2xl text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h1 className="text-2xl font-black text-white mb-1">Game Complete!</h1>
          <p className="text-[#94a3b8] font-medium text-sm mb-8">Final Leaderboard</p>
          
          <div className="space-y-3 text-left mb-10">
            {gameState.leaderboard.map((p, i) => (
               <div key={p.id} className="flex items-center justify-between bg-[#1e293b] p-4 rounded-2xl">
                 <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-[#334155] flex items-center justify-center font-bold text-white text-sm">
                     {i+1}
                   </div>
                   <div className="w-8 h-8 flex items-center justify-center text-xl">
                     {i === 0 ? '👑' : '👨‍🚀'}
                   </div>
                   <p className="font-bold text-white text-lg">{p.name}</p>
                 </div>
                 <span className="text-xl font-black text-[#f59e0b]">{p.score}</span>
               </div>
            ))}
          </div>

          <div className="flex gap-4">
            <button onClick={() => window.location.href='/'} className="flex-1 py-4 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold rounded-xl transition-all shadow-[0_4px_0_#1d4ed8]">New Game</button>
            <button onClick={() => window.location.href='/'} className="flex-1 py-4 bg-[#1e293b] text-white font-bold rounded-xl transition-all hover:bg-[#334155]">Back to Home</button>
          </div>
        </div>
      </div>
    );
  }

  // HOST IN-GAME (Audience view)
  return (
    <div className="max-w-4xl mx-auto mt-6 px-4">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-xl font-bold text-[#94a3b8]">ROOM <span className="text-white">{roomId}</span></h2>
        <div className="bg-[#1e293b] px-4 py-1.5 rounded-full border border-[#334155] text-[#34d399] font-bold text-sm">ROUND {gameState.currentRound} / {gameState.config.rounds}</div>
      </div>
      
      <div className="bg-[#111827] border border-[#1f2937] rounded-[32px] p-8 md:p-12 shadow-2xl relative overflow-hidden text-center">
        {gameState.state === 'ROUND_CLUES' && gameState.turn && (
          <div className="animate-in slide-in-from-bottom-8 duration-500">
            <h2 className="text-xl text-[#94a3b8] font-bold mb-6">Current Turn</h2>
            <div className="inline-block bg-[#f43f5e] px-8 py-4 rounded-2xl mb-8 shadow-[0_0_30px_rgba(244,63,94,0.3)]">
               <h1 className="text-4xl font-black text-white">{gameState.players.find(p=>p.id===gameState.turn.activePlayerId)?.name}'s Turn</h1>
            </div>
            
            <p className="text-[#94a3b8] font-medium mb-12 animate-pulse">{gameState.players.find(p=>p.id===gameState.turn.activePlayerId)?.name} is giving a clue...</p>
            
            <div className="absolute top-8 right-8 flex items-center gap-2 bg-[#1e293b] px-4 py-2 rounded-full border border-[#334155]">
              <span className="text-xl">⏱️</span>
              <span className={`text-xl font-black ${timeRemaining <= 10 ? 'text-[#f43f5e]' : 'text-[#34d399]'}`}>{timeRemaining}s</span>
            </div>
          </div>
        )}
        
        {gameState.state === 'VOTING' && (
          <div className="animate-in zoom-in duration-500 my-10">
            <h2 className="text-4xl font-black text-[#f59e0b] tracking-wide mb-6">Voting in Progress...</h2>
            <div className="flex justify-center items-center gap-4 mb-10">
               <span className="text-6xl font-black text-white">{gameState.votesSubmitted.length}</span>
               <span className="text-4xl text-[#64748b]">/</span>
               <span className="text-6xl font-black text-[#94a3b8]">{gameState.players.filter(p => p.active).length}</span>
            </div>
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl">⏳</span>
              <h1 className="text-5xl font-black text-[#34d399] tabular-nums">{timeRemaining}s</h1>
            </div>
          </div>
        )}

        {gameState.state === 'ROUND_WAIT' && (
          <div className="animate-in fade-in duration-500 my-16">
            <div className="text-6xl mb-6">⌛</div>
            <h2 className="text-3xl font-black text-white mb-2">Round Complete!</h2>
            <p className="text-[#94a3b8]">Calculating results...</p>
          </div>
        )}
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-bold text-[#64748b] uppercase tracking-wider mb-4 ml-4">Clue Transcript</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {gameState.players.filter(p=>p.active).map(p => {
             const clue = gameState.chat.find(c => c.senderName === p.name);
             return (
               <div key={p.id} className="bg-[#1e293b] rounded-2xl p-4 border border-[#334155] flex flex-col justify-center min-h-[80px]">
                 <span className="font-bold text-sm text-[#94a3b8] mb-1">{p.name}</span>
                 <span className={`text-lg font-medium ${clue ? 'text-white' : 'text-[#64748b] italic'}`}>
                   {clue ? clue.text : '...'}
                 </span>
               </div>
             );
           })}
        </div>
      </div>
    </div>
  );
}

function PlayerFlow({ gameState, myPlayerId, setMyPlayerId, privateRole, timeRemaining, roleAcknowledged, setRoleAcknowledged }) {
  const { roomId } = useParams();
  const [name, setName] = useState('');
  const [clueInput, setClueInput] = useState('');
  const [voteFor, setVoteFor] = useState('');
  const [confidence, setConfidence] = useState(100);

  // Safely restore isolated session if it matches the current room route
  useEffect(() => {
    const token = sessionStorage.getItem(`imposterToken_${roomId.toUpperCase()}`);
    if (token) {
      socket.auth = { token };
      if (socket.connected) socket.disconnect();
      socket.connect();
      
      const onConnect = () => {
        socket.emit('resume_session');
      };
      
      socket.on('connect', onConnect);
      return () => socket.off('connect', onConnect);
    }
  }, [roomId]);

  const joinGame = (e) => {
    e.preventDefault();
    SFX.join();
    socket.auth = {}; // Clear any previous auth when explicitly joining fresh
    if (socket.connected) socket.disconnect();
    socket.connect();
    
    const onConnect = () => {
      socket.emit('join_room', roomId.toUpperCase(), name);
      socket.off('connect', onConnect);
    };
    socket.on('connect', onConnect);
  };

  if (!gameState || gameState.state === 'LOBBY_OPEN') {
     if (!myPlayerId) {
       return (
         <div className="max-w-md mx-auto w-full mt-10 animate-in fade-in duration-500">
           <div className="bg-[#111827] border border-[#1f2937] rounded-[32px] p-8 shadow-2xl text-center">
             <div className="text-7xl mb-6">👥</div>
             <h2 className="text-3xl font-black text-white tracking-wide mb-2">JOIN GAME</h2>
             <p className="text-[#94a3b8] font-medium text-sm mb-8">Enter your name to join the game</p>
             
             <h3 className="text-lg font-bold text-[#64748b] mb-6">ROOM: <span className="text-[#3b82f6] text-2xl font-black">{roomId.toUpperCase()}</span></h3>
             
             <form onSubmit={joinGame} className="space-y-6 text-left">
               <div>
                 <label className="text-sm font-bold text-[#94a3b8] block mb-2">Player Name</label>
                 <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#64748b]">👤</div>
                   <input 
                     placeholder="Enter your name..." 
                     value={name} 
                     onChange={e=>setName(e.target.value)} 
                     required 
                     className="w-full bg-[#1e293b] border border-[#334155] rounded-xl pl-12 pr-4 py-4 text-white text-lg font-bold focus:ring-2 focus:ring-[#3b82f6] outline-none transition-all placeholder:text-[#475569]"
                   />
                 </div>
               </div>
               <button type="submit" className="w-full py-4 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold rounded-2xl text-xl transition-all shadow-[0_6px_0_#1d4ed8] hover:translate-y-1 hover:shadow-[0_2px_0_#1d4ed8]">Join Game</button>
             </form>
           </div>
         </div>
       );
     }
     
     const max = gameState ? gameState.config.maxPlayers : 8;
     const joined = gameState ? gameState.players.filter(p=>p.active).length : 1;
     return (
       <div className="max-w-md mx-auto w-full mt-10 animate-in slide-in-from-bottom-4 duration-500">
         <div className="bg-[#111827] border border-[#1f2937] rounded-[32px] p-8 shadow-2xl text-center">
           <div className="flex items-center justify-center gap-3 mb-2">
              <span className="text-2xl animate-spin-slow">🕒</span>
              <h2 className="text-2xl font-black text-white tracking-wide">WAITING FOR HOST</h2>
           </div>
           <p className="text-[#94a3b8] text-sm mb-8">The game will start soon...</p>
           
           <h3 className="text-lg font-bold text-[#64748b] mb-8">ROOM: <span className="text-[#3b82f6] text-2xl font-black">{roomId.toUpperCase()}</span></h3>
           
           <div className="text-left mb-8">
             <p className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-4">Players ({joined} / {max})</p>
             <div className="grid grid-cols-2 gap-y-4 gap-x-4">
               {Array.from({length: max}).map((_, i) => {
                 const p = gameState?.players[i];
                 const isMe = p?.id === myPlayerId;
                 return (
                   <div key={i} className="flex items-center gap-2">
                     <span className="text-[#64748b] text-sm font-mono font-bold">{i+1}.</span>
                     <span className={`text-sm font-bold truncate ${p?.active ? (isMe ? 'text-[#34d399]' : 'text-white') : 'text-[#475569]'}`}>
                       {p?.active ? p.name : '—'}
                     </span>
                     {p?.active && <div className={`w-2 h-2 rounded-full ${isMe ? 'bg-[#34d399] shadow-[0_0_8px_#34d399]' : 'bg-[#3b82f6]'}`}></div>}
                   </div>
                 );
               })}
             </div>
           </div>
           
           <div className="bg-[#1e293b] rounded-xl p-4 border border-[#334155]">
             <p className="text-sm font-medium text-[#94a3b8]">Waiting for the host to start the game.<br/>Please stay on this page.</p>
           </div>
           
           <div className="flex justify-center gap-2 mt-8 opacity-50">
             <div className="text-4xl text-[#3b82f6]">👨‍🚀</div>
             <div className="text-4xl text-[#f43f5e]">👨‍🚀</div>
             <div className="text-4xl text-[#f59e0b]">👨‍🚀</div>
           </div>
         </div>
       </div>
     );
  }

  // OVERLAY IDENTITY SCREEN
  if (privateRole && !roleAcknowledged) {
    const isImposter = privateRole.role === 'imposter';
    return (
      <div className="fixed inset-0 z-50 bg-[#0a0f1d]/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in zoom-in duration-300">
         <div className={`w-full max-w-md rounded-[32px] p-8 shadow-2xl border ${isImposter ? 'bg-[#111827] border-[#7f1d1d]' : 'bg-[#111827] border-[#065f46]'}`}>
           
           <h2 className="text-xl font-bold text-white text-center mb-10 tracking-widest">YOUR IDENTITY</h2>
           
           {isImposter ? (
             <div className="text-center flex flex-col items-center">
               <div className="text-[120px] mb-4 drop-shadow-[0_0_30px_rgba(244,63,94,0.4)]">👨‍🚀</div>
               <h1 className="text-5xl font-black text-[#f43f5e] mb-4">IMPOSTER</h1>
               <p className="text-[#94a3b8] text-sm font-medium max-w-[200px] leading-relaxed mb-10">
                 You are the Imposter. Blend in and don't get caught!
               </p>
             </div>
           ) : (
             <div className="text-center flex flex-col items-center">
               <div className="text-[120px] mb-4 drop-shadow-[0_0_30px_rgba(52,211,153,0.4)]">👨‍🚀</div>
               <h1 className="text-4xl font-black text-[#34d399] mb-4">CREW MEMBER</h1>
               <p className="text-[#94a3b8] text-sm font-medium max-w-[250px] leading-relaxed mb-10">
                 You are a crew member. Work with others to find the Imposter!
               </p>
               <div className="bg-[#1e293b] px-6 py-3 rounded-xl border border-[#334155] mb-6 inline-block w-full">
                 <p className="text-xs text-[#64748b] font-bold uppercase mb-1">Secret Word</p>
                 <p className="text-3xl font-black text-white">{privateRole.word}</p>
               </div>
             </div>
           )}
           
           <button onClick={() => { SFX.join(); setRoleAcknowledged(true); }} className={`w-full py-4 text-white font-bold rounded-2xl text-xl transition-all shadow-[0_6px_0_rgba(0,0,0,0.3)] hover:translate-y-1 ${isImposter ? 'bg-[#f43f5e] hover:bg-[#e11d48]' : 'bg-[#34d399] hover:bg-[#10b981] text-[#022c22]'}`}>
             Next
           </button>
         </div>
      </div>
    );
  }

  if (gameState.state === 'GAME_END') {
     return (
       <div className="max-w-md mx-auto w-full mt-6 animate-in fade-in duration-500">
         <div className="bg-[#111827] border border-[#1f2937] rounded-[32px] p-8 shadow-2xl text-center">
           <div className="text-6xl mb-4">🏆</div>
           <h1 className="text-2xl font-black text-white mb-1">Game Complete!</h1>
           <p className="text-[#94a3b8] font-medium text-sm mb-8">Final Leaderboard</p>
           
           <div className="space-y-3 text-left mb-10">
             {gameState.leaderboard.map((p, i) => {
                const isMe = p.id === myPlayerId;
                return (
                  <div key={p.id} className={`flex items-center justify-between p-4 rounded-2xl border ${isMe ? 'bg-[#1e3a8a]/20 border-[#3b82f6]' : 'bg-[#1e293b] border-[#334155]'}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#334155] flex items-center justify-center font-bold text-white text-sm">
                        {i+1}
                      </div>
                      <div className="w-8 h-8 flex items-center justify-center text-xl">
                        {i === 0 ? '👑' : '👨‍🚀'}
                      </div>
                      <p className="font-bold text-white text-lg">{p.name} {isMe && '(You)'}</p>
                    </div>
                    <span className="text-xl font-black text-[#f59e0b]">{p.score}</span>
                  </div>
                );
             })}
           </div>

           <button onClick={() => window.location.href='/'} className="w-full py-4 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold rounded-xl transition-all shadow-[0_4px_0_#1d4ed8] hover:translate-y-1">Back to Home</button>
         </div>
       </div>
     );
  }

  return (
    <div className="max-w-md mx-auto mt-4 pb-20 w-full animate-in slide-in-from-bottom-4 duration-300">
      
      <div className="flex justify-between items-center bg-[#111827] p-4 rounded-t-3xl border-b border-[#1f2937]">
        <div className="text-sm font-bold text-[#94a3b8]">Round <span className="text-white">{gameState.currentRound}</span> of {gameState.config.rounds}</div>
        <div className="flex items-center gap-3">
          {gameState.state !== 'ROUND_WAIT' && (
            <div className="flex items-center gap-1">
              <span className="text-lg">⏱️</span>
              <span className={`font-black ${timeRemaining <= 10 ? 'text-[#f43f5e]' : 'text-[#34d399]'}`}>{timeRemaining}s</span>
            </div>
          )}
          <button onClick={() => setRoleAcknowledged(false)} className="bg-[#1e293b] w-8 h-8 rounded-full flex items-center justify-center text-sm border border-[#334155]">👁️</button>
        </div>
      </div>
      
      <div className="bg-[#111827] p-6 rounded-b-3xl shadow-xl min-h-[350px] flex flex-col justify-between">
      
        {gameState.state === 'ROUND_CLUES' && gameState.turn && (
           <div className="animate-in fade-in duration-300 w-full flex-1 flex flex-col">
              {gameState.turn.activePlayerId === myPlayerId ? (
                 <div className="flex-1 flex flex-col justify-center text-center">
                   <div className="bg-[#b45309] text-white py-3 px-6 rounded-2xl inline-block mx-auto font-black text-xl mb-6 shadow-[0_4px_0_#78350f]">
                     YOUR TURN
                   </div>
                   <p className="text-[#94a3b8] text-sm font-bold mb-6">Give a clue related to the genre.</p>
                   
                   <form onSubmit={(e) => { 
                      e.preventDefault(); 
                      if(clueInput.trim()) { socket.emit('submit_clue', clueInput); setClueInput(''); }
                   }} className="w-full flex flex-col gap-6">
                     <textarea 
                       value={clueInput} 
                       onChange={e=>setClueInput(e.target.value)} 
                       placeholder="Type your clue here..." 
                       required 
                       rows="3"
                       className="w-full bg-[#1e293b] border border-[#334155] rounded-2xl p-4 text-white text-lg focus:ring-2 focus:ring-[#3b82f6] outline-none resize-none font-medium placeholder:text-[#475569]"
                       autoFocus
                     />
                     <button type="submit" className="w-full py-4 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold rounded-2xl text-xl transition-all shadow-[0_6px_0_#1d4ed8] hover:translate-y-1 hover:shadow-[0_2px_0_#1d4ed8]">Submit Clue</button>
                   </form>
                 </div>
              ) : (
                 <div className="flex-1 flex flex-col justify-center text-center">
                   <div className="bg-[#be123c] text-white py-3 px-6 rounded-2xl inline-flex items-center justify-center gap-2 mx-auto font-black text-xl mb-6 shadow-[0_4px_0_#881337] w-full">
                     <span>👨‍🚀</span> {gameState.players.find(p=>p.id===gameState.turn.activePlayerId)?.name}'s Turn
                   </div>
                   <p className="text-[#94a3b8] text-sm font-bold mb-8">{gameState.players.find(p=>p.id===gameState.turn.activePlayerId)?.name} is giving a clue...</p>
                   
                   <div className="bg-[#1e293b] rounded-2xl p-6 border border-[#334155] min-h-[100px] flex items-center justify-center">
                     <div className="flex gap-1 items-center">
                        <div className="w-2 h-2 bg-[#64748b] rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                        <div className="w-2 h-2 bg-[#64748b] rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                        <div className="w-2 h-2 bg-[#64748b] rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                     </div>
                   </div>
                 </div>
              )}
           </div>
        )}

        {gameState.state === 'VOTING' && (
           <div className="animate-in slide-in-from-bottom-4 duration-500 w-full flex-1 flex flex-col">
             {gameState.votesSubmitted.includes(myPlayerId) ? (
               <div className="flex-1 flex flex-col items-center justify-center text-center">
                 <div className="text-6xl mb-6">✅</div>
                 <h2 className="text-2xl font-black text-white mb-2">Vote Submitted!</h2>
                 <p className="text-[#94a3b8] text-sm font-bold">Waiting for other players...</p>
               </div>
             ) : (
               <div className="flex-1 flex flex-col">
                 <div className="text-center mb-8">
                   <h3 className="text-white font-black text-2xl mb-1">Who is the Imposter?</h3>
                   <p className="text-[#64748b] text-sm font-bold">Select a player to vote.</p>
                 </div>
                 
                 <form onSubmit={(e) => { e.preventDefault(); socket.emit('submit_vote', { voteFor, confidence: parseInt(confidence) }); }} className="flex-1 flex flex-col gap-4">
                   <div className="space-y-3 flex-1 overflow-y-auto">
                     {gameState.players.filter(p => p.id !== myPlayerId && p.active).map(p => {
                       const isSelected = voteFor === p.id;
                       return (
                         <label key={p.id} className="flex items-center p-4 rounded-2xl cursor-pointer bg-[#1e293b] hover:bg-[#334155] transition-all">
                           <div className={`w-6 h-6 rounded-full border-2 mr-4 flex items-center justify-center ${isSelected ? 'border-[#3b82f6]' : 'border-[#475569]'}`}>
                             {isSelected && <div className="w-3 h-3 bg-[#3b82f6] rounded-full shadow-[0_0_5px_#3b82f6]"></div>}
                           </div>
                           <input type="radio" name="vote" value={p.id} onChange={e=>setVoteFor(e.target.value)} required className="hidden"/>
                           <span className="text-lg font-bold text-white">{p.name}</span>
                         </label>
                       );
                     })}
                   </div>
                   
                   {gameState.currentRound >= 2 && (
                     <div className="bg-[#1e293b] p-5 rounded-2xl mb-2">
                       <p className="font-bold text-center text-[#94a3b8] mb-4 text-sm">CONFIDENCE LEVEL</p>
                       <input 
                         type="range" min="50" max="100" 
                         value={confidence} 
                         onChange={e=>setConfidence(e.target.value)} 
                         className="w-full h-2 bg-[#334155] rounded-lg appearance-none cursor-pointer accent-[#3b82f6]"
                       />
                       <div className="flex justify-between font-bold mt-2 text-sm">
                         <span className="text-[#64748b]">50%</span>
                         <span className="text-[#3b82f6] font-black">{confidence}%</span>
                         <span className="text-[#64748b]">100%</span>
                       </div>
                     </div>
                   )}
                   
                   <button type="submit" className="w-full mt-auto py-4 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-black rounded-2xl text-xl transition-all shadow-[0_6px_0_#1d4ed8] hover:translate-y-1 hover:shadow-[0_2px_0_#1d4ed8]">Submit Vote</button>
                 </form>
               </div>
             )}
           </div>
        )}

        {gameState.state === 'ROUND_WAIT' && (
           <div className="flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in duration-500">
              <div className="text-6xl mb-6 text-[#f59e0b]">⌛</div>
              <h2 className="text-2xl font-black text-white mb-2">Round Complete!</h2>
              <p className="text-[#94a3b8] text-sm font-bold mb-8">Calculating results...</p>
              
              <div className="w-8 h-8 border-4 border-[#334155] border-t-[#3b82f6] rounded-full animate-spin mb-4"></div>
              <p className="text-[#64748b] text-xs">Next round will start shortly.</p>
           </div>
        )}
      </div>
    </div>
  );
}
