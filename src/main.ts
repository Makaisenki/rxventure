import Phaser from 'phaser';
import './style.css';
import { Bank, Question, QUESTIONS_PER_BIOME, Role, RUN_QUESTION_COUNT, parseWorkbook, roleList, selectRun } from './questionBank';
import { Branch, LearningInsights, clearLeaderboards, clearLearningInsights, createBranch, createPlaythrough, discardPlaythrough, downloadLearningInsights, fetchActiveBank, fetchAdminBranches, fetchBranches, fetchLearningInsights, fetchScores, finishPlaythrough, isAdminSignedIn, recordAttempt, restoreBundledBank, signIn, signOut, submitScore, updateBranch, uploadBank } from './cloud';

type View = 'disclaimer' | 'title' | 'prologue' | 'branch' | 'roles' | 'game' | 'leaderboard' | 'settings' | 'adminLogin' | 'admin' | 'adminBranches' | 'adminInsights' | 'victory' | 'gameover';
type Trap = 'arrows' | 'boulders' | 'axe';
const KEY = { settings: 'rxventure-settings' };
const app = document.querySelector<HTMLDivElement>('#app')!;
let bank: Bank;
let defaultBank: Bank;
let view: View = 'disclaimer';
let chosenRole: Role;
let run: Question[] = [];
let index = 0, score = 0, lives = 5, timeLeft = 10, graceLeft = 6, timer: number | undefined;
let resolving = false;
let reaction: 'idle' | 'correct' | 'wrong' = 'idle';
let activeTrap: Trap | null = null;
let displayedOptions: { text: string; letter: string }[] = [];
let adminError = '';
let adminScorePreview = false;
let cloudOnline = false;
let activeBankId: string | null = null;
let branches: Branch[] = [];
let branchesOnline = false;
let chosenBranch: Branch | undefined;
let branchError = '';
let playerName = '';
let currentRunId: string | null = null;
let leaderboardRank: number | null = null;
let scoreSubmissionError = '';
let insights: LearningInsights | null = null;
let insightsError = '';
let selectedInsightId = '';
let settings = JSON.parse(localStorage.getItem(KEY.settings) || '{"sound":true,"contrast":false,"large":false}');

class AmbientScene extends Phaser.Scene {
  constructor() { super('ambient'); }
  create() {
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x12112f, 0x12112f, 0x063b48, 0x063b48, 1);
    graphics.fillRect(0, 0, 1600, 900);
    for (let i = 0; i < 36; i++) {
      const star = this.add.circle(Phaser.Math.Between(0, 1600), Phaser.Math.Between(0, 900), Phaser.Math.Between(1, 3), 0x85e6df, Phaser.Math.FloatBetween(.12, .45));
      this.tweens.add({ targets: star, alpha: .05, duration: Phaser.Math.Between(1200, 3200), yoyo: true, repeat: -1 });
    }
  }
}
new Phaser.Game({ type: Phaser.AUTO, parent: app, width: 1600, height: 900, transparent: true, scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: AmbientScene });

function saveSettings() { localStorage.setItem(KEY.settings, JSON.stringify(settings)); }
function stopTimer() { if (timer) window.clearInterval(timer); timer = undefined; }
let audioContext: AudioContext | undefined;
let musicGain: GainNode | undefined;
let musicTimer: number | undefined;
let musicPlaying = false;
let musicMode: 'menu' | 'ambience' | undefined;
let musicSession = 0;

function audio() {
  audioContext ??= new AudioContext();
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}
function tone(frequency: number, at: number, duration: number, volume: number, type: OscillatorType = 'sine', destination?: AudioNode, endFrequency?: number) {
  const ctx = audio(); const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), at + duration);
  gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + .02); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  oscillator.connect(gain).connect(destination ?? ctx.destination); oscillator.start(at); oscillator.stop(at + duration + .03);
}
function noise(at: number, duration: number, volume: number, destination?: AudioNode) {
  const ctx = audio(); const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate); const values = buffer.getChannelData(0);
  for (let i = 0; i < values.length; i += 1) values[i] = (Math.random() * 2 - 1) * (1 - i / values.length);
  const source = ctx.createBufferSource(); const filter = ctx.createBiquadFilter(); const gain = ctx.createGain();
  filter.type = 'bandpass'; filter.frequency.value = 760; filter.Q.value = 1.2; gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  source.buffer = buffer; source.connect(filter).connect(gain).connect(destination ?? ctx.destination); source.start(at); source.stop(at + duration);
}
function playDoorSelect() { if (!settings.sound) return; const now = audio().currentTime; tone(260, now, .08, .035, 'triangle', undefined, 320); }
function playCorrect() { if (!settings.sound) return; const now = audio().currentTime; tone(660, now, .22, .055, 'sine'); tone(880, now + .09, .32, .05, 'sine'); tone(1320, now + .19, .38, .035, 'sine'); }
function playTrap(trap: Trap) {
  if (!settings.sound) return;
  const now = audio().currentTime;
  if (trap === 'arrows') {
    noise(now, .16, .04); tone(1060, now, .22, .045, 'triangle', undefined, 280); noise(now + .17, .14, .035);
  } else if (trap === 'boulders') {
    [0, .16, .32].forEach((delay, i) => { tone(96 - i * 12, now + delay, .32, .085, 'triangle', undefined, 42); noise(now + delay + .12, .18, .05); });
  } else {
    tone(760, now, .46, .07, 'sawtooth', undefined, 110); noise(now + .32, .2, .05); tone(82, now + .34, .3, .075, 'triangle', undefined, 48);
  }
  navigator.vibrate?.(trap === 'boulders' ? [45, 55, 75, 55, 95] : [35, 35, 70]);
}
function playBiomeTransition() { if (!settings.sound) return; const now = audio().currentTime; [392, 494, 587].forEach((note, i) => tone(note, now + i * .12, .42, .035, 'sine')); }
function stopMusic() {
  musicSession += 1;
  musicPlaying = false;
  musicMode = undefined;
  if (musicTimer) window.clearTimeout(musicTimer);
  musicTimer = undefined;
  const oldGain = musicGain;
  musicGain = undefined;
  if (oldGain && audioContext) {
    oldGain.gain.setTargetAtTime(.0001, audioContext.currentTime, .08);
    window.setTimeout(() => oldGain.disconnect(), 220);
  }
}
function scheduleMusic(session = musicSession) {
  if (!musicPlaying || !musicGain || session !== musicSession) return;
  const ctx = audio(); const now = ctx.currentTime + .04;
  if (musicMode === 'menu') {
    // A short, original fantasy motif: warm sustained harmony with a bright
    // ascending call. It plays only before the player enters the dungeon.
    const roots = [196, 220, 246.94, 293.66]; const root = roots[Math.floor(Math.random() * roots.length)];
    [1, 1.25, 1.5, 2].forEach((ratio) => tone(root * ratio, now, 3.8, .075, 'triangle', musicGain));
    [2, 2.5, 3, 4, 3].forEach((ratio, i) => tone(root * ratio, now + i * .36, .42, .06, 'sine', musicGain));
    musicTimer = window.setTimeout(() => scheduleMusic(session), 3600);
  } else if (musicMode === 'ambience') {
    // Restore the original dungeon ambience soundtrack used before the
    // menu-music update. This remains a separate loop from the menu motif.
    const roots = [146.83, 174.61, 196, 130.81]; const root = roots[Math.floor(Math.random() * roots.length)];
    [1, 1.2, 1.5].forEach((ratio) => tone(root * ratio, now, 4.6, .07, 'sine', musicGain));
    [2, 4, 5, 7].forEach((step, i) => tone(root * [2, 2.4, 3, 2.4][i], now + step * .48, .55, .045, 'sine', musicGain));
    musicTimer = window.setTimeout(() => scheduleMusic(session), 4300);
  }
}
function startMusic(mode: 'menu' | 'ambience') {
  if (!settings.sound) return;
  // Calling this again from the player's click resumes a browser-suspended
  // context, while preserving the active loop.
  const ctx = audio();
  if (musicPlaying && musicMode === mode) return;
  if (musicPlaying) stopMusic();
  musicMode = mode;
  musicGain ??= ctx.createGain(); musicGain.connect(ctx.destination); musicGain.gain.cancelScheduledValues(ctx.currentTime); musicGain.gain.setTargetAtTime(.36, ctx.currentTime, .25); musicPlaying = true; scheduleMusic(musicSession);
}
function syncMusicForView() {
  const menuMusicAllowed = view === 'title' || view === 'prologue' || view === 'branch' || view === 'roles' || view === 'leaderboard' || view === 'settings';
  const ambienceAllowed = view === 'game' && document.body.dataset.paused !== 'true';
  document.body.dataset.musicScope = menuMusicAllowed ? 'menu' : ambienceAllowed ? 'ambience' : 'off';
  if (menuMusicAllowed) startMusic('menu');
  else if (ambienceAllowed) startMusic('ambience');
  else stopMusic();
}
function playTreasureFanfare() {
  stopMusic(); if (!settings.sound) return;
  const now = audio().currentTime + .04; [392, 494, 587, 784].forEach((note, i) => tone(note, now + i * .22, .75, .07, 'triangle'));
  [523.25, 659.25, 783.99].forEach((note) => tone(note, now + 1.05, 1.7, .05, 'sine'));
  [1046.5, 1318.51].forEach((note, i) => tone(note, now + 1.35 + i * .16, 1.1, .045, 'sine'));
}
function playGameOver() {
  if (!settings.sound) return;
  const now = audio().currentTime + .04;
  tone(196, now, .5, .07, 'triangle', undefined, 110);
  tone(146.83, now + .16, .65, .06, 'sawtooth', undefined, 73.42);
  noise(now + .08, .55, .025);
}
function damageFlash() { document.body.classList.add('damage-flash'); window.setTimeout(() => document.body.classList.remove('damage-flash'), 520); }
function shuffler(question: Question) { return question.options.map((text, i) => ({ text, letter: String.fromCharCode(65 + i) })).sort(() => Math.random() - .5); }

function render() {
  document.body.classList.toggle('contrast', settings.contrast); document.body.classList.toggle('large', settings.large); document.body.classList.toggle('admin-page', view === 'admin' || view === 'adminLogin' || view === 'adminBranches' || view === 'adminInsights'); document.body.classList.toggle('title-page', view === 'title');
  const layer = document.querySelector('.ui-layer') ?? document.createElement('section'); layer.className = 'ui-layer'; app.append(layer);
  layer.innerHTML = view === 'disclaimer' ? disclaimer() : view === 'title' ? title() : view === 'prologue' ? prologue() : view === 'branch' ? branchSelection() : view === 'roles' ? roles() : view === 'game' ? game() : view === 'leaderboard' ? leaderboard() : view === 'settings' ? settingsView() : view === 'adminLogin' ? adminLogin() : view === 'admin' ? admin() : view === 'adminBranches' ? adminBranches() : view === 'adminInsights' ? insightsView() : view === 'victory' ? victory() : gameover();
  bind(layer);
  syncMusicForView();
}

const disclaimer = () => `<section class="panel disclaimer"><p class="eyebrow">Before you begin</p><h2>Disclaimer</h2><p>This game is for educational purposes only.</p><button class="primary" data-go="title">Continue</button></section>`;
const title = () => `<section class="hero"><p class="eyebrow">A pharmacy quest for knowledge</p><h1>RxVenture <span>Dungeon</span></h1><p class="lede">Seek the sacred treasure. Choose wisely. Make your pharmacy legendary.</p>${cloudOnline ? '' : '<p class="cloud-status">Offline mode: shared scores are unavailable.</p>'}<button class="primary" data-go="prologue">Start quest</button><nav><button data-go="leaderboard">Leaderboard</button><button data-settings>Settings</button></nav><button class="crest" aria-label="Administration" data-admin>✦</button></section>`;
const prologue = () => `<section class="panel story"><p class="eyebrow">The call to adventure</p><h2>The kingdom needs your knowledge.</h2><p>Deep in the enchanted dungeon rests a treasure that will make your pharmacy the most prestigious in the realm.</p><p>Answer swiftly. Choose the right doors. Protect your five lives.</p><button class="primary" data-open-branch>Choose your role</button></section>`;
const branchSelection = () => `<section class="panel branch-selection"><p class="eyebrow">Before you enter</p><h2>Select your Branch</h2>${branchError ? `<p class="pin-error" role="alert">${branchError}</p>` : ''}${branchesOnline && branches.length ? `<label for="branch-select">Branch<select id="branch-select" data-branch-select><option value="">Select your branch</option>${branches.map((branch) => `<option value="${branch.id}">${branch.name}</option>`).join('')}</select></label><label for="player-name">Player name<input id="player-name" data-player-name maxlength="16" autocomplete="nickname" value="${playerName}" required/></label><button class="primary" data-confirm-branch disabled>Continue to character selection</button>` : `<p class="cloud-status">${branchesOnline ? 'No active branches have been configured. Please ask an administrator to set up branches before playing.' : 'Branch tracking is unavailable. Reconnect and try again.'}</p>`}<button data-go="prologue">Back</button></section>`;
const portraitAssets = ['role-pharmacist.png', 'role-technician.png', 'role-storekeeper.png', 'role-retail.png'];
const injuredPortraitAssets = ['role-pharmacist-injured.png', 'role-technician-injured.png', 'role-storekeeper-injured.png', 'role-retail-injured.png'];
const roleLabel = (role: Role) => role === 'Pharmacy Technician/Executive/Assistant'
  ? 'PA / PT / PE'
  : role === 'Storekeeper/Health Assistant'
    ? 'SK / HA'
    : role;
const roles = () => `<section class="panel"><p class="eyebrow">Choose your calling</p><h2>Which adventurer are you?</h2><div class="role-grid">${roleList.map((role, i) => `<button class="role-card" data-role="${role}"><span class="portrait p${i}"><img src="/assets/${portraitAssets[i]}" alt=""/></span><strong>${roleLabel(role)}</strong><small>Enter the dungeon</small></button>`).join('')}</div><button data-go="title">Back</button></section>`;
function trapEffect(trap: Trap | null) {
  if (trap === 'arrows') return `<div class="trap-overlay trap-arrows" aria-hidden="true"><img class="trap-arrow" src="/assets/trap-arrows.png" alt=""/></div>`;
  if (trap === 'boulders') return `<div class="trap-overlay trap-boulders" aria-hidden="true"><img class="trap-boulder boulder-one" src="/assets/trap-boulder.png" alt=""/><img class="trap-boulder boulder-two" src="/assets/trap-boulder.png" alt=""/><img class="trap-boulder boulder-three" src="/assets/trap-boulder.png" alt=""/></div>`;
  if (trap === 'axe') return `<div class="trap-overlay trap-axe" aria-hidden="true"><img class="axe-swing" src="/assets/trap-pendulum-axe.png" alt=""/></div>`;
  return '';
}
function game() {
  const question = run[index];
  const floor = Math.floor(index / QUESTIONS_PER_BIOME) + 1;
  const paused = document.body.dataset.paused === 'true';
  const timerText = graceLeft > 0 ? `⌛ Bonus begins in ${graceLeft.toFixed(1)}s` : timeLeft > 0 ? `⌛ Bonus ${timeLeft.toFixed(1)}s` : '⌛ Score locked';
  const avatarIndex = roleList.indexOf(chosenRole);
  const avatar = reaction === 'wrong' ? injuredPortraitAssets[avatarIndex] : portraitAssets[avatarIndex];
  const doorAsset = ['magic-door.png', 'door-crystal.png', 'door-castle.png', 'door-library.png', 'door-vault.png'][floor - 1];
  // U+FE0E forces a text-style heart rather than the colour emoji glyph that
  // iPhone browsers otherwise choose and cannot recolour for lost lives.
  const hearts = Array.from({ length: 5 }, (_, i) => `<span class="heart ${i < lives ? 'heart-active' : 'heart-empty'}">&#9829;&#65038;</span>`).join('');
  return `<section class="game-ui biome-${floor} ${paused ? 'is-paused' : ''}"><header class="hud"><span class="lives" aria-label="${lives} of 5 lives"><span class="heart-row" aria-hidden="true">${hearts}</span></span><b>${timerText}</b><span>${score} ✦ &nbsp; Floor ${floor} · ${index + 1}/${RUN_QUESTION_COUNT}</span><button data-pause>Ⅱ</button></header><main class="question-wrap"><p class="category">${question.category}</p><div class="question-scroll">${question.prompt}</div></main><div class="doors">${displayedOptions.map((option, i) => `<button class="door" data-option="${i}" ${(resolving || paused) ? 'disabled' : ''}><img src="/assets/${doorAsset}" alt=""/><span class="plaque"><b>${option.letter}</b> ${option.text}</span></button>`).join('')}</div><aside class="player-portrait ${reaction}"><img src="/assets/${avatar}" alt="${roleLabel(chosenRole)} adventurer"/></aside>${trapEffect(activeTrap)}<aside class="pause ${paused ? 'show' : ''}"><h3>Pause quest</h3><button data-toggle-sound aria-pressed="${settings.sound}">${settings.sound ? 'Mute sound' : 'Unmute sound'}</button><button data-resume>Resume</button><button data-return-menu>Return to main menu</button></aside></section>`;
}
const leaderboard = () => `<section class="panel leaderboard"><div class="leaderboard-board"><img class="leaderboard-board-art" src="/assets/gilded-scroll.png" alt=""/><div class="leaderboard-content"><h2>Hall of Prestige</h2><div class="tabs">${roleList.map((role, i) => `<button class="${i === 0 ? 'active' : ''}" data-tab="${i}">${roleLabel(role)}</button>`).join('')}</div><div class="score-columns" aria-hidden="true"><span>Player</span><span>Branch</span><span>Score</span></div><ol id="score-list"></ol><button data-go="title">Back</button></div></div></section>`;
const settingsView = () => `<section class="panel"><h2>Quest Settings</h2><div class="setting-list"><label><input type="checkbox" data-setting="sound" ${settings.sound ? 'checked' : ''}/> Sound and music</label><label><input type="checkbox" data-setting="large" ${settings.large ? 'checked' : ''}/> Larger text</label><label><input type="checkbox" data-setting="contrast" ${settings.contrast ? 'checked' : ''}/> High contrast</label></div><button data-go="title">Back</button></section>`;
const adminLogin = () => `<section class="panel admin-pin"><p class="eyebrow">Protected chamber</p><h2>Administrator sign in</h2><p>Use the shared administrator account to manage the cloud question bank and leaderboards.</p><form data-login-form><label for="admin-email">Email</label><input id="admin-email" data-admin-email type="email" autocomplete="username" required/><label for="admin-password">Password</label><input id="admin-password" data-admin-password type="password" autocomplete="current-password" required/><p class="pin-error" role="alert">${adminError}</p><button class="primary" type="submit">Sign in</button><button type="button" data-go="title">Cancel</button></form></section>`;
const admin = () => `<section class="panel admin"><p class="eyebrow">Administrator's chamber</p><h2>Question bank</h2><p>Replace the shared question bank only with a workbook that validates every role’s ${RUN_QUESTION_COUNT}-question pool. Player scores are not changed.</p><div class="admin-upload"><label for="question-bank-upload">Upload workbook</label><input id="question-bank-upload" type="file" accept=".xlsx" data-upload/></div><button data-restore>Restore bundled question bank</button><div class="admin-clear-actions"><button data-clear>Clear all shared leaderboards</button><button data-clear-insights>Clear all learning insights data</button></div><button data-open-branches>Manage branches</button><button data-open-insights>Learning insights &amp; export</button><button data-admin-final>Open high-score page</button><button data-sign-out>Sign out</button></section>`;
const adminBranches = () => `<section class="panel admin"><p class="eyebrow">Administrator's chamber</p><h2>Manage branches</h2><p>Only active branches are available to players. Historical attempts retain their branch snapshot if a branch is later renamed or deactivated.</p><form class="branch-add" data-branch-form><label for="branch-name">New branch name</label><input id="branch-name" maxlength="80" required/><button class="primary" type="submit">Add branch</button></form><div class="branch-list">${branches.length ? branches.map((branch, index) => `<article><strong>${branch.name}</strong><span>${branch.active ? 'Active' : 'Inactive'}</span><button data-branch-rename="${branch.id}">Rename</button><button data-branch-toggle="${branch.id}">${branch.active ? 'Deactivate' : 'Activate'}</button><button data-branch-up="${branch.id}" ${index === 0 ? 'disabled' : ''}>↑</button><button data-branch-down="${branch.id}" ${index === branches.length - 1 ? 'disabled' : ''}>↓</button></article>`).join('') : '<p>No branches yet. Add at least one before players can begin a tracked run.</p>'}</div><p class="pin-error" role="alert">${branchError}</p><button data-go="admin">Back</button></section>`;
const rate = (value: number | null) => value === null ? 'Hidden until 5 attempts' : `${Math.round(value * 100)}%`;
const insightsView = () => `<section class="panel admin insights"><p class="eyebrow">Administrator's chamber</p><h2>Learning insights</h2><p>Questions are ranked by incorrect-answer rate for the active question bank. Branch rates are hidden until five attempts.</p><nav><button data-go="admin">Back</button><button data-export="summary">Download summary CSV</button><button data-export="detail">Download detail CSV</button><button data-export="runs">Download playthrough CSV</button></nav>${insightsError ? `<p class="pin-error" role="alert">${insightsError}</p>` : ''}${insights ? (insights.questions.length ? `<div class="insight-list">${insights.questions.map((question) => `<article><button class="insight-question" data-insight-question="${question.id}"><span>${question.category}</span><strong>${question.incorrect}/${question.attempts} incorrect (${rate(question.incorrectRate)})</strong><small>${question.prompt}</small></button>${selectedInsightId === question.id ? `<table><thead><tr><th>Branch</th><th>Attempts</th><th>Incorrect</th><th>Rate</th></tr></thead><tbody>${question.branches.map((branch) => `<tr><td>${branch.name}</td><td>${branch.attempts}</td><td>${branch.incorrect}</td><td>${rate(branch.incorrectRate)}</td></tr>`).join('')}</tbody></table>` : ''}</article>`).join('')}</div>` : '<p>No answer attempts have been recorded for the active question bank.</p>') : '<p>Loading learning insights…</p>'}</section>`;
const victory = () => `<section class="panel victory"><div class="victory-chest-stage"><img class="chest" src="/assets/medicine-chest.png" alt="An open enchanted medicine chest"/></div><p class="eyebrow">The vault is open</p><h2>You found the sacred treasure!</h2><p class="victory-score">Your final score: <b>${score}</b></p>${adminScorePreview ? '<button data-admin-back>Return to administrator’s chamber</button>' : scoreSubmissionError ? `<p class="pin-error" role="alert">${scoreSubmissionError}</p><button data-go="title">Return to main menu</button>` : leaderboardRank ? `<p class="victory-rank">${playerName}, you are ranked <b>#${leaderboardRank}</b> among ${roleLabel(chosenRole)} adventurers.</p><button class="primary" data-go="leaderboard">View leaderboard</button><button data-go="title">Return to main menu</button>` : '<p class="victory-rank">Recording your result…</p>'}</section>`;
const gameover = () => `<section class="panel"><p class="eyebrow">The dungeon prevailed</p><h2>Your five lives are gone.</h2><p>Return to your pharmacy and prepare yourself further.</p><button class="primary" data-play-again>Try again</button><button data-go="title">Return to main menu</button></section>`;

function bind(layer: Element) {
  layer.querySelectorAll<HTMLElement>('[data-go]').forEach((button) => button.onclick = () => { stopTimer(); document.body.dataset.paused = 'false'; view = button.dataset.go as View; render(); if (view === 'leaderboard') showScores(0); });
  layer.querySelector<HTMLElement>('[data-open-branch]')?.addEventListener('click', () => { void openBranchSelection(); });
  const branchSelect = layer.querySelector<HTMLSelectElement>('[data-branch-select]');
  const playerNameInput = layer.querySelector<HTMLInputElement>('[data-player-name]');
  const continueBranch = layer.querySelector<HTMLButtonElement>('[data-confirm-branch]');
  const syncBranchContinue = () => { if (continueBranch) continueBranch.disabled = !branchSelect?.value || !validPlayerName(playerNameInput?.value ?? ''); };
  branchSelect?.addEventListener('change', syncBranchContinue);
  playerNameInput?.addEventListener('input', syncBranchContinue);
  continueBranch?.addEventListener('click', () => { const branch = branches.find((item) => item.id === branchSelect?.value); const name = (playerNameInput?.value ?? '').trim(); if (!branch || !validPlayerName(name)) return; chosenBranch = branch; playerName = name; view = 'roles'; render(); });
  layer.querySelectorAll<HTMLElement>('[data-role]').forEach((button) => button.onclick = () => start(button.dataset.role as Role));
  layer.querySelectorAll<HTMLElement>('[data-option]').forEach((button) => button.onclick = () => choose(Number(button.dataset.option)));
  layer.querySelector<HTMLElement>('[data-pause]')?.addEventListener('click', () => { document.body.dataset.paused = 'true'; stopTimer(); stopMusic(); render(); });
  layer.querySelector<HTMLElement>('[data-toggle-sound]')?.addEventListener('click', () => { settings.sound = !settings.sound; if (!settings.sound) stopMusic(); saveSettings(); render(); });
  layer.querySelector<HTMLElement>('[data-resume]')?.addEventListener('click', () => { document.body.dataset.paused = 'false'; beginTimer(false); render(); });
  layer.querySelector<HTMLElement>('[data-restart]')?.addEventListener('click', () => { if (confirm('Restart and lose this run?')) { void discardCurrentRun().finally(() => { void start(chosenRole); }); } });
  layer.querySelector<HTMLElement>('[data-return-menu]')?.addEventListener('click', () => { void discardCurrentRun(); stopTimer(); stopMusic(); document.body.dataset.paused = 'false'; view = 'title'; render(); });
  layer.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => input.onchange = () => { settings[input.dataset.setting!] = input.checked; if (input.dataset.setting === 'sound' && !input.checked) stopMusic(); saveSettings(); render(); });
  layer.querySelector<HTMLElement>('[data-settings]')?.addEventListener('click', () => { view = 'settings'; render(); });
  layer.querySelector<HTMLElement>('[data-admin]')?.addEventListener('click', () => { adminError = ''; view = isAdminSignedIn() ? 'admin' : 'adminLogin'; render(); });
  layer.querySelector<HTMLFormElement>('[data-login-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = layer.querySelector<HTMLInputElement>('[data-admin-email]')?.value ?? '';
    const password = layer.querySelector<HTMLInputElement>('[data-admin-password]')?.value ?? '';
    try { await signIn(email, password); adminError = ''; view = 'admin'; }
    catch (error) { adminError = error instanceof Error ? error.message : 'Sign in was not successful.'; }
    render();
  });
  layer.querySelectorAll<HTMLElement>('[data-tab]').forEach((button) => button.onclick = () => showScores(Number(button.dataset.tab)));
  layer.querySelector<HTMLInputElement>('[data-upload]')?.addEventListener('change', async (event) => { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; try { const candidate = parseWorkbook(await file.arrayBuffer()); if (confirm(`Replace the shared question bank with ${file.name}?`)) { const active = await uploadBank(candidate, file); bank = candidate; activeBankId = active.id; cloudOnline = true; alert('Shared question bank replaced. Existing leaderboard scores were kept; learning insights now begin for the new active bank.'); } } catch (error) { alert(error instanceof Error ? error.message : 'Invalid workbook.'); } });
  layer.querySelector<HTMLElement>('[data-restore]')?.addEventListener('click', () => { if (confirm('Restore the default shared question bank?')) void restoreBundledBank(defaultBank).then((active) => { bank = defaultBank; activeBankId = active.id; cloudOnline = true; alert('The default shared question bank is active again. Learning insights now begin for this active bank.'); }).catch((error) => alert(error instanceof Error ? error.message : 'Could not restore the default question bank.')); });
  layer.querySelector<HTMLElement>('[data-clear]')?.addEventListener('click', () => { if (confirm('Clear every role leaderboard? This cannot be undone.')) void clearLeaderboards().then(() => alert('Shared leaderboards cleared.')).catch((error) => alert(error instanceof Error ? error.message : 'Could not clear the leaderboards.')); });
  layer.querySelector<HTMLElement>('[data-clear-insights]')?.addEventListener('click', () => { if (confirm('Clear all recorded learning-insights attempts? This cannot be undone and does not affect branches, question banks, or leaderboards.')) void clearLearningInsights().then(() => alert('Learning insights data cleared.')).catch((error) => alert(error instanceof Error ? error.message : 'Could not clear learning insights data.')); });
  layer.querySelector<HTMLElement>('[data-open-branches]')?.addEventListener('click', () => { void openAdminBranches(); });
  layer.querySelector<HTMLElement>('[data-open-insights]')?.addEventListener('click', () => { view = 'adminInsights'; insights = null; insightsError = ''; selectedInsightId = ''; render(); void loadInsights(); });
  layer.querySelector<HTMLFormElement>('[data-branch-form]')?.addEventListener('submit', (event) => { event.preventDefault(); const input = layer.querySelector<HTMLInputElement>('#branch-name'); if (!input) return; void createBranch(input.value, branches.length).then(() => openAdminBranches()).catch((error) => { branchError = error instanceof Error ? error.message : 'Unable to add branch.'; render(); }); });
  layer.querySelectorAll<HTMLElement>('[data-branch-rename]').forEach((button) => button.onclick = () => { const branch = branches.find((item) => item.id === button.dataset.branchRename); const name = branch && prompt('Branch name', branch.name); if (!branch || !name) return; void updateBranch(branch.id, { name }).then(() => openAdminBranches()).catch((error) => { branchError = error instanceof Error ? error.message : 'Unable to rename branch.'; render(); }); });
  layer.querySelectorAll<HTMLElement>('[data-branch-toggle]').forEach((button) => button.onclick = () => { const branch = branches.find((item) => item.id === button.dataset.branchToggle); if (!branch) return; void updateBranch(branch.id, { active: !branch.active }).then(() => openAdminBranches()).catch((error) => { branchError = error instanceof Error ? error.message : 'Unable to update branch.'; render(); }); });
  layer.querySelectorAll<HTMLElement>('[data-branch-up],[data-branch-down]').forEach((button) => button.onclick = () => { const id = button.dataset.branchUp ?? button.dataset.branchDown; const current = branches.findIndex((item) => item.id === id); const target = button.dataset.branchUp ? current - 1 : current + 1; if (current < 0 || target < 0 || target >= branches.length) return; const a = branches[current]; const b = branches[target]; void Promise.all([updateBranch(a.id, { position: b.position }), updateBranch(b.id, { position: a.position })]).then(() => openAdminBranches()).catch((error) => { branchError = error instanceof Error ? error.message : 'Unable to reorder branches.'; render(); }); });
  layer.querySelectorAll<HTMLElement>('[data-insight-question]').forEach((button) => button.onclick = () => { selectedInsightId = selectedInsightId === button.dataset.insightQuestion ? '' : button.dataset.insightQuestion ?? ''; render(); });
  layer.querySelectorAll<HTMLElement>('[data-export]').forEach((button) => button.onclick = () => { void downloadLearningInsights(button.dataset.export as 'summary' | 'detail' | 'runs').catch((error) => { insightsError = error instanceof Error ? error.message : 'Unable to export learning insights.'; render(); }); });
  layer.querySelector<HTMLElement>('[data-sign-out]')?.addEventListener('click', () => { signOut(); view = 'title'; render(); });
  layer.querySelector<HTMLElement>('[data-admin-final]')?.addEventListener('click', () => { chosenRole = roleList[0]; score = 0; adminScorePreview = true; view = 'victory'; render(); });
  layer.querySelector<HTMLElement>('[data-admin-back]')?.addEventListener('click', () => { adminScorePreview = false; view = 'admin'; render(); });
  layer.querySelector<HTMLElement>('[data-play-again]')?.addEventListener('click', () => { view = 'branch'; render(); });
}
async function openBranchSelection() { branchError = ''; try { branches = await fetchBranches(); branchesOnline = true; } catch (error) { branches = []; branchesOnline = false; branchError = error instanceof Error ? error.message : 'Branch tracking is unavailable.'; } view = 'branch'; render(); }
async function openAdminBranches() { branchError = ''; try { branches = await fetchAdminBranches(); view = 'adminBranches'; } catch (error) { branchError = error instanceof Error ? error.message : 'Unable to load branches.'; view = 'adminBranches'; } render(); }
async function loadInsights() { try { insights = await fetchLearningInsights(); } catch (error) { insightsError = error instanceof Error ? error.message : 'Unable to load learning insights.'; } if (view === 'adminInsights') render(); }
async function showScores(index: number) { const list = document.querySelector('#score-list'); if (!list) return; const role = roleList[index]; list.innerHTML = '<li>Loading champions…</li>'; document.querySelectorAll('.tabs button').forEach((button, i) => button.classList.toggle('active', i === index)); try { const entries = await fetchScores(role); cloudOnline = true; list.innerHTML = entries.length ? entries.map((entry, i) => `<li><span>${i + 1}. ${entry.name}</span><span class="score-branch">${entry.branch ?? '—'}</span><b>${entry.score}</b></li>`).join('') : '<li>No champion has claimed this path yet.</li>'; } catch { cloudOnline = false; list.innerHTML = '<li>Leaderboard temporarily unavailable. Please try again when you are online.</li>'; } }
const validPlayerName = (name: string) => /^[\p{L}\p{N} _.-]{1,16}$/u.test(name.trim());
async function start(role: Role) { if (!chosenBranch || !activeBankId || !validPlayerName(playerName)) { branchError = 'Select a branch and enter a valid player name before beginning a tracked run.'; view = 'branch'; render(); return; } adminScorePreview = false; leaderboardRank = null; scoreSubmissionError = ''; try { currentRunId = (await createPlaythrough({ bankId: activeBankId, branchId: chosenBranch.id, role, playerName })).run.id; } catch (error) { branchError = error instanceof Error ? error.message : 'Unable to begin a tracked run.'; view = 'branch'; render(); return; } chosenRole = role; run = selectRun(bank, role); index = 0; score = 0; lives = 5; resolving = false; reaction = 'idle'; activeTrap = null; displayedOptions = shuffler(run[index]); view = 'game'; document.body.dataset.paused = 'false'; render(); beginTimer(); }
function beginTimer(reset = true) { stopTimer(); if (reset) { graceLeft = 6; timeLeft = 10; } timer = window.setInterval(() => { if (graceLeft > 0) graceLeft = Math.max(0, graceLeft - .1); else timeLeft = Math.max(0, timeLeft - .1); const target = document.querySelector('.hud b'); if (target) target.textContent = graceLeft > 0 ? `⌛ Bonus begins in ${graceLeft.toFixed(1)}s` : timeLeft > 0 ? `⌛ Bonus ${timeLeft.toFixed(1)}s` : '⌛ Score locked'; }, 100); }
function choose(optionIndex: number) { if (resolving || document.body.dataset.paused === 'true') return; playDoorSelect(); const option = displayedOptions[optionIndex]; answer(option.letter === run[index].answer); }
function finishCurrentRun(completed: boolean) { const runId = currentRunId; currentRunId = null; return runId ? finishPlaythrough(runId, score, completed).catch(() => { /* The completed status is best-effort if a connection drops during the final transition. */ }) : Promise.resolve(); }
function discardCurrentRun() { const runId = currentRunId; currentRunId = null; return runId ? discardPlaythrough(runId).catch(() => { /* An unfinished run stays out of the export if a connection drops before deletion. */ }) : Promise.resolve(); }
function publishVictory() { void finishCurrentRun(true); void submitScore(chosenRole, playerName, score, chosenBranch?.name).then(({ rank }) => { leaderboardRank = rank; if (view === 'victory') render(); }).catch((error) => { scoreSubmissionError = error instanceof Error ? error.message : 'Your run finished, but the leaderboard could not be updated.'; if (view === 'victory') render(); }); }
function answer(correct: boolean) { const question = run[index]; if (activeBankId && chosenBranch) void recordAttempt({ bankId: activeBankId, branchId: chosenBranch.id, role: chosenRole, questionId: question.id, category: question.category, prompt: question.prompt, correct, runId: currentRunId ?? undefined }).catch(() => { /* A run starts only when tracking is online; keep gameplay responsive if the connection drops later. */ }); stopTimer(); resolving = true; reaction = correct ? 'correct' : 'wrong'; if (correct) playCorrect(); else { activeTrap = ['arrows', 'boulders', 'axe'][Math.floor(Math.random() * 3)] as Trap; playTrap(activeTrap); damageFlash(); } if (correct) score += graceLeft > 0 ? 100 : Math.max(0, Math.ceil(timeLeft * 10)); else lives -= 1; render(); window.setTimeout(() => { reaction = 'idle'; activeTrap = null; resolving = false; if (!correct && lives <= 0) { void finishCurrentRun(false); playGameOver(); stopMusic(); view = 'gameover'; render(); return; } index += 1; if (index >= RUN_QUESTION_COUNT) { view = 'victory'; playTreasureFanfare(); render(); publishVictory(); return; } if (index % QUESTIONS_PER_BIOME === 0) playBiomeTransition(); displayedOptions = shuffler(run[index]); render(); beginTimer(); }, correct ? 650 : 1250); }

async function bootstrap() { const response = await fetch('/question-bank.xlsx'); defaultBank = parseWorkbook(await response.arrayBuffer()); try { const active = await fetchActiveBank(); bank = active?.data ?? defaultBank; activeBankId = active?.id ?? null; cloudOnline = Boolean(active); } catch { bank = defaultBank; cloudOnline = false; activeBankId = null; } render(); }
bootstrap().catch((error) => { app.innerHTML = `<pre>Unable to load question bank: ${error instanceof Error ? error.message : String(error)}</pre>`; });
