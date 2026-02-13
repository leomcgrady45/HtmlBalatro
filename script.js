const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

const JOKER_POOL = [
  { name: "加筹小丑", desc: "+60基础筹码", cost: 4, apply: (ctx) => (ctx.chips += 60) },
  { name: "倍率小丑", desc: "最终倍率 +1", cost: 5, apply: (ctx) => (ctx.mult += 1) },
  { name: "同花小丑", desc: "打出同花时额外 x1.5 倍率", cost: 6, apply: (ctx) => ctx.isFlush && (ctx.mult *= 1.5) },
  { name: "对子小丑", desc: "打出对子/两对/三条额外 +80筹码", cost: 5, apply: (ctx) => ctx.hasPairLike && (ctx.chips += 80) },
  { name: "高牌专家", desc: "高牌也有尊严：高牌 +120筹码", cost: 6, apply: (ctx) => ctx.handName === "高牌" && (ctx.chips += 120) },
  { name: "连顺小丑", desc: "顺子时最终倍率 +2", cost: 6, apply: (ctx) => ctx.isStraight && (ctx.mult += 2) },
];

const state = {
  round: 1,
  targetScore: 400,
  roundScore: 0,
  gold: 8,
  playsLeft: 4,
  discardsLeft: 3,
  deck: [],
  hand: [],
  discardPile: [],
  selected: new Set(),
  jokers: [],
  shopOffers: [],
};

const $ = (id) => document.getElementById(id);
const logEl = $("log");

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${rank}${suit}-${Math.random().toString(36).slice(2, 8)}` });
    }
  }
  return shuffle(deck);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function init() {
  state.deck = createDeck();
  drawToHand(8);
  rollShop();
  bindEvents();
  render();
  log("游戏开始！达成盲注目标后才能进入下一回合。");
}

function bindEvents() {
  $("drawBtn").onclick = () => {
    drawToHand(8 - state.hand.length);
    render();
  };
  $("playBtn").onclick = playSelected;
  $("discardBtn").onclick = discardSelected;
  $("nextRoundBtn").onclick = nextRound;
  $("refreshShopBtn").onclick = () => {
    if (state.gold < 1) return log("金币不足，无法刷新商店。");
    state.gold -= 1;
    rollShop();
    render();
    log("商店已刷新（-1金币）。");
  };
}

function drawToHand(count) {
  refillDeckIfNeeded();
  for (let i = 0; i < count && state.deck.length && state.hand.length < 8; i++) {
    state.hand.push(state.deck.pop());
    refillDeckIfNeeded();
  }
}

function refillDeckIfNeeded() {
  if (state.deck.length > 0 || state.discardPile.length === 0) return;
  state.deck = shuffle(state.discardPile);
  state.discardPile = [];
  log("抽牌堆耗尽，已将弃牌堆洗回抽牌堆。");
}

function toggleSelect(cardId) {
  if (state.selected.has(cardId)) {
    state.selected.delete(cardId);
  } else {
    if (state.selected.size >= 5) return;
    state.selected.add(cardId);
  }
  renderHand();
}

function playSelected() {
  const cards = state.hand.filter((c) => state.selected.has(c.id));
  if (cards.length === 0) return log("请先选择要打出的牌。\n");
  if (state.playsLeft <= 0) return log("本回合没有剩余出牌次数。\n");

  const evalResult = evaluateHand(cards);
  const context = {
    ...evalResult,
    chips: evalResult.baseChips,
    mult: evalResult.baseMult,
  };
  for (const joker of state.jokers) joker.apply(context);

  const handScore = Math.floor(context.chips * context.mult);
  state.roundScore += handScore;
  state.playsLeft -= 1;

  const cardIds = new Set(cards.map((c) => c.id));
  state.hand = state.hand.filter((c) => !cardIds.has(c.id));
  state.discardPile.push(...cards);
  state.selected.clear();

  drawToHand(8 - state.hand.length);
  if (state.roundScore >= state.targetScore) {
    state.gold += 4 + state.round;
    log(`✅ ${evalResult.handName}：${context.chips} x ${context.mult.toFixed(2)} = ${handScore}，达成盲注！奖励金币 ${4 + state.round}。`);
  } else {
    log(`🃏 ${evalResult.handName}：${context.chips} x ${context.mult.toFixed(2)} = ${handScore}。`);
  }

  if (state.playsLeft === 0 && state.roundScore < state.targetScore) {
    log("❌ 出牌用尽且未达标，自动扣除2金币并重置本回合。\n");
    state.gold = Math.max(0, state.gold - 2);
    resetRound(false);
  }

  render();
}

function discardSelected() {
  const cards = state.hand.filter((c) => state.selected.has(c.id));
  if (cards.length === 0) return log("请先选择要弃掉的牌。\n");
  if (state.discardsLeft <= 0) return log("本回合没有剩余弃牌次数。\n");

  const ids = new Set(cards.map((c) => c.id));
  state.hand = state.hand.filter((c) => !ids.has(c.id));
  state.discardPile.push(...cards);
  state.selected.clear();
  state.discardsLeft -= 1;

  drawToHand(8 - state.hand.length);
  render();
  log(`你弃掉了 ${cards.length} 张牌。`);
}

function evaluateHand(cards) {
  const values = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => a - b);
  const suits = cards.map((c) => c.suit);
  const countByValue = values.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {});
  const groups = Object.values(countByValue).sort((a, b) => b - a);

  const isFlush = suits.length >= 5 && suits.every((s) => s === suits[0]);
  const uniqueValues = [...new Set(values)];
  const isStraight = checkStraight(uniqueValues);

  let handName = "高牌";
  let baseChips = 40 + Math.max(...values, 10) * 4;
  let baseMult = 1;

  if (isStraight && isFlush && values.includes(14)) {
    handName = "皇家同花顺";
    baseChips = 320;
    baseMult = 8;
  } else if (isStraight && isFlush) {
    handName = "同花顺";
    baseChips = 260;
    baseMult = 6;
  } else if (groups[0] === 4) {
    handName = "四条";
    baseChips = 230;
    baseMult = 5;
  } else if (groups[0] === 3 && groups[1] >= 2) {
    handName = "葫芦";
    baseChips = 180;
    baseMult = 4;
  } else if (isFlush) {
    handName = "同花";
    baseChips = 150;
    baseMult = 3.5;
  } else if (isStraight) {
    handName = "顺子";
    baseChips = 140;
    baseMult = 3.2;
  } else if (groups[0] === 3) {
    handName = "三条";
    baseChips = 120;
    baseMult = 2.6;
  } else if (groups[0] === 2 && groups[1] === 2) {
    handName = "两对";
    baseChips = 100;
    baseMult = 2.2;
  } else if (groups[0] === 2) {
    handName = "对子";
    baseChips = 80;
    baseMult = 1.9;
  }

  return {
    handName,
    baseChips,
    baseMult,
    isFlush,
    isStraight,
    hasPairLike: ["对子", "两对", "三条"].includes(handName),
  };
}

function checkStraight(sortedUniqueVals) {
  if (sortedUniqueVals.length < 5) return false;
  for (let i = 0; i <= sortedUniqueVals.length - 5; i++) {
    const slice = sortedUniqueVals.slice(i, i + 5);
    if (slice[4] - slice[0] === 4 && slice.every((v, idx) => idx === 0 || v - slice[idx - 1] === 1)) {
      return true;
    }
  }
  if ([14, 2, 3, 4, 5].every((v) => sortedUniqueVals.includes(v))) return true;
  return false;
}

function rollShop() {
  state.shopOffers = shuffle(JOKER_POOL).slice(0, 3);
}

function buyJoker(joker) {
  if (state.jokers.length >= 3) return log("小丑牌槽位已满（最多3张）。");
  if (state.gold < joker.cost) return log("金币不足，无法购买该小丑牌。");
  state.gold -= joker.cost;
  state.jokers.push(joker);
  state.shopOffers = state.shopOffers.filter((j) => j !== joker);
  render();
  log(`购买小丑牌：${joker.name}（-${joker.cost}金币）`);
}

function nextRound() {
  if (state.roundScore < state.targetScore) return log("尚未达到盲注需求，不能进入下一回合。\n");
  state.round += 1;
  state.targetScore = Math.floor(state.targetScore * 1.45);
  resetRound(true);
  rollShop();
  log(`🎯 进入第 ${state.round} 回合，新的盲注需求：${state.targetScore}`);
  render();
}

function resetRound(clearScore) {
  state.playsLeft = 4;
  state.discardsLeft = 3;
  if (clearScore) state.roundScore = 0;
  state.selected.clear();
  drawToHand(8 - state.hand.length);
}

function render() {
  $("round").textContent = state.round;
  $("targetScore").textContent = state.targetScore;
  $("roundScore").textContent = state.roundScore;
  $("gold").textContent = state.gold;
  $("playsLeft").textContent = state.playsLeft;
  $("discardsLeft").textContent = state.discardsLeft;
  $("deckCount").textContent = state.deck.length;
  $("discardPileCount").textContent = state.discardPile.length;
  $("nextRoundBtn").disabled = state.roundScore < state.targetScore;

  renderHand();
  renderJokers();
  renderShop();
}

function renderHand() {
  const handEl = $("hand");
  handEl.innerHTML = "";
  for (const card of state.hand) {
    const div = document.createElement("div");
    div.className = `card ${["♥", "♦"].includes(card.suit) ? "red" : ""}`;
    if (state.selected.has(card.id)) div.classList.add("selected");
    div.innerHTML = `<div>${card.rank}</div><div>${card.suit}</div>`;
    div.onclick = () => toggleSelect(card.id);
    handEl.appendChild(div);
  }
}

function renderJokers() {
  const jokersEl = $("jokers");
  jokersEl.innerHTML = "";
  if (state.jokers.length === 0) jokersEl.innerHTML = "<em>暂无小丑牌</em>";
  for (const joker of state.jokers) {
    const div = document.createElement("div");
    div.className = "joker-card";
    div.innerHTML = `<strong>${joker.name}</strong><small>${joker.desc}</small>`;
    jokersEl.appendChild(div);
  }
}

function renderShop() {
  const shopEl = $("shop");
  shopEl.innerHTML = "";
  for (const joker of state.shopOffers) {
    const card = document.createElement("div");
    card.className = "shop-card";
    card.innerHTML = `
      <strong>${joker.name}</strong>
      <small>${joker.desc}</small>
      <small>价格：${joker.cost} 金币</small>
    `;

    const btn = document.createElement("button");
    btn.textContent = "购买";
    btn.onclick = () => buyJoker(joker);
    card.appendChild(btn);
    shopEl.appendChild(card);
  }
}

function log(text) {
  logEl.textContent = `${text}\n${logEl.textContent}`.slice(0, 4000);
}

init();
