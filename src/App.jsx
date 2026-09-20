import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { QRCodeSVG } from 'qrcode.react'
import './App.css'

const supabase = createClient(
  'https://sjvlyrtaqyywlvrcptzy.supabase.co',
  'sb_publishable_9Q76hK2aATVqJAtK07MmDQ_GA1o8PHi'
)

export default function App() {
  const [screen, setScreen] = useState('menu')
  const [sessionId, setSessionId] = useState('')
  const [name, setName] = useState('')
  const [scenarios, setScenarios] = useState([])
  const [players, setPlayers] = useState([])
  const [gameData, setGameData] = useState(null)
  const [answers, setAnswers] = useState(['', '', '', ''])
  const [votes, setVotes] = useState({})

  // =========== HOST: ALOITA ===========
  const hostStart = async () => {
    const id = uuidv4().substring(0, 6).toUpperCase()
    setSessionId(id)

    await supabase.from('sessions').insert({ id, game_mode: 'preset' })
    await supabase.from('game_state').insert({
      session_id: id,
      current_phase: 'setup',
      current_scenario_idx: 0,
      current_answer_idx: 0
    })
    await supabase.from('players').insert({
      id: uuidv4(),
      session_id: id,
      name: '🎤 Juontaja'
    })

    setScreen('host-setup')
  }

  // =========== HOST: LISÄÄ TILANTEET ===========
  const addScenarios = async (text) => {
    if (!text.trim()) return

    const lines = text.split('\n').filter(l => l.trim())
    const imported = []

    for (const line of lines) {
      const [title, desc] = line.split('|').map(s => s.trim())
      if (!title) continue

      const { data } = await supabase
        .from('scenarios')
        .insert({ session_id: sessionId, title, context: desc || '' })
        .select()

      if (data) imported.push(data[0])
    }

    setScenarios(prev => [...prev, ...imported])
  }

  // =========== HOST: LATAA SKENAARIOT STARTUP ===========
  useEffect(() => {
    if (!sessionId || screen !== 'host-setup') return

    const loadScenarios = async () => {
      const { data } = await supabase
        .from('scenarios')
        .select('*')
        .eq('session_id', sessionId)
        .order('id', { ascending: true })

      if (data) setScenarios(data)
    }

    loadScenarios()
  }, [sessionId, screen])

  // =========== HOST: ALOITA PELIä ===========
  const hostStartGame = async () => {
    if (scenarios.length === 0) {
      alert('Lisää tilanteet!')
      return
    }

    await supabase.from('game_state').update({
      current_phase: 'answering',
      current_scenario_idx: 0,
      current_answer_idx: 0
    }).eq('session_id', sessionId)

    setScreen('host-game')
  }

  // =========== PELAAJA: LIITY ===========
  const playerJoin = async (code) => {
    const upperCode = code.toUpperCase()
    
    const { data: gs } = await supabase
      .from('game_state')
      .select('*')
      .eq('session_id', upperCode)
      .single()

    if (!gs) {
      alert('Sessiota ei löydy')
      return
    }

    const { data: scen } = await supabase
      .from('scenarios')
      .select('*')
      .eq('session_id', upperCode)

    setSessionId(upperCode)
    setGameData(gs)
    setScenarios(scen || [])

    await supabase.from('players').insert({
      id: uuidv4(),
      session_id: upperCode,
      name: name || 'Pelaaja ' + Math.floor(Math.random() * 1000)
    })

    setScreen('player')
  }

  // =========== REAL-TIME ===========
  useEffect(() => {
    if (!sessionId) return

    const sub = supabase
      .channel(`game:${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state' },
        (p) => setGameData(p.new)
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players' },
        (p) => setPlayers(prev => [...prev, p.new])
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scenarios' },
        (p) => setScenarios(prev => [...prev, p.new])
      )
      .subscribe()

    return () => sub.unsubscribe()
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    supabase.from('players').select('*').eq('session_id', sessionId).then(({ data }) => {
      if (data) setPlayers(data)
    })
  }, [sessionId])

  // =========== HOST: SETUP ===========
  if (screen === 'host-setup') {
    return (
      <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
        <h1>Tilanne-kilpailu 📺 HOST</h1>
        <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#2196F3' }}>
          Koodi: {sessionId}
        </p>
        <div style={{ background: 'white', padding: '10px', marginBottom: '2rem', borderRadius: '8px', display: 'inline-block' }}>
          <QRCodeSVG value={sessionId} size={150} />
        </div>

        <h3>👥 Pelaajat ({players.length})</h3>
        {players.map(p => <p key={p.id} style={{ margin: '0.5rem 0' }}>{p.name}</p>)}

        {scenarios.length === 0 ? (
          <div style={{ marginTop: '2rem' }}>
            <h3>Lisää tilanteet</h3>
            <textarea
              id="csv"
              placeholder="Tilanne|Paljastus&#10;Toinen|Toinen paljastus"
              style={{ width: '100%', height: '120px', padding: '10px', marginBottom: '1rem', fontFamily: 'monospace' }}
            />
            <button onClick={() => addScenarios(document.getElementById('csv').value)} style={{ padding: '10px 20px', cursor: 'pointer' }}>
              Tuo tilanteet
            </button>
          </div>
        ) : (
          <div style={{ marginTop: '2rem' }}>
            <p>✓ Tilanteet tuotu: {scenarios.length}</p>
            <button onClick={hostStartGame} style={{ padding: '10px 20px', cursor: 'pointer', background: '#4CAF50', color: 'white' }}>
              ALOITA PELI
            </button>
          </div>
        )}

        <button onClick={() => setScreen('menu')} style={{ marginTop: '2rem', padding: '10px 20px', cursor: 'pointer' }}>
          Takaisin
        </button>
      </div>
    )
  }

  // =========== HOST: PELI ===========
  if (screen === 'host-game' && gameData && scenarios.length > 0) {
    const scenario = scenarios[gameData.current_scenario_idx]
    const answer = answers[gameData.current_answer_idx] || ''

    const nextAnswer = async () => {
      if (gameData.current_answer_idx < 3) {
        await supabase.from('game_state').update({
          current_answer_idx: gameData.current_answer_idx + 1,
          current_phase: 'voting'
        }).eq('session_id', sessionId)
      } else if (gameData.current_scenario_idx < scenarios.length - 1) {
        await supabase.from('game_state').update({
          current_scenario_idx: gameData.current_scenario_idx + 1,
          current_answer_idx: 0,
          current_phase: 'answering'
        }).eq('session_id', sessionId)
        setAnswers(['', '', '', ''])
      } else {
        alert('Peli päättyi!')
        setScreen('menu')
      }
    }

    return (
      <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
        <h1>Tilanne-kilpailu 📺</h1>
        <p>Kierros {gameData.current_scenario_idx + 1}/{scenarios.length}</p>
        <h2>❓ {scenario?.title}</h2>

        <h3>👥 Pelaajat ({players.length})</h3>
        {players.map(p => <p key={p.id}>{p.name}</p>)}

        {gameData.current_phase === 'answering' && (
          <p style={{ fontSize: '18px', marginTop: '2rem' }}>✍️ Pelaajat kirjoittavat...</p>
        )}

        {gameData.current_phase === 'voting' && (
          <div style={{ background: '#f0f0f0', padding: '2rem', borderRadius: '8px', marginTop: '2rem' }}>
            <p style={{ fontSize: '16px' }}>Vastaus {gameData.current_answer_idx + 1}:</p>
            <p style={{ fontSize: '20px', fontWeight: 'bold' }}>{answer || '(ei vastausta)'}</p>
          </div>
        )}

        <button onClick={nextAnswer} style={{ marginTop: '2rem', padding: '10px 20px', cursor: 'pointer', background: '#2196F3', color: 'white' }}>
          Seuraava →
        </button>

        <button onClick={() => setScreen('menu')} style={{ marginTop: '1rem', marginLeft: '1rem', padding: '10px 20px', cursor: 'pointer' }}>
          Lopeta
        </button>
      </div>
    )
  }

  // =========== PELAAJA: LIITTYMINEN ===========
  if (screen === 'player-join') {
    return (
      <div style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto' }}>
        <h1>🎮 Liity peliin</h1>
        <input
          type="text"
          placeholder="Nimesi"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: '10px', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #ddd' }}
        />
        <input
          type="text"
          placeholder="Sessikoodi"
          id="code"
          style={{ width: '100%', padding: '10px', marginBottom: '1rem', borderRadius: '6px', border: '1px solid #ddd' }}
        />
        <button
          onClick={() => {
            const code = document.getElementById('code').value
            if (name && code) playerJoin(code)
            else alert('Kirjoita nimi ja koodi!')
          }}
          style={{ width: '100%', padding: '10px', cursor: 'pointer', background: '#4CAF50', color: 'white' }}
        >
          Liity
        </button>
        <button onClick={() => setScreen('menu')} style={{ width: '100%', marginTop: '1rem', padding: '10px', cursor: 'pointer' }}>
          Takaisin
        </button>
      </div>
    )
  }

  // =========== PELAAJA: PELIä ===========
  if (screen === 'player') {
    // Fallback näyttö jos data ei ole valmis
    if (!gameData || scenarios.length === 0) {
      return (
        <div style={{ padding: '2rem', maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
          <h1>Tilanne-kilpailu 📱</h1>
          <p style={{ fontSize: '18px', marginTop: '3rem' }}>⏳ Ladataan...</p>
          <p style={{ color: '#666' }}>Sessiossa: {sessionId}</p>
          <button onClick={() => setScreen('menu')} style={{ marginTop: '2rem', padding: '10px 20px', cursor: 'pointer' }}>
            Takaisin
          </button>
        </div>
      )
    }

    const scenario = scenarios[gameData.current_scenario_idx]

    return (
      <div style={{ padding: '2rem', maxWidth: '500px', margin: '0 auto' }}>
        <h1>Tilanne-kilpailu 📱</h1>
        <p style={{ textAlign: 'center', color: '#666' }}>Sessiossa: {sessionId}</p>

        {!scenario ? (
          <p>Ladataan...</p>
        ) : (
          <>
            <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '8px', marginBottom: '2rem' }}>
              <p style={{ margin: 0 }}>❓ {scenario.title}</p>
            </div>

            {gameData.current_phase === 'setup' && (
              <p style={{ textAlign: 'center' }}>⏳ Odottaa...</p>
            )}

            {gameData.current_phase === 'answering' && (
              <>
                <h3>✍️ Kirjoita neuvosi (4 kpl)</h3>
                {answers.map((ans, i) => (
                  <input
                    key={i}
                    type="text"
                    placeholder={`Neuvosi ${i + 1}`}
                    value={ans}
                    onChange={(e) => {
                      const newAns = [...answers]
                      newAns[i] = e.target.value
                      setAnswers(newAns)
                    }}
                    style={{ width: '100%', padding: '10px', marginBottom: '0.5rem', borderRadius: '6px', border: '1px solid #ddd' }}
                  />
                ))}
              </>
            )}

            {gameData.current_phase === 'voting' && (
              <>
                <h3>⭐ Anna tähdet</h3>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  {[1, 2, 3].map(s => (
                    <button
                      key={s}
                      onClick={() => setVotes({ ...votes, [`answer-${gameData.current_answer_idx}`]: s })}
                      style={{
                        padding: '10px 15px',
                        fontSize: '20px',
                        background: votes[`answer-${gameData.current_answer_idx}`] === s ? '#ff9800' : '#ffc107',
                        cursor: 'pointer',
                        border: 'none',
                        borderRadius: '6px'
                      }}
                    >
                      {'⭐'.repeat(s)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <button onClick={() => setScreen('menu')} style={{ width: '100%', marginTop: '2rem', padding: '10px', cursor: 'pointer' }}>
          Takaisin
        </button>
      </div>
    )
  }

  // =========== PÄÄVALIKKO ===========
  return (
    <div style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto', textAlign: 'center' }}>
      <h1>🎮 Tilanne-kilpailu</h1>
      <button
        onClick={hostStart}
        style={{ width: '100%', padding: '1rem', fontSize: '16px', marginBottom: '1rem', cursor: 'pointer', background: '#2196F3', color: 'white' }}
      >
        📺 HOST
      </button>
      <button
        onClick={() => setScreen('player-join')}
        style={{ width: '100%', padding: '1rem', fontSize: '16px', cursor: 'pointer', background: '#4CAF50', color: 'white' }}
      >
        📱 LIITY
      </button>
    </div>
  )
}
