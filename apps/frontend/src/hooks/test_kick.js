const https = require('https');
https.get('https://raw.githubusercontent.com/Poyo-SSB/tetrio-bot/master/src/utils/srs.ts', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data.includes('180') ? data.substring(data.indexOf('180') - 100, data.indexOf('180') + 500) : 'no 180'));
});
