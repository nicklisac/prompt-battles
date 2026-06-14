import { useState, useEffect, useCallback, useRef } from 'react';
import { joinRoomChannel, generateRoomCode, generatePlayerId, generatePlayerName } from './supabase';
import { useLLM } from './hooks/useLLM';
import { getRandomTasks } from './utils/tasks';
import { tallyVotes, findTie, generateTiebreakerPrompt, parseTiebreakerResponse } from './utils/scoring';

const PHASES = { LOBBY: 'lobby', TASK: 'task', PROMPTING: 'prompting', PROCESSING: 'processing', RESULTS: 'results', VOTING: 'voting', SCORES: 'scores', FINISHED: 'finished' };

export default function App() {
  const [screen, setScreen] = useState('home');
  const [roomCode, setRoomCode] = useState('');
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem('pb_endpoint') || 'http://localhost:1234/v1');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('pb_apikey') || '');
  const [modelName, setModelName] = useState(() => localStorage.getItem('pb_model') || '');
  const [enableThinking, setEnableThinking] = useState(() => localStorage.getItem('pb_thinking') !== 'false');
  const [playerName, setPlayerName] = useState('');
  const [endpointVerified, setEndpointVerified] = useState(false);
  const [testingEndpoint, setTestingEndpoint] = useState(false);
  const [testError, setTestError] = useState('');

  useEffect(() => { localStorage.setItem('pb_endpoint', endpoint); }, [endpoint]);
  useEffect(() => { localStorage.setItem('pb_apikey', apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem('pb_model', modelName); }, [modelName]);
  useEffect(() => { localStorage.setItem('pb_thinking', enableThinking); }, [enableThinking]);
  
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [phase, setPhase] = useState(PHASES.LOBBY);
  const [task, setTask] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [results, setResults] = useState([]);
  const [votes, setVotes] = useState([]);
  const [scores, setScores] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [round, setRound] = useState(0);
  const [totalRounds] = useState(3);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [showTask, setShowTask] = useState(false);
  const [promptSubmitted, setPromptSubmitted] = useState(false);
  
  const channelRef = useRef(null);
  const processPromptsRef = useRef(null);
  const currentPlayerRef = useRef(currentPlayer);
  const applyMessageRef = useRef(null);
  const { callLLM } = useLLM();

  useEffect(() => {
    currentPlayerRef.current = currentPlayer;
  }, [currentPlayer]);
  
  // Store for round data
  const roundDataRef = useRef({ prompts: {}, results: {}, votes: [], gameScores: {}, gameTasks: [], processed: new Set() });
  
  // Timer for prompting phase
  useEffect(() => {
    if (phase !== PHASES.PROMPTING) return;
    if (timeLeft <= 0) {
      if (currentPlayer?.isHost && processPromptsRef.current) processPromptsRef.current();
      return;
    }
    const timer = setInterval(() => setTimeLeft(p => p - 1), 1000);
    return () => clearInterval(timer);
  }, [phase, timeLeft, currentPlayer]);
  
  // Apply message state changes (plain fn, no useCallback — kept fresh via ref)
  function applyMessage(message, cp) {
    const cur = cp || currentPlayerRef.current;
    switch (message.type) {
      case 'host:announce':
        setRoom({ code: message.roomCode, hostEndpoint: message.endpoint, hostModel: message.modelName, status: 'lobby' });
        if (!cur?.isHost) setPlayers(prev => [...prev, message.player]);
        break;
      case 'player:join':
        setPlayers(prev => prev.find(p => p.id === message.player.id) ? prev : [...prev, message.player]);
        break;
      case 'player:leave':
        setPlayers(prev => prev.filter(p => p.id !== message.playerId));
        break;
      case 'game:start':
        setPhase(PHASES.TASK);
        setTask(message.task);
        setRound(message.round);
        roundDataRef.current.prompts = {};
        roundDataRef.current.results = {};
        roundDataRef.current.votes = [];
        roundDataRef.current.processed = new Set();
        setTimeout(() => setShowTask(true), 500);
        break;
      case 'round:prompting':
        setPhase(PHASES.PROMPTING);
        setTimeLeft(60);
        setShowTask(false);
        setPromptSubmitted(false);
        break;
      case 'prompt:submit':
        if (cur?.isHost) {
          roundDataRef.current.prompts[message.playerId] = message.prompt;
        }
        break;
      case 'round:processing':
        setPhase(PHASES.PROCESSING);
        setProcessingProgress(0);
        break;
      case 'round:result':
        roundDataRef.current.results[message.playerId] = message;
        setResults(prev => {
          const existing = prev.findIndex(r => r.playerId === message.playerId);
          if (existing >= 0) { const u = [...prev]; u[existing] = message; return u; }
          return [...prev, message];
        });
        setProcessingProgress(message.progress || 0);
        break;
      case 'round:results-ready':
        setPhase(PHASES.RESULTS);
        break;
      case 'round:voting':
        setPhase(PHASES.VOTING);
        break;
      case 'vote:cast':
        roundDataRef.current.votes.push(message);
        setVotes(prev => {
          const existing = prev.findIndex(v => v.voterId === message.voterId);
          if (existing >= 0) { const u = [...prev]; u[existing] = message; return u; }
          return [...prev, message];
        });
        break;
      case 'round:scores':
        setPhase(PHASES.SCORES);
        setScores(message.scores);
        break;
      case 'round:next':
        setRound(message.round);
        setPhase(PHASES.TASK);
        setTask(message.task);
        setResults([]);
        setVotes([]);
        setPrompt('');
        setShowTask(false);
        roundDataRef.current.prompts = {};
        roundDataRef.current.results = {};
        roundDataRef.current.votes = [];
        roundDataRef.current.processed = new Set();
        setTimeout(() => setShowTask(true), 500);
        break;
      case 'game:end':
        setPhase(PHASES.FINISHED);
        setLeaderboard(message.leaderboard);
        break;
      default: break;
    }
  }

  // Keep ref fresh so host game functions can call latest applyMessage
  useEffect(() => {
    applyMessageRef.current = applyMessage;
  });

  // Handle incoming Supabase messages (skip own echoes for prompt:submit)
  const handleMessage = useCallback((message) => {
    if (message.type === 'prompt:submit' && message.senderId === currentPlayer?.id) return;
    applyMessage(message, currentPlayer);
  }, [currentPlayer]);
  
  // Broadcast message
  const broadcast = useCallback((message) => {
    if (channelRef.current) channelRef.current.broadcast({ ...message, senderId: currentPlayer?.id });
  }, [currentPlayer]);
  
  // Test LLM connection
  const handleTestEndpoint = async () => {
    if (!endpoint || !modelName) return;
    setTestingEndpoint(true);
    setTestError('');
    try {
      await callLLM(endpoint, modelName, 'You are a helpful assistant.', 'Say "OK" in one word.', apiKey, enableThinking);
      setEndpointVerified(true);
      setTestError('');
    } catch (err) {
      setEndpointVerified(false);
      setTestError(err.message || 'Connection failed');
    } finally {
      setTestingEndpoint(false);
    }
  };

  // Create room as host
  const handleCreateRoom = () => {
    if (!endpoint || !modelName) return;
    const code = generateRoomCode();
    const player = { id: generatePlayerId(), name: generatePlayerName(), isHost: true };
    setCurrentPlayer(player);
    setRoom({ code, hostEndpoint: endpoint, hostModel: modelName, hostApiKey: apiKey, hostEnableThinking: enableThinking, status: 'lobby' });
    setPlayers([player]);
    setPhase(PHASES.LOBBY);

    const channel = joinRoomChannel(code, handleMessage);
    channel.subscribe(player);
    channelRef.current = channel;

    broadcast({ type: 'host:announce', roomCode: code, endpoint, modelName, player });
    setScreen('game');
  };
  
  // Join room as player
  const handleJoinRoom = () => {
    if (!roomCode || !playerName) return;
    const player = { id: generatePlayerId(), name: playerName, isHost: false };
    setCurrentPlayer(player);
    setPlayers([player]);
    setPhase(PHASES.LOBBY);
    
    const channel = joinRoomChannel(roomCode.toUpperCase(), handleMessage);
    channel.subscribe(player);
    channelRef.current = channel;
    
    broadcast({ type: 'player:join', player });
    setScreen('game');
  };
  
  // Host: Start game
  const handleStartGame = () => {
    const tasks = getRandomTasks(totalRounds);
    roundDataRef.current.gameTasks = tasks;
    roundDataRef.current.gameScores = {};
    for (const p of players) roundDataRef.current.gameScores[p.id] = 0;

    const startMsg = { type: 'game:start', round: 1, task: tasks[0] };
    applyMessageRef.current(startMsg);
    broadcast(startMsg);

    setTimeout(() => {
      const promptingMsg = { type: 'round:prompting' };
      applyMessageRef.current(promptingMsg);
      broadcast(promptingMsg);
    }, 3000);
  };
  
  // Host: Send a single prompt to the LLM
  const processSinglePrompt = useCallback(async (playerId, playerName, playerPrompt) => {
    if (!currentPlayer?.isHost) return;
    if (roundDataRef.current.processed.has(playerId)) return;
    roundDataRef.current.processed.add(playerId);

    if (phase !== PHASES.PROCESSING) {
      setPhase(PHASES.PROCESSING);
      broadcast({ type: 'round:processing' });
    }

    try {
        const response = await callLLM(room.hostEndpoint, room.hostModel, task.systemPrompt, playerPrompt, room.hostApiKey, room.hostEnableThinking);
      const result = { playerId, playerName, prompt: playerPrompt, response };
      setResults(prev => [...prev, result]);
      broadcast({ type: 'round:result', ...result });
    } catch (err) {
      console.error(`Failed for ${playerName}:`, err);
      const result = { playerId, playerName, prompt: playerPrompt, response: '[Error: Model failed to respond]' };
      setResults(prev => [...prev, result]);
      broadcast({ type: 'round:result', ...result });
    }

    // Check if all prompts are done
    const submitted = players.filter(p => roundDataRef.current.prompts[p.id]);
    if (roundDataRef.current.processed.size >= submitted.length && submitted.length > 0) {
      broadcast({ type: 'round:results-ready' });
      setPhase(PHASES.RESULTS);
    }
  }, [currentPlayer, players, room, task, phase, broadcast, callLLM]);

  const processSingleRef = useRef(null);
  useEffect(() => {
    processSingleRef.current = processSinglePrompt;
  }, [processSinglePrompt]);

  // Host: Process all prompts (called when timer expires)
  const processPrompts = useCallback(async () => {
    if (!currentPlayer?.isHost) return;

    setPhase(PHASES.PROCESSING);
    broadcast({ type: 'round:processing' });

    const prompts = roundDataRef.current.prompts;
    const playerPrompts = players.filter(p => prompts[p.id]).map(p => ({ playerId: p.id, playerName: p.name, prompt: prompts[p.id] }));

    for (const { playerId, playerName, prompt: pp } of playerPrompts) {
      await processSinglePrompt(playerId, playerName, pp);
    }

    if (playerPrompts.length > 0) {
      broadcast({ type: 'round:results-ready' });
      setPhase(PHASES.RESULTS);
    }
  }, [currentPlayer, players, room, task, broadcast, callLLM, processSinglePrompt]);

  useEffect(() => {
    processPromptsRef.current = processPrompts;
  }, [processPrompts]);
  
  // Player: Submit prompt
  const handleSubmitPrompt = () => {
    if (!prompt.trim() || promptSubmitted) return;
    setPromptSubmitted(true);
    const trimmed = prompt.trim();
    broadcast({ type: 'prompt:submit', playerId: currentPlayer.id, prompt: trimmed });

    // Host: store own prompt and send to LLM immediately
    if (currentPlayer?.isHost) {
      roundDataRef.current.prompts[currentPlayer.id] = trimmed;
      if (processSingleRef.current) {
        processSingleRef.current(currentPlayer.id, currentPlayer.name, trimmed);
      }
    }
  };
  
  // Host: Start voting
  const handleStartVoting = () => {
    setPhase(PHASES.VOTING);
    broadcast({ type: 'round:voting' });
  };
  
  // Player: Cast vote
  const handleCastVote = (targetPlayerId) => {
    if (targetPlayerId === currentPlayer.id) return;
    const vote = { voterId: currentPlayer.id, voterName: currentPlayer.name, targetPlayerId, round };
    setVotes(prev => {
      const existing = prev.findIndex(v => v.voterId === currentPlayer.id);
      if (existing >= 0) { const u = [...prev]; u[existing] = vote; return u; }
      return [...prev, vote];
    });
    broadcast({ type: 'vote:cast', ...vote });
  };
  
  // Host: Calculate scores
  const handleCalculateScores = async () => {
    const roundScores = tallyVotes(roundDataRef.current.votes, players.map(p => p.id));
    const tie = findTie(roundScores);
    
    if (tie) {
      const tiedSubmissions = Object.values(roundDataRef.current.results).filter(r => tie.includes(r.playerId));
      try {
          const modelResponse = await callLLM(room.hostEndpoint, room.hostModel, 'You are a judge. Be decisive.', generateTiebreakerPrompt(task, tiedSubmissions), room.hostApiKey, room.hostEnableThinking);
        const tieWinner = parseTiebreakerResponse(modelResponse, tie);
        roundScores[tieWinner]++;
      } catch (err) {
        console.error('Tiebreaker failed:', err);
        roundScores[tie[Math.floor(Math.random() * tie.length)]]++;
      }
    }
    
    const newScores = { ...roundDataRef.current.gameScores };
    for (const [pid, score] of Object.entries(roundScores)) newScores[pid] = (newScores[pid] || 0) + score;
    roundDataRef.current.gameScores = newScores;
    
    const scoresWithNames = players.map(p => ({ playerId: p.id, playerName: p.name, roundScore: roundScores[p.id] || 0, totalScore: newScores[p.id] || 0 }));
    setScores(scoresWithNames);
    broadcast({ type: 'round:scores', scores: scoresWithNames });
    setPhase(PHASES.SCORES);
  };
  
  // Host: Next round or end
  const handleNextRound = () => {
    if (round >= totalRounds) {
      const finalLeaderboard = players.map(p => ({ playerName: p.name, totalScore: roundDataRef.current.gameScores[p.id] || 0 })).sort((a, b) => b.totalScore - a.totalScore);
      const endMsg = { type: 'game:end', leaderboard: finalLeaderboard };
      applyMessageRef.current(endMsg);
      broadcast(endMsg);
    } else {
      const nextTask = roundDataRef.current.gameTasks[round];
      roundDataRef.current.prompts = {};
      roundDataRef.current.results = {};
      roundDataRef.current.votes = [];
      roundDataRef.current.processed = new Set();
      const nextMsg = { type: 'round:next', round: round + 1, task: nextTask };
      applyMessageRef.current(nextMsg);
      broadcast(nextMsg);
      setTimeout(() => {
        const promptingMsg = { type: 'round:prompting' };
        applyMessageRef.current(promptingMsg);
        broadcast(promptingMsg);
      }, 3500);
    }
  };
  
  // Leave room
  const handleLeave = () => {
    if (channelRef.current) {
      broadcast({ type: 'player:leave', playerId: currentPlayer?.id });
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    setRoom(null); setPlayers([]); setCurrentPlayer(null); setPhase(PHASES.LOBBY);
    setScreen('home'); setPrompt(''); setResults([]); setVotes([]); setScores([]); setLeaderboard([]);
  };
  
  const isHost = currentPlayer?.isHost;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {screen === 'home' && <HomeScreen onCreate={() => setScreen('create')} onJoin={() => setScreen('join')} />}
      {screen === 'create' && <CreateScreen endpoint={endpoint} setEndpoint={setEndpoint} apiKey={apiKey} setApiKey={setApiKey} modelName={modelName} setModelName={setModelName} enableThinking={enableThinking} setEnableThinking={setEnableThinking} onCreate={handleCreateRoom} onBack={() => setScreen('home')} onTest={handleTestEndpoint} testing={testingEndpoint} verified={endpointVerified} testError={testError} />}
      {screen === 'join' && <JoinScreen roomCode={roomCode} setRoomCode={setRoomCode} playerName={playerName} setPlayerName={setPlayerName} onJoin={handleJoinRoom} onBack={() => setScreen('home')} />}
      {screen === 'game' && room && (
        <GameScreen
          room={room} players={players} currentPlayer={currentPlayer} phase={phase} task={task}
          prompt={prompt} setPrompt={setPrompt} timeLeft={timeLeft} results={results} votes={votes}
          scores={scores} leaderboard={leaderboard} round={round} totalRounds={totalRounds}
          processingProgress={processingProgress} showTask={showTask} promptSubmitted={promptSubmitted}
          isHost={isHost} onStartGame={handleStartGame} onSubmitPrompt={handleSubmitPrompt}
          onCastVote={handleCastVote} onStartVoting={handleStartVoting} onCalculateScores={handleCalculateScores}
          onNextRound={handleNextRound} onLeave={handleLeave}
        />
      )}
    </div>
  );
}

function HomeScreen({ onCreate, onJoin }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="text-center animate-fade-in">
        <h1 className="text-6xl md:text-8xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 bg-clip-text text-transparent mb-4">Prompt Battle</h1>
        <p className="text-xl text-slate-300 mb-12 max-w-md mx-auto">A party game where your prompt is your weapon. Same model, same task — best prompt wins.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button onClick={onCreate} className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-xl font-semibold hover:from-purple-500 hover:to-pink-500 transition-all transform hover:scale-105 shadow-lg shadow-purple-500/25">Create Game</button>
          <button onClick={onJoin} className="px-8 py-4 bg-slate-800 border-2 border-slate-600 rounded-xl text-xl font-semibold hover:border-purple-500 hover:text-purple-400 transition-all">Join Game</button>
        </div>
      </div>
    </div>
  );
}

function CreateScreen({ endpoint, setEndpoint, apiKey, setApiKey, modelName, setModelName, enableThinking, setEnableThinking, onCreate, onBack, onTest, testing, verified, testError }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md animate-fade-in">
        <h2 className="text-3xl font-bold text-center mb-8">Create Game</h2>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">LLM Endpoint URL</label>
            <input type="text" value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="http://localhost:1234/v1" className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500" />
            <p className="text-xs text-slate-500 mt-1">OpenAI-compatible API (LM Studio, Ollama, etc.)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Model Name</label>
            <input type="text" value={modelName} onChange={e => setModelName(e.target.value)} placeholder="e.g., llama-3.1-8b" className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">API Key (optional)</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-... (for cloud endpoints)" className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500" />
            <p className="text-xs text-slate-500 mt-1">Only needed for OpenAI, Together, etc. Leave blank for local LLMs.</p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={enableThinking} onChange={e => setEnableThinking(e.target.checked)} className="w-4 h-4 rounded bg-slate-700 border-slate-600 text-purple-600 focus:ring-purple-500" />
            <span className="text-sm text-slate-300">Enable thinking (reasoning models)</span>
          </label>
          <button onClick={onTest} disabled={testing || !endpoint || !modelName} className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 transition-all">
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          {verified && <p className="text-center text-sm text-green-400">Connection successful!</p>}
          {testError && <p className="text-center text-sm text-red-400">{testError}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={onBack} className="flex-1 px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg hover:border-slate-500 transition-all">Back</button>
            <button onClick={onCreate} disabled={!verified} className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-500 hover:to-pink-500 transition-all">Create</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function JoinScreen({ roomCode, setRoomCode, playerName, setPlayerName, onJoin, onBack }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md animate-fade-in">
        <h2 className="text-3xl font-bold text-center mb-8">Join Game</h2>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Room Code</label>
            <input type="text" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} placeholder="X7K9M2" maxLength={6} className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 text-center text-2xl tracking-widest font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Your Name</label>
            <input type="text" value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Enter your name" maxLength={20} className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500" />
          </div>
          <div className="flex gap-3 pt-4">
            <button onClick={onBack} className="flex-1 px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg hover:border-slate-500 transition-all">Back</button>
            <button onClick={onJoin} disabled={!roomCode || !playerName} className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-500 hover:to-pink-500 transition-all">Join</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GameScreen({ room, players, currentPlayer, phase, task, prompt, setPrompt, timeLeft, results, votes, scores, leaderboard, round, totalRounds, processingProgress, showTask, promptSubmitted, isHost, onStartGame, onSubmitPrompt, onCastVote, onStartVoting, onCalculateScores, onNextRound, onLeave }) {
  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-4xl mx-auto flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Prompt Battle</h1>
          <p className="text-sm text-slate-400">Room: <span className="font-mono text-purple-400">{room.code}</span> {currentPlayer && `• ${currentPlayer.name}`}</p>
        </div>
        <button onClick={onLeave} className="px-3 py-1 text-sm bg-slate-800 border border-slate-600 rounded-lg hover:border-red-500 hover:text-red-400 transition-all">Leave</button>
      </div>
      <div className="max-w-4xl mx-auto">
        {phase === PHASES.LOBBY && <LobbyPhase players={players} currentPlayer={currentPlayer} isHost={isHost} onStartGame={onStartGame} roomCode={room.code} />}
        {phase === PHASES.TASK && showTask && task && <TaskDisplay task={task} round={round} totalRounds={totalRounds} />}
        {phase === PHASES.PROMPTING && <PromptingPhase task={task} prompt={prompt} setPrompt={setPrompt} timeLeft={timeLeft} onSubmit={onSubmitPrompt} promptSubmitted={promptSubmitted} />}
        {phase === PHASES.PROCESSING && <ProcessingPhase progress={processingProgress} isHost={isHost} />}
        {phase === PHASES.RESULTS && <ResultsPhase results={results} isHost={isHost} onStartVoting={onStartVoting} />}
        {phase === PHASES.VOTING && <VotingPhase results={results} currentPlayer={currentPlayer} votes={votes} onCastVote={onCastVote} onCalculateScores={onCalculateScores} isHost={isHost} players={players} />}
        {phase === PHASES.SCORES && <ScoresPhase scores={scores} round={round} totalRounds={totalRounds} isHost={isHost} onNextRound={onNextRound} />}
        {phase === PHASES.FINISHED && <FinishedPhase leaderboard={leaderboard} />}
      </div>
    </div>
  );
}

function LobbyPhase({ players, currentPlayer, isHost, onStartGame, roomCode }) {
  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-2">Lobby</h2>
        <p className="text-slate-400">Share this code with players</p>
      </div>
      <div className="flex justify-center mb-8">
        <div className="bg-slate-800 border-2 border-purple-500 rounded-xl px-8 py-4 animate-pulse-glow">
          <span className="text-4xl font-mono font-bold tracking-widest bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">{roomCode}</span>
        </div>
      </div>
      <div className="bg-slate-800/50 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4">Players ({players.length})</h3>
        <div className="space-y-2">
          {players.map(p => (
            <div key={p.id} className={`flex items-center justify-between p-3 rounded-lg ${p.isHost ? 'bg-purple-900/30 border border-purple-500/30' : 'bg-slate-700/30'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${p.isHost ? 'bg-purple-400' : 'bg-green-400'}`} />
                <span>{p.name}</span>
                {p.isHost && <span className="text-xs text-purple-400">HOST</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {isHost && players.length >= 1 && (
        <div className="text-center">
          <button onClick={onStartGame} className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl text-xl font-semibold hover:from-green-500 hover:to-emerald-500 transition-all transform hover:scale-105 shadow-lg shadow-green-500/25">Start Game</button>
        </div>
      )}
      {isHost && players.length === 1 && <p className="text-center text-slate-500">You're the only player. Start to play solo, or wait for friends to join.</p>}
      {!isHost && <p className="text-center text-slate-500">Waiting for host to start...</p>}
    </div>
  );
}

function TaskDisplay({ task, round, totalRounds }) {
  return (
    <div className="animate-fade-in text-center py-16">
      <div className="text-sm text-slate-400 mb-4">Round {round} of {totalRounds}</div>
      <div className="inline-block px-4 py-2 bg-purple-900/50 border border-purple-500/30 rounded-full text-purple-300 text-sm mb-6">{task.category}</div>
      <h2 className="text-3xl md:text-4xl font-bold mb-4">{task.description}</h2>
      <p className="text-slate-400">Get ready to write your prompt...</p>
    </div>
  );
}

function PromptingPhase({ task, prompt, setPrompt, timeLeft, onSubmit, promptSubmitted }) {
  const handleSubmit = (e) => { e.preventDefault(); onSubmit(); };
  return (
    <div className="animate-fade-in">
      <div className="text-center mb-6">
        <div className={`text-6xl font-bold mb-2 ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-white'}`}>{timeLeft}</div>
        <p className="text-slate-400">seconds remaining</p>
      </div>
      <div className="bg-slate-800/50 rounded-xl p-4 mb-6 text-center">
        <div className="text-xs text-purple-400 mb-1">{task?.category}</div>
        <p className="text-lg font-semibold">{task?.description}</p>
      </div>
      <form onSubmit={handleSubmit}>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Write your prompt here..." rows={4} className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none mb-4" disabled={timeLeft <= 0 || promptSubmitted} />
        <button type="submit" disabled={!prompt.trim() || timeLeft <= 0 || promptSubmitted} className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-500 hover:to-pink-500 transition-all">
          {promptSubmitted ? 'Prompt Submitted ✓' : 'Submit Prompt'}
        </button>
      </form>
    </div>
  );
}

function ProcessingPhase({ progress, isHost }) {
  return (
    <div className="animate-fade-in text-center py-16">
      <div className="text-6xl mb-6">🧠</div>
      <h2 className="text-2xl font-bold mb-4">{isHost ? 'Processing Prompts...' : 'Waiting for Host...'}</h2>
      <p className="text-slate-400 mb-8">{isHost ? 'Sending prompts to the model' : 'The host is processing everyone prompts'}</p>
      <div className="max-w-md mx-auto">
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-sm text-slate-500 mt-2">{Math.round(progress)}%</p>
      </div>
    </div>
  );
}

function ResultsPhase({ results, isHost, onStartVoting }) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-center mb-6">Results</h2>
      <div className="space-y-6 mb-8">
        {results.map((result, index) => (
          <div key={result.playerId} className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-1 bg-purple-900/50 rounded text-sm font-mono">Player {String.fromCharCode(65 + index)}</span>
              <span className="text-slate-400 text-sm">{result.playerName}</span>
            </div>
            <div className="mb-3">
              <div className="text-xs text-slate-500 mb-1">Prompt:</div>
              <p className="text-sm text-slate-300 italic">"{result.prompt}"</p>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Output:</div>
              {isSvgResult(result.response) ? (() => {
                  const safe = sanitizeSvg(result.response);
                  return safe ? (
                    <div className="svg-result" dangerouslySetInnerHTML={{ __html: safe }} />
                  ) : (
                    <div className="bg-white text-slate-900 rounded-lg p-4 whitespace-pre-wrap">{result.response}</div>
                  );
                })() : (
                <div className="bg-white text-slate-900 rounded-lg p-4 whitespace-pre-wrap">{result.response}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {isHost && results.length > 0 && (
        <div className="text-center">
          <button onClick={onStartVoting} className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-xl font-semibold hover:from-purple-500 hover:to-pink-500 transition-all transform hover:scale-105">Start Voting</button>
        </div>
      )}
    </div>
  );
}

function VotingPhase({ results, currentPlayer, votes, onCastVote, onCalculateScores, isHost, players }) {
  const myVote = votes.find(v => v.voterId === currentPlayer?.id)?.targetPlayerId;
  const eligibleVoters = players.filter(p => !p.isHost || players.length > 2);
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-center mb-2">Vote!</h2>
      <p className="text-center text-slate-400 mb-6">Pick your favorite (cannot vote for yourself)</p>
      <div className="space-y-4 mb-8">
        {results.map((result, index) => {
          const isSelf = result.playerId === currentPlayer?.id;
          const isSelected = myVote === result.playerId;
          return (
            <button key={result.playerId} onClick={() => !isSelf && onCastVote(result.playerId)} disabled={isSelf}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${isSelf ? 'border-slate-700 opacity-50 cursor-not-allowed' : isSelected ? 'border-purple-500 bg-purple-900/20' : 'border-slate-700 hover:border-purple-400 bg-slate-800/50'}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-1 bg-purple-900/50 rounded text-sm font-mono">Player {String.fromCharCode(65 + index)}</span>
                <span className="text-slate-400 text-sm">{result.playerName}</span>
                {isSelf && <span className="text-xs text-slate-500">(you)</span>}
                {isSelected && <span className="text-xs text-purple-400">✓ voted</span>}
              </div>
              <div className="text-xs text-slate-500 truncate">{isSvgResult(result.response) ? '🎨 SVG Art' : result.response.substring(0, 100) + '...'}</div>
            </button>
          );
        })}
      </div>
      <div className="text-center mb-4"><span className="text-slate-400">{votes.length} of {eligibleVoters.length} votes cast</span></div>
      {isHost && votes.length >= eligibleVoters.length && (
        <div className="text-center">
          <button onClick={onCalculateScores} className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl text-xl font-semibold hover:from-green-500 hover:to-emerald-500 transition-all transform hover:scale-105">Calculate Scores</button>
        </div>
      )}
      {!isHost && <p className="text-center text-slate-500">Waiting for all players to vote...</p>}
    </div>
  );
}

function ScoresPhase({ scores, round, totalRounds, isHost, onNextRound }) {
  const sortedScores = [...scores].sort((a, b) => b.roundScore - a.roundScore);
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold text-center mb-6">Round {round} Scores</h2>
      <div className="space-y-3 mb-8">
        {sortedScores.map((score, index) => (
          <div key={score.playerId} className={`flex items-center justify-between p-4 rounded-xl ${index === 0 ? 'bg-gradient-to-r from-yellow-900/30 to-amber-900/30 border border-yellow-500/30' : 'bg-slate-800/50 border border-slate-700'}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : '#'}</span>
              <span className="font-semibold">{score.playerName}</span>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-purple-400">+{score.roundScore}</div>
              <div className="text-xs text-slate-500">Total: {score.totalScore}</div>
            </div>
          </div>
        ))}
      </div>
      {isHost && (
        <div className="text-center">
          <button onClick={onNextRound} className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-xl font-semibold hover:from-purple-500 hover:to-pink-500 transition-all transform hover:scale-105">
            {round >= totalRounds ? 'See Final Results' : 'Next Round'}
          </button>
        </div>
      )}
      {!isHost && <p className="text-center text-slate-500">{round >= totalRounds ? 'Game over!' : 'Waiting for next round...'}</p>}
    </div>
  );
}

function FinishedPhase({ leaderboard }) {
  const sorted = [...leaderboard].sort((a, b) => b.totalScore - a.totalScore);
  return (
    <div className="animate-fade-in text-center py-8">
      <div className="text-6xl mb-6">🏆</div>
      <h2 className="text-3xl font-bold mb-2">Game Over!</h2>
      <p className="text-slate-400 mb-8">Final Leaderboard</p>
      <div className="space-y-4 max-w-md mx-auto">
        {sorted.map((entry, index) => (
          <div key={index} className={`flex items-center justify-between p-4 rounded-xl ${index === 0 ? 'bg-gradient-to-r from-yellow-900/30 to-amber-900/30 border-2 border-yellow-500/50' : 'bg-slate-800/50 border border-slate-700'}`}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">{index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}</span>
              <span className="font-semibold text-lg">{entry.playerName}</span>
            </div>
            <div className="text-2xl font-bold text-purple-400">{entry.totalScore}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function isSvgResult(response) {
  return response.trim().startsWith('<svg') || response.trim().startsWith('<?xml');
}

function sanitizeSvg(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const svg = doc.querySelector('svg');
  if (!svg) return null;
  svg.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on') || attr.value.includes('javascript:')) {
        el.removeAttribute(attr.name);
      }
    });
  });
  svg.querySelectorAll('script').forEach(s => s.remove());
  return svg.outerHTML;
}
