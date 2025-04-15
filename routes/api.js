const express = require('express');
const axios = require('axios'); // 確保已安裝 axios: npm install axios
const WebSocket = require('ws'); // 確保已安裝 ws: npm install ws
const router = express.Router();

let token = ''; // 用來存放 token 的變數
const host = '';
const wsHost = '';

// 取得 token 的 API
router.post('/get3cxToken', async function(req, res, next) {
  try {
    // 發送 POST 請求到指定的 API
    const response = await axios.post(`${host}/connect/token`, {
      grant_type: '',
      client_id: '',
      client_secret: '',
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    // 回傳 API 的回應
    token = response.data.access_token;
    console.log('Token:', token);
    res.json(response.data);
  } catch (error) {
    console.error('Error making API request:', error.message);
    res.status(500).json({ error: 'Failed to fetch token' });
  }
});

// 取得 WebSocket 的 API
router.post('/callcontrol/ws', async function(req, res, next) {
  try {
    // 建立 WebSocket 連線
    const ws = new WebSocket(`${wsHost}/callcontrol/ws`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    ws.on('open', function open() {
      console.log('WebSocket connection established');
      // 可以在這裡發送訊息到 WebSocket 伺服器
      // ws.send(JSON.stringify({ message: 'Hello WebSocket Server!' }));
    });

    ws.on('message', function message(data) {
      try {
        // 將 Buffer 轉換為字串
        const messageString = data.toString();
    
        // 如果是 JSON 格式，嘗試解析
        const messageJson = JSON.parse(messageString);
    
        console.log('Received JSON message from WebSocket server:', messageJson);

        const { event_type } = messageJson.event;
        console.log('event_type:', event_type, typeof event_type);
      } catch (error) {
        // 如果不是 JSON 格式，直接輸出字串
        console.log('Received raw message from WebSocket server:', data.toString());
      }
    });

    ws.on('close', function close() {
      console.log('WebSocket connection closed');
    });

    ws.on('error', function error(err) {
      console.error('WebSocket error:', err.message);
    });

    res.json({ message: 'WebSocket connection initiated' });
  } catch (error) {
    console.error('Error establishing WebSocket connection:', error.message);
    res.status(500).json({ error: 'Failed to connect to WebSocket' });
  }
});

module.exports = router;