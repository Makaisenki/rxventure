import Phaser from 'phaser';
import './style.css';
import { Bank, Question, Role, parseWorkbook, roleList, selectRun } from './questionBank';
import { clearLeaderboards, fetchActiveBank, fetchScores, isAdminSignedIn, restoreBundledBank, signIn, signOut, submitScore, uploadBank } from './cloud';

type View = 'title' | 'prologue' | 'roles' | 'game' | 'leaderboard' | 'settings' | 'adminLogin' | 'admin' | 'victory' | 'gameover';
const KEY = { settings: 'rxventure-settings' };
const app = document.querySelector<HTMLDivElement>('#app')!;
let bank: Bank;
let defaultBank: Bank;
let view: View = 'title';
let chosenRole: Role;
let run: Question[] = [];
let index = 0, score = 0, lives = 5, timeLeft = 10, graceLeft = 10, timer: number | undefined;
let expanded = -1;
let resolving = false;
let reaction: 'idle' | 'correct' | 'wrong' = 'idle';
let displayedOptions: { text: string; letter: string }[] = [];
let adminError = '';
let cloudOnline = false;
let settings = JSON.parse(localStorage.getItem(KEY.settings) || '{"sound":false,"contrast":false,"large":false,"reduced":false}');

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
function beep(ok: boolean) { if (!settings.sound) return; const ctx = new AudioContext(); const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); oscillator.frequency.value = ok ? 660 : 180; gain.gain.value = .04; oscillator.connect(gain).connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + .13); }
function shuffler(question: Question) { return question.options.map((text, i) => ({ text, letter: String.fromCharCode(65 + i) })).sort(() => Math.random() - .5); }

function render() {
  document.body.classList.toggle('contrast', settings.contrast); document.body.classList.toggle('large', settings.large); document.body.classList.toggle('reduce', settings.reduced);
  const layer = document.querySelector('.ui-layer') ?? document.createElement('section'); layer.className = 'ui-layer'; app.append(layer);
  layer.innerHTML = view === 'title' ? title() : view === 'prologue' ? prologue() : view === 'roles' ? roles() : view === 'game' ? game() : view === 'leaderboard' ? leaderboard() : view === 'settings' ? settingsView() : view === 'adminLogin' ? adminLogin() : view === 'admin' ? admin() : view === 'victory' ? victory() : gameover();
  bind(layer);
}

const title = () => `<section class="hero"><p class="eyebrow">A pharmacy quest for knowledge</p><h1>RxVenture <span>Dungeon</span></h1><p class="lede">Seek the sacred treasure. Choose wisely. Make your pharmacy legendary.</p>${cloudOnline ? '' : '<p class="cloud-status">Offline mode: shared scores are unavailable.</p>'}<button class="primary" data-go="prologue">Start quest</button><nav><button data-go="leaderboard">Leaderboard</button><button data-settings>Settings</button></nav><button class="crest" aria-label="Administration" data-admin>✦</button></section>`;
const prologue = () => `<section class="panel story"><p class="eyebrow">The call to adventure</p><h2>The kingdom needs your knowledge.</h2><p>Deep in the enchanted dungeon rests a treasure that will make your pharmacy the most prestigious in the realm.</p><p>Answer swiftly. Choose the right doors. Protect your five lives.</p><button class="primary" data-go="roles">Choose your role</button></section>`;
const portraitAssets = ['role-pharmacist.png', 'role-technician.png', 'role-storekeeper.png', 'role-retail.png'];
const roleLabel = (role: Role) => role === 'Pharmacy Technician/Executive/Assistant' ? 'PA / PT / PE' : role;
const roles = () => `<section class="panel"><p class="eyebrow">Choose your calling</p><h2>Which adventurer are you?</h2><div class="role-grid">${roleList.map((role, i) => `<button class="role-card" data-role="${role}"><span class="portrait p${i}"><img src="/assets/${portraitAssets[i]}" alt=""/></span><strong>${roleLabel(role)}</strong><small>Enter the dungeon</small></button>`).join('')}</div><button data-go="title">Back</button></section>`;
function game() {
  const question = run[index];
  const floor = Math.floor(index / 10) + 1;
  const timerText = graceLeft > 0 ? `⌛ Bonus begins in ${graceLeft.toFixed(1)}s` : timeLeft > 0 ? `⌛ Bonus ${timeLeft.toFixed(1)}s` : '⌛ Score locked';
  const avatar = portraitAssets[roleList.indexOf(chosenRole)];
  const doorAsset = ['magic-door.png', 'door-crystal.png', 'door-castle.png', 'door-library.png', 'door-vault.png'][floor - 1];
  return `<section class="game-ui biome-${floor}"><header class="hud"><span class="lives"><span aria-hidden="true">♥</span> ${lives}/5</span><b>${timerText}</b><span>${score} ✦ &nbsp; Floor ${floor} · ${index + 1}/50</span><button data-pause>Ⅱ</button></header><main class="question-wrap"><p class="category">${question.category}</p><div class="question-scroll">${question.prompt}</div></main><div class="doors">${displayedOptions.map((option, i) => `<button class="door ${expanded === i ? 'expanded' : ''}" data-option="${i}" ${resolving ? 'disabled' : ''}><img src="/assets/${doorAsset}" alt=""/><span class="plaque"><b>${option.letter}</b> ${option.text}</span></button>`).join('')}</div><aside class="player-portrait ${reaction}"><img src="/assets/${avatar}" alt="${roleLabel(chosenRole)} adventurer"/></aside><aside class="pause ${document.body.dataset.paused === 'true' ? 'show' : ''}"><h3>Pause quest</h3><button data-resume>Resume</button><button data-return-menu>Return to main menu</button></aside></section>`;
}
const leaderboard = () => `<section class="panel leaderboard"><p class="eyebrow">Hall of prestige</p><h2>Leaderboard</h2><div class="tabs">${roleList.map((role, i) => `<button class="${i === 0 ? 'active' : ''}" data-tab="${i}">${roleLabel(role)}</button>`).join('')}</div><ol id="score-list"></ol><button data-go="title">Back</button></section>`;
const settingsView = () => `<section class="panel"><p class="eyebrow">Quest settings</p><h2>Make the dungeon yours</h2><div class="setting-list"><label><input type="checkbox" data-setting="sound" ${settings.sound ? 'checked' : ''}/> Sound and music</label><label><input type="checkbox" data-setting="large" ${settings.large ? 'checked' : ''}/> Larger text</label><label><input type="checkbox" data-setting="contrast" ${settings.contrast ? 'checked' : ''}/> High contrast</label><label><input type="checkbox" data-setting="reduced" ${settings.reduced ? 'checked' : ''}/> Reduce motion</label></div><button data-go="title">Back</button></section>`;
const adminLogin = () => `<section class="panel admin-pin"><p class="eyebrow">Protected chamber</p><h2>Administrator sign in</h2><p>Use the shared administrator account to manage the cloud question bank and leaderboards.</p><form data-login-form><label for="admin-email">Email</label><input id="admin-email" data-admin-email type="email" autocomplete="username" required/><label for="admin-password">Password</label><input id="admin-password" data-admin-password type="password" autocomplete="current-password" required/><p class="pin-error" role="alert">${adminError}</p><button class="primary" type="submit">Sign in</button><button type="button" data-go="title">Cancel</button></form></section>`;
const admin = () => `<section class="panel admin"><p class="eyebrow">Administrator's chamber</p><h2>Question bank</h2><p>Replace the shared question bank only with a workbook that validates every role’s 50-question pool. Player scores are not changed.</p><input type="file" accept=".xlsx" data-upload/><button data-restore>Restore bundled question bank</button><button data-clear>Clear all shared leaderboards</button><button data-sign-out>Sign out</button><button data-go="title">Back</button></section>`;
const victory = () => `<section class="panel victory"><img class="chest" src="/assets/medicine-chest.png" alt="An open enchanted medicine chest"/><p class="eyebrow">The vault is open</p><h2>You found the sacred treasure!</h2><p>Your final score: <b>${score}</b></p><label>Enter your adventurer nickname <input maxlength="16" data-name autofocus /></label><button class="primary" data-save-score>Claim your place</button></section>`;
const gameover = () => `<section class="panel"><p class="eyebrow">The dungeon prevailed</p><h2>Your five lives are gone.</h2><p>Every new run summons a new set of questions.</p><button class="primary" data-play-again>Try again</button><button data-go="roles">Choose another role</button></section>`;

function bind(layer: Element) {
  layer.querySelectorAll<HTMLElement>('[data-go]').forEach((button) => button.onclick = () => { stopTimer(); document.body.dataset.paused = 'false'; view = button.dataset.go as View; render(); if (view === 'leaderboard') showScores(0); });
  layer.querySelectorAll<HTMLElement>('[data-role]').forEach((button) => button.onclick = () => start(button.dataset.role as Role));
  layer.querySelectorAll<HTMLElement>('[data-option]').forEach((button) => button.onclick = () => choose(Number(button.dataset.option)));
  layer.querySelector<HTMLElement>('[data-pause]')?.addEventListener('click', () => { document.body.dataset.paused = 'true'; stopTimer(); render(); });
  layer.querySelector<HTMLElement>('[data-resume]')?.addEventListener('click', () => { document.body.dataset.paused = 'false'; beginTimer(false); render(); });
  layer.querySelector<HTMLElement>('[data-restart]')?.addEventListener('click', () => { if (confirm('Restart and lose this run?')) start(chosenRole); });
  layer.querySelector<HTMLElement>('[data-return-menu]')?.addEventListener('click', () => { stopTimer(); document.body.dataset.paused = 'false'; view = 'title'; render(); });
  layer.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => input.onchange = () => { settings[input.dataset.setting!] = input.checked; saveSettings(); render(); });
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
  layer.querySelector<HTMLInputElement>('[data-upload]')?.addEventListener('change', async (event) => { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; try { const candidate = parseWorkbook(await file.arrayBuffer()); if (confirm(`Replace the shared question bank with ${file.name}?`)) { await uploadBank(candidate, file); bank = candidate; cloudOnline = true; alert('Shared question bank replaced. Existing leaderboard scores were kept.'); } } catch (error) { alert(error instanceof Error ? error.message : 'Invalid workbook.'); } });
  layer.querySelector<HTMLElement>('[data-restore]')?.addEventListener('click', () => { if (confirm('Restore the default shared question bank?')) void restoreBundledBank(defaultBank).then(() => { bank = defaultBank; cloudOnline = true; alert('The default shared question bank is active again.'); }).catch((error) => alert(error instanceof Error ? error.message : 'Could not restore the default question bank.')); });
  layer.querySelector<HTMLElement>('[data-clear]')?.addEventListener('click', () => { if (confirm('Clear every role leaderboard? This cannot be undone.')) void clearLeaderboards().then(() => alert('Shared leaderboards cleared.')).catch((error) => alert(error instanceof Error ? error.message : 'Could not clear the leaderboards.')); });
  layer.querySelector<HTMLElement>('[data-sign-out]')?.addEventListener('click', () => { signOut(); view = 'title'; render(); });
  layer.querySelector<HTMLElement>('[data-play-again]')?.addEventListener('click', () => start(chosenRole));
  layer.querySelector<HTMLElement>('[data-save-score]')?.addEventListener('click', () => { const name = (layer.querySelector<HTMLInputElement>('[data-name]')?.value ?? '').trim(); if (!name) return; if (!cloudOnline) { alert('You are offline. Reconnect before submitting a shared score.'); return; } void submitScore(chosenRole, name, score).then(() => { view = 'leaderboard'; render(); void showScores(roleList.indexOf(chosenRole)); }).catch((error) => alert(error instanceof Error ? error.message : 'Could not submit this score.')); });
}
async function showScores(index: number) { const list = document.querySelector('#score-list'); if (!list) return; const role = roleList[index]; list.innerHTML = '<li>Loading champions…</li>'; document.querySelectorAll('.tabs button').forEach((button, i) => button.classList.toggle('active', i === index)); try { const entries = await fetchScores(role); cloudOnline = true; list.innerHTML = entries.length ? entries.map((entry, i) => `<li><span>${i + 1}. ${entry.name}</span><b>${entry.score}</b></li>`).join('') : '<li>No champion has claimed this path yet.</li>'; } catch { cloudOnline = false; list.innerHTML = '<li>Leaderboard temporarily unavailable. Please try again when you are online.</li>'; } }
function start(role: Role) { chosenRole = role; run = selectRun(bank, role); index = 0; score = 0; lives = 5; expanded = -1; resolving = false; reaction = 'idle'; displayedOptions = shuffler(run[index]); view = 'game'; document.body.dataset.paused = 'false'; render(); beginTimer(); }
function beginTimer(reset = true) { stopTimer(); if (reset) { graceLeft = 10; timeLeft = 10; } timer = window.setInterval(() => { if (graceLeft > 0) graceLeft = Math.max(0, graceLeft - .1); else timeLeft = Math.max(0, timeLeft - .1); const target = document.querySelector('.hud b'); if (target) target.textContent = graceLeft > 0 ? `⌛ Bonus begins in ${graceLeft.toFixed(1)}s` : timeLeft > 0 ? `⌛ Bonus ${timeLeft.toFixed(1)}s` : '⌛ Score locked'; }, 100); }
function choose(optionIndex: number) { if (resolving) return; if (expanded !== optionIndex) { expanded = optionIndex; render(); return; } const option = displayedOptions[optionIndex]; answer(option.letter === run[index].answer); }
function answer(correct: boolean) { stopTimer(); resolving = true; reaction = correct ? 'correct' : 'wrong'; beep(correct); if (correct) score += graceLeft > 0 ? 100 : Math.max(0, Math.ceil(timeLeft * 10)); else lives -= 1; expanded = -1; render(); window.setTimeout(() => { reaction = 'idle'; resolving = false; if (!correct && lives <= 0) { view = 'gameover'; render(); return; } index += 1; if (index >= 50) { view = 'victory'; render(); return; } displayedOptions = shuffler(run[index]); render(); beginTimer(); }, settings.reduced ? 0 : 650); }

async function bootstrap() { const response = await fetch('/question-bank.xlsx'); defaultBank = parseWorkbook(await response.arrayBuffer()); try { const active = await fetchActiveBank(); bank = active ?? defaultBank; cloudOnline = Boolean(active); } catch { bank = defaultBank; cloudOnline = false; } render(); }
bootstrap().catch((error) => { app.innerHTML = `<pre>Unable to load question bank: ${error instanceof Error ? error.message : String(error)}</pre>`; });
