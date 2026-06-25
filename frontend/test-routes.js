const http = require('http');

const routes = ['/pay/agent', '/pay/merchant', '/app/user/auto-pay-setup'];

routes.forEach(route => {
  http.get(`http://localhost:3000${route}`, (res) => {
    console.log(`${route}: ${res.statusCode}`);
  }).on('error', (err) => {
    console.log(`${route}: ERROR - ${err.message}`);
  });
});
