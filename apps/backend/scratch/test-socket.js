const { Server } = require('socket.io');
const io = new Server();
console.log(io.sockets.sockets instanceof Map);
