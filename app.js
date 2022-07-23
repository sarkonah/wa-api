const { Client, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");
const socketIO = require("socket.io");
const express = require("express");
const qrcode = require("qrcode");
const http = require("http");
const { response } = require("express");
const port = process.env.PORT || 5000;
const { phoneNumberFormatter } = require('./formatter');
const { body, validationResult } = require('express-validator');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: __dirname });
});
const client = new Client({
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process", // <- this one doesn't works in Windows
      "--disable-gpu",
    ],
  },
  authStrategy: new LocalAuth(),
});


client.on("message", (msg) => {
  if (msg.body == "dek") {
    msg.reply("iyaa?");
  }
});

client.initialize();

io.on("connection", function (socket) {
  socket.emit("message", "connecting...");

  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('message', 'QR Code received, scan please!');
    });
  });

  client.on('ready', () => {
    socket.emit('ready', 'Whatsapp is ready!');
    socket.emit('message', 'Whatsapp is ready!');
  });

  client.on('authenticated', (session) => {
    socket.emit('authenticated', 'Whatsapp is authenticated');
    socket.emit('message', 'Whatsapp is authenticated');
    console.log('AUTHENTICATED', session);
    // save session to db
    // db.saveSession(session);
  });

  client.on('auth_failure', function (session) {
    console.log(session);
    socket.emit('message', 'Auth failure, restarting....');
  });

  client.on('disconnected', (reason) => {
    socket.emit('message', 'Whatsapp is disconected!');
    // remove session from db
    // db.removeSession(); 
    client.destroy();
    client.initialize();
  });

});

// Send message
const checkRegisteredNumber = async function (number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
}

app.post("/send-message", [
  body('number').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {

  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }
  const number = phoneNumberFormatter(req.body.number);
  const message = req.body.message;

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: 'The number is not registered'
    });
  }

  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

server.listen(port, function () {
  console.log("app runing ");
});
