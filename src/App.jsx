import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { QRCodeSVG } from 'qrcode.react'  // ← RIVI 4 (KORJATTU)
import './App.css'

const SUPABASE_URL = 'https://sjvlyrtaqyywlvrcptzy.supabase.co'
const SUPABASE_KEY = 'sb_publishable_9Q76hK2aATVqJAtK07MmDQ_GA1o8PHi'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default function App() {
  const [mode, setMode] = useState('menu')
  const [sessionId, setSessionId] = useState(null)
  const [playerId, setPlayerId] = useState(null)
  const [gameMode, setGameMode] = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [players, setPlayers] = useState([])
  const [currentScenarioIdx, setCurrentScenarioIdx] = useState(0)
  const [currentAnswerIdx, setCurrentAnswerIdx] = useState(null)
  const [csvInput, setCsvInput] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [answers, setAnswers] = useState([])
  const [votes, setVotes] = useState({})
  const [scores, setScores] = useState({})
  const [gameStarted, setGameStarted] = useState(false)

  // Host: Aloita peli
  const startGame = async (selectedMode) => {
    const newSessionId = uuidv4().substring(0, 6).toUpperCase()
    setSessionId(newSessionId)
    setGameMode(selectedMode)
    setMode('host')

    await supabase.from('sessions').insert({
      id: newSessionId,
      game_mode: selectedMode
    })

    if (selectedMode === 'preset') {
      const defaultScenarios = [
        {
          title: 'Mitä sanot vanhalle miehelle, joka roikkuu pää alaspäin?',
          context: 'Tosiasiassa oletkin itse pää alaspäin ja vanha mies näyttää roikkuvan pääalaspäin.'
        },
        {
          title: 'Mikä on paras neuvosi nuorelle, joka ei halua mennä töihin?',
          context: 'Tosiasiassa hän on jo yrittäjä ja kertoo asiasta sijoittajille.'
        }
      ]
      setScenarios(defaultScenarios)
    }
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

  // Player: Liity peliin
  const joinGame = async (sessionCode) => {
    const newPlayerId = uuidv4()
    setPlayerId(newPlayerId)
    setSessionId(sessionCode)
    setMode('player')

    await supabase.from('players').insert({
      id: newPlayerId,
      session_id: sessionCode,
      name: playerName || `Pelaaja ${Math.floor(Math.random() * 1000)}`
    })
  }

  // Kuuntele pelaajia
  useEffect(() => {
    if (!sessionId || mode !== 'host') return

    const subscription = supabase
      .channel(`players:${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players' }, (payload) => {
        setPlayers(prev => [...prev, payload.new])
      })
      .subscribe()

    return () => subscription.unsubscribe()
  }, [sessionId, mode])

  // Host: Aloita vastaus-kierros
  const startAnswerRound = () => {
    if (currentScenarioIdx < scenarios.length) {
      setGameStarted(true)
      setCurrentAnswerIdx(0)
      setAnswers(['', '', '', ''])
      setVotes({})
    }
  }

  // Player: Kirjoita vastaus
  const submitAnswer = async (answerText) => {
    if (sessionId && playerId && currentScenarioIdx < scenarios.length) {
      const answerIdx = answers.findIndex(a => a === '')
      if (answerIdx !== -1) {
        const newAnswers = [...answers]
        newAnswers[answerIdx] = answerText
        setAnswers(newAnswers)
      }
    }
  }

  // Player: Anna tähdet
  const submitVote = async (stars) => {
    if (sessionId && playerId && currentAnswerIdx !== null) {
      const key = `answer-${currentAnswerIdx}`
      setVotes(prev => ({
        ...prev,
        [key]: (prev[key] || 0) + stars
      }))
      
      setScores(prev => ({
        ...prev,
        [currentAnswerIdx]: (prev[currentAnswerIdx] || 0) + stars
      }))
    }
  }

  // HOST VIEW
  if (mode === 'host') {
    return (
      <div className="container host">
        <div className="header">
          <h1>Tilanne-kilpailu 📺 HOST</h1>
          <div className="session-info">
            <div className="session-code">
              <strong>Sessikoodi:</strong> {sessionId}
            </div>
            <div style={{marginTop: '1rem', background: 'white', padding: '10px', borderRadius: '8px', display: 'inline-block'}}>
              <QRCodeSVG value={`https://seliselipeli.netlify.app?join=${sessionId}`} size={150} />  {/* ← RIVI 145 (KORJATTU) */}
            </div>
            <p style={{marginTop: '1rem', color: '#666', fontSize: '12px'}}>Pelaajia: {players.length}</p>
          </div>
        </div>

        {/* Setup */}
        {scenarios.length === 0 && !gameStarted && (
          <div className="setup">
            <h2>📋 Lisää tilanteet</h2>
            <div className="csv-section">
              <label>CSV-muoto: Tilanne|Paljastus</label>
              <textarea 
                value={csvInput}
                onChange={(e) => setCsvInput(e.target.value)}
                placeholder="Tilanne 1|Paljastus 1&#10;Tilanne 2|Paljastus 2"
                style={{minHeight: '150px'}}
              />
              <button onClick={() => handleCSVImport(csvInput)} className="btn btn-primary">
                📥 Tuo CSV
              </button>
            </div>
          </div>
        )}

        {/* Aloita peli */}
        {scenarios.length > 0 && !gameStarted && (
          <div className="setup">
            <h2>Kierros {currentScenarioIdx + 1} / {scenarios.length}</h2>
            <div className="scenario-box">
              <p className="prompt">❓ {scenarios[currentScenarioIdx].title}</p>
              <p style={{marginTop: '1rem', color: '#666', fontSize: '14px'}}>Paljastus: {scenarios[currentScenarioIdx].context}</p>
            </div>
            <button onClick={startAnswerRound} className="btn btn-primary" style={{marginTop: '2rem', width: '100%'}}>
              ▶️ Aloita vastaus-kierros
            </button>
          </div>
        )}

        {/* Vastaus-kierros */}
        {gameStarted && (
          <div className="game-display">
            <h2>Vastaus {currentAnswerIdx + 1}</h2>
            
            <div className="answer-box">
              <p style={{fontSize: '18px', fontWeight: 'bold', marginBottom: '1.5rem'}}>
                {answers[currentAnswerIdx] || '(odottaa vastausta)'}
              </p>
              <p style={{color: '#666', fontSize: '14px'}}>
                🗳️ Äänet: <strong>{votes[`answer-${currentAnswerIdx}`] || 0}</strong>
              </p>
            </div>

            <div style={{marginTop: '2rem', display: 'flex', gap: '1rem'}}>
              {currentAnswerIdx > 0 && (
                <button onClick={() => setCurrentAnswerIdx(currentAnswerIdx - 1)} className="btn">
                  ← Edellinen
                </button>
              )}
              {currentAnswerIdx < answers.length - 1 && (
                <button onClick={() => setCurrentAnswerIdx(currentAnswerIdx + 1)} className="btn btn-primary">
                  Seuraava →
                </button>
              )}
              {currentAnswerIdx === answers.length - 1 && (
                <button onClick={() => {
                  if (currentScenarioIdx < scenarios.length - 1) {
                    setCurrentScenarioIdx(currentScenarioIdx + 1)
                    setGameStarted(false)
                    setCurrentAnswerIdx(null)
                    setAnswers([])
                    setVotes({})
                  } else {
                    alert(`Peli päättyi!\n\nPisteet:\n${Object.entries(scores).map(([k, v]) => `Vastaus ${parseInt(k)+1}: ${v}`).join('\n')}`)
                    setMode('menu')
                  }
                }} className="btn btn-primary">
                  Seuraava kierros →
                </button>
              )}
            </div>
          </div>
        )}

        <button onClick={() => setMode('menu')} className="btn" style={{marginTop: '2rem'}}>
          ← Takaisin
        </button>
      </div>
    )
  }

  // PLAYER VIEW
  if (mode === 'player') {
    return (
      <div className="container player">
        <h1>Tilanne-kilpailu 📱</h1>
        <p style={{textAlign: 'center', color: '#666'}}>Sessiossa: <strong>{sessionId}</strong></p>

        {!gameStarted ? (
          <div className="player-screen">
            <p>⏳ Odottaa pelin alkua...</p>
            <p style={{marginTop: '1rem', fontSize: '14px', color: '#999'}}>Nimesi: {playerName}</p>
          </div>
        ) : (
          <div className="player-screen">
            <h3 style={{marginBottom: '1.5rem'}}>Kirjoita neuvosi</h3>
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
              {answers.map((ans, i) => (
                <input
                  key={i}
                  type="text"
                  placeholder={`Vastaus ${i + 1}`}
                  value={ans}
                  onChange={(e) => {
                    const newAnswers = [...answers]
                    newAnswers[i] = e.target.value
                    setAnswers(newAnswers)
                    submitAnswer(e.target.value)
                  }}
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

  // MENU
  return (
    <div className="container menu">
      <h1>🎮 Tilanne-kilpailu</h1>
      <div className="menu-buttons">
        <button onClick={() => startGame('preset')} className="btn btn-primary">
          📺 Host - Valmiit tilanteet
        </button>
        <button onClick={() => startGame('dynamic')} className="btn btn-primary">
          📺 Host - Dynaaminen moodi
        </button>
        <div className="join-section">
          <h3>📱 Liity peliin</h3>
          <input 
            type="text" 
            placeholder="Anna nimesi"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <input 
            type="text" 
            placeholder="Sessikoodi (esim. ABC123)"
            id="sessionInput"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && playerName) {
                joinGame(e.target.value.toUpperCase())
              }
            }}
          />
          <button 
            onClick={() => {
              const code = document.getElementById('sessionInput').value.toUpperCase()
              if (playerName && code) joinGame(code)
            }} 
            className="btn btn-primary" 
            disabled={!playerName}
          >
            Liity
          </button>
        </div>
      </div>
    </div>
  )
}
