const fs = require('fs');

const appCode = `
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { socket } from './socket';

export default function App() {
  const [gameState, setGameState] = useState(null);
  const [localDeadline, setLocalDeadline] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [error, setError] = useState('');
  const [myPlayerId, setMyPlayerId] = useState('');
  const [privateRole, setPrivateRole] = useState(null);

  useEffect(() => {
    socket.on('connect', () => {
      if (localStorage.getItem('sessionToken')) socket.emit('resume_session');
    });
    socket.on('join_success', (data) => { setMyPlayerId(data.playerId); setError(''); });
    socket.on('error', (msg) => setError(msg));
    socket.on('sync_state', (state) => {
      setGameState(state);
      if (state.turn && state.turn.remainingMs > 0) setLocalDeadline(Date.now() + state.turn.remainingMs);
      else setLocalDeadline(0);
    });
    socket.on('private_role', (data) => setPrivateRole(data));
    socket.on('lobby_update', (players) => setGameState(prev => ({ ...prev, players })));

    return () => {
      socket.off('connect'); socket.off('join_success'); socket.off('error'); 
      socket.off('sync_state'); socket.off('private_role'); socket.off('lobby_update');
    };
  }, []);

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
      <div style={{ fontFamily: 'sans-serif', margin: '0 auto', maxWidth: 800, padding: 20 }}>
        {error && <div style={{background:'red', color:'white', padding:10, marginBottom:20}}>{error}</div>}
        <Routes>
          <Route path="/" element={<HostLanding />} />
          <Route path="/create" element={<CreateGame />} />
          <Route path="/host/:roomId" element={<HostView gameState={gameState} timeRemaining={timeRemaining} />} />
          
          {/* Player paths */}
          <Route path="/:roomId" element={<PlayerFlow gameState={gameState} myPlayerId={myPlayerId} privateRole={privateRole} timeRemaining={timeRemaining} />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

function HostLanding() {
  const nav = useNavigate();
  return (
    <div style={{textAlign:'center', marginTop:100}}>
      <h1>IMPOSTER GAME</h1>
      <h3 style={{color:'gray'}}>[ HOST ]</h3>
      <br/>
      <button onClick={() => nav('/create')} style={{padding:'15px 30px', fontSize:18, cursor:'pointer'}}>Start the game</button>
    </div>
  );
}

function CreateGame() {
  const nav = useNavigate();
  const [config, setConfig] = useState({ maxPlayers: 8, imposters: 1, rounds: 3, genre: 'general' });
  
  useEffect(() => {
    const handleRoomCreated = (id) => nav(\`/host/\${id}\`);
    socket.on('room_created', handleRoomCreated);
    return () => socket.off('room_created', handleRoomCreated);
  }, [nav]);

  const createRoom = () => {
    socket.auth.isHost = true;
    socket.disconnect().connect();
    socket.emit('create_room', config);
  };

  const genres = ['AI', 'IT', 'Tech', 'Cybersecurity', 'Locations', 'General'];

  return (
    <div>
      <h2>CREATE GAME</h2>
      <div style={{marginBottom: 15}}>
        <label>Number of Players <br/>
          <select value={config.maxPlayers} onChange={e=>setConfig({...config, maxPlayers:parseInt(e.target.value)})}>
             {[3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div style={{marginBottom: 15}}>
        <label>Imposters <br/>
          <select value={config.imposters} onChange={e=>setConfig({...config, imposters:parseInt(e.target.value)})}>
             {[1,2].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div style={{marginBottom: 15}}>
        <label>Rounds <br/>
          <select value={config.rounds} onChange={e=>setConfig({...config, rounds:parseInt(e.target.value)})}>
             {[1,2,3].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <div style={{marginBottom: 15}}>
        <label>Genre <br/>
          {genres.map(g => (
             <div key={g}>
               <input type="radio" checked={config.genre === g.toLowerCase()} onChange={() => setConfig({...config, genre: g.toLowerCase()})} /> {g}
             </div>
          ))}
        </label>
      </div>
      <br/>
      <button onClick={createRoom} style={{padding:'10px 20px'}}>CREATE ROOM</button>
    </div>
  );
}

function HostView({ gameState, timeRemaining }) {
  const { roomId } = useParams();
  
  if (!gameState) return <p>Loading room...</p>;

  if (gameState.state === 'LOBBY_OPEN') {
    const joined = gameState.players.length;
    const max = gameState.config.maxPlayers;
    const allJoined = joined === max;

    return (
      <div style={{textAlign:'center'}}>
        <h2>IMPOSTER GAME</h2>
        <h3>ROOM: {roomId}</h3>
        <div style={{margin:'20px 0', padding:50, border:'2px dashed black', display:'inline-block'}}>
           [ QR CODE PLACEHOLDER ]
        </div>
        <p>or</p>
        <p>Join: <b>game.com/{roomId}</b></p>
        <hr/>
        <h3>PLAYERS</h3>
        <div style={{textAlign:'left', maxWidth: 200, margin:'0 auto'}}>
          {Array.from({length: max}).map((_, i) => (
             <p key={i}>{i+1}. {gameState.players[i] ? gameState.players[i].name : '—'}</p>
          ))}
        </div>
        <br/>
        <p>{joined} / {max} JOINED</p>
        <button 
          onClick={() => socket.emit('force_start', roomId)} 
          disabled={!allJoined}
          style={{padding:'10px 20px', background: allJoined ? 'green' : 'gray', color:'white', cursor: allJoined ? 'pointer' : 'not-allowed'}}
        >
          START GAME
        </button>
      </div>
    );
  }
  
  if (gameState.state === 'GAME_END') {
    return (
      <div style={{textAlign:'center'}}>
        <h1>GAME OVER</h1>
        <h2>FINAL LEADERBOARD</h2>
        <table style={{margin:'0 auto', textAlign:'left', borderSpacing:10}}>
          <tbody>
            {gameState.leaderboard.map((p, i) => (
               <tr key={p.id}>
                 <td>{i+1}.</td>
                 <td>{p.name}</td>
                 <td>{p.score}</td>
               </tr>
            ))}
          </tbody>
        </table>
        <br/>
        <h2>🏆 WINNER: {gameState.leaderboard[0]?.name}</h2>
        <button onClick={() => window.location.href='/'} style={{padding:'10px 20px'}}>NEW GAME</button>
      </div>
    );
  }

  // Host In-Game view
  return (
    <div>
      <h2>IMPOSTER GAME - ROOM: {roomId}</h2>
      <h3>ROUND {gameState.currentRound}</h3>
      <hr/>
      {gameState.state === 'ROUND_CLUES' && gameState.turn && (
        <div style={{textAlign:'center'}}>
          <p>CURRENT TURN</p>
          <h2>{gameState.turn.activePlayerId}</h2>
          <h1 style={{color:'red', fontSize:48}}>{timeRemaining}</h1>
        </div>
      )}
      
      {gameState.state === 'VOTING' && (
        <div style={{textAlign:'center'}}>
          <h2 style={{color:'orange'}}>VOTING IN PROGRESS</h2>
          <p>{gameState.votesSubmitted.length} / {gameState.players.length} VOTES</p>
          <h1 style={{color:'red', fontSize:48}}>{timeRemaining}</h1>
        </div>
      )}

      {gameState.state === 'ROUND_WAIT' && <h2 style={{textAlign:'center'}}>Calculating Round Results...</h2>}
      
      <hr/>
      <h3>CLUES</h3>
      <div style={{textAlign:'left'}}>
         {gameState.players.map(p => {
           const clue = gameState.chat.find(c => c.senderName === p.name);
           return (
             <p key={p.id} style={{fontFamily:'monospace'}}>
               {p.name.padEnd(10, ' ')} {clue ? clue.text : '...'}
             </p>
           );
         })}
      </div>
    </div>
  );
}

function PlayerFlow({ gameState, myPlayerId, privateRole, timeRemaining }) {
  const { roomId } = useParams();
  const [name, setName] = useState('');
  const [showRoleScreen, setShowRoleScreen] = useState(false);
  const [clueInput, setClueInput] = useState('');
  const [voteFor, setVoteFor] = useState('');
  const [confidence, setConfidence] = useState(100);

  // Auto-show role screen when game starts
  useEffect(() => {
    if (gameState && gameState.state === 'ROLE_REVEAL') {
      setShowRoleScreen(true);
    }
  }, [gameState?.state]);

  const joinGame = (e) => {
    e.preventDefault();
    socket.auth.isHost = false;
    socket.disconnect().connect();
    socket.emit('join_room', roomId, name);
  };

  if (!gameState || gameState.state === 'LOBBY_OPEN') {
     if (!myPlayerId) {
       return (
         <div style={{textAlign:'center', marginTop:50}}>
           <h2>JOIN GAME</h2>
           <p>ROOM: {roomId.toUpperCase()}</p>
           <form onSubmit={joinGame}>
             <input placeholder="Player Name" value={name} onChange={e=>setName(e.target.value)} required style={{padding:10, fontSize:16}}/><br/><br/>
             <button type="submit" style={{padding:'10px 20px', background:'black', color:'white', width:'100%'}}>JOIN GAME</button>
           </form>
         </div>
       );
     }
     
     // Waiting lobby
     const max = gameState ? gameState.config.maxPlayers : 8;
     const joined = gameState ? gameState.players.length : 1;
     return (
       <div style={{textAlign:'center', marginTop:50}}>
         <h2>WAITING FOR HOST</h2>
         <p>ROOM: {roomId.toUpperCase()}</p>
         <div style={{textAlign:'left', maxWidth:200, margin:'0 auto'}}>
           <h3>PLAYERS</h3>
           {Array.from({length: max}).map((_, i) => {
             const p = gameState?.players[i];
             return <p key={i}>{p ? '✓' : '○'} {p ? p.name : '—'}</p>;
           })}
         </div>
         <p>{joined} / {max} PLAYERS</p>
         <p style={{color:'gray', fontStyle:'italic'}}>Waiting for host to start...</p>
       </div>
     );
  }

  if (showRoleScreen && privateRole) {
    return (
      <div style={{textAlign:'center', marginTop:50}}>
         <h2>YOUR IDENTITY</h2>
         {privateRole.role === 'imposter' ? (
           <div style={{background:'black', color:'red', padding:40, margin:'20px 0'}}>
             <h1>YOU ARE THE IMPOSTER</h1>
             <p>Blend in.<br/>Give believable clues.<br/>Do not reveal yourself.</p>
           </div>
         ) : (
           <div style={{background:'lightblue', color:'black', padding:40, margin:'20px 0'}}>
             <p>SECRET WORD</p>
             <h1>{privateRole.word}</h1>
           </div>
         )}
         <p style={{color:'red', fontWeight:'bold'}}>Do not show this to anyone.</p>
         <button onClick={() => setShowRoleScreen(false)} style={{padding:'10px 40px'}}>NEXT</button>
      </div>
    );
  }

  if (gameState.state === 'GAME_END') {
     return (
       <div style={{textAlign:'center'}}>
         <h1>GAME OVER</h1>
         <h2>FINAL LEADERBOARD</h2>
         <table style={{margin:'0 auto', textAlign:'left', borderSpacing:10}}>
           <tbody>
             {gameState.leaderboard.map((p, i) => (
                <tr key={p.id}>
                  <td>{i+1}.</td>
                  <td>{p.name}</td>
                  <td>{p.score}</td>
                </tr>
             ))}
           </tbody>
         </table>
         <br/>
         <h2>🏆 WINNER: {gameState.leaderboard[0]?.name}</h2>
       </div>
     );
  }

  return (
    <div style={{textAlign:'center', marginTop:20}}>
      <h2>ROUND {gameState.currentRound}</h2>
      
      {gameState.state === 'ROUND_CLUES' && gameState.turn && (
         <div>
            {gameState.turn.activePlayerId === myPlayerId ? (
               <div style={{background:'#eee', padding:20}}>
                 <h3>YOUR TURN</h3>
                 <p>Give a clue related to the secret word.</p>
                 <h1 style={{color:'red'}}>{timeRemaining}</h1>
                 <form onSubmit={(e) => { e.preventDefault(); socket.emit('submit_clue', clueInput); setClueInput(''); }}>
                   <input value={clueInput} onChange={e=>setClueInput(e.target.value)} placeholder="Enter your clue..." required style={{padding:10, width:'80%'}}/><br/><br/>
                   <button type="submit" style={{padding:'10px 20px', background:'black', color:'white', width:'100%'}}>SUBMIT CLUE</button>
                 </form>
               </div>
            ) : (
               <div>
                 <h3 style={{color:'gray'}}>WAIT FOR YOUR TURN</h3>
                 <p>Current player: <b>{gameState.players.find(p=>p.id===gameState.turn.activePlayerId)?.name}</b></p>
                 <h1 style={{color:'red'}}>{timeRemaining}</h1>
               </div>
            )}
            <hr/>
            <h3>Clues</h3>
            <div style={{textAlign:'left'}}>
               {gameState.players.map(p => {
                 const clue = gameState.chat.find(c => c.senderName === p.name);
                 return (
                   <p key={p.id}><b>{p.name}:</b> {clue ? clue.text : '...'}</p>
                 );
               })}
            </div>
         </div>
      )}

      {gameState.state === 'VOTING' && (
         <div style={{textAlign:'left'}}>
           <h3>WHO DO YOU THINK IS THE IMPOSTER?</h3>
           {gameState.votesSubmitted.includes(myPlayerId) ? (
             <div style={{textAlign:'center', marginTop:50}}>
               <h2 style={{color:'green'}}>VOTE SUBMITTED ✓</h2>
               <p>WAITING FOR OTHER PLAYERS...</p>
               <p style={{color:'gray'}}>Round {gameState.currentRound} will continue when voting is complete.</p>
             </div>
           ) : (
             <form onSubmit={(e) => { e.preventDefault(); socket.emit('submit_vote', { voteFor, confidence: parseInt(confidence) }); }}>
               {gameState.players.filter(p => p.id !== myPlayerId).map(p => (
                 <div key={p.id} style={{margin:'10px 0'}}>
                   <label style={{fontSize:18}}>
                     <input type="radio" name="vote" value={p.id} onChange={e=>setVoteFor(e.target.value)} required style={{transform:'scale(1.5)', marginRight:10}}/>
                     {p.name}
                   </label>
                 </div>
               ))}
               
               {gameState.currentRound >= 2 && (
                 <div style={{marginTop:30, padding:15, background:'#f0f0f0'}}>
                   <p style={{fontWeight:'bold'}}>How confident are you?</p>
                   <input type="range" min="50" max="100" value={confidence} onChange={e=>setConfidence(e.target.value)} style={{width:'100%'}}/>
                   <div style={{display:'flex', justifyContent:'space-between'}}>
                     <span>50%</span>
                     <span>{confidence}%</span>
                     <span>100%</span>
                   </div>
                 </div>
               )}
               
               <br/>
               <button type="submit" style={{width:'100%', padding:15, background:'black', color:'white', fontSize:18}}>SUBMIT VOTE</button>
             </form>
           )}
         </div>
      )}

      {gameState.state === 'ROUND_WAIT' && (
         <div style={{textAlign:'center', marginTop:50}}>
            <h2 style={{color:'green'}}>VOTING COMPLETE ✓</h2>
            <p>WAITING FOR HOST TO ADVANCE...</p>
         </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync('frontend/src/App.jsx', appCode);
