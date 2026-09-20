import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import QRCode from 'qrcode'
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
  const [playerVote, setPlayerVote] = useState(null)
  const [votes, setVotes] = useState({})
  const [csvInput, setCsvInput] = useState('')
  const [playerName, setPlayerName] = useState('')

  // Generoi QR-koodi
  useEffect(() => {
    if (sessionId && mode === 'host') {
      const canvas = document.getElementById('qr-canvas')
      if (canvas) {
        QRCode.toCanvas(canvas, `https://seliselipeli.netlify.app?join=${sessionId}`, {
          width: 150,
          margin: 2,
          color: { dark: '#000', light: '#fff' }
        })
      }
    }
  }, [sessionId, mode])

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
          context: 'Tosiasiassa oletkin itse pää alaspäin tehtävässä ja vanha mies näyttää roikkuvan pääalaspäin.'
        },
        {
          title: 'Mikä on paras neuvosi nuorelle, joka ei halua mennä töihin?',
          context: 'Tosiasiassa hän on jo yrittäjä ja kertoo asiasta sijoittajille.'
        },
        {
          title: 'Miten auttaisit ystävää joka näyttää syventyneen videopeleihin?',
          context: 'Tosiasiassa hän kehittää pelejä ammatissa ja tekee tutkimusta.'
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

  // Menu
  if (mode === 'menu') {
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
              onKeyPress={(e) => {
                if (e.key === 'Enter') joinGame(e.target.value.toUpperCase())
              }}
            />
            <button onClick={() => playerName && joinGame('')} className="btn btn-primary" disabled={!playerName}>
              Liity
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Host
  if (mode === 'host') {
    return (
      <div className="container host">
        <div className="header">
          <h1>Tilanne-kilpailu 🎮</h1>
          <div className="session-info">
            <div className="session-code">
              <strong>Sessikoodi:</strong> {sessionId}
            </div>
            <canvas id="qr-canvas" style={{marginTop: '1rem', background: 'white', padding: '10px', borderRadius: '8px'}}></canvas>
            <p style={{marginTop: '1rem', color: '#666', fontSize: '12px'}}>Pelaajia: {players.length}</p>
          </div>
        </div>

        {scenarios.length === 0 && (
          <div className="setup">
            <h2>📋 Lisää tilanteet</h2>
            <div className="csv-section">
              <label>CSV-muoto: Tilanne|Paljastus</label>
              <textarea 
                value={csvInput}
                onChange={(e) => setCsvInput(e.target.value)}
                placeholder="Tilanne 1|Paljastus 1&#10;Tilanne 2|Paljastus 2"
              />
              <button onClick={() => handleCSVImport(csvInput)} className="btn btn-primary">
                📥 Tuo CSV
              </button>
            </div>
          </div>
        )}

        {scenarios.length > 0 && (
          <div className="game-display">
            <div className="scenario-box">
              <p className="prompt">❓ {scenarios[currentScenarioIdx]?.title}</p>
              {currentAnswerIdx !== null && (
                <div className="answer-box">
                  <p><strong>Vastaus {currentAnswerIdx + 1}</strong></p>
                  <p style={{marginTop: '1rem', fontSize: '14px', color: '#666'}}>Pelaajien äänet: {votes[currentAnswerIdx] || 0}</p>
                </div>
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

  // Player
  if (mode === 'player') {
    return (
      <div className="container player">
        <h1>Tilanne-kilpailu 🎮</h1>
        <p style={{textAlign: 'center', color: '#666'}}>Sessiossa: <strong>{sessionId}</strong></p>
        <div className="player-screen">
          <p>⏳ Odottaa pelin alkua...</p>
          <p style={{marginTop: '1rem', fontSize: '14px', color: '#999'}}>Nimesi: {playerName}</p>
        </div>
        <button onClick={() => setMode('menu')} className="btn" style={{marginTop: '2rem'}}>
          ← Takaisin
        </button>
      </div>
    )
  }
}
