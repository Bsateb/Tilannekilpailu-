import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import QRCode from 'qrcode.react'
import { v4 as uuidv4 } from 'uuid'
import './App.css'

const SUPABASE_URL = 'https://sjvlyrtaqyywlvrcptzy.supabase.co'
const SUPABASE_KEY = 'sb_publishable_9Q76hK2aATVqJAtK07MmDQ_GA1o8PHi'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default function App() {
  const [mode, setMode] = useState('menu') // menu, host, player
  const [sessionId, setSessionId] = useState(null)
  const [playerId, setPlayerId] = useState(null)
  const [gameMode, setGameMode] = useState(null)
  const [scenarios, setScenarios] = useState([])
  const [players, setPlayers] = useState([])
  const [currentScenarioIdx, setCurrentScenarioIdx] = useState(0)
  const [currentAnswerIdx, setCurrentAnswerIdx] = useState(null)
  const [playerVote, setPlayerVote] = useState(null)
  const [votes, setVotes] = useState({})
  const [scores, setScores] = useState({})
  const [csvInput, setCsvInput] = useState('')
  const [playerName, setPlayerName] = useState('')

  // Host: Aloita peli
  const startGame = async (selectedMode) => {
    const newSessionId = uuidv4().substring(0, 6)
    setSessionId(newSessionId)
    setGameMode(selectedMode)
    setMode('host')

    await supabase.from('sessions').insert({
      id: newSessionId,
      game_mode: selectedMode
    })

    if (selectedMode === 'preset') {
      // Oletusscenaariot
      const defaultScenarios = [
        {
          title: 'Mitä sanot vanhalle miehelle, joka roikkuu pää alaspäin?',
          context: 'Tosiasiassa oletkin itse pää alaspäin tehtävässä ja vanha mies näyttää roikkuvan pääalaspäin.'
        },
        {
          title: 'Mikä on paras neuvosi nuorelle ihmiselle, joka ei halua mennä töihin?',
          context: 'Tosiasiassa hän on jo yrittäjä ja kertoo asiasta potentiaalisille sijoittajille.'
        }
      ]
      setScenarios(defaultScenarios)
    }
  }

  // CSV import
  const handleCSVImport = (csv) => {
    const lines = csv.trim().split('\n')
    const imported = lines.map(line => {
      const [title, context] = line.split('|')
      return { title: title.trim(), context: context.trim() }
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
    if (!sessionId) return

    const subscription = supabase
      .channel(`players:${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players' }, (payload) => {
        setPlayers(prev => [...prev, payload.new])
      })
      .subscribe()

    return () => subscription.unsubscribe()
  }, [sessionId])

  if (mode === 'menu') {
    return (
      <div className="container menu">
        <h1>🎮 Tilanne-kilpailu</h1>
        <div className="menu-buttons">
          <button onClick={() => startGame('preset')} className="btn btn-primary">
            Host - Valmiit tilanteet
          </button>
          <button onClick={() => startGame('dynamic')} className="btn btn-primary">
            Host - Dynaaminen moodi
          </button>
          <div className="join-section">
            <input 
              type="text" 
              placeholder="Nimesi"
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
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'host') {
    return (
      <div className="container host">
        <div className="header">
          <h1>Tilanne-kilpailu - Host</h1>
          <div className="session-code">
            Sessikoodi: <strong>{sessionId}</strong>
            <QRCode value={`https://tilannekilpailu.netlify.app?join=${sessionId}`} size={100} />
          </div>
        </div>

        {scenarios.length === 0 && (
          <div className="setup">
            <h2>Lisää tilanteet</h2>
            <div className="csv-section">
              <label>CSV-muoto: Tilanne|Paljastus</label>
              <textarea 
                value={csvInput}
                onChange={(e) => setCsvInput(e.target.value)}
                placeholder="Tilanne 1|Paljastus 1&#10;Tilanne 2|Paljastus 2"
              />
              <button onClick={() => handleCSVImport(csvInput)} className="btn btn-primary">
                Tuo CSV
              </button>
            </div>
          </div>
        )}

        {scenarios.length > 0 && (
          <div className="game-display">
            <h2>Pelaajia: {players.length}</h2>
            <div className="scenario-display">
              <p className="prompt">{scenarios[currentScenarioIdx].title}</p>
              {currentAnswerIdx !== null && (
                <>
                  <div className="answer-section">
                    <p>Vastaus {currentAnswerIdx + 1}</p>
                  </div>
                  <div className="votes-display">
                    Äänet: {votes[currentAnswerIdx] || 0}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="controls">
          <button onClick={() => setMode('menu')} className="btn">Takaisin</button>
        </div>
      </div>
    )
  }

  if (mode === 'player') {
    return (
      <div className="container player">
        <h1>Tilanne-kilpailu</h1>
        <p>Sessiossa: {sessionId}</p>
        <div className="player-screen">
          <p>Odottaa pelin alkua...</p>
        </div>
        <button onClick={() => setMode('menu')} className="btn">Takaisin</button>
      </div>
    )
  }
}
