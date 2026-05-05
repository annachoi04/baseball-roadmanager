const axios = require('axios');

async function getHanwhaPlayers() {
  try {
    const res = await axios.post(
      'https://www.koreabaseball.com/Player/Register.aspx',
      '__EVENTTARGET=&__EVENTARGUMENT=&ctl00%24ctl00%24ctl00%24cphContents%24cphContents%24cphContents%24hfSearchTeam=HH&ctl00%24ctl00%24ctl00%24cphContents%24cphContents%24cphContents%24hfSearchDate=20260504',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Referer': 'https://www.koreabaseball.com/Player/Register.aspx',
          'X-Requested-With': 'XMLHttpRequest',
          'X-MicrosoftAjax': 'Delta=true'
        },
        timeout: 10000
      }
    );

    const html = res.data;
    console.log('투수 위치:', html.indexOf('투수'));
    console.log('포수 위치:', html.indexOf('포수'));
    console.log('응답 길이:', html.length);
    console.log('\n응답 앞부분:\n', html.slice(0, 1000));

  } catch (e) {
    console.log('실패:', e.message);
  }
}

getHanwhaPlayers();