(function () {
  'use strict';

  /* ───────── 연습용 가정 (숫자를 바꾸려면 여기) ───────── */
  const QUOTE = { FOB: 38000, CIF: 41000, DAP: 43400 };  // 조건별 견적가 (USD)
  const QTY_LABEL = '스테인리스 텀블러 5,000개';
  const COST_MAKE = 42000000;      // 제조원가 (원)
  const COST_LOCAL = 1200000;      // 국내 운송·통관·선적 비용 (원)
  const FX_NOW = 1400, FX_FWD = 1395;
  const FREIGHT = 2400, FREIGHT_SURGE = 1200, DEST = 1400, DEST_JAM = 900;  // USD
  const INS = { C: 60, A: 150 };   // 적하보험료 (USD)
  const ODDS = { freight: 0.35, damage: 0.25, congestion: 0.3, late: 0.25, default: 0.15 };

  const usd = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  const krw = function (n) { return (n < 0 ? '−' : '') + '₩' + Math.abs(Math.round(n)).toLocaleString('ko-KR'); };
  const signed = function (n) { return (n < 0 ? '−' : '+') + '₩' + Math.abs(Math.round(n)).toLocaleString('ko-KR'); };
  const $ = function (id) { return document.getElementById(id); };

  /* ───────── 상태 ───────── */
  // w: 판마다 숨겨진 세상, c: 내가 고른 것, rv: 지금까지 드러난 사건
  let s;
  function drawWorld() {
    const r = Math.random(), f = Math.random();
    return {
      freight: Math.random() < ODDS.freight,
      damage: Math.random() < ODDS.damage,
      congestion: Math.random() < ODDS.congestion,
      credit: r < ODDS.default ? 'default' : r < ODDS.default + ODDS.late ? 'late' : 'ok',
      fx: f < 0.35 ? 1330 : f < 0.65 ? 1400 : 1470
    };
  }
  function reset(world) {
    s = { phase: 'intro', i: 0, answered: false, last: null, w: world || drawWorld(), c: {}, rv: {} };
  }

  function seq() {
    return ['inc', 'pay', 'fx']
      .concat(s.c.inc && s.c.inc !== 'FOB' ? ['ins'] : [])
      .concat(['ev_freight', 'delay', s.c.pay === 'lc' ? 'doc' : 'bl', 'ev_voyage', 'ev_settle', 'report']);
  }
  const isPost = function () { return s.c.pay === 'oa' || s.c.pay === 'oains'; };
  const hasDisc = function () { return s.c.pay === 'lc' && (s.c.delay === 'silent' || (!!s.c.doc && s.c.doc !== 'name')); };
  const quote = function () { return QUOTE[s.c.inc || 'FOB']; };
  // 실제로 받은 대금 비율
  function paidFraction() {
    if (!s.rv.settle) return 1;
    const c = s.c, w = s.w;
    if (isPost() && w.credit === 'default') return c.bl === 'hold' ? 0.7 : 0;
    if (c.pay === 'lc' && hasDisc() && w.credit !== 'ok') return 0.8;
    if (c.pay === 'adv' && w.credit === 'default') return c.bl === 'hold' ? 0.79 : 0.3;
    return 1;
  }

  /* ───────── 손익 계산 ───────── */
  function ledger() {
    const c = s.c, w = s.w, rv = s.rv, inc = c.inc || 'FOB', q = quote();
    const L = [];
    const add = function (label, v, sub) { if (Math.round(v) !== 0) L.push({ label: label, krw: v, sub: sub }); };
    const dmg = rv.voyage && w.damage;
    const spot = rv.settle ? w.fx : FX_NOW;
    const h = c.fx === 'full' ? 1 : c.fx === 'half' ? 0.5 : 0;
    const frac = paidFraction();

    let deduct = 0;   // 사고가 났는데 아직 돈을 못 받은 상태라 바이어가 깎은 금액
    if (dmg && isPost() && frac === 1 && (inc === 'FOB' || (inc === 'CIF' && c.ins !== 'A'))) deduct = 0.1 * q;
    const recv = q * frac - deduct;

    add('수출대금', recv * spot, usd(recv) + ' × ' + spot.toLocaleString('ko-KR') + '원');
    add('선물환 손익', h * q * (FX_FWD - spot));
    if (rv.settle && c.pay === 'oains' && frac < 1) add('수출보험 보상', 0.9 * (1 - frac) * q * FX_NOW);
    add('제조원가', -COST_MAKE);
    add('국내 운송·통관', -COST_LOCAL);
    if (inc !== 'FOB') add('해상운임', -(FREIGHT + (rv.freight && w.freight ? FREIGHT_SURGE : 0)) * FX_NOW);
    if (inc === 'DAP') add('미국 도착지 비용', -(DEST + (rv.voyage && w.congestion ? DEST_JAM : 0)) * FX_NOW);
    if (c.ins === 'C' || c.ins === 'A') add('적하보험료 ICC(' + c.ins + ')', -INS[c.ins] * FX_NOW);
    if (c.pay === 'lc') add('신용장 수수료', -450000);
    if (c.pay === 'oains') add('단기수출보험료', -350000);
    if (hasDisc()) add('하자 수수료', -150000);
    if (c.delay === 'overtime') add('야간·주말 생산', -900000);
    if (c.delay === 'ask' && c.pay === 'lc') add('신용장 조건변경', -150000);
    if (c.delay === 'silent' && c.pay !== 'lc') add('납기 지연 배상 (2%)', -0.02 * q * FX_NOW);
    if (c.delay === 'backdate') add('급행 생산·특송', -1400000);
    if (c.bl === 'courier') add('B/L 특송료', -60000);
    if (c.bl === 'surrender') add('Surrender 수수료', -40000);
    if (c.bl === 'hold' && isPost()) add('LA 터미널 보관료', -560000);
    if (dmg && inc === 'DAP' && c.ins !== 'A') add('침수 손상분 재공급', -0.2 * q * FX_NOW);
    if (rv.settle && w.credit === 'late' && c.bl && c.bl !== 'hold') {
      if (isPost()) add('대금 지연 금융비용', -600000);
      if (c.pay === 'adv') add('잔금 지연 금융비용', -400000);
    }

    let trust = 50;
    if (c.inc === 'FOB') trust -= 5;
    if (c.inc === 'DAP') trust += 10;
    trust += { oa: 10, oains: 10, lc: -5, adv: -15 }[c.pay] || 0;
    if (inc === 'CIF' && c.ins === 'A') trust += 3;
    // 야간 생산과 B/L 소동은 바이어가 모르는 일이라 신뢰에 영향이 없다
    trust += { overtime: 0, ask: -3, silent: -20, backdate: 0 }[c.delay] || 0;
    if (isPost()) trust += { courier: 0, surrender: 3, hold: -15 }[c.bl] || 0;
    if (c.pay === 'adv' && c.bl && c.bl !== 'hold') trust += 5;
    // 선적 지연 하자는 납기 단계(silent −20)에서 이미 반영했으므로 서류 실수만 따로 깎는다
    if (c.doc && c.doc !== 'name') trust -= 5;
    if (dmg && inc === 'CIF') trust += c.ins === 'A' ? 5 : -20;
    if (dmg && inc === 'DAP') trust += c.ins === 'A' ? -5 : -10;
    trust = Math.max(0, Math.min(100, trust));

    const profit = L.reduce(function (sum, x) { return sum + x.krw; }, 0);
    return { lines: L, profit: profit, trust: trust };
  }

  /* ───────── 장면 데이터 ───────── */
  const WHO = {
    mia: { name: 'Mia Carter', role: 'Harbor & Pine Trading 구매 담당', init: '🛍️', cls: '' },
    boss: { name: '박 팀장', role: '해외영업팀', init: '👔', cls: ' in' },
    plant: { name: '생산관리 담당', role: '공장', init: '🏭', cls: ' in' },
    fwd: { name: '포워더', role: '선적 담당', init: '🚢', cls: ' in' }
  };
  const say = function (who, text) { return { who: who, text: text }; };

  const D = {
    inc: {
      tag: '견적', sheet: '조건', title: '어떤 조건으로 견적을 낼까?',
      scene: function () { return [
        say('mia', '스테인리스 텀블러 500ml 5,000개 견적 부탁드립니다. 가능하면 저희 LA 창고까지 받는 DAP 조건이면 좋겠어요.'),
        say('boss', 'FOB 부산 기준 $38,000이면 이익이 1,000만 원 남아. 조건은 네가 정해서 견적 내 봐.')
      ]; },
      options: function () { return [
        { id: 'FOB', short: 'FOB Busan', title: 'FOB Busan · $38,000', desc: '부산항에서 본선에 실으면 우리 일은 끝. 운임과 보험은 바이어가 알아서 한다.' },
        { id: 'CIF', short: 'CIF Los Angeles', title: 'CIF Los Angeles · $41,000', desc: 'LA항까지 운임과 보험을 우리가 잡는다. 지금 운임 견적은 $2,400.' },
        { id: 'DAP', short: 'DAP LA 창고', title: 'DAP 바이어 창고 · $43,400', desc: '창고 문 앞까지 우리가 책임진다. 운임 $2,400에 미국 내 비용 $1,400.' }
      ]; },
      result: function (id) { return {
        FOB: ['Mia: "알겠습니다. 포워더는 저희가 지정할게요." 조금 아쉬워하는 눈치입니다.',
              '운임이 오르든 LA항이 막히든 우리와는 상관없어집니다. 대신 운임에서 남길 차익이 없고, 바이어가 원한 조건도 아닙니다.'],
        CIF: ['Mia: "CIF도 괜찮아요. 도착항에서부터는 저희가 할게요."',
              '견적에 넣은 운임보다 실제 운임이 싸면 그 차이가 이익입니다. 반대로 선적 전에 운임이 오르면 차액은 우리가 냅니다. 위험은 부산항에서 넘어가지만 운임은 LA까지 우리 몫입니다.'],
        DAP: ['Mia: "딱 원하던 조건이에요. 고마워요!"',
              '마진이 가장 크고 바이어도 가장 좋아합니다. 대신 창고에 도착할 때까지 운임, 사고, 도착항 사정이 전부 우리 위험입니다.']
      }[id]; },
      lesson: function (id) {
        const w = s.w;
        if (id === 'FOB') return w.freight
          ? '운임이 급등했지만 FOB라 영향이 없었습니다. 대신 운임 차익을 포기했고 바이어가 원한 조건도 아니었습니다.'
          : '운임이 오르지 않았기 때문에 CIF나 DAP였다면 차익을 남길 수 있었습니다. FOB는 그 기회를 내주고 안전을 산 선택입니다.';
        if (id === 'CIF') return w.freight
          ? '견적 후 운임이 $1,200 올라 차익이 사라지고 손해가 났습니다. 운임을 견적에 넣을 때는 견적 유효기간을 짧게 잡거나 운임 변동 조항을 둡니다.'
          : '운임이 그대로여서 차익 $600을 남겼습니다. 운임이 올랐다면 $1,200을 물어야 했습니다.';
        return '바이어가 가장 편한 조건이라 신뢰가 올랐습니다. 대신 운임, 도착항 혼잡, 운송 중 사고가 모두 우리 위험이었습니다.' +
          (w.freight ? ' 이번에는 운임이 $1,200 올랐습니다.' : '') + (w.congestion ? ' LA항 혼잡으로 $900이 더 들었습니다.' : '');
      }
    },

    pay: {
      tag: '결제', sheet: '결제', title: '결제조건을 어디까지 받아줄까?',
      scene: function () { return [
        say('mia', '가격은 좋습니다. 결제는 선적 후 60일 송금(O/A)으로 하죠. 다른 공급사들과도 그렇게 거래합니다.'),
        say('boss', '처음 거래하는 바이어고 신용조사는 아직 못 했어. 어디까지 받아줄지 판단해 봐.')
      ]; },
      options: function () { return [
        { id: 'oa', short: 'O/A 60일', title: 'O/A 60일을 그대로 받는다', desc: '바이어가 가장 좋아한다. 돈을 못 받으면 손쓸 방법이 없다.' },
        { id: 'oains', short: 'O/A 60일 + 수출보험', title: 'O/A 60일을 받고 단기수출보험에 든다', desc: '보험료 35만 원. 못 받으면 손실의 90%를 보상받는다.' },
        { id: 'lc', short: 'L/C At Sight', title: '일람불 신용장(L/C At Sight)을 요구한다', desc: '은행이 지급을 확약한다. 수수료 45만 원, 서류가 신용장과 일치해야 한다.' },
        { id: 'adv', short: '선수금 30% + 잔금', title: '선수금 30%, 잔금 70%는 B/L 사본을 보고 송금', desc: '우리에게 가장 안전하다. 바이어는 싫어한다.' }
      ]; },
      result: function (id) { return {
        oa: ['Mia: "좋아요, 바로 발주서(PO) 보낼게요." 계약이 빠르게 성사됐습니다.',
             '선적하고 60일 동안 대금 ' + usd(quote()) + ' 전체가 담보 없는 외상으로 남습니다.'],
        oains: ['Mia에게는 O/A 60일을 그대로 주고, 한국무역보험공사 단기수출보험에 가입했습니다.',
                '바이어 입장에서는 달라진 것이 없습니다. 보험료를 내는 대신 못 받았을 때 손실의 90%를 보상받습니다. 보상 비율은 연습용 가정입니다.'],
        lc: ['Mia: "신용장이요? 개설 수수료도 들고 한도도 묶이는데… 알겠어요, 이번 한 번은요."',
             '개설은행이 지급을 확약하므로 바이어 사정과 상관없이 받을 수 있습니다. 단, 서류가 신용장 조건과 일치할 때만입니다.'],
        adv: ['Mia: "선수금 30%요? 저희도 첫 거래인데 부담스럽네요." 한참 뒤에 마지못해 동의했습니다.',
              '원가 일부를 미리 확보하고, 잔금은 원본 B/L을 넘기기 전에 받는 구조입니다. 안전한 만큼 바이어 신뢰가 크게 깎입니다.']
      }[id]; },
      lesson: function (id) {
        const w = s.w, bad = w.credit === 'default';
        if (id === 'oa') return bad
          ? '담보 없는 외상의 최악의 경우가 나왔습니다. 첫 거래에서는 신용조사, 수출보험, 선수금 중 하나는 걸어 둡니다.'
          : '이번에는 돈을 받았습니다. 하지만 바이어가 결제하지 못했다면 대금 ' + usd(quote()) + ' 전액을 잃는 선택이었고, 이 게임에서 그 확률은 15%입니다.';
        if (id === 'oains') return bad
          ? '바이어가 원하는 조건을 주고도 손실의 90%를 보상받았습니다. 보험료 35만 원이 제값을 했습니다.'
          : '보험료 35만 원으로 미회수 위험을 덜어낸 절충안입니다. 바이어가 원하는 외상 조건을 유지할 수 있어 실무에서 흔히 씁니다.';
        if (id === 'lc') return hasDisc()
          ? (w.credit !== 'ok'
            ? '하자가 나자 은행의 지급확약이 사라졌고, 자금 사정이 나쁜 바이어가 하자를 이유로 값을 깎았습니다. 신용장은 서류가 일치할 때만 안전합니다.'
            : '하자가 났지만 바이어가 받아줘서 수수료만 내고 끝났습니다. 바이어 사정이 나빴다면 지급을 거절당할 수 있었습니다.')
          : '서류가 일치했기 때문에 바이어 사정과 상관없이 은행에서 대금을 받았습니다. 대신 수수료가 들고 바이어의 신용한도를 묶습니다.';
        return s.c.bl === 'hold'
          ? '선수금을 받고 원본 B/L을 쥐고 있었으므로 잔금까지 보호됐습니다. 가장 안전하지만 바이어 신뢰를 가장 많이 깎는 조건입니다.'
          : '선수금 조건을 어렵게 얻어 놓고 원본 B/L을 먼저 넘겨 잔금 70%의 보호 장치를 스스로 풀었습니다.';
      }
    },

    fx: {
      tag: '환율', sheet: '환헤지', title: '석 달 뒤에 들어올 달러, 환율은 어떻게 할까?',
      scene: function () { return [
        say('boss', '대금 ' + usd(quote()) + '는 석 달쯤 뒤에 달러로 들어와. 지금 환율은 1,400원이고, 은행 선물환은 1,395원에 잡아 준대.')
      ]; },
      options: function () { return [
        { id: 'full', short: '전액 선물환', title: '전액을 선물환으로 고정한다', desc: usd(quote()) + ' 전부를 1,395원에 판다. 환율이 어떻게 되든 이익이 정해진다.' },
        { id: 'half', short: '절반 선물환', title: '절반만 고정한다', desc: '절반은 1,395원에 팔고, 나머지는 들어오는 날 환율로 바꾼다.' },
        { id: 'none', short: '헤지 안 함', title: '헤지하지 않는다', desc: '들어오는 날 환율로 바꾼다. 오르면 더 벌고 내리면 덜 번다.' }
      ]; },
      result: function (id) { return {
        full: ['은행과 선물환 계약을 맺었습니다.',
               '지금 환율보다 5원 낮게 팔았으니 그만큼이 헤지 비용입니다. 이제 환율이 움직여도 원화 이익은 변하지 않습니다.'],
        half: ['대금의 절반만 선물환으로 팔았습니다.',
               '환율이 오를 때의 이익과 내릴 때의 손실을 모두 절반으로 줄인 선택입니다.'],
        none: ['아무 계약도 하지 않았습니다. 결과는 결제일에 알 수 있습니다.',
               '환율이 70원 움직이면 이익이 약 ' + krw(70 * quote()) + ' 달라집니다. 목표 이익 1,000만 원에 비하면 작지 않습니다.']
      }[id]; },
      lesson: function (id) {
        const f = s.w.fx, gap = krw(Math.abs(f - FX_NOW) * quote());
        if (id === 'full') return f > FX_NOW ? '환율이 ' + f.toLocaleString() + '원으로 올라, 헤지하지 않았다면 더 벌었을 판입니다. 그래도 헤지의 목적은 환차익이 아니라 이익을 확정하는 것입니다.'
          : f < FX_NOW ? '환율이 ' + f.toLocaleString() + '원으로 내렸지만 1,395원에 고정해 둔 덕에 영향이 없었습니다.'
          : '환율이 제자리여서 헤지 비용만 조금 들었습니다. 보험료를 낸 셈입니다.';
        if (id === 'half') return '절반은 고정하고 절반은 열어 둔 선택입니다. ' +
          (f > FX_NOW ? '오른 환율의 이익을 절반만 누렸습니다.' : f < FX_NOW ? '내린 환율의 손실을 절반으로 줄였습니다.' : '환율이 제자리여서 차이가 거의 없었습니다.');
        return f > FX_NOW ? '환율이 올라 환차익 약 ' + gap + '을 얻었습니다. 실력이 아니라 운입니다. 반대로 갔다면 같은 금액을 잃었습니다.'
          : f < FX_NOW ? '환율이 내려 약 ' + gap + '을 잃었습니다. 영업으로 번 이익이 환율로 깎였습니다.'
          : '환율이 제자리여서 아무 일도 없었습니다. 어느 쪽으로든 움직일 수 있었습니다.';
      }
    },

    ins: {
      tag: '보험', sheet: '적하보험', title: '적하보험은 어디까지 들까?',
      scene: function () { return [
        say('boss', s.c.inc === 'CIF'
          ? 'CIF니까 보험은 우리가 들어 줘야 해. 의무는 ICC(C)까지야. 보험료 차이는 크지 않아.'
          : 'DAP는 보험 의무가 없어. 다만 창고에 내려놓기 전까지 사고는 전부 우리 책임이야.')
      ]; },
      options: function () {
        const o = [
          { id: 'C', short: 'ICC(C)', title: 'ICC(C) · $60', desc: '침몰, 좌초, 화재, 충돌 같은 큰 사고만 보상한다.' },
          { id: 'A', short: 'ICC(A)', title: 'ICC(A) · $150', desc: '침수, 파손, 도난을 포함해 대부분의 사고를 보상한다.' }
        ];
        if (s.c.inc === 'DAP') o.unshift({ id: 'none', short: '보험 없음', title: '보험 없이 보낸다', desc: '보험료 0원. 태평양 항로에서 사고가 그렇게 흔할까?' });
        return o;
      },
      result: function (id) {
        const cif = s.c.inc === 'CIF';
        return {
          none: ['보험 없이 선적하기로 했습니다.', '도착할 때까지 화물에 생기는 일은 전부 회사 돈으로 메워야 합니다.'],
          C: ['ICC(C) 조건으로 보험증권을 받았습니다.',
              cif ? 'CIF의 최소 의무를 정확히 채웠습니다. ICC(C)는 열거된 큰 사고만 보상하고 해수 침수나 파손은 빠집니다.'
                  : 'ICC(C)는 열거된 큰 사고만 보상하고 해수 침수나 파손은 빠집니다. DAP에서는 그 빈틈이 우리 손해가 됩니다.'],
          A: ['ICC(A) 조건으로 보험증권을 받았습니다.',
              cif ? '의무보다 넓게 들었습니다. 위험은 이미 바이어에게 넘어가 있으므로, 이 보험으로 보상받는 사람은 Mia입니다.'
                  : '대부분의 사고를 보상하는 조건입니다. DAP에서는 이 보험이 우리 자신을 지킵니다.']
        }[id];
      },
      lesson: function (id) {
        const d = s.w.damage, cif = s.c.inc === 'CIF';
        if (cif && id === 'C') return d ? 'ICC(C)는 침몰·좌초·화재 같은 큰 사고만 보상하고 해수 침수는 빠집니다. 의무는 지켰지만 바이어는 보상을 받지 못했습니다.'
          : '사고가 없어 $90을 아꼈습니다. CIF의 최소 의무는 ICC(C)지만, 사고가 나면 바이어는 보상 범위를 따집니다.';
        if (cif) return d ? '침수 사고를 ICC(A)가 보상했습니다. $90 차이로 바이어와의 관계를 지켰습니다.'
          : '사고는 없었습니다. $90을 더 내고 바이어에게 넓은 보상 범위를 준 선택입니다.';
        if (id === 'none') return d ? 'DAP는 창고에 도착할 때까지 우리 위험입니다. 보험료 $150을 아끼려다 화물의 20%를 다시 만들었습니다.'
          : '사고가 없어 보험료를 아꼈습니다. 하지만 DAP에서 무보험은 화물 전체를 거는 선택입니다.';
        if (id === 'C') return d ? 'ICC(C)는 해수 침수를 보상하지 않아 손해를 그대로 떠안았습니다. DAP에서는 우리 자신을 위해 넓은 범위가 필요합니다.'
          : '사고는 없었습니다. ICC(C)는 큰 사고만 보상하므로 DAP에서는 빈틈이 큽니다.';
        return d ? '침수 손해를 보험금으로 메웠습니다. DAP에서 보험은 바이어가 아니라 우리를 지키는 장치입니다.'
          : '사고는 없었습니다. DAP에서 $150은 싼 보험료입니다.';
      }
    },

    delay: {
      tag: '납기', sheet: '납기 대응', title: '생산이 3일 늦어진다',
      scene: function () { return [
        say('plant', '원자재 입고가 늦어져 생산이 3일 밀립니다. 약속한 선적일은 못 맞춥니다.'),
        say('boss', s.c.pay === 'lc' ? '신용장의 최종선적일(Latest Date of Shipment)도 넘기게 돼. 어떻게 할래?' : 'Mia와 약속한 선적일을 넘기게 돼. 어떻게 할래?')
      ]; },
      options: function () { return [
        { id: 'overtime', short: '야간 생산', title: '야간·주말 생산을 돌려 날짜를 맞춘다', desc: '추가 비용 90만 원.' },
        { id: 'ask', short: '연기 요청', title: 'Mia에게 바로 알리고 선적일 1주 연기를 요청한다',
          desc: s.c.pay === 'lc' ? '신용장 조건변경(Amend) 수수료 15만 원이 든다.' : '비용은 없다. 바이어가 달가워하지는 않을 것이다.' },
        { id: 'silent', short: '말없이 지연', title: '말없이 3일 늦게 선적한다', desc: '비용은 없다. 3일쯤은 넘어가 주지 않을까?' },
        { id: 'backdate', short: 'B/L 날짜 조작 시도', title: '포워더에게 B/L 날짜를 원래 선적일로 찍어 달라고 한다', desc: '서류상으로는 납기를 지킨 것이 된다.' }
      ]; },
      result: function (id) {
        const lc = s.c.pay === 'lc';
        return {
          overtime: ['공장이 주말까지 돌았고, 화물은 약속한 날 본선에 실렸습니다.', '돈으로 납기를 샀습니다. Mia는 이런 일이 있었는지도 모릅니다.'],
          ask: ['Mia: "미리 알려줘서 고마워요. 1주면 판매 일정을 조정할 수 있어요."' + (lc ? ' 신용장 조건변경도 바로 진행됐습니다.' : ''),
                '일정이 밀린 것 자체는 감점이지만, 먼저 알렸기 때문에 바이어가 대비할 수 있었습니다.' + (lc ? ' 최종선적일을 변경했으므로 하자도 생기지 않습니다.' : '')],
          silent: lc
            ? ['3일 늦게 선적했습니다. B/L의 선적일이 신용장의 최종선적일보다 늦습니다.', '선적 지연(Late Shipment)은 서류를 고쳐서 없앨 수 없는 하자입니다. 은행의 지급확약이 여기서 사라졌습니다.']
            : ['3일 늦게 선적했습니다. 도착이 늦자 Mia가 항의하며 계약서의 지연 배상 2%를 청구했습니다.', '바이어는 판매 일정을 조정할 기회도 없이 늦은 화물을 받았습니다. 배상금보다 신뢰를 더 많이 잃었습니다.'],
          backdate: ['포워더: "선하증권 소급발행(Back Date)은 사기입니다. 못 해 드립니다." 하루를 더 잃고, 결국 급행 생산과 특송으로 겨우 날짜를 맞췄습니다.',
                     '실제 선적일과 다른 날짜를 B/L에 적는 것은 서류 위조입니다. 적발되면 대금 지급 거절은 물론 형사 책임까지 질 수 있습니다.']
        }[id];
      },
      lesson: function (id) {
        const lc = s.c.pay === 'lc';
        return {
          overtime: '돈으로 납기를 지켰습니다. 납기는 바이어 신뢰와 신용장 조건이 함께 걸린 약속입니다.',
          ask: (lc ? '미리 알리고 신용장 조건변경(Amend)을 받아 하자를 피했습니다. ' : '') + '문제가 생기면 먼저 알리는 쪽이 가장 싸게 먹힙니다.',
          silent: lc ? '선적일이 신용장의 최종선적일을 넘기면 고칠 수 없는 하자가 됩니다. 은행의 지급확약을 스스로 버린 셈입니다.'
                     : '말없이 늦으면 바이어는 판매 일정을 조정할 기회를 잃습니다. 지연 배상보다 신뢰 손실이 큽니다.',
          backdate: 'B/L 선적일을 앞당겨 적는 소급발행(Back Date)은 서류 위조이고 사기입니다. 포워더가 거절해 준 것이 다행입니다.'
        }[id];
      }
    },

    doc: {
      tag: '서류', sheet: '서류', title: '은행에 내기 전에 서류를 확인하자',
      scene: function () { return [
        say('fwd', '네고 서류 초안입니다. 인보이스 확인하시고 은행에 내시면 됩니다.'),
        { docs: true },
        say('boss', '은행은 서류만 봐. 신용장과 글자 하나만 달라도 하자야.')
      ]; },
      options: function () { return [
        { id: 'ok', short: '그대로 제출', title: '문제없다. 그대로 제출한다' },
        { id: 'name', short: '품명 수정', title: '품명이 신용장과 다르다. 고쳐서 제출한다' },
        { id: 'amount', short: '금액 수정', title: '금액이 신용장과 다르다. 고쳐서 제출한다' }
      ]; },
      result: function (id) {
        const lawA = 'UCP 600 제18조에 따라 상업송장의 물품 명세는 신용장과 일치해야 합니다. 신용장은 STAINLESS STEEL TUMBLER, 초안은 STAINLESS TUMBLER였습니다.';
        const lawB = '하자가 있으면 개설은행의 지급 의무가 사라집니다. 이제 대금을 받을 수 있는지는 바이어가 하자를 받아주느냐에 달렸습니다.';
        if (id === 'name') return s.c.delay === 'silent'
          ? ['품명은 바로잡았습니다. 하지만 선적일이 최종선적일을 넘긴 하자는 그대로 남았습니다.', lawA]
          : ['인보이스를 고쳐 제출했고, 은행이 일치하는 제시(Complying Presentation)로 판단했습니다.', lawA];
        if (id === 'ok') return ['은행에서 하자 통보가 왔습니다. 인보이스 품명에 STEEL이 빠져 있었습니다.', lawB];
        return ['금액은 신용장과 같았습니다. 정작 틀린 곳은 품명이었고, 은행에서 하자 통보가 왔습니다.', lawB];
      },
      lesson: function (id) {
        return id === 'name'
          ? '인보이스의 물품 명세는 신용장과 일치해야 합니다(UCP 600 제18조). STEEL 한 단어가 지급 거절 사유가 됩니다.'
          : '인보이스 품명에 STEEL이 빠져 있었습니다. 인보이스의 물품 명세는 신용장과 일치해야 합니다(UCP 600 제18조).';
      }
    },

    bl: {
      tag: '서류', sheet: '원본 B/L', title: '원본 B/L을 어떻게 할까?',
      scene: function () { return [
        say('fwd', '선적 끝났습니다. 원본 B/L 3통 나왔어요. 어떻게 처리할까요?'),
        say('boss', isPost() ? '계약은 선적 후 60일 외상이야. Mia는 이 서류가 있어야 화물을 찾을 수 있어.' : '잔금 70%는 아직 안 들어왔어. Mia는 이 서류가 있어야 화물을 찾을 수 있어.')
      ]; },
      options: function () { return [
        { id: 'courier', short: '원본 특송', title: '원본을 특송으로 바로 보낸다', desc: '특송료 6만 원. 닷새쯤 걸린다.' },
        { id: 'surrender', short: 'Surrender', title: 'Surrender B/L로 처리한다', desc: '수수료 4만 원. 원본 없이 화물을 찾을 수 있어 가장 빠르다.' },
        { id: 'hold', short: '입금까지 보유', title: '입금을 확인할 때까지 원본을 갖고 있는다',
          desc: isPost() ? '돈이 들어오기 전에는 화물을 못 찾게 한다. 계약한 조건과는 다르다.' : '잔금이 들어오면 보낸다. 계약한 그대로다.' }
      ]; },
      result: function (id) {
        if (isPost()) return {
          courier: ['원본 B/L을 보냈고, Mia가 LA에서 화물을 찾았습니다.', '이제 화물도 서류도 바이어 손에 있습니다. 우리에게 남은 것은 60일 뒤에 주겠다는 약속뿐입니다.'],
          surrender: ['Mia: "빠르네요, 고마워요." 도착한 날 바로 화물을 찾았습니다.', '가장 빠르고 바이어가 좋아하는 방법입니다. 화물 통제권은 선적과 동시에 넘어갔습니다.'],
          hold: ['Mia: "외상으로 계약했는데 왜 서류를 안 주죠?" 화물이 LA 터미널에 묶여 보관료가 나왔습니다.', '화물 통제권은 지켰지만 합의한 결제조건을 우리가 어긴 셈입니다.']
        }[id];
        return id === 'hold'
          ? ['원본 B/L을 금고에 넣고 잔금 입금을 기다립니다.', '원본 B/L은 화물을 찾을 권리 그 자체입니다. 쥐고 있는 동안 잔금 70%가 보호됩니다.']
          : ['Mia: "먼저 보내주셨네요, 고마워요."', '잔금을 받기 전에 화물 통제권을 넘겼습니다. 남은 70%는 이제 담보 없는 외상입니다.'];
      },
      lesson: function (id) {
        const bad = s.w.credit === 'default';
        if (isPost()) return id === 'hold'
          ? '외상으로 계약해 놓고 서류를 쥐고 있으면 계약 위반에 가깝습니다. 불안했다면 결제조건을 정할 때 안전장치를 걸었어야 합니다.'
          : '외상 조건에서 원본 B/L을 넘기는 것은 계약대로 한 일입니다. 그 뒤의 안전은 결제조건 단계에서 이미 정해져 있었습니다.';
        return id === 'hold'
          ? '잔금이 들어올 때까지 원본 B/L을 쥐고 있는 것이 이 결제조건의 핵심입니다.'
          : '원본 B/L을 먼저 넘기면 잔금 70%는 담보 없는 외상이 됩니다.' + (bad ? ' 이번에 그 70%를 잃었습니다.' : ' 이번에는 바이어가 결제해 문제가 없었습니다.');
      }
    }
  };

  /* ───────── 사건 장면 ───────── */
  const EV = {
    ev_freight: function () {
      const fob = s.c.inc === 'FOB';
      return s.w.freight
        ? { tag: '선적 2주 전', title: '북미 항로 운임이 뛰었다', paras: [
            '성수기 물량이 몰리면서 포워더가 부산–LA 운임을 $2,400에서 $3,600으로 다시 불렀습니다.',
            fob ? 'FOB로 계약했기 때문에 우리와는 상관없는 일입니다. 오른 운임은 Mia가 냅니다.'
                : '견적가는 이미 확정됐습니다. 오른 $1,200(168만 원)은 고스란히 우리 부담입니다.'] }
        : { tag: '선적 2주 전', title: '운임은 견적 때 그대로', paras: [
            '포워더가 부산–LA 운임 $2,400을 그대로 확정해 줬습니다.',
            fob ? 'FOB라 어차피 우리와는 상관없는 일입니다.' : '견적에 넣어 둔 운임 차익이 그대로 남습니다.'] };
    },
    ev_voyage: function () {
      const c = s.c, w = s.w, inc = c.inc, paras = [];
      if (w.damage) {
        paras.push('태평양에서 거친 날씨를 만나 컨테이너에 해수가 들어왔습니다. 텀블러 포장의 20%가 젖었습니다.');
        if (inc === 'FOB') paras.push('위험은 부산항에서 본선에 실을 때 이미 넘어갔습니다. Mia가 자기 보험으로 처리할 일입니다.');
        if (inc === 'CIF') paras.push(c.ins === 'A'
          ? 'ICC(A)로 들어 둔 보험에서 Mia가 손해를 보상받았습니다.'
          : 'ICC(C)는 해수 침수를 보상하지 않습니다. Mia의 보험금 청구가 거절됐습니다.');
        if (inc === 'DAP') paras.push(c.ins === 'A'
          ? 'DAP라 손해는 우리 몫이지만, ICC(A) 보험금으로 대체품을 만들어 보냈습니다. 도착은 조금 늦었습니다.'
          : 'DAP라 창고에 도착하기 전의 손해는 우리 몫입니다. ' + (c.ins === 'C' ? 'ICC(C)는 해수 침수를 보상하지 않습니다. ' : '') + '젖은 20%를 회사 돈으로 다시 만들어 보냈습니다.');
        if (isPost() && (inc === 'FOB' || (inc === 'CIF' && c.ins !== 'A')))
          paras.push('문제는 아직 대금을 받지 못했다는 점입니다. Mia가 대금 10% 공제를 요구했고, 외상인 우리는 받아들일 수밖에 없었습니다.');
      } else {
        paras.push('날씨가 좋았고 화물은 아무 문제 없이 태평양을 건넜습니다.');
      }
      if (inc === 'DAP' && w.congestion) paras.push('LA항이 혼잡해 컨테이너가 터미널에 일주일 묶였습니다. 체화료와 보관료 $900은 DAP인 우리 부담입니다.');
      return { tag: '항해 중', title: w.damage ? '컨테이너에 물이 들어왔다' : (inc === 'DAP' && w.congestion ? 'LA항이 막혔다' : '순조로운 항해'), paras: paras };
    },
    ev_settle: function () {
      const c = s.c, w = s.w, hold = c.bl === 'hold', frac = paidFraction();
      let fxp = '결제일 환율은 ' + w.fx.toLocaleString('ko-KR') + '원입니다.';
      if (c.fx === 'full') fxp += ' 전액을 1,395원에 고정해 두었으므로 달라지는 것은 없습니다.';
      else if (w.fx === FX_NOW) fxp += ' 석 달 전과 같습니다.';
      else if (c.fx === 'half') fxp += ' 고정하지 않은 절반에서 ' + (w.fx > FX_NOW ? '환차익이 생겼습니다.' : '환차손이 났습니다.');
      else fxp += w.fx > FX_NOW ? ' 헤지를 하지 않은 덕에 환차익이 생겼습니다.' : ' 헤지를 하지 않아 원화로 받는 돈이 줄었습니다.';

      let p;
      if (isPost()) {
        p = w.credit === 'ok' ? '약속한 날 Harbor & Pine에서 대금이 들어왔습니다.'
          : w.credit === 'late' ? (hold ? '바이어의 자금 사정이 나빴지만, 화물을 찾으려면 돈을 내야 했기에 결국 입금됐습니다.'
                                        : 'Mia: "자금 사정이 좋지 않아요. 두 달만 기다려 주세요." 두 달 늦게 받았고 그동안의 금융비용은 우리 몫입니다.')
          : (hold ? 'Harbor & Pine이 파산 보호를 신청했습니다. 원본 B/L을 쥐고 있던 덕에 화물을 되찾아 다른 곳에 30% 싸게 팔았습니다.'
                  : 'Harbor & Pine이 파산 보호를 신청했습니다. 화물은 이미 넘어갔고 대금을 받을 길이 없습니다.') +
            (c.pay === 'oains' ? ' 무역보험공사에 사고를 통지해 손실의 90%를 보상받았습니다.' : '');
      } else if (c.pay === 'lc') {
        p = !hasDisc()
          ? (w.credit === 'ok' ? '서류를 낸 지 며칠 만에 은행에서 대금이 들어왔습니다.'
                               : '바이어의 자금 사정이 나빠졌다는 소문이 돕니다. 하지만 서류가 일치했기 때문에 은행은 이미 대금을 지급했습니다.')
          : (w.credit === 'ok' ? 'Mia가 하자를 받아줘서(Waive) 며칠 늦게 대금이 들어왔습니다.'
                               : '자금 사정이 나빠진 바이어가 하자를 이유로 서류 인수를 거절했습니다. 화물은 이미 LA에 있습니다. 대금을 20% 깎아 주고서야 받았습니다.');
      } else {
        p = w.credit === 'ok' ? '잔금 70%가 약속대로 들어왔습니다.'
          : w.credit === 'late' ? (hold ? '잔금이 늦어졌지만, 원본 B/L이 필요한 바이어가 결국 입금했습니다.'
                                        : '잔금이 두 달 늦게 들어왔습니다. 서류를 먼저 넘긴 터라 기다리는 수밖에 없었습니다.')
          : (hold ? '바이어가 잔금을 내지 못했습니다. 쥐고 있던 원본 B/L로 화물을 되찾아 30% 싸게 처분했습니다. 선수금 30%는 지켰습니다.'
                  : '바이어가 잔금을 내지 못했습니다. 화물은 이미 넘어갔고, 남은 것은 선수금 30%뿐입니다.');
      }
      const lateHit = w.credit === 'late' && c.bl && !hold;
      const title = frac === 0 ? '대금이 들어오지 않았다' : frac < 1 ? '대금을 다 받지 못했다' : lateHit ? '대금이 늦게 들어왔다' : '대금이 들어왔다';
      return { tag: '결제일', title: title, paras: [p, fxp] };
    }
  };
  const REVEAL = { ev_freight: 'freight', ev_voyage: 'voyage', ev_settle: 'settle' };

  /* ───────── 그리기 ───────── */
  const NODES = ['견적', '결제', '환율', '보험', '운임', '납기', '서류', '항해', '결산'];
  const ICONS = ['🧾', '💳', '💱', '🛡️', '⛴️', '⏰', '📄', '🌊', '🏁'];
  const NODE_OF = { inc: 0, pay: 1, fx: 2, ins: 3, ev_freight: 4, delay: 5, doc: 6, bl: 6, ev_voyage: 7, ev_settle: 8, report: 9 };

  function chipsHtml(d) {
    if (!d) return '';
    const out = [];
    if (Math.round(d.dp) !== 0) out.push('<span class="chip ' + (d.dp > 0 ? 'up' : 'down') + '">이익 ' + signed(d.dp) + '</span>');
    if (d.dt !== 0) out.push('<span class="chip ' + (d.dt > 0 ? 'up' : 'down') + '">신뢰 ' + (d.dt > 0 ? '+' : '−') + Math.abs(d.dt) + '</span>');
    if (!out.length) out.push('<span class="chip flat">이익과 신뢰에 변화 없음</span>');
    return '<div class="chips">' + out.join('') + '</div>';
  }
  function sceneHtml(items) {
    return items.map(function (m) {
      if (m.docs) {
        const q = usd(quote()).replace('$', 'USD '), term = { FOB: 'FOB BUSAN', CIF: 'CIF LOS ANGELES', DAP: 'DAP LOS ANGELES' }[s.c.inc];
        return '<div class="docs">' +
          '<div class="doc"><h4>신용장 (L/C)</h4><dl><dt>45A Description of Goods</dt><dd>5,000 PCS OF STAINLESS STEEL TUMBLER 500ML</dd><dt>32B Amount</dt><dd>' + q + '</dd><dt>Trade Terms</dt><dd>' + term + '</dd></dl></div>' +
          '<div class="doc"><h4>상업송장 초안 (Invoice)</h4><dl><dt>Description</dt><dd>5,000 PCS OF STAINLESS TUMBLER 500ML</dd><dt>Amount</dt><dd>' + q + '</dd><dt>Trade Terms</dt><dd>' + term + '</dd></dl></div></div>';
      }
      const p = WHO[m.who];
      return '<div class="msg' + p.cls + '"><div class="avatar" aria-hidden="true">' + p.init + '</div><div class="bubble"><span class="who">' + p.name + ' · ' + p.role + '</span>' + m.text + '</div></div>';
    }).join('');
  }

  function renderRoute() {
    const key = s.phase === 'intro' ? null : seq()[s.i], at = key ? NODE_OF[key] : -1;
    $('route').innerHTML = NODES.map(function (n, i) {
      const skip = i === 3 && s.c.inc === 'FOB';
      const cls = skip ? 'skip' : i < at ? 'done' : i === at ? 'now' : '';
      return '<li class="' + cls + '"' + (i === at ? ' aria-current="step"' : '') + '><i aria-hidden="true">' + (cls === 'done' ? '✓' : ICONS[i]) + '</i><span>' + n + '</span></li>';
    }).join('');
  }
  function renderBoard() {
    const l = ledger(), c = s.c;
    $('b-profit').textContent = krw(l.profit);
    $('b-trust-n').textContent = l.trust;
    $('b-trust').style.width = l.trust + '%';
    const pick = function (k) { if (!c[k]) return '—'; return D[k].options().filter(function (o) { return o.id === c[k]; })[0].short; };
    const rows = [['품목', QTY_LABEL], ['조건', pick('inc')], ['결제', pick('pay')], ['환헤지', pick('fx')],
      ['적하보험', c.inc === 'FOB' ? '바이어가 부보' : pick('ins')], ['납기 대응', pick('delay')],
      [c.pay === 'lc' ? '서류' : '원본 B/L', pick(c.pay === 'lc' ? 'doc' : 'bl')]];
    $('sheet').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('');
  }

  function introHtml() {
    return '<span class="tag">시작 전에</span><h2>오늘부터 이 거래의 담당자는 당신입니다</h2>' +
      '<p>주방용품 제조사 한빛리빙 해외영업팀에 입사한 지 석 달. 미국 LA의 유통업체 Harbor &amp; Pine Trading에서 첫 견적 요청이 들어왔습니다. 견적부터 대금 회수까지 직접 결정하세요.</p>' +
      '<ul><li>결정은 5~6번, 한 판에 5분쯤 걸립니다.</li>' +
      '<li>운임, 환율, 운송 사고, 바이어의 자금 사정은 판마다 다르게 정해져 있고 미리 알 수 없습니다.</li>' +
      '<li>목표는 이익 1,000만 원을 지키면서 재주문을 받아내는 것입니다.</li></ul>' +
      '<div class="actions"><button type="button" class="btn" data-act="start" id="go">거래 시작</button></div>' +
      '<p class="fine" style="margin-top:14px">등장하는 회사와 인물은 모두 가상이고, 금액과 확률은 연습용 가정입니다.</p>';
  }
  function decisionHtml(key) {
    // 조건을 고르기 전에는 보험 단계가 seq()에 없으므로 하나 더해서 센다 (FOB면 빠진다)
    const d = D[key], keys = seq().filter(function (k) { return D[k]; });
    let h = '<span class="tag">결정 ' + (keys.indexOf(key) + 1) + ' / ' + (keys.length + (s.c.inc ? 0 : 1)) + ' · ' + d.tag + '</span><h2>' + d.title + '</h2>' + sceneHtml(d.scene());
    h += '<div class="options' + (s.answered ? ' locked' : '') + '">' + d.options().map(function (o) {
      const picked = s.c[key] === o.id;
      return '<button type="button" class="opt' + (picked ? ' picked' : '') + '" data-opt="' + o.id + '"' + (s.answered ? ' disabled' : '') + '><b>' + o.title + '</b>' + (o.desc ? '<span>' + o.desc + '</span>' : '') + '</button>';
    }).join('') + '</div>';
    if (s.answered) {
      const r = d.result(s.c[key]);
      h += '<div class="result">' + chipsHtml(s.last) + '<p>' + r[0] + '</p><p class="why">' + r[1] + '</p>' +
        '<div class="actions"><button type="button" class="btn" data-act="next" id="go">다음</button></div></div>';
    }
    return h;
  }
  function eventHtml(key) {
    const e = EV[key]();
    return '<span class="tag news">' + e.tag + '</span><h2>' + e.title + '</h2>' +
      e.paras.map(function (p) { return '<p>' + p + '</p>'; }).join('') +
      '<div class="result">' + chipsHtml(s.last) +
      '<div class="actions"><button type="button" class="btn" data-act="next" id="go">' + (key === 'ev_settle' ? '성적표 보기' : '다음') + '</button></div></div>';
  }
  function reportHtml() {
    const l = ledger(), w = s.w, c = s.c;
    const score = Math.max(-1, Math.min(1.3, l.profit / 1e7)) * 60 + l.trust * 0.4;
    const g = l.profit < 0 ? 'F' : score >= 88 ? 'S' : score >= 74 ? 'A' : score >= 60 ? 'B' : score >= 45 ? 'C' : 'D';
    const gname = { S: '에이스 신입', A: '믿고 맡길 담당자', B: '무난한 첫 거래', C: '아슬아슬한 한 건', D: '수업료를 낸 거래', F: '적자 거래' }[g];
    const reorder = w.credit === 'default' ? 'Harbor & Pine과의 거래는 여기서 끝났습니다.'
      : l.trust >= 60 ? 'Mia가 5,000개 재주문을 넣었습니다.'
      : l.trust >= 40 ? 'Mia는 다음 주문을 다른 공급사와 비교해 보겠다고 합니다.' : 'Mia는 다음 주문을 다른 공급사에 넣었습니다.';
    let h = '<div class="verdict"><div class="grade g-' + g + '" role="img" aria-label="등급 ' + g + '">' + g + '</div><div class="say"><span class="tag">성적표</span><h2>' + gname + '</h2>' +
      '<p>이익 <b>' + krw(l.profit) + '</b> (목표 ₩10,000,000), 바이어 신뢰 <b>' + l.trust + '</b>. ' + reorder + '</p></div></div>';

    h += '<h3 class="sec">손익 내역</h3><table class="ledger"><tbody>' + l.lines.map(function (x) {
      return '<tr><td>' + x.label + (x.sub ? '<small>' + x.sub + '</small>' : '') + '</td><td class="n">' + krw(x.krw) + '</td></tr>';
    }).join('') + '<tr class="total"><td>이익</td><td class="n">' + krw(l.profit) + '</td></tr></tbody></table>';

    const world = [
      ['운임', w.freight ? '$1,200 급등' : '변동 없음', !w.freight],
      ['항해', w.damage ? '해수 침수 사고' : '사고 없음', !w.damage],
      ['결제일 환율', w.fx.toLocaleString('ko-KR') + '원' + (w.fx > FX_NOW ? ' (상승)' : w.fx < FX_NOW ? ' (하락)' : ' (제자리)'), w.fx >= FX_NOW],
      ['바이어 자금 사정', { ok: '정상', late: '악화, 지급 지연', default: '파산 보호 신청' }[w.credit], w.credit === 'ok']
    ];
    if (c.inc === 'DAP') world.push(['LA항', w.congestion ? '혼잡' : '원활', !w.congestion]);
    h += '<h3 class="sec">이번 판에 숨어 있던 것</h3><div class="world">' + world.map(function (x) {
      return '<div' + (x[2] ? ' class="calm"' : '') + '><b>' + x[0] + '</b>' + x[1] + '</div>';
    }).join('') + '</div>';

    h += '<h3 class="sec">결정 돌아보기</h3><ul class="review">' + seq().filter(function (k) { return D[k]; }).map(function (k) {
      const o = D[k].options().filter(function (x) { return x.id === c[k]; })[0];
      return '<li><div class="pick"><small>' + D[k].sheet + '</small>' + o.short + '</div><p>' + D[k].lesson(c[k]) + '</p></li>';
    }).join('') + '</ul>';

    h += '<div class="actions"><button type="button" class="btn" data-act="new" id="go">새 판 시작</button>' +
      '<button type="button" class="btn ghost" data-act="same">같은 상황에서 다르게 골라 보기</button></div>';
    return h;
  }

  function render(moved) {
    renderRoute(); renderBoard();
    const key = s.phase === 'intro' ? null : seq()[s.i];
    const el = $('stage');
    el.innerHTML = !key ? introHtml() : key === 'report' ? reportHtml() : EV[key] ? eventHtml(key) : decisionHtml(key);
    if (moved && !s.answered) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    if (moved) {
      // 새 장면은 맨 위부터, 고른 뒤에는 결과와 다음 버튼이 보이게 스크롤한다
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      if (!s.answered) window.scrollTo({ top: 0 });
      else { const r = el.querySelector('.result'); if (r) r.scrollIntoView({ block: 'nearest', behavior: calm }); }
      const b = el.querySelector(D[key] && !s.answered ? '.opt' : '#go');
      if (b) b.focus({ preventScroll: true });
    }
  }

  // 사건 장면에 들어설 때 그 사건을 드러내고 변화량을 기록한다
  function enter() {
    const key = seq()[s.i];
    s.answered = false; s.last = null;
    if (REVEAL[key]) {
      const a = ledger(); s.rv[REVEAL[key]] = true; const b = ledger();
      s.last = { dp: b.profit - a.profit, dt: b.trust - a.trust };
    }
  }

  $('stage').addEventListener('click', function (e) {
    const opt = e.target.closest('[data-opt]'), act = e.target.closest('[data-act]');
    if (opt && !s.answered) {
      const key = seq()[s.i], a = ledger();
      s.c[key] = opt.dataset.opt;
      const b = ledger();
      s.last = { dp: b.profit - a.profit, dt: b.trust - a.trust };
      s.answered = true;
      render(true);
    } else if (act) {
      const a = act.dataset.act;
      if (a === 'start') { s.phase = 'play'; s.i = 0; enter(); }
      else if (a === 'next') { s.i += 1; enter(); }
      else if (a === 'new') { reset(); s.phase = 'play'; enter(); }
      else if (a === 'same') { reset(s.w); s.phase = 'play'; enter(); }
      render(true);
    }
  });

  reset();
  render(false);
})();
