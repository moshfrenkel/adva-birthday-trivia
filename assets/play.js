// PLAYER state machine.
(function(){
  const $ = sel => document.querySelector(sel);
  const show = id => {
    ['join','wait','q','answered','feedback','final','disconnect'].forEach(s => {
      const el = document.getElementById('screen-'+s);
      if (el) el.classList.toggle('hidden', s !== id);
    });
  };

  const params = new URLSearchParams(location.search);
  const preCode = params.get('g') || '';
  if (preCode) $('#input-code').value = preCode;

  let net = null;
  let myName = '';
  let answerStartedAt = 0;
  let timerInterval = null;
  let questionTimeMs = 20000;

  function join() {
    const code = $('#input-code').value.trim();
    const name = $('#input-name').value.trim();
    const err = $('#join-error');
    err.textContent = '';
    if (!/^\d{4}$/.test(code)) { err.textContent = 'קוד משחק חייב להיות 4 ספרות'; return; }
    if (!name) { err.textContent = 'חובה שם'; return; }
    SFX.unlock();
    myName = name;
    $('#btn-join').disabled = true;
    err.textContent = 'מתחברת...';

    net = Net.playerJoin(code, {
      onOpen: () => {
        net.send({ type: 'join', name });
      },
      onClose: () => { show('disconnect'); },
      onError: (e) => {
        console.error(e);
        err.textContent = 'חיבור נכשל. בדקי את הקוד ונסי שוב.';
        $('#btn-join').disabled = false;
      },
      onMessage: (data) => {
        if (!data || !data.type) return;
        if (data.type === 'joined') {
          $('#my-name-tag').textContent = 'שלום ' + myName + '!';
          SFX.join();
          show('wait');
        } else if (data.type === 'question') {
          startQuestion(data);
        } else if (data.type === 'answer-ack') {
          // stop timer, wait for reveal
          clearInterval(timerInterval);
          $('#answered-title').textContent = 'תשובה נקלטה! ✨';
          $('#answered-subtitle').textContent = 'ממתינות להמשך...';
          show('answered');
        } else if (data.type === 'reveal') {
          if (data.correct) SFX.correct(); else SFX.wrong();
          showFeedback(data);
        } else if (data.type === 'final') {
          $('#final-rank').textContent = `מקום ${data.rank} מתוך ${data.total} 🎉`;
          $('#final-score').textContent = `${data.score} נקודות`;
          SFX.fanfare();
          show('final');
        }
      }
    });
  }

  function startQuestion(data) {
    questionTimeMs = data.timeMs || 20000;
    $('#q-num').textContent = (data.index + 1);

    const ans = $('#answers');
    ans.innerHTML = '';
    data.answers.forEach((txt, i) => {
      const el = document.createElement('div');
      el.className = 'ans a' + i;
      el.innerHTML = `<span class="shape"></span>`;
      el.addEventListener('click', () => submitAnswer(i, el), { once: true });
      ans.appendChild(el);
    });

    answerStartedAt = Date.now();
    show('q');

    let remaining = Math.ceil(questionTimeMs/1000);
    $('#timer').textContent = remaining;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      remaining--;
      $('#timer').textContent = remaining;
      if (remaining > 0 && remaining <= 5) SFX.tickUrgent();
      if (remaining <= 0) {
        clearInterval(timerInterval);
        SFX.timeout();
        // no answer submitted - just move to wait
        $('#answered-title').textContent = 'הזמן נגמר ⏰';
        $('#answered-subtitle').textContent = 'ממתינות להמשך...';
        show('answered');
      }
    }, 1000);
  }

  function submitAnswer(i, clickedEl) {
    clearInterval(timerInterval);
    // disable all buttons
    document.querySelectorAll('#answers .ans').forEach(el => {
      el.style.pointerEvents = 'none';
      if (el !== clickedEl) el.style.opacity = '0.4';
    });
    net.send({ type: 'answer', index: i });
  }

  function showFeedback(data) {
    if (data.correct) {
      $('#feedback-title').textContent = '✅ נכון!';
      $('#feedback-title').style.color = '#FFD23F';
      $('#feedback-score').textContent = `+${data.gotPoints} נקודות`;
    } else {
      $('#feedback-title').textContent = '❌ לא נכון';
      $('#feedback-title').style.color = '#fff';
      $('#feedback-score').textContent = `סך הכל: ${data.score} נק'`;
    }
    $('#feedback-rank').textContent = `מקום ${data.rank} מתוך ${data.total}`;
    show('feedback');
  }

  $('#btn-join').addEventListener('click', join);
  $('#input-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('#input-name').focus(); });
  $('#input-name').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
})();
