const TRANSPORT = {
  seoul: {
    '잠실':  { possible: true, note: '지하철 40분', score: 3 },
    '고척':  { possible: true, note: '지하철 50분', score: 3 },
    '수원':  { possible: true, note: '전철 50분',   score: 2 },
    '인천':  { possible: true, note: '전철 60분',   score: 2 },
    '대전':  { possible: true, note: 'KTX 1시간',   score: 2 },
    '대구':  { possible: false, note: '이동 거리 너무 멀어', score: 0 },
    '광주':  { possible: false, note: '이동 거리 너무 멀어', score: 0 },
    '창원':  { possible: false, note: '이동 거리 너무 멀어', score: 0 },
    '부산':  { possible: false, note: '이동 거리 너무 멀어', score: 0 },
  },
  daejeon: {
    '대전':  { possible: true, note: '버스 20분',          score: 3 },
    '수원':  { possible: true, note: 'KTX 50분',           score: 2 },
    '잠실':  { possible: true, note: 'KTX 1시간 10분',     score: 2 },
    '고척':  { possible: true, note: 'KTX + 지하철',       score: 2 },
    '인천':  { possible: true, note: 'KTX + 전철 1시간반', score: 1 },
    '대구':  { possible: false, note: '이동 거리 너무 멀어', score: 0 },
    '광주':  { possible: false, note: '이동 거리 너무 멀어', score: 0 },
    '창원':  { possible: false, note: '이동 거리 너무 멀어', score: 0 },
    '부산':  { possible: false, note: '이동 거리 너무 멀어', score: 0 },
  }
};

function evaluateGame(game, options) {
  const { location, recentStats, calendarConflict } = options;

  let score = 0;
  const conditions = [];
  let blocked = false;
  let blockReason = null;

  // ── 1단계: 필수 조건 ──

  // 캘린더 일정 충돌
if (options.calendarConflict) {
  blocked = true;
  blockReason = '당일 일정 있음 — ' + options.calendarConflict;
}

  // 이동 가능 여부
  const transport = TRANSPORT[location][game.venue] || { possible: false, note: '해당 구장 이동 불가', score: 0 };
  if (!transport.possible) {
    blocked = true;
    blockReason = (blockReason ? blockReason + ' / ' : '') + game.venue + ' 이동 불가 — ' + transport.note;
  }

  if (blocked) {
    return {
      verdict: '비추',
      score: 0,
      blocked: true,
      blockReason,
      conditions: [],
      message: blockReason + '\n다음 경기를 노려봐!'
    };
  }

  // ── 2단계: 점수 계산 ──

  // 좋아하는 선수 (임시: 라인업 미확정 +2)
  const playerScore = 2;
  // 캘린더 여유
if (options.calendarFree) {
  score += 1;
  conditions.push({ label: '일정 여유', detail: '당일 일정 없음', score: '+1', type: 'pass' });
}
  score += playerScore;
  conditions.push({
    label: '좋아하는 선수',
    detail: '라인업 미확정 — 출전 가능성 높음',
    score: '+' + playerScore,
    type: 'warn'
  });

  // 승리 예측
  let winScore = 0;
  let winDetail = '';
  let winType = 'warn';

  if (recentStats) {
    const { ourWins, oppLosses, oppWins, bullpenWarn } = recentStats;
    const ourGood = ourWins >= 3;
    const oppBad = oppLosses >= 3;
    const oppHot = oppWins >= 4;

    if (ourGood && oppBad) {
      winScore = 3;
      winDetail = '우리팀 호조 + 상대 부진 (' + ourWins + '승 / 상대 ' + oppLosses + '패)';
      winType = 'pass';
    } else if (ourGood) {
      winScore = 2;
      winDetail = '우리팀 최근 호조 (' + ourWins + '승)';
      winType = 'pass';
    } else if (oppBad) {
      winScore = 2;
      winDetail = '상대팀 최근 부진 (' + oppLosses + '패)';
      winType = 'pass';
    } else if (ourWins >= 2) {
      winScore = 1;
      winDetail = '우리팀 보통 (' + ourWins + '승 ' + (5 - ourWins) + '패)';
      winType = 'warn';
    } else {
      winScore = 0;
      winDetail = '우리팀 최근 부진 (' + ourWins + '승 ' + (5 - ourWins) + '패)';
      winType = 'fail';
    }

    if (oppHot) {
      winScore = Math.max(0, winScore - 1);
      winDetail += ' / 상대 최근 호조 (' + oppWins + '승)';
    }

    if (bullpenWarn) {
      winScore = Math.max(0, winScore - 1);
      winDetail += ' / 불펜 연투 주의';
    }
  } else {
    winScore = game.isHome ? 2 : 1;
    winDetail = game.isHome ? '홈경기 — 데이터 수집 중' : '원정 — 데이터 수집 중';
    winType = game.isHome ? 'pass' : 'warn';
  }

  score += winScore;
  conditions.push({
    label: '승리 예측',
    detail: winDetail,
    score: '+' + winScore,
    type: winType
  });

  // 이동 여유
  score += transport.score;
  conditions.push({
    label: '이동 여유',
    detail: transport.note,
    score: '+' + transport.score,
    type: transport.score >= 3 ? 'pass' : transport.score >= 2 ? 'warn' : 'fail'
  });

  // 홈경기 보너스 (서울 출발 시에만)
  if (game.isHome && location === 'seoul') {
    score += 1;
    conditions.push({ label: '홈경기', detail: '대전 홈 어드밴티지', score: '+1', type: 'pass' });
  }

  // ── 최종 판정 ──
  // 상대팀 페널티/보너스 반영
const penalty = (options.opponentPenalty && options.opponentPenalty[game.opponent]) || 0;
score += penalty;

const threshold = options.threshold || 7;
let verdict, message;
if (score >= threshold) {
  verdict = 'GO';
  message = score + '점이야. 조건 좋은 날이야. 지금 티켓 잡아도 좋을 것 같아.' + (penalty < 0 ? ' (상대팀 페널티 반영됨)' : '');
} else if (score >= threshold - 3) {
  verdict = '애매';
  message = score + '점이야. 나쁘진 않은데 라인업 확정되면 다시 알려줄게.';
} else {
  verdict = '비추';
  message = score + '점이야. 오늘은 쉬는 게 나을 것 같아.';
}

return { verdict, score, blocked: false, conditions, message };}

module.exports = { evaluateGame };