const express = require('express');
const router = express.Router();
const axios = require('axios');
const WebSocket = require('ws');
require('dotenv').config();

const host = process.env.BONSALE_HOST;
const xApiKey = process.env.BONSALE_X_API_KEY;
const xApiSecret = process.env.BONSALE_X_API_SECRET;

const axiosBonsaleInstance = axios.create({
  baseURL: host,
  headers: {
    'X-API-KEY': xApiKey,
    'X-API-SECRET': xApiSecret,
  },
});

// 創建 WebSocket Server
const clientWsWebHook = new WebSocket.Server({ noServer: true });

clientWsWebHook.on('connection', (ws) => {
  console.log('WebSocket Server - clientWsWebHook: Client connected');

  ws.on('close', () => {
    console.log('WebSocket Server - clientWsWebHook: Client disconnected');
  });
});

// 建立一個 /WebHook 端點 來接收 Bonsale 的 WebHook 通知
router.post('/WebHook', async function(req, res) {
  try {
    console.log('Received Bonsale WebHook:', req.body);

    // 將 WebHook 資料發送到所有連接的客戶端
    clientWsWebHook.clients.forEach((client) => {
      client.send(JSON.stringify(req.body)); // 將 WebHook 資料發送到所有連接的客戶端
    });
    res.status(200).send({ message: 'WebHook received' });
  } catch (error) {
    console.error('Error in POST /WebHook:', error.message);
    return res.status(error.status).send(`Error in POST /WebHook: ${error.message}`);
  }
});

// 取得 Bonsale 外撥專案
router.get('/project/auto-dial', async function(req, res) {
  try {
    const queryString = new URLSearchParams(req.query).toString().replace(/%2B/g, '+'); // 將 %2B 替換為 + 因為 Bonsale 的 sort query API 格式會像這樣 created_at+desc 但 new URLSearchParams 會將 + 編碼成 %2B 導致無法正確查詢
    console.log(req.query)
    const autoDialData = await axiosBonsaleInstance.get(`${host}/project/auto-dial?${queryString}`);
    const autoDialProject = autoDialData.data;
    return res.status(200).send(autoDialProject);
  } catch (error) {
    console.error('Error in GET /auto-dial:', error.message);
    return res.status(error.status).send(`Error in GET /auto-dial: ${error.message}`);
  }
});

// 取得單一 Bonsale 外撥專案
router.get('/project/:projectId/auto-dial/:callFlowId', async function(req, res) {
  const { projectId, callFlowId } = req.params;
  console.log('projectId:', projectId);
  console.log('callFlowId:', callFlowId);
  if (!projectId || !callFlowId) {
    return res.status(400).send('Error in GET /auto-dial: Missing required fields');
  };
  try {
    const autoDialData = await axiosBonsaleInstance.get(`${host}/project/${projectId}/auto-dial/${callFlowId}`);
    const autoDialProject = autoDialData.data;
    return res.status(200).send(autoDialProject);
  } catch (error) {
    console.error('Error in GET /auto-dial:', error.message);
    return res.status(error.status).send(`Error in GET /auto-dial: ${error.message}`);
  }
});

// 取得 Bonsale 專案名單資料
router.get('/project', async function(req, res) {
  try {
    const queryString = new URLSearchParams(req.query).toString();
    console.log(queryString)
    const autoDialData = await axiosBonsaleInstance.get(`${host}/project/customer?${queryString}`);
    const autoDialProject = autoDialData.data;
    return res.status(200).send(autoDialProject);
  } catch (error) {
    console.error('Error in GET /project:', error.message);
    return res.status(error.status).send(`Error in GET /project: ${error.message}`);
  }
});

// 取得 Bonsale 專案名單總頁數資料
router.get('/project/count/customer', async function(req, res) {
  try {
    const queryString = new URLSearchParams(req.query).toString();
    console.log(`${host}/project/count/customer?${queryString}`)
    const autoDialData = await axiosBonsaleInstance.get(`${host}/project/count/customer?${queryString}`);
    const autoDialProject = autoDialData.data;
    return res.status(200).send(autoDialProject);
  } catch (error) {
    console.error('Error in GET /project/count/customer:', error.message);
    return res.status(error.status).send(`Error in GET /project/count/customer: ${error.message}`);
  }
});

// 編輯 Bonsale 專案資料
router.put('/project/3cx/:projectId', async function(req, res) {
  const { projectId } = req.params; // 從路徑參數中取得 projectId
  const { isEnable } = req.body; 

  try {
    // 發送 PUT 請求到 Bonsale API
    const response = await axiosBonsaleInstance.put(
      `${host}/project/3cx/${projectId}`,
      { isEnable } // 傳遞 payload 作為請求主體
    );

    // 回傳 Bonsale API 的回應
    return res.status(200).send(response.data);
  } catch (error) {
    console.error('Error in PUT /project/3cx/:projectId:', error.message);
    return res.status(error.status).send(`Error in PUT /project/3cx/:projectId: ${error.message}`);
  }
});

// 取得 outbound 外撥的人員資料
router.get('/outbound', async function(req, res) {
  try {
    const queryString = new URLSearchParams(req.query).toString();
    console.log(queryString)
    const outboundResult = await axiosBonsaleInstance.get(`${host}/outbound?${queryString}`);
    const outboundProject = outboundResult.data;
    return res.status(200).send(outboundProject);
  } catch (error) {
    console.error('Error in GET /outbound:', error.message);
    return res.status(error.status).send(`Error in GET /outbound: ${error.message}`);
  }
});

// Bonsale 回寫 callStatus
router.put('/project/:projectId/customer/:customerId/callStatus', async function(req, res) {
  const { projectId, customerId } = req.params; // 從路徑參數中取得 projectId 和 customerId
  const { callStatus } = req.body; // 從請求主體中取得 callStatus
  console.log('callStatus:', callStatus);
  console.log('projectId:', projectId);
  console.log('customerId:', customerId);

  try {
    // 發送 PUT 請求到 Bonsale API
    const response = await axiosBonsaleInstance.put(
      `${host}/project/${projectId}/customer/${customerId}/callStatus`,
      { callStatus } // 傳遞 callStatus 作為請求主體
    );

    // 回傳 Bonsale API 的回應
    return res.status(200).send(response.data);
  } catch (error) {
    console.error('Error in PUT /project/:projectId/customer/:customerId/callStatus:', error.message);
    return res.status(error.status).send(`Error in PUT /project/:projectId/customer/:customerId/callStatus: ${error.message}`);
  }
});

// Bonsale 回寫 dialUpdate
router.put('/project/:projectId/customer/:customerId/dialUpdate', async function(req, res) {
  const { projectId, customerId } = req.params; // 從路徑參數中取得 projectId 和 customerId
  console.log('projectId:', projectId);
  console.log('customerId:', customerId);

  try {
    // 發送 PUT 請求到 Bonsale API
    const response = await axiosBonsaleInstance.put(
      `${host}/project/${projectId}/customer/${customerId}/dialUpdate`
    );

    // 回傳 Bonsale API 的回應
    return res.status(200).send(response.data);
  } catch (error) {
    console.error('Error in PUT /project/:projectId/customer/:customerId/dialUpdate:', error.message);
    return res.status(error.status).send(`Error in PUT /outbound: ${error.message}`);
  }
});

// Bonsale 取得 訪談紀錄 /project/customer/visit
router.get('/project/customer/visit', async function(req, res) {
  try {
    const queryString = new URLSearchParams(req.query).toString();
    console.log(queryString)
    const response = await axiosBonsaleInstance.get(
      `${host}/project/customer/visit?${queryString}`,
    )

    // 回傳 Bonsale API 的回應
    return res.status(200).send(response.data);
  } catch (error) {
    console.error('Error in GET /project/customer/visit:', error.message);
    return res.status(error.status).send(`Error in GET /project/customer/visit: ${error.message}`);
  }
});

// Bonsale 回寫 訪談紀錄 /project/customer/visit
router.post('/project/customer/visit', async function(req, res) {
  const {projectId, customerId, visitType, visitedUsername, visitedAt, description, visitedResult, task } = req.body;

  if (!projectId || !customerId || !visitType || !visitedUsername || !visitedAt || !description || !visitedResult) {
    return res.status(400).send('Error in POST /project/customer/visit: Missing required fields');
  };

  try {
    // 發送 POST 請求到 Bonsale API
    const response = await axiosBonsaleInstance.post(
      `${host}/project/customer/visit`,
      { projectId, customerId, visitType, visitedUsername, visitedAt, description, visitedResult, task }
    );

    // 回傳 Bonsale API 的回應
    return res.status(200).send(response.data);
  } catch (error) {
    console.error('Error in POST /project/customer/visit:', error.message);
    return res.status(error.status).send(`Error in POST /project/customer/visit: ${error.message}`);
  }
});

// Bonsale 更新 最新執行時間 /project/:id/auto-dial/:callFlowId/execute
router.put('/project/:projectId/auto-dial/:callFlowId/execute', async function(req, res) {
  const { projectId, callFlowId } = req.params;

  if (!projectId || !callFlowId ) {
    return res.status(400).send('Error in POST /project/customer/visit: Missing required fields');
  };

  try {
    // 發送 PUT 請求到 Bonsale API
    const response = await axiosBonsaleInstance.put(
      `${host}/project/${projectId}/auto-dial/${callFlowId}/execute`,
      {}
    );

    // 回傳 Bonsale API 的回應
    return res.status(200).send(response.data);
  } catch (error) {
    console.error('Error in POST /project/customer/visit:', error.message);
    return res.status(error.status).send(`Error in POST /project/customer/visit: ${error.message}`);
  }
});

// Bonsale config 取得備份 project 暫存
router.get('/config/:configName', async function(req, res) {
  const { configName } = req.params;

  if (!configName) {
    return res.status(400).send('Error in GET /config/:configName: Missing required fields');
  };

  try {
    // 發送 GET 請求到 Bonsale API
    const response = await axiosBonsaleInstance.get(
      `${host}/config/${configName}`
    );

    // 回傳 Bonsale API 的回應
    return res.status(200).send(response.data);
  } catch (error) {
    console.error('Error in GET /config/:configName:', error.message);
    return res.status(error.status).send(`Error in GET /config/:configName: ${error.message}`);
  }
});

// Bonsale config 更新備份 project 暫存
router.put('/config/:configName', async function(req, res) {
  const { configName } = req.params;
  const { data } = req.body;

  if (!configName || !data) {
    return res.status(400).send('Error in PUT /config/:configName: Missing required fields');
  };

  try {
    // 發送 PUT 請求到 Bonsale API
    const response = await axiosBonsaleInstance.put(
      `${host}/config/${configName}`,
      { data }
    );

    // 回傳 Bonsale API 的回應
    return res.status(200).send(response.data);
  } catch (error) {
    console.error('Error in PUT /config/:configName:', error.message);
    return res.status(error.status).send(`Error in PUT /config/:configName: ${error.message}`);
  }
});

module.exports = { router, clientWsWebHook };
