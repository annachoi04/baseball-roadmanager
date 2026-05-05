require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { google } = require('googleapis');
const { getHanwhaSchedule, getRecentResults } = require('./schedule');
const { evaluateGame } = require('./score');
const { HANWHA_PLAYERS } = require('./players');
const { getLearningWeights, getInsights } = require('./learning');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// ── 경기 일정 API ──
app.get('/api/schedule', async (req, res) => {
  try {
    const month = req.query.month || new Date().getMonth() + 1;
    const games = await getHanwhaSchedule(month);
    res.json({ success: true, games });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 직관 판단 API ──
app.post('/api/evaluate', async (req, res) => {
  try {
    const { game, location } = req.body;
    const month = new Date().getMonth() + 1;

    const hanwhaStats = await getRecentResults('한화', month);
    const oppStats = await getRecentResults(game.opponent, month);
    const recentStats = {
      ourWins: hanwhaStats.wins,
      oppLosses: oppStats.losses,
      oppWins: oppStats.wins,
      bullpenWarn: false
    };

    // 피드백 학습 가중치
    const weights = getLearningWeights();
    const insights = getInsights();

    // 캘린더 일정 확인
    let calendarConflict = null;
    let calendarFree = false;

    if (fs.existsSync('./tokens.json')) {
      try {
        const tokens = JSON.parse(fs.readFileSync('./tokens.json'));
        oauth2Client.setCredentials(tokens);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const dateStr = game._dateStr;
        if (dateStr) {
          const dayStart = new Date(dateStr + 'T00:00:00+09:00');
          const dayEnd = new Date(dateStr + 'T23:59:59+09:00');

          console.log('캘린더 확인 날짜:', dateStr);

          const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: dayStart.toISOString(),
            timeMax: dayEnd.toISOString(),
            singleEvents: true,
            orderBy: 'startTime'
          });

          const allEvents = response.data.items || [];
          console.log('전체 이벤트 수:', allEvents.length);

          const realEvents = allEvents.filter(function(e) {
            return e.eventType !== 'birthday' && e.transparency !== 'transparent';
          });

          if (realEvents.length === 0) {
            calendarFree = true;
          } else {
            const gameStart = new Date(dateStr + 'T' + game.time + ':00+09:00');
            const gameEnd = new Date(gameStart.getTime() + 4 * 60 * 60 * 1000);
           console.log('location:', location, 'venue:', game.venue);
const travelMinutes = location === 'daejeon' && game.venue === '대전' ? 30 :
                      location === 'daejeon' ? 90 :
                      location === 'seoul' && (game.venue === '잠실' || game.venue === '고척') ? 60 : 90;
const gameStartWithTravel = new Date(gameStart.getTime() - travelMinutes * 60 * 1000);

            const conflictEvents = realEvents.filter(function(e) {
              if (!e.start.dateTime) return false;
              const eventStart = new Date(e.start.dateTime);
              const eventEnd = new Date(e.end.dateTime);
              return eventStart < gameEnd && eventEnd > gameStartWithTravel;
            });

            if (conflictEvents.length > 0) {
              const ev = conflictEvents[0];
              const evStart = new Date(ev.start.dateTime);
              const evEnd = new Date(ev.end.dateTime);
              const fmt = function(d) {
                return d.getHours() + '시 ' + String(d.getMinutes()).padStart(2, '0') + '분';
              };
              calendarConflict = ev.summary + ' (' + fmt(evStart) + ' ~ ' + fmt(evEnd) + ')';
            } else {
              calendarFree = true;
            }
          }
        }
      } catch (e) {
        console.log('캘린더 확인 실패:', e.message);
      }
    }

    const result = evaluateGame(game, {
      location,
      recentStats,
      calendarConflict,
      calendarFree,
      threshold: weights.threshold,
      opponentPenalty: weights.opponentPenalty
    });

    res.json({
      success: true,
      result,
      hanwhaStats,
      oppStats,
      calendarConflict,
      calendarFree,
      insights,
      weights: weights.stats
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 경기 결과 API ──
app.get('/api/results', async (req, res) => {
  try {
    const month = req.query.month || new Date().getMonth() + 1;
    const monthStr = String(month).padStart(2, '0');
    const axios = require('axios');
    const res2 = await axios.post(
      'https://www.koreabaseball.com/ws/Schedule.asmx/GetMonthSchedule',
      'leId=1&srIdList=0%2C9%2C6&seasonId=2026&gameMonth=' + monthStr,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'https://www.koreabaseball.com/Schedule/Schedule.aspx',
          'Origin': 'https://www.koreabaseball.com',
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 10000
      }
    );
    const rows = res2.data.rows;
    const resultMap = {};
    for (const row of rows) {
      for (const cell of row.row) {
        if (!cell.Text || !cell.Text.includes('한화')) continue;
        const dayMatch = cell.Text.match(/class="dayNum">(\d+)<\/li>/g);
        const gameMatches = cell.Text.match(/한화\s*<b>(\d+)\s*:\s*(\d+)<\/b>/g);
        if (!dayMatch || !gameMatches) continue;
        const day = dayMatch[0].match(/(\d+)/)[1];
        const dateKey = '2026-' + monthStr + '-' + String(day).padStart(2, '0');
        const scoreMatch = gameMatches[0].match(/한화\s*<b>(\d+)\s*:\s*(\d+)<\/b>/);
        if (scoreMatch) {
          const hanwhaScore = parseInt(scoreMatch[1]);
          const oppScore = parseInt(scoreMatch[2]);
          resultMap[dateKey] = { hanwhaScore, oppScore, won: hanwhaScore > oppScore };
        }
      }
    }
    res.json({ success: true, resultMap });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 선수 목록 API ──
app.get('/api/players', (req, res) => {
  res.json({ success: true, players: HANWHA_PLAYERS });
});

// ── 피드백 API ──
app.post('/api/feedback', (req, res) => {
  try {
    const { game, feedback, memo } = req.body;
    const feedbackData = {
      date: game._dateStr || game.date,
      opponent: game.opponent,
      venue: game.venue,
      isHome: game.isHome,
      feedback, memo,
      savedAt: new Date().toISOString()
    };
    let existing = [];
    if (fs.existsSync('./feedback.json')) {
      existing = JSON.parse(fs.readFileSync('./feedback.json', 'utf8'));
    }
    existing.push(feedbackData);
    fs.writeFileSync('./feedback.json', JSON.stringify(existing, null, 2));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/feedback', (req, res) => {
  try {
    if (!fs.existsSync('./feedback.json')) return res.json({ success: true, feedbacks: [] });
    const feedbacks = JSON.parse(fs.readFileSync('./feedback.json', 'utf8'));
    res.json({ success: true, feedbacks });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── 구글 캘린더 연동 ──
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.readonly']
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync('./tokens.json', JSON.stringify(tokens));
    res.redirect('/');
  } catch (e) {
    res.status(500).send('로그인 실패: ' + e.message);
  }
});

app.get('/api/calendar', async (req, res) => {
  try {
    if (!fs.existsSync('./tokens.json')) {
      return res.json({ success: false, needLogin: true });
    }
    const tokens = JSON.parse(fs.readFileSync('./tokens.json'));
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 30,
      singleEvents: true,
      orderBy: 'startTime'
    });
    res.json({ success: true, events: response.data.items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('서버 실행중: http://localhost:' + PORT);
});