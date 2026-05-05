const axios = require('axios');

async function getHanwhaSchedule(month) {
  const monthStr = String(month).padStart(2, '0');
  
  const res = await axios.post(
    'https://www.koreabaseball.com/ws/Schedule.asmx/GetScheduleList',
    `leId=1&srIdList=0%2C9%2C6&seasonId=2026&gameMonth=${monthStr}&teamId=`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://www.koreabaseball.com/Schedule/Schedule.aspx',
        'Origin': 'https://www.koreabaseball.com',
        'X-Requested-With': 'XMLHttpRequest'
      },
      timeout: 10000
    }
  );

  const rows = res.data.rows;
  const games = [];
  let currentDate = '';

  for (const row of rows) {
    const cells = row.row;

    const dateCell = cells.find(c => c.Class === 'day');
    if (dateCell) currentDate = dateCell.Text;

    const timeCell = cells.find(c => c.Class === 'time');
    const playCell = cells.find(c => c.Class === 'play');
    const venueCell = cells[cells.length - 2];

    if (playCell && timeCell && playCell.Text.includes('한화')) {
      const teamMatch = playCell.Text.match(/<span>([^<]+)<\/span>/g);
      const team1 = teamMatch[0].replace(/<\/?span>/g, '');
      const team2 = teamMatch[2].replace(/<\/?span>/g, '');
      const time = timeCell.Text.replace(/<\/?b>/g, '');
      const venue = venueCell ? venueCell.Text : '';
      const isHome = venue === '대전';
      const opponent = team1 === '한화' ? team2 : team1;

      games.push({
        date: currentDate,
        time,
        opponent,
        venue,
        isHome
      });
    }
  }

  return games;
}

async function getRecentResults(teamName, month) {
  const results = [];

  // 이번 달 + 지난달 데이터 같이 가져오기
  const months = month === 1 ? [12, 1] : [month - 1, month];

  for (const m of months) {
    const monthStr = String(m).padStart(2, '0');
    const seasonId = m === 12 ? 2025 : 2026;

    try {
      const res = await axios.post(
        'https://www.koreabaseball.com/ws/Schedule.asmx/GetMonthSchedule',
        'leId=1&srIdList=0%2C9%2C6&seasonId=' + seasonId + '&gameMonth=' + monthStr,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Referer': 'https://www.koreabaseball.com/Schedule/Schedule.aspx',
            'Origin': 'https://www.koreabaseball.com',
            'X-Requested-With': 'XMLHttpRequest'
          },
          timeout: 10000
        }
      );

      const rows = res.data.rows;
      for (const row of rows) {
        for (const cell of row.row) {
          if (!cell.Text || !cell.Text.includes(teamName)) continue;
          const matches = cell.Text.match(/([가-힣A-Z]+)\s*<b>(\d+)\s*:\s*(\d+)<\/b>\s*([가-힣A-Z]+)/g);
          if (!matches) continue;

          for (const match of matches) {
            const parsed = match.match(/([가-힣A-Z]+)\s*<b>(\d+)\s*:\s*(\d+)<\/b>\s*([가-힣A-Z]+)/);
            if (!parsed) continue;
            const away = parsed[1];
            const awayScore = parseInt(parsed[2]);
            const homeScore = parseInt(parsed[3]);
            const home = parsed[4];
            if (away !== teamName && home !== teamName) continue;
            const isOurTeamAway = away === teamName;
            const ourScore = isOurTeamAway ? awayScore : homeScore;
            const oppScore = isOurTeamAway ? homeScore : awayScore;
            results.push({ won: ourScore > oppScore, ourScore, oppScore });
          }
        }
      }
    } catch (e) {
      console.log(m + '월 데이터 실패:', e.message);
    }
  }

  // 최근 5경기만
  const recent5 = results.slice(-5);
  const wins = recent5.filter(r => r.won).length;
  return { recent5, wins, losses: recent5.length - wins };
}
module.exports = { getHanwhaSchedule, getRecentResults };
