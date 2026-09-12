
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'super-secret-key-poc';

const GENRES = {
  ai: ['Neural Network', 'Algorithm', 'Data', 'Robot'],
  it: ['Server', 'Cloud', 'Network', 'Router'],
  tech: ['Smartphone', 'Laptop', 'Processor', 'Battery'],
  cybersecurity: ['Firewall', 'Hacker', 'Encryption', 'Malware'],
  locations: ['Hospital', 'School', 'Bank', 'Beach'],
  general: ['Apple', 'Car', 'House', 'Tree']
};

const rooms = new Map();

function getRoom(roomId) { return rooms.get(roomId); }

function createRoom(roomId, config) {
  const room = {
    id: roomId,
    state: 'LOBBY_OPEN',
    config: config || { maxPlayers: 8, imposters: 1, rounds: 3, genre: 'general' },
    players: new Map(),
    currentRound: 1,
    turn: null,
    order: [],
    secretWord: '',
    chat: [],
    votes: new Map(),
    impostersList: [],
    leaderboard: []
  };
  rooms.set(roomId, room);
  return room;
}

function assignRoles(room) {
  const playerIds = Array.from(room.players.keys());
  for (let i = playerIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
  }
  
  const numImposters = room.config.imposters;
  room.impostersList = playerIds.slice(0, numImposters);
  
  const pool = GENRES[room.config.genre] || GENRES.general;
  room.secretWord = pool[Math.floor(Math.random() * pool.length)];

  for (const [id, player] of room.players.entries()) {
    player.score = 0;
    player.correctVotes = 0;
    player.confidencePoints = 0;
    if (room.impostersList.includes(id)) {
      player.role = 'imposter';
      player.word = null;
    } else {
      player.role = 'crew';
      player.word = room.secretWord;
    }
  }
}

function calculateScoring(room) {
  const round = room.currentRound;
  const votesThisRound = room.votes.get(round) || new Map();
  const maxBonus = round === 1 ? 2 : (round === 2 ? 3 : 4);
  const baseCorrectScore = round;
  
  let activeCrewIds = [];
  for (const [id, p] of room.players.entries()) {
    if (p.role === 'crew' && p.active) activeCrewIds.push(id);
  }
  const N = activeCrewIds.length;

  room.impostersList.forEach(impId => {
    let C = 0;
    activeCrewIds.forEach(crewId => {
      const v = votesThisRound.get(crewId);
      if (v && v.voteFor === impId) C++;
    });

    const impPlayer = room.players.get(impId);
    if (C === N && N > 0) impPlayer.score += 0;
    else if (C === 0 || N === 0) impPlayer.score += maxBonus;
    else impPlayer.score += Math.floor(maxBonus / 2);
  });

  activeCrewIds.forEach(crewId => {
    const v = votesThisRound.get(crewId);
    if (!v) return;
    let isCorrect = room.impostersList.includes(v.voteFor);
    
    if (isCorrect) {
      room.players.get(crewId).score += baseCorrectScore;
      room.players.get(crewId).correctVotes += 1;
    }
    
    if (round >= 2 && v.confidence) {
      let betScore = 0;
      if (v.confidence >= 90) betScore = 2;
      else if (v.confidence >= 70) betScore = 1;
      
      if (isCorrect) {
        room.players.get(crewId).score += betScore;
        room.players.get(crewId).confidencePoints += betScore;
      } else {
        room.players.get(crewId).score -= betScore;
        room.players.get(crewId).confidencePoints -= betScore;
      }
    }
  });
}

function generateSessionToken(roomId, playerId) { return jwt.sign({ roomId, playerId }, JWT_SECRET, { expiresIn: '12h' }); }
function verifySessionToken(token) { try { return jwt.verify(token, JWT_SECRET); } catch (err) { return null; } }

module.exports = { rooms, getRoom, createRoom, assignRoles, calculateScoring, generateSessionToken, verifySessionToken };
