// HOST state machine for the trivia game.
(function(){
  const $ = sel => document.querySelector(sel);
  const show = id => {
    ['connecting','lobby','question','reveal','leaderboard','podium'].forEach(s => {
      const el = document.getElementById('screen-'+s);
      if (el) el.classList.toggle('hidden', s !== id);
    });
  };

  const code = Net.makeCode();
  const playerUrl = new URL('play.html', location.href);
  playerUrl.searchParams.set('g', code);
  const joinUrl = playerUrl.toString();

  $('#game-code').textContent = code;
  $('#game-url').textContent = joinUrl;

  // Render QR via image service (no JS dependency)
  const qrImg = document.createElement('img');
  qrImg.alt = 'QR code';
  qrImg.width = 300; qrImg.height = 300;
  qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=' + encodeURIComponent(joinUrl);
  const qrHost = $('#qr');
  qrHost.innerHTML = '';
  qrHost.appendChild(qrImg);

  // players: peerId -> { name, score, lastAnswer, lastTime }
  const players = new Map();
  let currentQ = -1;
  let questionStartedAt = 0;
  let timerInterval = null;
  let net = null;

  function renderPlayers() {
    const list = $('#players-list');
    list.innerHTML = '';
    for (const p of players.values()) {
      const el = document.createElement('div');
      el.className = 'player-chip';
      el.textContent = p.name;
      list.appendChild(el);
    }
    $('#player-count').textContent = players.size;
    $('#btn-start').disabled = players.size < 1;
  }

  function startGame() {
    currentQ = -1;
    nextQuestion();
  }

  function nextQuestion() {
    currentQ++;
    if (currentQ >= QUESTIONS.length) {
      return finish();
    }
    const q = QUESTIONS[currentQ];
    $('#q-num').textContent = (currentQ + 1);
    $('#q-text').textContent = q.q;
    $('#total-count').textContent = players.size;
    $('#answer-count').textContent = 0;

    const ans = $('#answers');
    ans.innerHTML = '';
    q.a.forEach((txt, i) => {
      const el = document.createElement('div');
      el.className = 'ans a' + i;
      el.innerHTML = `<span class="shape"></span><span class="label">${txt}</span>`;
      ans.appendChild(el);
    });

    // reset per-round player state
    for (const p of players.values()) {
      p.lastAnswer = null;
      p.lastTime = null;
    }

    questionStartedAt = Date.now();
    show('question');
    net.broadcast({ type: 'question', index: currentQ, question: q.q, answers: q.a, timeMs: QUESTION_TIME_MS });

    // timer
    let remaining = Math.ceil(QUESTION_TIME_MS / 1000);
    $('#timer').textContent = remaining;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      remaining--;
      $('#timer').textContent = remaining;
      if (remaining <= 0) {
        clearInterval(timerInterval);
        reveal();
      }
    }, 1000);
  }

  function reveal() {
    clearInterval(timerInterval);
    const q = QUESTIONS[currentQ];

    // score players
    for (const p of players.values()) {
      if (p.lastAnswer === q.correct) {
        p.score += scoreFor(true, p.lastTime, QUESTION_TIME_MS);
      }
    }

    $('#reveal-text').textContent = q.q;
    const ans = $('#reveal-answers');
    ans.innerHTML = '';
    q.a.forEach((txt, i) => {
      const el = document.createElement('div');
      el.className = 'ans a' + i + (i === q.correct ? ' correct' : ' wrong');
      el.innerHTML = `<span class="shape"></span><span class="label">${txt}</span>`;
      ans.appendChild(el);
    });

    show('reveal');

    // tell each player individually whether they were correct + their rank
    const ranked = getRanked();
    for (const p of players.values()) {
      const rank = ranked.findIndex(x => x.id === p.id) + 1;
      net.sendTo(p.id, {
        type: 'reveal',
        correct: p.lastAnswer === q.correct,
        correctIndex: q.correct,
        gotPoints: p.lastAnswer === q.correct ? scoreFor(true, p.lastTime, QUESTION_TIME_MS) : 0,
        score: p.score,
        rank, total: ranked.length
      });
    }
  }

  function getRanked() {
    return Array.from(players.values()).sort((a,b) => b.score - a.score);
  }

  function showLeaderboard() {
    const ranked = getRanked();
    const host = $('#leaderboard');
    host.innerHTML = '';
    ranked.slice(0, 8).forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      row.innerHTML = `<div style="display:flex;gap:14px;align-items:center;"><div class="rank">${i+1}</div><div>${escapeHtml(p.name)}</div></div><div class="score">${p.score}</div>`;
      host.appendChild(row);
    });
    show('leaderboard');
  }

  function finish() {
    const ranked = getRanked();
    $('#podium').innerHTML = '';
    const order = [ranked[1], ranked[0], ranked[2]]; // 2nd, 1st, 3rd visually
    const classes = ['p2','p1','p3'];
    const medals = ['🥈','🥇','🥉'];
    const places = [2,1,3];
    order.forEach((p, idx) => {
      if (!p) return;
      const el = document.createElement('div');
      el.className = 'pod ' + classes[idx];
      el.innerHTML = `<div class="medal">${medals[idx]}</div><div class="name">${escapeHtml(p.name)}</div><div class="score">${p.score} נק'</div>`;
      $('#podium').appendChild(el);
    });

    const list = $('#final-leaderboard');
    list.innerHTML = '';
    ranked.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      row.innerHTML = `<div style="display:flex;gap:14px;align-items:center;"><div class="rank">${i+1}</div><div>${escapeHtml(p.name)}</div></div><div class="score">${p.score}</div>`;
      list.appendChild(row);
    });

    show('podium');
    confettiBurst();

    // broadcast final to players
    ranked.forEach((p, i) => {
      net.sendTo(p.id, { type: 'final', rank: i+1, total: ranked.length, score: p.score });
    });
  }

  function confettiBurst() {
    const colors = ['#FF3EA5','#2BBCB3','#FFD23F','#A06CD5','#22C55E','#EF4444'];
    for (let i = 0; i < 80; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random()*100 + 'vw';
      c.style.background = colors[Math.floor(Math.random()*colors.length)];
      c.style.animationDuration = (2 + Math.random()*2.5) + 's';
      c.style.animationDelay = Math.random()*0.5 + 's';
      c.style.transform = `rotate(${Math.random()*360}deg)`;
      document.body.appendChild(c);
      setTimeout(()=>c.remove(), 5000);
    }
  }

  function escapeHtml(s){return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));}

  // --- wire network ---
  net = Net.hostStart(code, {
    onOpen: () => { show('lobby'); },
    onError: (err) => {
      console.error('peer error', err);
      if (err.type === 'unavailable-id') {
        alert('הקוד תפוס - מרענן עם קוד חדש');
        location.reload();
      }
    },
    onPlayerConnect: (conn) => {
      // waits for "join" message with name
    },
    onPlayerDisconnect: (conn) => {
      players.delete(conn.peer);
      renderPlayers();
    },
    onMessage: (conn, data) => {
      if (!data || !data.type) return;
      if (data.type === 'join') {
        const name = String(data.name || 'שחקנית').slice(0, 20);
        players.set(conn.peer, { id: conn.peer, name, score: 0, lastAnswer: null, lastTime: null });
        renderPlayers();
        conn.send({ type: 'joined', code });
      } else if (data.type === 'answer') {
        const p = players.get(conn.peer);
        if (!p) return;
        if (p.lastAnswer != null) return; // already answered
        p.lastAnswer = data.index;
        p.lastTime = Math.max(0, Date.now() - questionStartedAt);
        // update UI counter
        let n = 0;
        for (const x of players.values()) if (x.lastAnswer != null) n++;
        $('#answer-count').textContent = n;
        // tell the player their answer landed
        conn.send({ type: 'answer-ack' });
        // auto-advance if everyone answered
        if (n === players.size) {
          setTimeout(reveal, 400);
        }
      }
    }
  });

  $('#btn-start').addEventListener('click', startGame);
  $('#btn-leaderboard').addEventListener('click', showLeaderboard);
  $('#btn-next').addEventListener('click', nextQuestion);
})();
