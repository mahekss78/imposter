const fs = require('fs');

const appCode = `
import React, { useState, useEffect } from 'react';
import { socket } from './socket';

export default function App() {
  const [view, setView] = useState('menu');
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [gameState, setGameState] = useState(null);
  const [localDeadline, setLocalDeadline] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [error, setError] = useState('');
  const [myPlayerId, setMyPlayerId] = useState('');
  
  const [privateRole, setPrivateRole] = useState(null);
  const [showRole, setShowRole] = useState(false);
  const [hostConfig, setHostConfig] = useState({ imposters: 1, rounds: 1, genre: 'locations' });

  // Phase B/C inputs
  const [clueInput, setClueInput] = useState('');
  const [voteFor, setVoteFor] = useState('');
  const [confidence, setConfidence] = useState(100);

  useEffect(() => {
    socket.on('connect', () => {
      if (localStorage.getItem('sessionToken')) socket.emit('resume_session');
    });
    socket.on('room_created', (id) => { setRoomId(id); setView('host'); setError(''); });
    socket.on('join_success', (data) => { setMyPlayerId(data.playerId); setView('player'); setError(''); });
    socket.on('error', (msg) => setError(msg));
    socket.on('sync_state', (state) => {
      setGameState(state);
      if (state.turn && state.turn.remainingMs > 0) setLocalDeadline(Date.now() + state.turn.remainingMs);
      else setLocalDeadline(0);
      if (view === 'menu' && !socket.auth.isHost) setView('player');
    });
    socket.on('private_role', (data) => setPrivateRole(data));
    socket.on('lobby_update', (players) => setGameState(prev => ({ ...prev, players })));

    return () => {
      socket.off('connect'); socket.off('room_created'); socket.off('join_success');
      socket.off('error'); socket.off('sync_state'); socket.off('private_role'); socket.off('lobby_update');
    };
  }, [view]);

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

  const createRoom = () => { socket.auth.isHost = true; socket.disconnect().connect(); socket.emit('create_room', hostConfig); };
  const joinRoom = (e) => { e.preventDefault(); socket.auth.isHost = false; socket.disconnect().connect(); socket.emit('join_room', roomId.toUpperCase(), playerName); };
  const forceStart = () => socket.emit('force_start', roomId);
  
  const submitClue = (e) => {
    e.preventDefault();
    if (!clueInput) return;
    socket.emit('submit_clue', clueInput);
    setClueInput('');
  };

  const submitVote = (e) => {
    e.preventDefault();
    if (!voteFor) return;
    socket.emit('submit_vote', { voteFor, confidence: parseInt(confidence) });
  };

  const renderChat = () => (
    <div style={{border: '1px solid gray', padding: 10, marginTop: 10}}>
      <h4>Shared Clues</h4>
      {gameState.chat && gameState.chat.map((c, i) => <p key={i}><strong>{c.senderName}:</strong> {c.text}</p>)}
    </div>
  );

  const renderLeaderboard = () => (
    <div>
      <h2>Final Leaderboard</h2>
      <table cellPadding={10} style={{borderCollapse: 'collapse', border: '1px solid black'}}>
        <thead>
          <tr><th>Name</th><th>Role</th><th>Score</th></tr>
        </thead>
        <tbody>
          {gameState.leaderboard.map(p => (
            <tr key={p.id}><td>{p.name}</td><td>{p.role}</td><td>{p.score}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (view === 'menu') {
    return (
      <div style={{ padding: 20 }}>
        <h1>Imposter Game</h1>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <div style={{ border: '1px solid black', padding: 10, marginBottom: 20 }}>
            <h3>Create a Game (Host)</h3>
            <label>Imposters: 
              <select value={hostConfig.imposters} onChange={e => setHostConfig({...hostConfig, imposters: parseInt(e.target.value)})}>
                <option value={1}>1</option><option value={2}>2</option>
              </select>
            </label><br/>
            <label>Rounds: 
              <select value={hostConfig.rounds} onChange={e => setHostConfig({...hostConfig, rounds: parseInt(e.target.value)})}>
                <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
              </select>
            </label><br/>
            <label>Genre: 
              <select value={hostConfig.genre} onChange={e => setHostConfig({...hostConfig, genre: e.target.value})}>
                <option value="locations">Locations</option><option value="fantasy">Fantasy</option><option value="scifi">Sci-Fi</option>
              </select>
            </label><br/><br/>
            <button onClick={createRoom}>Create Room</button>
        </div>
        <hr />
        <div style={{ border: '1px solid black', padding: 10, marginTop: 20 }}>
            <h3>Join a Game (Player)</h3>
            <form onSubmit={joinRoom}>
              <input placeholder="Room Code" value={roomId} onChange={e => setRoomId(e.target.value)} required />
              <input placeholder="Player Name" value={playerName} onChange={e => setPlayerName(e.target.value)} required />
              <button type="submit">Join Room</button>
            </form>
        </div>
      </div>
    );
  }

  if (view === 'host') {
    return (
      <div style={{ padding: 20 }}>
        <h2>Host View - Room {roomId}</h2>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {gameState && gameState.state === 'LOBBY_OPEN' && (
          <button onClick={forceStart}>Force Start Game</button>
        )}
        {gameState && gameState.state === 'ROLE_REVEAL' && <h1 style={{color: 'purple'}}>ROLE REVEAL PHASE (10s)</h1>}
        {gameState && gameState.state === 'VOTING' && <h1 style={{color: 'orange'}}>VOTING IN PROGRESS</h1>}
        {gameState && gameState.state === 'ROUND_WAIT' && <h1>Round Complete. Scoring...</h1>}
        {gameState && gameState.state === 'GAME_END' && renderLeaderboard()}
        
        {gameState && gameState.turn && (
           <h1 style={{color:'red'}}>Timer: {timeRemaining}s</h1>
        )}
        
        {gameState && gameState.state !== 'LOBBY_OPEN' && gameState.state !== 'ROLE_REVEAL' && gameState.state !== 'GAME_END' && renderChat()}
      </div>
    );
  }

  if (view === 'player') {
    return (
      <div style={{ padding: 20 }}>
        <h2>Player View {gameState && \`- Round \${gameState.currentRound}\`}</h2>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        
        {privateRole && gameState && gameState.state !== 'LOBBY_OPEN' && (
           <div style={{ padding: 10, background: '#eee', marginBottom: 20 }}>
              <button onClick={() => setShowRole(!showRole)}>
                {showRole ? 'Hide My Role' : 'View My Role'}
              </button>
              {showRole && (
                 <div style={{ marginTop: 10, padding: 10, background: 'white', border: '2px solid black' }}>
                    <p style={{ fontSize: 24, fontWeight: 'bold' }}>
                      You are {privateRole.role === 'imposter' ? 'THE IMPOSTER' : 'CREW'}
                    </p>
                    {privateRole.word && (
                      <p>The Secret Word is: <strong>{privateRole.word}</strong></p>
                    )}
                 </div>
              )}
           </div>
        )}

        {gameState ? (
          <div>
            <p>Phase: {gameState.state}</p>
            {gameState.state === 'ROLE_REVEAL' && <h3>Game starting in 10 seconds...</h3>}
            {gameState.state === 'ROUND_CLUES' && gameState.turn && (
              <div style={{ padding: 20, border: '1px solid black' }}>
                <h3>Active Player: {gameState.turn.activePlayerId}</h3>
                <h1>{timeRemaining}s</h1>
                {gameState.turn.activePlayerId === myPlayerId ? (
                  <form onSubmit={submitClue}>
                    <input value={clueInput} onChange={e => setClueInput(e.target.value)} placeholder="Type your clue..." required />
                    <button type="submit" style={{background:'green', color:'white'}}>Submit Clue</button>
                  </form>
                ) : <p>Waiting for them to finish...</p>}
              </div>
            )}
            
            {gameState.state === 'VOTING' && gameState.turn && (
              <div style={{ padding: 20, border: '1px solid orange' }}>
                <h3>Vote for the Imposter!</h3>
                <h1>{timeRemaining}s</h1>
                {gameState.votesSubmitted.includes(myPlayerId) ? (
                   <p>Vote submitted. Waiting for others...</p>
                ) : (
                  <form onSubmit={submitVote}>
                    <select value={voteFor} onChange={e => setVoteFor(e.target.value)} required>
                      <option value="">Select a player...</option>
                      {gameState.players.filter(p => p.id !== myPlayerId).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {gameState.currentRound >= 2 && (
                       <div>
                         <br/><label>Confidence ({confidence}%): </label>
                         <input type="range" min="50" max="100" value={confidence} onChange={e => setConfidence(e.target.value)} />
                       </div>
                    )}
                    <br/><br/><button type="submit" style={{background:'red', color:'white'}}>Submit Vote</button>
                  </form>
                )}
              </div>
            )}

            {gameState.state === 'ROUND_WAIT' && <h3>Round Complete. Waiting for next round...</h3>}
            {gameState.state === 'GAME_END' && renderLeaderboard()}

            {gameState.state !== 'LOBBY_OPEN' && gameState.state !== 'ROLE_REVEAL' && gameState.state !== 'GAME_END' && renderChat()}
          </div>
        ) : (
          <p>Waiting for state...</p>
        )}
      </div>
    );
  }
}
`;

fs.writeFileSync('frontend/src/App.jsx', appCode);
