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
  const [answers, setAnswers] = useState(['', '', '', ''])
  const [votes, setVotes] = useState({})
  const [csvInput, setCsvInput] = useState('')
  const [currentScenario, setCurrentScenario] = useState(null)
  const [loading, setLoading] = useState(false)

  const startGame = async () => {
    const newSessionId = uuidv4().substring(0, 6).toUpperCase()
    const hostPlayerId = uuidv4()
    
    setSessionId(newSessionId)
    setPlayerId(hostPlayerId)
    setIsHost(true)
    setMode('host-setup')

    await supabase.from('sessions').insert({
      id: newSessionId,
      game_mode: 'preset',
      created_at: new Date().toISOString()
    })

    await supabase.from('game_state').insert({
      session_id: newSessionId,
      current_phase: 'setup',
      current_scenario_idx: 0,
      current_answer_idx: 0,
      host_pin: null,
      started_at: new Date().toISOString()
    })

    await supabase.from('players').insert({
      id: hostPlayerId,
      session_id: newSessionId,
      name: '🎤 Juontaja',
      joined_at: new Date().toISOString()
    })
  }

  const handleCSVImport = async (csv) => {
    if (!sessionId) return

    const lines = csv.trim().split('\n').filter(l => l.trim())
    const imported = lines.map(line => {
      const [title, context] = line.split('|').map(s => s.trim())
      return { title, context }
    })

    for (const scenario of imported) {
      await supabase.from('scenarios').insert({
        session_id: sessionId,
        title: scenario.title,
        context: scenario.context,
        created_by: '🎤 Juontaja',
        created_at: new Date().toISOString()
      })
    }

    setScenarios(imported)
    setCsvInput('')
  }

  const joinGame = async (code) => {
    setLoading(true)
    
    try {
      const { data: gameStateData, error: gsError } = await supabase
        .from('game_state')
        .select('*')
        .eq('session_id', code.toUpperCase())
        .single()

      if (gsError || !gameStateData) {
        alert('Sessiota ei löydy!')
        setLoading(false)
        return
      }

      const { data: scenariosData } = await supabase
        .from('scenarios')
        .select('*')
        .eq('session_id', code.toUpperCase())
        .order('id', { ascending: true })

      const newPlayerId = uuidv4()
      
      await supabase.from('players').insert({
        id: newPlayerId,
        session_id: code.toUpperCase(),
        name: playerName || `Pelaaja ${Math.floor(Math.random() * 1000)}`,
        joined_at: new Date().toISOString()
      })

      setPlayerId(newPlayerId)
      setSessionId(code.toUpperCase())
      setGameState(gameStateData)
      if (scenariosData) setScenarios(scenariosData)
      setMode('player')
    } catch (error) {
      console.error('Join error:', error)
      alert('Virhe liittyessä peliin!')
    }
    
    setLoading(false)
  }

  useEffect(() => {
    if (!sessionId) return

    const fetchScenarios = async () => {
      const { data } = await supabase
        .from('scenarios')
        .select('*')
        .eq('session_id', sessionId)
        .order('id', { ascending: true })
      
      if (data) setScenarios(data)
    }

    fetchScenarios()

    const subscription = supabase
      .channel(`scenarios:${sessionId}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'scenarios' },
        (payload) => {
          setScenarios(prev => [...prev, payload.new])
        }
      )
      .subscribe()

    return () => subscription.unsubscribe()
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return

    const fetchGameState = async () => {
      const { data } = await supabase
        .from('game_state')
        .select('*')
        .eq('session_id', sessionId)
        .single()
      
      if (data) {
        setGameState(data)
        if (scenarios.length > 0 && data.current_scenario_idx < scenarios.length) {
          setCurrentScenario(scenarios[data.current_scenario_idx])
        }
      }
    }

    fetchGameState()

    const subscription = supabase
      .channel(`game-state:${sessionId}`)
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'game_state' },
        (payload) => {
          setGameState(payload.new)
          if (scenarios.length > 0 && payload.new.current_scenario_idx < scenarios.length) {
            setCurrentScenario(scenarios[payload.new.current_scenario_idx])
          }
        }
      )
      .subscribe()

    return () => subscription.unsubscribe()
  }, [sessionId, scenarios])

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

    const subscription = supabase
      .channel(`players:${sessionId}`)
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'players' },
        (payload) => {
          setPlayers(prev => [...prev, payload.new])
        }
      )
      .subscribe()

    return () => subscription.unsubscribe()
  }, [sessionId])

  const startAnsweringPhase = async () => {
    if (scenarios.length === 0) return

    await supabase.from('game_state')
      .update({
        current_phase: 'answering',
        current_scenario_idx: 0,
        current_answer_idx: 0
      })
      .eq('session_id', sessionId)

    setAnswers(['', '', '', ''])
    setVotes({})
    setMode('host')
  }

  const moveToNextAnswer = async () => {
    if (!gameState || !scenarios.length) return

    if (gameState.current_answer_idx < 3) {
      await supabase.from('game_state')
        .update({ 
          current_answer_idx: gameState.current_answer_idx + 1,
          current_phase: 'voting'
        })
        .eq('session_id', sessionId)
    } else if (gameState.current_scenario_idx < scenarios.length - 1) {
      await supabase.from('game_state')
        .update({
          current_scenario_idx: gameState.current_scenario_idx + 1,
          current_answer_idx: 0,
          current_phase: 'answering'
        })
        .eq('session_id', sessionId)
      
      setAnswers(['', '', '', ''])
      setVotes({})
    } else {
      alert('Peli päättyi!')
      setMode('menu')
    }
  }

  const submitPlayerAnswer = (index, text) => {
    const newAnswers = [...answers]
    newAnswers[index] = text
    setAnswers(newAnswers)
  }

  const submitPlayerVote = (stars) => {
    if (!gameState) return

    const answerKey = `answer-${gameState.current_answer_idx}`
    setVotes(prev => ({
      ...prev,
      [answerKey]: stars
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
        
        <div style={{marginBottom: '2rem'}}>
          <p style={{fontSize: '24px', fontWeight: 'bold', color: '#2196F3', marginBottom: '1rem'}}>
            Koodi: <span style={{fontSize: '32px'}}>{sessionId}</span>
          </p>
          <div style={{background: 'white', padding: '10px', borderRadius: '8px', display: 'inline-block'}}>
            <QRCodeSVG value={`https://tilannekilpailu.vercel.app?join=${sessionId}`} size={150} />
          </div>
        </div>

        <PlayersList />

        {scenarios.length === 0 && (
          <div>
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
          <div>
            <h2>✓ Valmis!</h2>
            <p style={{fontSize: '16px', color: '#666'}}>📍 Tilanteet: {scenarios.length}</p>
            <p style={{fontSize: '16px', color: '#666'}}>👥 Pelaajia: {players.length - 1} (ilman juontajaa)</p>
            <button onClick={startAnsweringPhase} className="btn btn-primary" style={{width: '100%', padding: '1rem', fontSize: '18px', marginTop: '1rem'}}>
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

  if (mode === 'host' && gameState && currentScenario) {
    const currentAnswer = answers[gameState.current_answer_idx] || ''

    return (
      <div className="container host">
        <h1>Tilanne-kilpailu 📺</h1>
        
        <div style={{marginBottom: '2rem', textAlign: 'center'}}>
          <p style={{color: '#666', marginBottom: '0.5rem'}}>Kierros {gameState.current_scenario_idx + 1}/{scenarios.length}</p>
          <p style={{fontSize: '18px', fontWeight: 'bold', color: '#2196F3', marginBottom: 0}}>❓ {currentScenario.title}</p>
        </div>

        <PlayersList />

        <div style={{background: '#fafafa', padding: '2rem', borderRadius: '8px', marginBottom: '2rem'}}>
          {gameState.current_phase === 'answering' && (
            <>
              <h2 style={{textAlign: 'center', marginTop: 0}}>✍️ Pelaajat kirjoittavat neuvoja...</h2>
              <p style={{textAlign: 'center', fontSize: '14px', color: '#999'}}>Odottaa vastauksia...</p>
            </>
          )}

          {gameState.current_phase === 'voting' && (
            <>
              <h2 style={{textAlign: 'center', marginTop: 0}}>Vastaus {gameState.current_answer_idx + 1}</h2>
              <div style={{background: '#f0f0f0', padding: '2rem', borderRadius: '8px', marginBottom: '2rem', minHeight: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <p style={{fontSize: '18px', fontWeight: 'bold', textAlign: 'center', margin: 0}}>
                  {currentAnswer || '(ei vastausta)'}
                </p>
              </div>
              <p style={{textAlign: 'center', marginBottom: 0, color: '#666'}}>
                🗳️ Äänet: <strong>{votes[`answer-${gameState.current_answer_idx}`] || 0}</strong>
              </p>
            </>
          )}
        </div>

        <button onClick={moveToNextAnswer} className="btn btn-primary" style={{width: '100%', padding: '1rem', fontSize: '16px'}}>
          Seuraava →
        </button>

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
            disabled={loading}
            style={{width: '100%', padding: '12px', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px', boxSizing: 'border-box'}}
          />
          <input 
            type="text" 
            placeholder="Sessikoodi (esim. ABC123)"
            id="sessionCode"
            disabled={loading}
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
            disabled={loading}
            className="btn btn-primary" 
            style={{width: '100%', padding: '12px', fontSize: '16px', opacity: loading ? 0.6 : 1}}
          >
            {loading ? '⏳ Liitytään...' : 'Liity'}
          </button>
          <button onClick={() => setMode('menu')} className="btn" disabled={loading} style={{width: '100%', marginTop: '1rem', opacity: loading ? 0.6 : 1}}>
            ← Takaisin
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'player') {
    if (!gameState || gameState.current_phase === 'setup') {
      return (
        <div className="container player">
          <h1>Tilanne-kilpailu 📱</h1>
          <p style={{textAlign: 'center', color: '#666', marginBottom: '1.5rem'}}>Sessiossa: <strong>{sessionId}</strong></p>
          <p style={{textAlign: 'center', fontSize: '14px', color: '#999', marginBottom: '1rem'}}>Pelaajia: {players.length}</p>
          <PlayersList />
          <p style={{textAlign: 'center', fontSize: '18px', marginTop: '2rem'}}>⏳ Odottaa pelin alkua...</p>
          <button onClick={() => setMode('menu')} className="btn" style={{marginTop: '2rem', width: '100%'}}>
            ← Takaisin
          </button>
        </div>
      )
    }

    if (gameState.current_phase === 'answering' && currentScenario) {
      return (
        <div className="container player">
          <h1>Tilanne-kilpailu 📱</h1>
          <p style={{textAlign: 'center', color: '#666', marginBottom: '1rem'}}>Sessiossa: <strong>{sessionId}</strong></p>

          <div style={{background: '#f9f9f9', padding: '1rem', borderRadius: '8px', marginBottom: '2rem'}}>
            <p style={{fontSize: '14px', color: '#666', marginTop: 0, marginBottom: '0.5rem'}}>Tilanne:</p>
            <p style={{fontSize: '18px', fontWeight: 'bold', marginBottom: 0}}>❓ {currentScenario.title}</p>
          </div>

          <div style={{marginBottom: '2rem'}}>
            <h3 style={{marginBottom: '1.5rem', textAlign: 'center'}}>✍️ Kirjoita neuvosi (neljä)</h3>
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
              {answers.map((ans, i) => (
                <input
                  key={i}
                  type="text"
                  placeholder={`Neuvosi ${i + 1}`}
                  value={ans}
                  onChange={(e) => submitPlayerAnswer(i, e.target.value)}
                  style={{padding: '12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '16px', boxSizing: 'border-box'}}
                />
              ))}
            </div>
          </div>

          <button onClick={() => setMode('menu')} className="btn" style={{width: '100%'}}>
            ← Takaisin
          </button>
        </div>
      )
    }

    if (gameState.current_phase === 'voting' && currentScenario) {
      return (
        <div className="container player">
          <h1>Tilanne-kilpailu 📱</h1>
          <p style={{textAlign: 'center', color: '#666', marginBottom: '1rem'}}>Sessiossa: <strong>{sessionId}</strong></p>

          <div style={{background: '#f9f9f9', padding: '1rem', borderRadius: '8px', marginBottom: '2rem'}}>
            <p style={{fontSize: '14px', color: '#666', marginTop: 0, marginBottom: '0.5rem'}}>Tilanne:</p>
            <p style={{fontSize: '18px', fontWeight: 'bold', marginBottom: 0}}>❓ {currentScenario.title}</p>
          </div>

          <div style={{marginBottom: '2rem'}}>
            <h3 style={{marginBottom: '2rem', textAlign: 'center'}}>⭐ Arvioi vastaus</h3>
            <p style={{textAlign: 'center', fontSize: '14px', color: '#666', marginBottom: '1.5rem'}}>Vastaus {gameState.current_answer_idx + 1} / 4</p>
            
            <div style={{display: 'flex', gap: '1rem', justifyContent: 'center'}}>
              {[1, 2, 3].map(stars => (
                <button
                  key={stars}
                  onClick={() => submitPlayerVote(stars)}
                  style={{
                    padding: '16px 20px',
                    fontSize: '24px',
                    background: votes[`answer-${gameState.current_answer_idx}`] === stars ? '#ff9800' : '#ffc107',
                    color: '#333',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.1s',
                    boxShadow: votes[`answer-${gameState.current_answer_idx}`] === stars ? '0 4px 8px rgba(0,0,0,0.2)' : 'none'
                  }}
                  onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'}
                  onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                >
                  {'⭐'.repeat(stars)}
                </button>
              ))}
            </div>
          </div>

          <p style={{textAlign: 'center', color: '#999', fontSize: '14px'}}>
            {votes[`answer-${gameState.current_answer_idx}`] 
              ? `✓ Olet antanut ${votes[`answer-${gameState.current_answer_idx}`]} tähteä` 
              : 'Valitse tähdet...'}
          </p>

          <button onClick={() => setMode('menu')} className="btn" style={{marginTop: '2rem', width: '100%'}}>
            ← Takaisin
          </button>
        </div>
      )
    }
  }

  return (
    <div className="container menu">
      <h1>🎮 Tilanne-kilpailu</h1>
      <p style={{textAlign: 'center', color: '#666', marginBottom: '2rem'}}>Hauskaa seuraavaksi synttäreillä!</p>
      <div style={{maxWidth: '400px', margin: '0 auto'}}>
        <button onClick={startGame} className="btn btn-primary" style={{width: '100%', padding: '1rem', fontSize: '18px', marginBottom: '1rem'}}>
          📺 Aloita HOST
        </button>
        <button onClick={() => setMode('player-join')} className="btn btn-primary" style={{width: '100%', padding: '1rem', fontSize: '18px'}}>
          📱 Liity peliin
        </button>
      </div>
    </div>
  )
}
