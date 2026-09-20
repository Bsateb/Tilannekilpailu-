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
  const [hostPin, setHostPin] = useState('')
  const [pinInput, setPinInput] = useState('')
  const [scenarios, setScenarios] = useState([])
  const [players, setPlayers] = useState([])
  const [gameState, setGameState] = useState(null)
  const [answers, setAnswers] = useState([])
  const [votes, setVotes] = useState({})
  const [scores, setScores] = useState({})
  const [csvInput, setCsvInput] = useState('')

  // Host: Aloita peli
  const startGame = async () => {
    const newSessionId = uuidv4().substring(0, 6).toUpperCase()
    const pin = Math.random().toString().slice(2, 6) // 4-numeroinen PIN
    
    setSessionId(newSessionId)
    setHostPin(pin)
    setIsHost(true)
    setMode('host-setup')

    // Luo sessio
    await supabase.from('sessions').insert({
      id: newSessionId,
      game_mode: 'preset'
    })

    // Luo game_state
    await supabase.from('game_state').insert({
      session_id: newSessionId,
      current_phase: 'setup',
      current_scenario_idx: 0,
      current_answer_idx: null,
      host_pin: pin
    })
  }

  // CSV import
  const handleCSVImport = (csv) => {
    const lines = csv.trim().split('\n').filter(l => l.trim())
    const imported = lines.map(line => {
      const [title, context] = line.split('|').map(s => s.trim())
      return { title, context }
    })
    setScenarios(imported)
    setCsvInput('')
  }

  // Player: Liity peliin PIN:llä
  const joinGame = async (code, pin) => {
    // Tarkista PIN
    const { data, error } = await supabase
      .from('game_state')
      .select('host_pin')
      .eq('session_id', code.toUpperCase())
      .single()

    if (error || data.host_pin !== pin) {
      alert('Väärä PIN!')
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

  // Host: Kuuntele game_state:a
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

  // Player: Kuuntele game_state:a
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

  // Kuuntele pelaajia
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

  // Host: Aloita vastaus-kierros
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

  // Host: Siirry seuraavaan vastaukseen
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

  // Player: Kirjoita vastaus
  const submitAnswer = (index, text) => {
    const newAnswers = [...answers]
    newAnswers[index] = text
    setAnswers(newAnswers)
  }

  // Player: Anna tähdet
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

  // ===== HOST SETUP =====
  if (mode === 'host-setup') {
    return (
      <div className="container host">
        <h1>Tilanne-kilpailu 📺 HOST SETUP</h1>
        
        <div className="header" style={{marginBottom: '2rem'}}>
          <div className="session-info">
            <p style={{fontSize: '24px', fontWeight: 'bold', color: '#2196F3', marginBottom: '1rem'}}>
              PIN: <span style={{fontSize: '32px'}}>{hostPin}</span>
            </p>
            <p style={{color: '#666', marginBottom: '1rem'}}>Sessikoodi: <strong>{sessionId}</strong></p>
            <div style={{background: 'white', padding: '10px', borderRadius: '8px', display: 'inline-block'}}>
              <QRCodeSVG value={`https://seliselipeli.netlify.app?join=${sessionId}`} size={150} />
            </div>
            <p style={{marginTop: '1rem', color: '#666', fontSize: '12px'}}>Pelaajia: {players.length}</p>
          </div>
        </div>

        {scenarios.length === 0 && (
          <div className="setup">
            <h2>📋 Lisää tilanteet</h2>
            <textarea 
              value={csvInput}
              onChange={(e) => setCsvInput(e.target.value)}
              placeholder="Tilanne|Paljastus"
              style={{minHeight: '150px', width: '100%', padding: '10px', borderRadius: '6px'}}
            />
            <button onClick={() => handleCSVImport(csvInput)} className="btn btn-primary" style={{marginTop: '1rem'}}>
              📥 Tuo CSV
            </button>
          </div>
        )}

        {scenarios.length > 0 && (
          <div className="setup">
            <h2>Valmis! Pelaajia: {players.length}/15</h2>
            <button onClick={startAnswerRound} className="btn btn-primary" style={{width: '100%', padding: '1rem', fontSize: '18px'}}>
              ▶️ ALOITA PELI
            </button>
          </div>
        )}

        <button onClick={() => setMode('menu')} className="btn" style={{marginTop: '2rem'}}>
          ← Takaisin
        </button>
      </div>
    )
  }

  // ===== HOST GAME =====
  if (mode === 'host' && gameState) {
    const currentScenario = scenarios[gameState.current_scenario_idx]
    const currentAnswer = answers[gameState.current_answer_idx] || ''

    return (
      <div className="container host">
        <h1>Tilanne-kilpailu 📺</h1>
        
        <div style={{marginBottom: '2rem'}}>
          <p style={{color: '#666'}}>Kierros {gameState.current_scenario_idx + 1}/{scenarios.length} | Pelaajia: {players.length}</p>
          <p className="prompt">❓ {currentScenario.title}</p>
        </div>

        {gameState.current_phase === 'answering' && (
          <div className="game-display">
            <h2>Vastaus {gameState.current_answer_idx + 1}</h2>
            <div className="answer-box" style={{background: '#f0f0f0', padding: '2rem', borderRadius: '8px', marginBottom: '2rem'}}>
              <p style={{fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem'}}>
                {currentAnswer || '(odottaa vastausta)'}
              </p>
              <p style={{color: '#666'}}>🗳️ Äänet: <strong>{votes[`answer-${gameState.current_answer_idx}`] || 0}</strong></p>
            </div>

            <button onClick={nextAnswer} className="btn btn-primary" style={{width: '100%', padding: '1rem'}}>
              Seuraava →
            </button>
          </div>
        )}

        <button onClick={() => setMode('menu')} className="btn" style={{marginTop: '2rem'}}>
          ← Takaisin
        </button>
      </div>
    )
  }

  // ===== PLAYER JOIN =====
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
            style={{width: '100%', padding: '10px', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #ddd'}}
          />
          <input 
            type="text" 
            placeholder="Sessikoodi (esim. ABC123)"
            id="sessionCode"
            style={{width: '100%', padding: '10px', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #ddd'}}
          />
          <input 
            type="text" 
            placeholder="PIN (4 numeroa)"
            id="pinCode"
            style={{width: '100%', padding: '10px', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #ddd'}}
          />
          <button 
            onClick={() => {
              const code = document.getElementById('sessionCode').value
              const pin = document.getElementById('pinCode').value
              if (playerName && code && pin) {
                joinGame(code, pin)
              }
            }} 
            className="btn btn-primary" 
            style={{width: '100%'}}
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

  // ===== PLAYER GAME =====
  if (mode === 'player' && gameState) {
    return (
      <div className="container player">
        <h1>Tilanne-kilpailu 📱</h1>
        <p style={{textAlign: 'center', color: '#666'}}>Sessiossa: <strong>{sessionId}</strong></p>

        {gameState.current_phase === 'setup' && (
          <div className="player-screen">
            <p>⏳ Odottaa pelin alkua...</p>
            <p style={{marginTop: '1rem', fontSize: '14px', color: '#999'}}>Nimesi: {playerName}</p>
          </div>
        )}

        {gameState.current_phase === 'answering' && (
          <div className="player-screen">
            <h3 style={{marginBottom: '1.5rem'}}>Kirjoita neuvosi</h3>
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
              {answers.map((ans, i) => (
                <input
                  key={i}
                  type="text"
                  placeholder={`Vastaus ${i + 1}`}
                  value={ans}
                  onChange={(e) => submitAnswer(i, e.target.value)}
                  disabled={ans !== ''}
                  style={{padding: '10px', borderRadius: '6px', border: '1px solid #ddd'}}
                />
              ))}
            </div>

            <div style={{marginTop: '2rem'}}>
              <p style={{marginBottom: '1rem', color: '#666'}}>Anna tähdet (1-3)</p>
              <div style={{display: 'flex', gap: '1rem', justifyContent: 'center'}}>
                {[1, 2, 3].map(stars => (
                  <button
                    key={stars}
                    onClick={() => submitVote(stars)}
                    style={{
                      padding: '12px 24px',
                      fontSize: '18px',
                      background: '#ffc107',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    {'⭐'.repeat(stars)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <button onClick={() => setMode('menu')} className="btn" style={{marginTop: '2rem'}}>
          ← Takaisin
        </button>
      </div>
    )
  }

  // ===== MENU =====
  return (
    <div className="container menu">
      <h1>🎮 Tilanne-kilpailu</h1>
      <div className="menu-buttons">
        <button onClick={startGame} className="btn btn-primary">
          📺 Aloita HOST
        </button>
        <button onClick={() => setMode('player-join')} className="btn btn-primary">
          📱 Liity peliin
        </button>
      </div>
    </div>
  )
}
