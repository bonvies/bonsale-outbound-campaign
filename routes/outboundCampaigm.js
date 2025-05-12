const express = require('express');
const WebSocket = require('ws');
const router = express.Router();
const {
  get3cxToken,
  makeCall,
  getCaller,
  getParticipants
} = require('../services/callControl.js');

require('dotenv').config();

const wsHost = process.env.WS_HOST_3CX
const callGapTime = parseInt(process.env.CALL_GAP_TIME) || 5; // 預設 5 秒

// 創建 WebSocket Server
const clientWs = new WebSocket.Server({ port: process.env.WS_PORT_OUTBOUND_CAMPAIGM || 3021 });

clientWs.on('connection', (ws) => {
  console.log('WebSocket Server: Client connected');

  ws.on('close', () => {
    console.log('WebSocket Server: Client disconnected');
  });
});

// 建立 WebSocket 連線 查看自動撥號狀態
function createWs (token, phones, dn, device_id, caller, client_id) {
  const phoneNumbersArray = phones.split(',');
  let nowCall = 0;

  try {
    // 建立 WebSocket 連線
    const ws = new WebSocket(`${wsHost}/callcontrol/ws`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    ws.on('open', async function open() {
      // console.log('WebSocket connection established');

      // 進行初次撥打電話
      const phoneNumbersArray = phones.split(',');
      console.log(`撥打者 ${client_id} / 準備撥給 第 ${nowCall + 1} 隻手機: ${phoneNumbersArray[nowCall]}`);
      await makeCall(token, dn, device_id, 'outbound', phoneNumbersArray[0]);
    });

    ws.on('message', async function message(data) {
      try {
        // 取得參與者資訊
        const participants = await getParticipants(token, dn);
        // console.log('參與者資訊 : ', participants);

        // 將 Buffer 轉換為字串
        const messageString = data.toString();
    
        // 如果是 JSON 格式，嘗試解析
        const messageJson = JSON.parse(messageString);
    
        // console.log('WebSocket server 接收數據 : ', messageJson);

        const { event_type } = messageJson.event;

        // 整合 參與者資訊 和 WebSocket server 接收數據
        // console.log('caller.devices:', caller.devices);
        const resultData = {
          ...messageJson,
          client_id,
          caller: {
            dn: caller.dn,
            type: caller.type,
            devices: caller.devices,
          },
          participants: participants
        }

        // if(client_id === 'leo'){
        //   console.error('整合 參與者資訊 和 WebSocket server 接收數據 : ', resultData);
        // } else {
        //   console.log('整合 參與者資訊 和 WebSocket server 接收數據 : ', resultData);
        // }

        console.log('整合 參與者資訊 和 WebSocket server 接收數據 : ', resultData);
        

        // 傳送 resultData 給 WebSocket Server 的所有連線客戶端
        clientWs.clients.forEach((client) => {
          client.send(JSON.stringify(resultData));
        });
        
        if (event_type === 1) {
          // console.log('event_type:', event_type);
          nowCall++;
          console.log('=================== 我是分隔線 ====================');
          // console.log(`撥打者 ${caller.dn} / 前一隻手機掛斷了 ${callGapTime} 秒後準備撥給 第 ${nowCall + 1} 隻手機: ${phoneNumbersArray[nowCall]}`);
          console.log(`撥打者 ${client_id} / 前一隻手機接聽分機成功或中斷了 準備 ${callGapTime} 秒後準備撥給下隻手機`);
          if (!phoneNumbersArray[nowCall]) {
            console.log('沒有更多的電話號碼可以撥打');
            nowCall = 0; // 重置計數器
            ws.close(); // 關閉 WebSocket 連線
            return;
          } else {
            // 等待 ${callGapTime} 秒後撥打下一個電話
            setTimeout(async () => {
              console.log(`撥打者 ${client_id} / 準備撥給 第 ${nowCall} 手機: ${phoneNumbersArray[nowCall]}`);
              await makeCall(token, dn, device_id, 'outbound', phoneNumbersArray[nowCall]);
            }, callGapTime * 1000); // 轉換為毫秒
          }
        }

      } catch (error) {
        // 如果不是 JSON 格式，直接輸出字串
        clientWs.close();
        console.log('Received raw message from WebSocket server:', data.toString());
      }
    });

    ws.on('close', function close() {
      // console.log('WebSocket connection closed');
    });

    ws.on('error', function error(err) {
      // console.error('WebSocket error:', err.message);
      throw new Error('WebSocket connection error');
    });

  } catch (error) {
    console.error('Error establishing WebSocket connection:', error.message);
    throw new Error('Failed to establish WebSocket connection');
  }
};

// 常規的 outboundCampaigm API
router.post('/', async function(req, res, next) {
  const { grant_type, client_id, client_secret, phones } = req.body;

  if (!grant_type || !client_id || !client_secret || !phones) {
    return res.status(400).send('Missing required fields');
  }
  try {
    // 先取得 3CX token 
    const fetch_get3cxToken = await get3cxToken(grant_type, client_id, client_secret);
    if (!fetch_get3cxToken.success) return res.status(fetch_get3cxToken.error.status).send(fetch_get3cxToken.error); // 錯誤處理
    const token = fetch_get3cxToken.data?.access_token; // 取得 access_token
    // console.log(token);

    // 取得 撥號分機資訊 (需要設定 queue)
    const fetch_getCaller = await getCaller(token); // 取得撥號者
    if (!fetch_getCaller.success) return res.status(fetch_getCaller.error.status).send(fetch_getCaller.error); // 錯誤處理
    const caller = fetch_getCaller.data
    const { dn, device_id } = caller.devices[0]; // 這邊我只有取第一台設備資訊
    // console.log('撥打者資訊 : ', caller);

    // 建立 WebSocket 連線
    try {
      createWs(token, phones, dn, device_id, caller, client_id);
    } catch (error) {
      console.error('Error establishing WebSocket connection:', error.message);
    }

    // // Log the received data (for debugging purposes)
    // console.log({ grant_type, client_id, client_secret, phones });

    res.status(200).send({
      message: 'Request outboundCampaigm successfully',
      token_3cx: token,
    });
  } catch (error) {
    console.error('Error in POST /:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
