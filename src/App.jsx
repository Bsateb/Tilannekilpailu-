import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { QRCodeSVG } from 'qrcode.react'
import './App.css'

const SUPABASE_URL = 'https://sjvlyrtaqyywlvrcptzy.supabase.co'
const SUPABASE_KEY = 'sb_publishable_9Q76hK2aATVqJAtK07MmDQ_GA1o8PHi'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default function App() {
  const [mode, setMode] = useState('menu')
  const [sessionId, setSessionId] = useState(null)
  const [playerId, setPlayerId] = useState(null)
  const [playerName, setPlayerName] = useState('')
  const [isHost, setIsHost] = useState(false)
  const [scenarios, setScenarios] = useState([])
  const [players, setPlayers] = useState([])
  const [gameState, setGameState] = useState(null)
  const [answers, setAnswers] = useState([])
  const [votes, setVotes] = useState({})
  const [scores, setScores] = useState({})
  const [csvInput, setCsvInput] = useState('')

  const startGame = async () => {
    const newSessionId = uuidv4().substring(0, 6).toUpperCase()
    const hostPlayerId = uuidv4()
    
    setSessionId(newSessionId)
    setPlayerId(hostPlayerId)
    setIsHost(true)
    setMode('host-setup')

    await supabase.from('sessions').insert({
      id: newSessionId,
      game_mode: 'preset'
    })

    await supabase.from('game_state').insert({
      session_id: newSessionId,
      current_phase: 'setup',
      current_scenario_idx: 0,
      current_answer_idx: null,
      host_pin: null
    })

    await supabase.from('players').insert({
      id: hostPlayerId,
      session_id: newSessionId,
      name: '🎤 Juontaja'
    })
  }

  const handleCSVImport = (csv) => {
    const lines = csv.trim().split('\n').filter(l => l.trim())
    const imported = lines.map(line => {
      const [title, context] = line.split('|').map(s => s.trim())
      return { title, context }
    })
    setScenarios(imported)
    setCsvInput('')
  }

  const joinGame = async (code) => {
    const { data, error } = await supabase
      .from('game_state')
      .select('*')
      .eq('session_id', code.toUpperCase())
      .single()

    if (error) {
      alert('Sessiota ei löydy!')
      return
    }

    const newPlayerId = uuidv4()
    setPlayerId(newPlayerId)
    setSessionId(code.toUpperCase())
    setMode('player')

    await supabase.from('players').insert({
      id: newPlayerId,
      session_id: code.toUpperCase(),
      name: playerName || `Pelaaja ${Math.floor(Math.random() * 1000)}`
    })
  }

  useEffect(() => {
    if (!sessionId || !isHost) return

    const subscription = supabase
      .channel(`game-state:${sessionId}`)
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'game_state' }, 
        (payload) => {
          setGameState(payload.new)
        }
      )
      .subscribe()

    return () => subscription.unsubscribe()
  }, [sessionId, isHost])

  useEffect(() => {
    if (!sessionId || isHost) return

    const subscription = supabase
      .channel(`game-state:${sessionId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_state' },
        (payload) => {
          setGameState(payload.new)
        }
      )
      .subscribe()

    return () => subscription.unsubscribe()
  }, [sessionId, isHost])

  useEffect(() => {
    if (!sessionId) return

    const subscription = supabase
      .channel(`players:${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players' }, (payload) => {
        setPlayers(prev => [...prev, payload.new])
      })
      .subscribe()

    return () => subscription.unsubscribe()
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return

    const fetchPlayers = async () => {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('session_id', sessionId)
      if (data) setPlayers(data)
    }

    fetchPlayers()
  }, [sessionId])

  const startAnswerRound = async () => {
    if (scenarios.length === 0) return

    await supabase.from('game_state')
      .update({
        current_phase: 'answering',
        current_answer_idx: 0
      })
      .eq('session_id', sessionId)

    setAnswers(['', '', '', ''])
    setVotes({})
  }

  const nextAnswer = async () => {
    if (!gameState) return

    if (gameState.current_answer_idx < 3) {
      await supabase.from('game_state')
        .update({ current_answer_idx: gameState.current_answer_idx + 1 })
        .eq('session_id', sessionId)
    } else if (gameState.current_scenario_idx < scenarios.length - 1) {
      await supabase.from('game_state')
        .update({
          current_scenario_idx: gameState.current_scenario_idx + 1,
          current_phase: 'setup',
          current_answer_idx: null
        })
        .eq('session_id', sessionId)
      setAnswers([])
      setVotes({})
    } else {
      alert('Peli päättyi!')
      setMode('menu')
    }
  }

  const submitAnswer = (index, text) => {
    const newAnswers = [...answers]
    newAnswers[index] = text
    setAnswers(newAnswers)
  }

  const submitVote = async (stars) => {
    if (!gameState) return

    const key = `answer-${gameState.current_answer_idx}`
    setVotes(prev => ({
      ...prev,
      [key]: (prev[key] || 0) + stars
    }))

    setScores(prev => ({
      ...prev,
      [gameState.current_answer_idx]: (prev[gameState.current_answer_idx] || 0) + stars
    }))
  }

  const PlayersList = () => (
    <div style={{background: '#f5f5f5', padding: '1rem', borderRadius: '8px', marginBottom: '2rem'}}>
      <h3 style={{marginTop: 0, marginBottom: '1rem'}}>👥 Pelaajat ({players.length})</h3>
      <div>
        {players.map(p => (
          <div key={p.id} style={{padding: '0.75rem', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
            <span style={{fontSize: '16px'}}>{p.name}</span>
            {p.name.includes('🎤') && <span style={{fontSize: '12px', color: '#2196F3', fontWeight: 'bold'}}>HOST</span>}
          </div>
        ))}
      </div>
    </div>
  )

  if (mode === 'host-setup') {
    return (
      <div className="container host">
        <h1>Tilanne-kilpailu 📺 HOST SETUP</h1>
        
        <div className="header" style={{marginBottom: '2rem'}}>
          <div className="session-info">
            <p style={{fontSize: '24px', fontWeight: 'bold', color: '#2196F3', marginBottom: '1rem'}}>
              Koodi: <span style={{fontSize: '32px'}}>{sessionId}</span>
            </p>
            <div style={{background: 'white', padding: '10px', borderRadius: '8px', display: 'inline-block'}}>
              <QRCodeSVG value={`https://seliselipeli.netlify.app?join=${sessionId}`} size={150} />
            </div>
          </div>
        </div>

        <PlayersList />

        {scenarios.length === 0 && (
          <div className="setup">
            <h2>📋 Lisää tilanteet</h2>
            <textarea 
              value={csvInput}
              onChange={(e) => setCsvInput(e.target.value)}
              placeholder="Tilanne|Paljastus"
              style={{minHeight: '150px', width: '100%', padding: '10px', borderRadius: '6px', fontFamily: 'monospace', boxSizing: 'border-box'}}
            />
            <button onClick={() => handleCSVImport(csvInput)} className="btn btn-primary" style={{marginTop: '1rem', width: '100%'}}>
              📥 Tuo tilanteet
            </button>
          </div>
        )}

        {scenarios.length > 0 && (
          <div className="setup">
            <h2>✓ Valmis! Pelaajia: {players.length - 1}/15</h2>
            <p style={{fontSize: '14px', color: '#666'}}>({players.length - 1} = pelaajat ilman juontajaa)</p>
            <button onClick={startAnswerRound} className="btn btn-primary" style={{width: '100%', padding: '1rem', fontSize: '18px', marginTop: '1rem'}}>
              ▶️ ALOITA PELI
            </button>
          </div>
        )}

        <button onClick={() => setMode('menu')} className="btn" style={{marginTop: '2rem', width: '100%'}}>
          ← Takaisin
        </button>
      </div>
    )
  }

  if (mode === 'host' && gameState) {
    const currentScenario = scenarios[gameState.current_scenario_idx]
    const currentAnswer = answers[gameState.current_answer_idx] || ''

    return (
      <div className="container host">
        <h1>Tilanne-kilpailu 📺</h1>
        
        <div style={{marginBottom: '2rem'}}>
          <p style={{color: '#666'}}>Kierros {gameState.current_scenario_idx + 1}/{scenarios.length}</p>
          <p className="prompt">❓ {currentScenario.title}</p>
        </div>

        <PlayersList />

        {gameState.current_phase === 'answering' && (
          <div className="game-display">
            <h2>Vastaus {gameState.current_answer_idx + 1}</h2>
            <div className="answer-box" style={{background: '#f0f0f0', padding: '2rem', borderRadius: '8px', marginBottom: '2rem', minHeight: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
              <p style={{fontSize: '18px', fontWeight: 'bold', textAlign: 'center'}}>
                {currentAnswer || '(odottaa vastausta)'}
              </p>
            </div>

            <p style={{marginBottom: '1rem', color: '#666'}}>🗳️ Äänet: <strong>{votes[`answer-${gameState.current_answer_idx}`] || 0}</strong></p>

            <button onClick={nextAnswer} className="btn btn-primary" style={{width: '100%', padding: '1rem', fontSize: '16px'}}>
              Seuraava →
            </button>
          </div>
        )}

        {gameState.current_phase === 'setup' && (
          <div className="game-display">
            <p style={{textAlign: 'center', fontSize: '18px'}}>⏳ Seuraava kierros alkaa...</p>
          </div>
        )}

        <button onClick={() => setMode('menu')} className="btn" style={{marginTop: '2rem', width: '100%'}}>
          ← Takaisin
        </button>
      </div>
    )
  }

  if (mode === 'player-join') {
    return (
      <div className="container menu">
        <h1>🎮 Liity peliin</h1>
        <div style={{maxWidth: '400px', margin: '0 auto'}}>
          <input 
            type="text" 
            placeholder="Nimesi"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            style={{width: '100%', padding: '12px', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px', boxSizing: 'border-box'}}
          />
          <input 
            type="text" 
            placeholder="Sessikoodi (esim. ABC123)"
            id="sessionCode"
            style={{width: '100%', padding: '12px', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px', boxSizing: 'border-box'}}
          />
          <button 
            onClick={() => {
              const code = document.getElementById('sessionCode').value
              if (playerName && code) {
                joinGame(code)
              } else {
                alert('Kirjoita nimi ja sessikoodi!')
              }
            }} 
            className="btn btn-primary" 
            style={{width: '100%', padding: '12px', fontSize: '16px'}}
          >
            Liity
          </button>
          <button onClick={() => setMode('menu')} className="btn" style={{width: '100%', marginTop: '1rem'}}>
            ← Takaisin
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'player' && gameState) {
    return (
      <div className="container player">
        <h1>Tilanne-kilpailu 📱</h1>
        <p style={{textAlign: 'center', color: '#666', marginBottom: '1.5rem'}}>Sessiossa: <strong>{sessionId}</strong></p>

        <PlayersList />

        {gameState.current_phase === 'setup' && (
          <div className="player-screen">
            <p style={{textAlign: 'center', fontSize: '18px'}}>⏳ Odottaa pelin alkua...</p>
          </div>
        )}

        {gameState.current_phase === 'answering' && (
          <div className="player-screen">
            <h3 style={{marginBottom: '1.5rem', textAlign: 'center'}}>Kirjoita neuvosi (neljä)</h3>
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
              {answers.map((ans, i) => (
                <input
                  key={i}
                  type="text"
                  placeholder={`Neuvosi ${i + 1}`}
                  value={ans}
                  onChange={(e) => submitAnswer(i, e.target.value)}
                  style={{padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px', boxSizing: 'border-box'}}
                />
              ))}
            </div>

            <div style={{marginTop: '2rem', textAlign: 'center'}}>
              <p style={{marginBottom: '1rem', color: '#666'}}>Anna tähdet</p>
              <div style={{display: 'flex', gap: '0.75rem', justifyContent: 'center'}}>
                {[1, 2, 3].map(stars => (
                  <button
                    key={stars}
                    onClick={() => submitVote(stars)}
                    style={{
                      padding: '12px 16px',
                      fontSize: '20px',
                      background: '#ffc107',
                      color: '#333',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    {'⭐'.repeat(stars)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <button onClick={() => setMode('menu')} className="btn" style={{marginTop: '2rem', width: '100%'}}>
          ← Takaisin
        </button>
      </div>
    )
  }

  return (
    <div className="container menu">
      <h1>🎮 Tilanne-kilpailu</h1>
      <p style={{textAlign: 'center', color: '#666', marginBottom: '2rem'}}>Hauskaa seuraavaksi synttäreillä!</p>
      <div className="menu-buttons" style={{maxWidth: '400px', margin: '0 auto'}}>
        <button onClick={startGame} className="btn btn-primary" style={{width: '100%', padding: '1rem', fontSize: '18px', marginBottom: '1rem'}}>
          📺 Aloita HOST
        </button>
        <button onClick={() => setMode('player-join')} className="btn btn-primary" style={{width: '100%', padding: '1rem', fontSize: '18px'}}>
          📱 Liity peliin
        </button>
      </div>
    </div>
  )
