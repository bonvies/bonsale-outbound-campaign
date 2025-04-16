const express = require('express');
const axios = require('axios');
const WebSocket = require('ws');
const { set } = require('../app');
const e = require('express');
const router = express.Router();
require('dotenv').config();

const host = process.env.API_HOST;
const wsHost = process.env.WS_HOST;

// 取得 3CX token
async function get3cxToken (grant_type, client_id, client_secret) {
  try {
    const response = await axios.post(`${host}/connect/token`, {
      grant_type,
      client_id,
      client_secret
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    return response.data.access_token;
  } catch (error) {
  console.error('Error making API request:', error.message);
  throw new Error('Failed to fetch token');
  }
};

// 取得撥號者 讓 queue 去撥通電話
async function getCaller (token) {
  try {
    const response = await axios.get(`${host}/callcontrol`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });
    const caller = response.data.find(item => item.type === 'Wqueue');
    if (!caller) {
      throw new Error('Caller not found');
    }

    return caller;
  } catch (error) {
    console.error('Error making API request:', error.message);
    throw new Error('Failed to getCaller data');
  } 
};

async function makeCall (token, dn, device_id, reason, destination, timeout = 30) {
  try {
    const response = await axios.post(`${host}/callcontrol/${dn}/devices/${device_id}/makecall`, {
      reason,
      destination,
      timeout
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });
    // 回傳 API 的回應
    return response.data;
  } catch (error) {
    console.error('Error making API request:', error.message);
    throw new Error('Failed to makecall');
  }
};

// 取得參與者資訊 電話撥出時可用來抓取對方是否接聽
async function getParticipants (token, dn) {
  try {
    const response = await axios.get(`${host}/callcontrol/${dn}/participants`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });
    console.log('參與者資訊：', response.data);
    return response.data;
  } catch (error) {
    console.error('Error making API request:', error.message);
    throw new Error('Failed to get participants');
  }
};

// 建立 WebSocket 連線 查看自動撥號狀態
function callcontrolWs (token, phone, dn, device_id) {
  const phoneNumbersArray = phone.split(',');
  let nowCall = 0;

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

    ws.on('message', async function message(data) {
      try {
        // 取得參與者資訊
        const participants = await getParticipants(token, dn);
        console.log('參與者資訊：', participants);

        // 將 Buffer 轉換為字串
        const messageString = data.toString();
    
        // 如果是 JSON 格式，嘗試解析
        const messageJson = JSON.parse(messageString);
    
        // console.log('Received JSON message from WebSocket server:', messageJson);

        const { event_type } = messageJson.event;
        
        if (event_type === 1) {
          console.log('event_type:', event_type);
          nowCall++;
          console.log(`前一隻手機掛斷了 5秒後準備撥給 第 ${nowCall + 1} 隻手機: ${phoneNumbersArray[nowCall]}`);

          if (!phoneNumbersArray[nowCall]) {
            console.log('No more phone numbers to call');
            nowCall = 0; // 重置計數器
            ws.close(); // 關閉 WebSocket 連線
            return;
          } else {
            // 等待 5 秒後撥打下一個電話
            setTimeout(() => {
              makeCall(token, dn, device_id, 'outbound', phoneNumbersArray[nowCall]);
            }, 5000);
          }

        }

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
      throw new Error('WebSocket connection error');
    });

  } catch (error) {
    console.error('Error establishing WebSocket connection:', error.message);
    throw new Error('Failed to establish WebSocket connection');
  }
};

// 主要 的 API
router.post('/', async function(req, res, next) {
  const { grant_type, client_id, client_secret, phone } = req.body;

  if (!grant_type || !client_id || !client_secret || !phone) {
    return res.status(400).send('Missing required fields');
  }
  try {
    // 先取得 3CX token 
    const token = await get3cxToken(grant_type, client_id, client_secret);
    console.log(token);
    // 取得 撥號分機資訊 (需要設定 queue)
    const caller = await getCaller(token);
    const { dn, device_id } = caller.devices[0]; // TODO 這邊我只有取第一台設備資訊

    // 進行初次撥打電話
    const phoneNumbersArray = phone.split(',');
    makeCall(token, dn, device_id, 'outbound', phoneNumbersArray[0]);

    // 建立 WebSocket 連線
    callcontrolWs(token, phone, dn, device_id);

    // Log the received data (for debugging purposes)
    console.log({ grant_type, client_id, client_secret, phone });

    res.status(200).send('Request received successfully');
  } catch (error) {
    console.error('Error in POST /:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
