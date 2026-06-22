const words = window.WORDS || [];
const STORAGE_KEY = 'n3-kotoba-progress-v2';
const state = {
  progress: JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'),
  deck: [], index: 0, revealed: false, testWord: null, testAnswered: false,
  testCorrect: 0, testTotal: 0,
};
const $ = (selector) => document.querySelector(selector);

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress)); updateStats(); }
function statusOf(word) { return state.progress[word.id]?.status || 'unseen'; }
function filteredWords() {
  const frequency = $('#frequencyFilter').value;
  const deck = $('#deckFilter').value;
  return words.filter((word) => {
    const freqOk = frequency === 'all'
      || (frequency === 'gte5' && word.frequency >= 5)
      || (frequency === 'gte3' && word.frequency >= 3)
      || (frequency === 'eq2' && word.frequency === 2)
      || (frequency === 'eq1' && word.frequency === 1);
    return freqOk && (deck === 'all' || statusOf(word) === deck);
  });
}
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function rebuildDeck(shouldShuffle = false) {
  state.deck = shouldShuffle ? shuffle(filteredWords()) : filteredWords();
  state.index = 0;
  showCard();
  renderTable();
}
function showCard() {
  const word = state.deck[state.index];
  state.revealed = false;
  $('#cardReading').classList.add('concealed');
  $('#cardAnswer').classList.add('concealed');
  $('#revealButton').classList.remove('hidden');
  $('#gradeActions').classList.add('hidden');
  if (!word) {
    $('#cardWord').textContent = '一休み';
    $('#cardReading').textContent = '';
    $('#cardAnswer strong').textContent = 'No words match this deck. Try another filter.';
    $('#cardAnswer').classList.remove('concealed');
    $('#revealButton').classList.add('hidden');
    $('#frequencyBadge').textContent = 'Deck complete';
    $('#studyProgress').textContent = '0 cards';
    $('#progressFill').style.width = '0%';
    return;
  }
  $('#cardWord').textContent = word.word;
  $('#cardReading').textContent = word.reading || 'かな-only word';
  $('#cardAnswer strong').textContent = word.meaning;
  $('#frequencyBadge').textContent = `${word.frequency}× appeared`;
  $('#studyProgress').textContent = `Card ${state.index + 1} of ${state.deck.length}`;
  $('#progressFill').style.width = `${((state.index + 1) / state.deck.length) * 100}%`;
}
function reveal() {
  if (!state.deck.length || state.revealed) return;
  state.revealed = true;
  $('#cardReading').classList.remove('concealed');
  $('#cardAnswer').classList.remove('concealed');
  $('#revealButton').classList.add('hidden');
  $('#gradeActions').classList.remove('hidden');
}
function grade(status) {
  const word = state.deck[state.index];
  if (!word || !state.revealed) return;
  const old = state.progress[word.id] || { attempts: 0 };
  state.progress[word.id] = { status, attempts: old.attempts + 1, updated: Date.now() };
  save();
  state.index = (state.index + 1) % state.deck.length;
  showCard();
  renderTable();
}
function updateStats() {
  const statuses = words.map(statusOf);
  $('#totalStat').textContent = words.length;
  $('#knownStat').textContent = statuses.filter((value) => value === 'known').length;
  $('#reviewStat').textContent = statuses.filter((value) => value === 'review').length;
}
function switchView(view) {
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === view));
  document.querySelectorAll('.view').forEach((panel) => panel.classList.toggle('active', panel.id === `${view}View`));
  if (view === 'test') newTestWord();
  if (view === 'words') renderTable();
}
function newTestWord() {
  const pool = filteredWords();
  if (!pool.length) {
    state.testWord = null;
    $('#testMeaning').textContent = 'No words match this deck.';
    return;
  }
  state.testWord = pool[Math.floor(Math.random() * pool.length)];
  state.testAnswered = false;
  $('#testMeaning').textContent = state.testWord.meaning;
  $('#testInput').value = '';
  $('#testInput').disabled = false;
  $('#checkButton').disabled = false;
  $('#testFeedback').textContent = '';
  $('#testFeedback').className = 'feedback';
  $('#nextTestButton').classList.add('hidden');
  setTimeout(() => $('#testInput').focus(), 0);
}
function normalize(value) { return value.trim().replace(/[\s・]/g, '').normalize('NFKC'); }
function checkTest() {
  if (!state.testWord || state.testAnswered || !normalize($('#testInput').value)) return;
  const correct = normalize($('#testInput').value) === normalize(state.testWord.word);
  state.testAnswered = true;
  state.testTotal += 1;
  if (correct) state.testCorrect += 1;
  $('#testScore').textContent = `${state.testCorrect} / ${state.testTotal} correct`;
  $('#testFeedback').textContent = correct
    ? `Correct — ${state.testWord.word}${state.testWord.reading ? `（${state.testWord.reading}）` : ''}`
    : `Answer: ${state.testWord.word}${state.testWord.reading ? `（${state.testWord.reading}）` : ''}`;
  $('#testFeedback').className = `feedback ${correct ? 'correct' : 'wrong'}`;
  $('#testInput').disabled = true;
  $('#checkButton').disabled = true;
  $('#nextTestButton').classList.remove('hidden');
  const old = state.progress[state.testWord.id] || { attempts: 0 };
  state.progress[state.testWord.id] = { status: correct ? 'known' : 'review', attempts: old.attempts + 1, updated: Date.now() };
  save();
  renderTable();
}
function renderTable() {
  const query = normalize($('#searchInput')?.value || '').toLowerCase();
  const visible = filteredWords().filter((word) => normalize(`${word.word}${word.reading}${word.meaning}`).toLowerCase().includes(query));
  $('#wordTable').innerHTML = visible.map((word) => {
    const status = statusOf(word);
    const labels = { known: 'Remembered', review: 'Review', unseen: 'Not studied' };
    return `<tr><td lang="ja">${word.word}</td><td lang="ja">${word.reading || '—'}</td><td>${word.meaning}</td><td><span class="freq-pill">${word.frequency}×</span></td><td><span class="status-pill ${status}">${labels[status]}</span></td></tr>`;
  }).join('');
  $('#emptyTable').classList.toggle('hidden', visible.length > 0);
}

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => switchView(tab.dataset.view)));
$('#frequencyFilter').addEventListener('change', () => rebuildDeck());
$('#deckFilter').addEventListener('change', () => rebuildDeck());
$('#shuffleButton').addEventListener('click', () => rebuildDeck(true));
$('#revealButton').addEventListener('click', reveal);
$('#againButton').addEventListener('click', () => grade('review'));
$('#rememberButton').addEventListener('click', () => grade('known'));
$('#checkButton').addEventListener('click', checkTest);
$('#nextTestButton').addEventListener('click', newTestWord);
$('#testInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') state.testAnswered ? newTestWord() : checkTest(); });
$('#searchInput').addEventListener('input', renderTable);
document.addEventListener('keydown', (event) => {
  if (!$('#studyView').classList.contains('active') || ['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); reveal(); }
  if (event.key === '1') grade('review');
  if (event.key === '2') grade('known');
});

updateStats();
rebuildDeck();
