
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'super-secret-key-poc';

const GENRES = {
  ai: { 'Neural Network': 'A computing system inspired by the human brain.', 'Algorithm': 'A set of rules for solving a problem.', 'Data': 'Information processed by computers.', 'Robot': 'A machine capable of carrying out complex actions.' },
  it: { 'Server': 'A computer that provides data to other computers.', 'Cloud': 'Servers accessed over the internet.', 'Network': 'A group of connected computers.', 'Router': 'A device that forwards data packets.' },
  tech: { 'Smartphone': 'A mobile phone with computer features.', 'Laptop': 'A portable personal computer.', 'Processor': 'The logic circuitry that responds to and processes basic instructions.', 'Battery': 'A device containing an electric cell.' },
  cybersecurity: { 'Firewall': 'A network security system.', 'Hacker': 'Someone who uses computers to gain unauthorized access.', 'Encryption': 'The process of converting information into code.', 'Malware': 'Software designed to disrupt or damage.' },
  locations: { 'Hospital': 'A place for medical treatment.', 'School': 'An institution for educating children.', 'Bank': 'A financial institution.', 'Beach': 'A pebbly or sandy shore by the sea.' },
  general: { 'Apple': 'A round fruit with red or green skin.', 'Car': 'A four-wheeled road vehicle.', 'House': 'A building for human habitation.', 'Tree': 'A woody perennial plant.' }
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
    secretWordDescription: '',
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
  const words = Object.keys(pool);
  room.secretWord = words[Math.floor(Math.random() * words.length)];
  room.secretWordDescription = pool[room.secretWord];

  for (const [id, player] of room.players.entries()) {
    player.score = 0;
    player.correctVotes = 0;
    player.confidencePoints = 0;
    player.roundScores = {}; // Initialize round scores
    if (room.impostersList.includes(id)) {
      player.role = 'imposter';
      player.word = null;
      player.wordDescription = null;
    } else {
      player.role = 'crew';
      player.word = room.secretWord;
      player.wordDescription = room.secretWordDescription;
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
    let roundScore = 0;
    if (C === N && N > 0) roundScore = 0;
    else if (C === 0 || N === 0) roundScore = maxBonus;
    else roundScore = Math.floor(maxBonus / 2);
    
    impPlayer.score += roundScore;
    impPlayer.roundScores[round] = (impPlayer.roundScores[round] || 0) + roundScore;
  });

  activeCrewIds.forEach(crewId => {
    const v = votesThisRound.get(crewId);
    if (!v) return;
    let isCorrect = room.impostersList.includes(v.voteFor);
    
    let roundScore = 0;
    if (isCorrect) {
      roundScore += baseCorrectScore;
      room.players.get(crewId).correctVotes += 1;
    }
    
    if (round >= 2 && v.confidence) {
      let betScore = 0;
      if (v.confidence >= 90) betScore = 2;
      else if (v.confidence >= 70) betScore = 1;
      
      if (isCorrect) {
        roundScore += betScore;
        room.players.get(crewId).confidencePoints += betScore;
      } else {
        roundScore -= betScore;
        room.players.get(crewId).confidencePoints -= betScore;
      }
    }
    
    room.players.get(crewId).score += roundScore;
    room.players.get(crewId).roundScores[round] = (room.players.get(crewId).roundScores[round] || 0) + roundScore;
  });
}

function generateSessionToken(roomId, playerId) { return jwt.sign({ roomId, playerId }, JWT_SECRET, { expiresIn: '12h' }); }
function verifySessionToken(token) { try { return jwt.verify(token, JWT_SECRET); } catch (err) { return null; } }

module.exports = { rooms, getRoom, createRoom, assignRoles, calculateScoring, generateSessionToken, verifySessionToken };
