const { Server } = require('socket.io');
const io = new Server();
console.log(typeof io.in('room').socketsLeave === 'function');
