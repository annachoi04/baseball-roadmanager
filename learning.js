const fs = require('fs');

function loadFeedbacks() {
  if (!fs.existsSync('./feedback.json')) return [];
  return JSON.parse(fs.readFileSync('./feedback.json', 'utf8'));
}

function getLearningWeights() {
  const feedbacks = loadFeedbacks();
  if (feedbacks.length === 0) {
    return { threshold: 7, opponentPenalty: {}, stats: null };
  }

  const went = feedbacks.filter(f => f.feedback !== 'notgo');
  const good = feedbacks.filter(f => f.feedback === 'good');
  const bad = feedbacks.filter(f => f.feedback === 'bad');
  const notgo = feedbacks.filter(f => f.feedback === 'notgo');

  // 임계값 조정
  const badRatio = went.length > 0 ? bad.length / went.length : 0;
  let threshold = 7;
  if (badRatio > 0.6) threshold = 8;
  else if (badRatio < 0.2) threshold = 6;
  if (notgo.length >= 3) threshold = Math.max(5, threshold - 1);

  // 상대팀별 페널티/보너스 계산
  const opponentStats = {};
  feedbacks.forEach(f => {
    if (!opponentStats[f.opponent]) opponentStats[f.opponent] = { good: 0, bad: 0, total: 0 };
    if (f.feedback === 'good') opponentStats[f.opponent].good++;
    if (f.feedback === 'bad') opponentStats[f.opponent].bad++;
    if (f.feedback !== 'notgo') opponentStats[f.opponent].total++;
  });

  // 상대팀별 점수 보정
  // 2경기 이상 데이터 있을 때만 반영
  const opponentPenalty = {};
  Object.keys(opponentStats).forEach(opp => {
    const s = opponentStats[opp];
    if (s.total < 2) return;
    const goodRatio = s.good / s.total;
    if (goodRatio >= 0.7) opponentPenalty[opp] = 1;   // 자주 좋았던 팀 +1
    else if (goodRatio <= 0.3) opponentPenalty[opp] = -1; // 자주 별로였던 팀 -1
  });

  return {
    threshold,
    opponentPenalty,
    stats: {
      total: feedbacks.length,
      good: good.length,
      bad: bad.length,
      notgo: notgo.length,
      badRatio: Math.round(badRatio * 100) + '%',
      opponentStats
    }
  };
}

function getInsights() {
  const feedbacks = loadFeedbacks();
  if (feedbacks.length < 3) return null;

  const insights = [];
  const went = feedbacks.filter(f => f.feedback !== 'notgo');
  const good = feedbacks.filter(f => f.feedback === 'good');
  const bad = feedbacks.filter(f => f.feedback === 'bad');

  // 홈 vs 원정
  const homeFeedbacks = went.filter(f => f.isHome);
  const awayFeedbacks = went.filter(f => !f.isHome);
  const homeGoodRatio = homeFeedbacks.length > 0 ? good.filter(f => f.isHome).length / homeFeedbacks.length : 0;
  const awayGoodRatio = awayFeedbacks.length > 0 ? good.filter(f => !f.isHome).length / awayFeedbacks.length : 0;

  if (homeFeedbacks.length >= 2 && homeGoodRatio > 0.7) insights.push('홈경기 직관 만족도가 높아');
  if (awayFeedbacks.length >= 2 && awayGoodRatio < 0.3) insights.push('원정 직관은 별로인 경우가 많아');
  if (awayFeedbacks.length >= 2 && awayGoodRatio > 0.7) insights.push('원정 직관도 꽤 만족스러운 편이야');

  // 상대팀별 패턴
  const opponentStats = {};
  feedbacks.forEach(f => {
    if (!opponentStats[f.opponent]) opponentStats[f.opponent] = { good: 0, bad: 0, total: 0 };
    if (f.feedback === 'good') opponentStats[f.opponent].good++;
    if (f.feedback === 'bad') opponentStats[f.opponent].bad++;
    if (f.feedback !== 'notgo') opponentStats[f.opponent].total++;
  });

  Object.keys(opponentStats).forEach(opp => {
    const s = opponentStats[opp];
    if (s.total < 2) return;
    const goodRatio = s.good / s.total;
    if (goodRatio >= 0.7) insights.push(opp + ' 전 직관은 대체로 좋았어');
    else if (goodRatio <= 0.3) insights.push(opp + ' 전 직관은 별로인 경우가 많았어 (-1 적용 중)');
  });

  return insights.length > 0 ? insights : null;
}

module.exports = { getLearningWeights, getInsights };